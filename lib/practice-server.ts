import "server-only";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { CLASS_GRADES } from "@/lib/class-grades";
import {
  PRACTICE_QUESTION_COLUMNS,
  practiceImageUrl,
  toPracticeQuestion,
  type PracticeQuestionRow,
} from "@/lib/practice-bank";
import { pickRound, shuffleOptions } from "@/lib/practice-round";
import { instantiate, type PlayableQuestion } from "@/lib/practice-template";
import { sanitizeProgress, type PracticeProgress } from "@/lib/practice-progress";

// The practice tables have no read policies for students or guests
// (supabase/migrations/*_practice-pool.sql): everything they see comes
// through here, with the service role, after deciding what they may see.

export type PracticeViewer =
  | { kind: "guest" }
  | { kind: "parent" }
  | { kind: "student"; studentId: string; firstName: string; grade: string | null }
  | { kind: "teacher" };

/** Guests and parents play public sections; the centre's students and the teacher, all of them. */
export function seesPrivateSections(viewer: PracticeViewer): boolean {
  return viewer.kind === "student" || viewer.kind === "teacher";
}

export async function getPracticeViewer(): Promise<PracticeViewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "guest" };

  const service = createServiceRoleClient();
  const [{ data: teacher }, { data: student }] = await Promise.all([
    service.from("teachers").select("user_id").eq("user_id", user.id).maybeSingle(),
    service.from("students").select("id, first_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (teacher) return { kind: "teacher" };
  if (student) {
    const { data: classes } = await service
      .from("student_class_assignments")
      .select("classes(grade, archived_at)")
      .eq("student_id", (student as { id: string }).id);
    const grades = ((classes ?? []) as unknown as { classes: { grade: string | null; archived_at: string | null } | null }[])
      .map((row) => row.classes)
      .filter((item) => item && !item.archived_at && item.grade)
      .map((item) => item!.grade as string);
    return {
      kind: "student",
      studentId: (student as { id: string }).id,
      firstName: (student as { first_name: string }).first_name,
      grade: grades[0] ?? null,
    };
  }
  return { kind: "parent" };
}

export interface PracticeCatalogGrade {
  code: string;
  label: string;
  sections: { id: string; name: string; count: number }[];
  count: number;
}

/** The grades and sections this viewer may play, with question counts; empty sections left out. */
export async function getPracticeCatalog(viewer: PracticeViewer): Promise<PracticeCatalogGrade[]> {
  const service = createServiceRoleClient();
  let sectionQuery = service
    .from("practice_sections")
    .select("id, grade, name, position")
    .order("position", { ascending: true });
  if (!seesPrivateSections(viewer)) sectionQuery = sectionQuery.eq("is_public", true);
  const { data: sections, error } = await sectionQuery;
  if (error) throw error;
  const sectionRows = (sections ?? []) as { id: string; grade: string; name: string; position: number }[];
  if (sectionRows.length === 0) return [];

  const { data: questions, error: questionError } = await service
    .from("practice_questions")
    .select("section_id")
    .eq("is_active", true)
    .in("section_id", sectionRows.map((row) => row.id));
  if (questionError) throw questionError;
  const counts = new Map<string, number>();
  for (const row of (questions ?? []) as { section_id: string }[]) {
    counts.set(row.section_id, (counts.get(row.section_id) ?? 0) + 1);
  }

  return CLASS_GRADES.map((grade) => {
    const gradeSections = sectionRows
      .filter((row) => row.grade === grade.code && (counts.get(row.id) ?? 0) > 0)
      .map((row) => ({ id: row.id, name: row.name, count: counts.get(row.id) ?? 0 }));
    return {
      code: grade.code,
      label: grade.label,
      sections: gradeSections,
      count: gradeSections.reduce((sum, section) => sum + section.count, 0),
    };
  }).filter((grade) => grade.sections.length > 0);
}

/** One question of a round: played numbers filled in, answer included (checked on the device). */
export interface RoundQuestion extends PlayableQuestion {
  id: string;
  sectionId: string;
  sectionName: string;
  imageUrl: string | null;
}

/**
 * Draws a round from sections (with the player's mistakes coming back more
 * often) or, with `mistakesOnly`, from the mistakes themselves. Only
 * questions the viewer may see are ever considered.
 */
export async function drawPracticeRound(
  viewer: PracticeViewer,
  input: { sectionIds: string[]; mistakeIds: string[]; mistakesOnly: boolean },
): Promise<RoundQuestion[]> {
  const service = createServiceRoleClient();
  let sectionQuery = service.from("practice_sections").select("id, name, is_public");
  if (!input.mistakesOnly) sectionQuery = sectionQuery.in("id", input.sectionIds);
  const { data: sections, error } = await sectionQuery;
  if (error) throw error;
  const allowed = ((sections ?? []) as { id: string; name: string; is_public: boolean }[]).filter(
    (section) => section.is_public || seesPrivateSections(viewer),
  );
  const nameBySection = new Map(allowed.map((section) => [section.id, section.name]));
  if (allowed.length === 0) return [];

  let poolQuery = service
    .from("practice_questions")
    .select("id, section_id")
    .eq("is_active", true)
    .in("section_id", allowed.map((section) => section.id));
  if (input.mistakesOnly) poolQuery = poolQuery.in("id", input.mistakeIds.length ? input.mistakeIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: pool, error: poolError } = await poolQuery;
  if (poolError) throw poolError;

  const poolIds = ((pool ?? []) as { id: string }[]).map((row) => row.id);
  const picked = input.mistakesOnly ? pickRound(poolIds, []) : pickRound(poolIds, input.mistakeIds);
  if (picked.length === 0) return [];

  const { data: rows, error: rowsError } = await service
    .from("practice_questions")
    .select(PRACTICE_QUESTION_COLUMNS)
    .in("id", picked);
  if (rowsError) throw rowsError;
  const byId = new Map(((rows ?? []) as PracticeQuestionRow[]).map((row) => [row.id, toPracticeQuestion(row)]));

  const round: RoundQuestion[] = [];
  for (const id of picked) {
    const question = byId.get(id);
    if (!question) continue;
    try {
      const played = instantiate(question);
      round.push({
        ...played,
        options: question.type === "choice" || question.type === "counterexample" ? shuffleOptions(played.options) : played.options,
        id: question.id,
        sectionId: question.sectionId,
        sectionName: nameBySection.get(question.sectionId) ?? "",
        imageUrl: question.imagePath ? practiceImageUrl(question.imagePath) : null,
      });
    } catch {
      // A question that can't be played (edited into a bad state) is skipped, not shown broken.
    }
  }
  return round;
}

/** A student's saved progress (null when they haven't played logged in yet). */
export async function getStudentPracticeProgress(studentId: string): Promise<PracticeProgress | null> {
  const { data } = await createServiceRoleClient()
    .from("practice_progress")
    .select("data")
    .eq("student_id", studentId)
    .maybeSingle();
  return data ? sanitizeProgress((data as { data: unknown }).data) : null;
}

/** Can this viewer see this question (its section public, or they see private ones)? */
export async function canSeeQuestion(viewer: PracticeViewer, questionId: string): Promise<boolean> {
  const { data } = await createServiceRoleClient()
    .from("practice_questions")
    .select("id, practice_sections(is_public)")
    .eq("id", questionId)
    .maybeSingle();
  if (!data) return false;
  const section = (data as unknown as { practice_sections: { is_public: boolean } | null }).practice_sections;
  return Boolean(section?.is_public) || seesPrivateSections(viewer);
}

/**
 * One question from the public sections to show on the homepage: a
 * multiple-choice or true/false one without an image, so it can be
 * answered with one tap. null when there's none.
 */
export async function samplePracticeQuestion(catalog: PracticeCatalogGrade[]): Promise<RoundQuestion | null> {
  const sectionIds = catalog.flatMap((grade) => grade.sections.map((section) => section.id)).slice(0, 100);
  if (sectionIds.length === 0) return null;
  const round = await drawPracticeRound({ kind: "guest" }, { sectionIds, mistakeIds: [], mistakesOnly: false });
  const tappable = round.filter((question) => (question.type === "choice" || question.type === "true_false") && !question.imageUrl);
  return tappable.find((question) => question.type === "choice") ?? tappable[0] ?? null;
}
