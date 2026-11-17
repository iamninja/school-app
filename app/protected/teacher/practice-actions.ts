"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { CLASS_GRADES } from "@/lib/class-grades";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { validatePracticeQuestion, type PracticeQuestionSpec } from "@/lib/practice-template";
import {
  PRACTICE_IMAGES_BUCKET,
  PRACTICE_QUESTION_COLUMNS,
  quizQuestionToPractice,
  toPracticeQuestion,
  toPracticeQuestionColumns,
  addCounterexampleAnswer,
  duplicateQuestions,
  emptyCounterexampleTally,
  type CounterexampleTally,
  type PracticeQuestionStats,
  practiceQuestionKey,
  type CopyableQuizQuestion,
  summarizeAnswers,
  type PracticeQuestion,
  type PracticeQuestionRow,
  type PracticeReport,
  type PracticeSection,
  type PracticeStudentProgress,
} from "@/lib/practice-bank";
import { currentDailyStreak, sanitizeProgress } from "@/lib/practice-progress";
import { athensToday } from "@/lib/push/athens-time";

/** The Athens calendar day of a timestamp. */
function athensDayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(iso));
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const QUIZ_IMAGES_BUCKET = "quiz-images";
const MAX_IMPORT_QUESTIONS = 300;

async function requireTeacherSession(): Promise<{ supabase: SupabaseServerClient; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await requireTeacher(supabase, user.id);
  return { supabase, userId: user.id };
}

function checkGrade(grade: string): string {
  if (!CLASS_GRADES.some((item) => item.code === grade)) throw new ExpectedError("Pick a grade");
  return grade;
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ExpectedError("Give the section a name");
  if (trimmed.length > 120) throw new ExpectedError("Keep the section name under 120 characters");
  return trimmed;
}

async function ownedSection(supabase: SupabaseServerClient, userId: string, sectionId: string) {
  const { data, error } = await supabase
    .from("practice_sections")
    .select("id, grade, name")
    .eq("id", sectionId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (error || !data) throw new ExpectedError("That section no longer exists");
  return data as { id: string; grade: string; name: string };
}

function checkedSpec(spec: PracticeQuestionSpec): PracticeQuestionSpec {
  const problems = validatePracticeQuestion(spec);
  if (problems.length) throw new ExpectedError(problems.join(" · "));
  return spec;
}

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function listPracticeSectionsAction(): Promise<PracticeSection[]> {
  const { supabase, userId } = await requireTeacherSession();
  const [{ data: sections, error }, { data: counts, error: countError }] = await Promise.all([
    supabase
      .from("practice_sections")
      .select("id, grade, name, position, is_public")
      .eq("teacher_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("practice_questions").select("section_id").eq("teacher_id", userId).eq("is_active", true),
  ]);
  if (error) throw error;
  if (countError) throw countError;
  const countBySection = new Map<string, number>();
  for (const row of (counts ?? []) as { section_id: string }[]) {
    countBySection.set(row.section_id, (countBySection.get(row.section_id) ?? 0) + 1);
  }
  return ((sections ?? []) as { id: string; grade: string; name: string; position: number; is_public: boolean }[]).map(
    (row) => ({
      id: row.id,
      grade: row.grade,
      name: row.name,
      position: row.position,
      isPublic: row.is_public,
      questionCount: countBySection.get(row.id) ?? 0,
    }),
  );
}

export async function createPracticeSectionAction(input: { grade: string; name: string }): Promise<PracticeSection> {
  const { supabase, userId } = await requireTeacherSession();
  const grade = checkGrade(input.grade);
  const name = checkName(input.name);
  const { data: last } = await supabase
    .from("practice_sections")
    .select("position")
    .eq("teacher_id", userId)
    .eq("grade", grade)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("practice_sections")
    .insert({ teacher_id: userId, grade, name, position: ((last as { position: number } | null)?.position ?? -1) + 1 })
    .select("id, grade, name, position, is_public")
    .single();
  if (uniqueViolation(error)) throw new ExpectedError("This grade already has a section with that name");
  if (error) throw error;
  const row = data as { id: string; grade: string; name: string; position: number; is_public: boolean };
  return { id: row.id, grade: row.grade, name: row.name, position: row.position, isPublic: row.is_public, questionCount: 0 };
}

export async function updatePracticeSectionAction(
  sectionId: string,
  changes: { name?: string; isPublic?: boolean },
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, sectionId);
  const update: Record<string, unknown> = {};
  if (changes.name !== undefined) update.name = checkName(changes.name);
  if (changes.isPublic !== undefined) update.is_public = Boolean(changes.isPublic);
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("practice_sections").update(update).eq("id", sectionId).eq("teacher_id", userId);
  if (uniqueViolation(error)) throw new ExpectedError("This grade already has a section with that name");
  if (error) throw error;
}

/** Saves a grade's section order: ids in their new order. */
export async function reorderPracticeSectionsAction(grade: string, sectionIds: string[]): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  checkGrade(grade);
  if (sectionIds.length > 500) throw new ExpectedError("Too many sections");
  const { data, error } = await supabase
    .from("practice_sections")
    .select("id")
    .eq("teacher_id", userId)
    .eq("grade", grade);
  if (error) throw error;
  const owned = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  if (sectionIds.some((id) => !owned.has(id))) throw new ExpectedError("The sections changed - reload and try again");
  const results = await Promise.all(
    sectionIds.map((id, position) =>
      supabase.from("practice_sections").update({ position }).eq("id", id).eq("teacher_id", userId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

/** Deletes a section with all its questions (and their images). */
export async function deletePracticeSectionAction(sectionId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, sectionId);
  const { data: images } = await supabase
    .from("practice_questions")
    .select("image_path")
    .eq("section_id", sectionId)
    .not("image_path", "is", null);
  const { error } = await supabase.from("practice_sections").delete().eq("id", sectionId).eq("teacher_id", userId);
  if (error) throw error;
  const paths = ((images ?? []) as { image_path: string | null }[])
    .map((row) => row.image_path)
    .filter((path): path is string => Boolean(path));
  if (paths.length) await supabase.storage.from(PRACTICE_IMAGES_BUCKET).remove(paths);
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function listPracticeQuestionsAction(sectionId: string): Promise<PracticeQuestion[]> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, sectionId);
  const { data, error } = await supabase
    .from("practice_questions")
    .select(PRACTICE_QUESTION_COLUMNS)
    .eq("section_id", sectionId)
    .eq("teacher_id", userId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as PracticeQuestionRow[]).map(toPracticeQuestion);
}

async function nextQuestionPosition(supabase: SupabaseServerClient, sectionId: string): Promise<number> {
  const { data } = await supabase
    .from("practice_questions")
    .select("position")
    .eq("section_id", sectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { position: number } | null)?.position ?? -1) + 1;
}

function checkImagePath(path: string | null | undefined, userId: string): string | null {
  if (!path) return null;
  if (!path.startsWith(`${userId}/`) || path.includes("..")) throw new ExpectedError("That image doesn't belong to you");
  return path;
}

/** Creates a question, or saves changes to one (questionId). */
export async function savePracticeQuestionAction(input: {
  sectionId: string;
  questionId?: string | null;
  spec: PracticeQuestionSpec;
  imagePath?: string | null;
}): Promise<PracticeQuestion> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, input.sectionId);
  const spec = checkedSpec(input.spec);
  const columns = {
    ...toPracticeQuestionColumns(spec),
    image_path: checkImagePath(input.imagePath, userId),
    section_id: input.sectionId,
    updated_at: new Date().toISOString(),
  };

  if (input.questionId) {
    const { data, error } = await supabase
      .from("practice_questions")
      .update(columns)
      .eq("id", input.questionId)
      .eq("teacher_id", userId)
      .select(PRACTICE_QUESTION_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ExpectedError("That question no longer exists");
    return toPracticeQuestion(data as PracticeQuestionRow);
  }

  const { data, error } = await supabase
    .from("practice_questions")
    .insert({ ...columns, teacher_id: userId, source: "manual", position: await nextQuestionPosition(supabase, input.sectionId) })
    .select(PRACTICE_QUESTION_COLUMNS)
    .single();
  if (error) throw error;
  return toPracticeQuestion(data as PracticeQuestionRow);
}

/** Switch a question off (kept, never drawn) or back on. */
export async function setPracticeQuestionActiveAction(questionId: string, isActive: boolean): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  const { data, error } = await supabase
    .from("practice_questions")
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("teacher_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ExpectedError("That question no longer exists");
}

export async function deletePracticeQuestionAction(questionId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  const { data: existing } = await supabase
    .from("practice_questions")
    .select("id, image_path")
    .eq("id", questionId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (!existing) return;
  const { error } = await supabase.from("practice_questions").delete().eq("id", questionId).eq("teacher_id", userId);
  if (error) throw error;
  const imagePath = (existing as { image_path: string | null }).image_path;
  if (imagePath) {
    // Another question (a duplicate) may share the image.
    const { data: others } = await supabase.from("practice_questions").select("id").eq("image_path", imagePath).limit(1);
    if (!others?.length) await supabase.storage.from(PRACTICE_IMAGES_BUCKET).remove([imagePath]);
  }
}

/** Deletes several questions at once (and images no other question uses). */
export async function deletePracticeQuestionsAction(questionIds: string[]): Promise<{ deleted: number }> {
  const { supabase, userId } = await requireTeacherSession();
  return deleteQuestions(supabase, userId, questionIds);
}

/**
 * Removes repeated copies of the same question (practiceQuestionKey) within
 * a section, keeping the first one in the section's order.
 */
export async function removePracticeDuplicatesAction(sectionId: string): Promise<{ removed: number }> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, sectionId);
  const { data, error } = await supabase
    .from("practice_questions")
    .select(PRACTICE_QUESTION_COLUMNS)
    .eq("section_id", sectionId)
    .eq("teacher_id", userId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const extra = duplicateQuestions(((data ?? []) as PracticeQuestionRow[]).map(toPracticeQuestion));
  const { deleted } = await deleteQuestions(supabase, userId, extra.map((question) => question.id));
  return { removed: deleted };
}

async function deleteQuestions(supabase: SupabaseServerClient, userId: string, questionIds: string[]): Promise<{ deleted: number }> {
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) return { deleted: 0 };
  if (ids.length > 500) throw new ExpectedError("Delete at most 500 questions at a time");
  const { data: own, error } = await supabase.from("practice_questions").select("id, image_path").in("id", ids).eq("teacher_id", userId);
  if (error) throw error;
  const rows = (own ?? []) as { id: string; image_path: string | null }[];
  if (rows.length === 0) return { deleted: 0 };
  const { error: deleteError } = await supabase
    .from("practice_questions")
    .delete()
    .in("id", rows.map((row) => row.id))
    .eq("teacher_id", userId);
  if (deleteError) throw deleteError;
  // An image goes only when no remaining question (a duplicate) shares it.
  for (const imagePath of new Set(rows.map((row) => row.image_path).filter((path): path is string => Boolean(path)))) {
    const { data: others } = await supabase.from("practice_questions").select("id").eq("image_path", imagePath).limit(1);
    if (!others?.length) await supabase.storage.from(PRACTICE_IMAGES_BUCKET).remove([imagePath]);
  }
  return { deleted: rows.length };
}

/** Moves questions to another section (of any grade). */
export async function movePracticeQuestionsAction(questionIds: string[], toSectionId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, toSectionId);
  if (questionIds.length === 0) return;
  if (questionIds.length > 500) throw new ExpectedError("Move at most 500 questions at a time");
  let position = await nextQuestionPosition(supabase, toSectionId);
  for (const id of questionIds) {
    const { error } = await supabase
      .from("practice_questions")
      .update({ section_id: toSectionId, position: position++, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("teacher_id", userId);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Import from Markdown
// ---------------------------------------------------------------------------

export type PracticeImportResult =
  | {
      ok: true;
      /** The first section imported into (the console opens it); null when nothing new went in. */
      sectionId: string | null;
      imported: number;
      /** Questions left out because the grade already has them (or the file repeats them). */
      skipped: number;
      createdSection: boolean;
      /** Per section: how many questions went in, how many were duplicates, whether it's new. */
      sections: { id: string | null; name: string | null; imported: number; skipped: number; created: boolean }[];
    }
  | { ok: false; errors: string[] };

/** What an import would do, for the preview: per section, new and duplicate questions. */
export type PracticeImportCheck =
  | { ok: true; sections: { name: string | null; exists: boolean; fresh: number; skipped: number }[] }
  | { ok: false; errors: string[] };

type ImportPlan = {
  groups: {
    /** The section's name in the file; null when everything goes into the section picked. */
    name: string | null;
    /** The section, if it exists already. */
    sectionId: string | null;
    specs: PracticeQuestionSpec[];
    skipped: number;
  }[];
};

/**
 * Where each question of a file goes - all into the section picked, or each
 * into the "# " section it sits under - leaving out questions the grade
 * already has, in any of its sections, or that the file repeats
 * (practiceQuestionKey). Reads only.
 */
async function planImport(
  supabase: SupabaseServerClient,
  userId: string,
  grade: string,
  markdown: string,
  pickedSectionId: string | null | undefined,
): Promise<{ ok: true; plan: ImportPlan } | { ok: false; errors: string[] }> {
  if (markdown.length > 500_000) return { ok: false, errors: ["The file is too big (over 500 KB)"] };
  const parsed = parsePracticeMarkdown(markdown);
  if (parsed.errors.length) return { ok: false, errors: parsed.errors };
  if (parsed.questions.length > MAX_IMPORT_QUESTIONS) {
    return { ok: false, errors: [`Import at most ${MAX_IMPORT_QUESTIONS} questions at a time (this file has ${parsed.questions.length})`] };
  }

  const groups: ImportPlan["groups"] = [];
  const groupFor: number[] = [];
  if (pickedSectionId) {
    await ownedSection(supabase, userId, pickedSectionId);
    groups.push({ name: null, sectionId: pickedSectionId, specs: [], skipped: 0 });
    parsed.questions.forEach(() => groupFor.push(0));
  } else {
    const unplaced = parsed.sectionNames.flatMap((name, index) => (name ? [] : [index + 1]));
    if (unplaced.length) {
      return {
        ok: false,
        errors: [
          unplaced.length === parsed.questions.length
            ? 'Pick a section, or start the file with "# Section name"'
            : `Question${unplaced.length === 1 ? "" : "s"} ${unplaced.join(", ")} come${unplaced.length === 1 ? "s" : ""} before any "# Section name" heading - add one above, or pick a section`,
        ],
      };
    }
    const names = parsed.sectionNames.map((name) => checkName(name!));
    for (const name of [...new Set(names)]) {
      const { data: existing } = await supabase
        .from("practice_sections")
        .select("id")
        .eq("teacher_id", userId)
        .eq("grade", grade)
        .eq("name", name)
        .maybeSingle();
      groups.push({ name, sectionId: existing ? (existing as { id: string }).id : null, specs: [], skipped: 0 });
    }
    names.forEach((name) => groupFor.push(groups.findIndex((group) => group.name === name)));
  }

  // Everything the grade already has, in any section.
  const { data: existingRows, error } = await supabase
    .from("practice_questions")
    .select(`${PRACTICE_QUESTION_COLUMNS}, practice_sections!inner(grade)`)
    .eq("teacher_id", userId)
    .eq("practice_sections.grade", grade);
  if (error) throw error;
  const seen = new Set(((existingRows ?? []) as PracticeQuestionRow[]).map((row) => practiceQuestionKey(toPracticeQuestion(row))));

  parsed.questions.forEach((spec, index) => {
    const group = groups[groupFor[index]];
    const key = practiceQuestionKey(spec);
    if (seen.has(key)) group.skipped++;
    else {
      seen.add(key);
      group.specs.push(spec);
    }
  });
  return { ok: true, plan: { groups } };
}

/** The import preview's numbers: per section, how many questions are new and how many the grade already has. */
export async function checkPracticeImportAction(input: {
  grade: string;
  markdown: string;
  sectionId?: string | null;
}): Promise<PracticeImportCheck> {
  const { supabase, userId } = await requireTeacherSession();
  const planned = await planImport(supabase, userId, checkGrade(input.grade), input.markdown, input.sectionId);
  if (!planned.ok) return planned;
  return {
    ok: true,
    sections: planned.plan.groups.map((group) => ({
      name: group.name,
      exists: group.sectionId !== null,
      fresh: group.specs.length,
      skipped: group.skipped,
    })),
  };
}

/**
 * Imports a Markdown file: everything into the section given, or each
 * question into the "# " section it sits under in the file (a file can hold
 * several; missing ones are created under the grade). Questions the grade
 * already has are left out, so importing a file again only adds what's new.
 * All or nothing - any problem and nothing is saved, sections it created
 * included.
 */
export async function importPracticeMarkdownAction(input: {
  grade: string;
  markdown: string;
  sectionId?: string | null;
}): Promise<PracticeImportResult> {
  const { supabase, userId } = await requireTeacherSession();
  const grade = checkGrade(input.grade);
  const planned = await planImport(supabase, userId, grade, input.markdown, input.sectionId);
  if (!planned.ok) return planned;
  const { groups } = planned.plan;

  // Sections the file names that don't exist yet - only those getting questions.
  const created: { id: string; name: string }[] = [];
  for (const group of groups) {
    if (group.sectionId || group.specs.length === 0 || !group.name) continue;
    try {
      const section = await createPracticeSectionAction({ grade, name: group.name });
      group.sectionId = section.id;
      created.push({ id: section.id, name: group.name });
    } catch (error) {
      await removeSections(supabase, userId, created);
      throw error;
    }
  }

  const rows: (ReturnType<typeof toPracticeQuestionColumns> & {
    teacher_id: string;
    section_id: string;
    source: "import";
    position: number;
  })[] = [];
  for (const group of groups) {
    if (!group.specs.length) continue;
    let position = await nextQuestionPosition(supabase, group.sectionId!);
    for (const spec of group.specs) {
      rows.push({ ...toPracticeQuestionColumns(spec), teacher_id: userId, section_id: group.sectionId!, source: "import" as const, position: position++ });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from("practice_questions").insert(rows);
    if (error) {
      // All or nothing: the insert is one statement (none of the rows went
      // in), and sections this import created go too.
      await removeSections(supabase, userId, created);
      throw error;
    }
  }

  const sections = groups.map((group) => ({
    id: group.sectionId,
    name: group.name,
    imported: group.specs.length,
    skipped: group.skipped,
    created: created.some((item) => item.id === group.sectionId),
  }));
  return {
    ok: true,
    sectionId: sections.find((section) => section.imported > 0)?.id ?? sections.find((section) => section.id)?.id ?? null,
    imported: rows.length,
    skipped: sections.reduce((sum, section) => sum + section.skipped, 0),
    createdSection: created.length > 0,
    sections,
  };
}

async function removeSections(supabase: SupabaseServerClient, userId: string, sections: { id: string }[]) {
  if (sections.length === 0) return;
  await supabase.from("practice_sections").delete().in("id", sections.map((section) => section.id)).eq("teacher_id", userId);
}

// ---------------------------------------------------------------------------
// Copy from quizzes
// ---------------------------------------------------------------------------

type QuizQuestionWithKey = {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "short_answer";
  model_answer: string | null;
  image_path: string | null;
  order_index: number;
};

async function quizQuestionsWithKeys(quizIds: string[]) {
  // Ownership is checked by the caller with the teacher's own client; the
  // answer-key columns are only readable with the service role
  // (20260906120000_hide-quiz-answer-key-columns.sql).
  const serviceRole = createServiceRoleClient();
  const { data: questions, error } = await serviceRole
    .from("quiz_questions")
    .select("id, quiz_id, question_text, question_type, model_answer, image_path, order_index")
    .in("quiz_id", quizIds)
    .order("order_index", { ascending: true });
  if (error) throw error;
  const ids = ((questions ?? []) as QuizQuestionWithKey[]).map((question) => question.id);
  const { data: options, error: optionsError } = ids.length
    ? await serviceRole
        .from("quiz_question_options")
        .select("question_id, option_text, is_correct, order_index")
        .in("question_id", ids)
    : { data: [], error: null };
  if (optionsError) throw optionsError;
  const byQuestion = new Map<string, { option_text: string; is_correct: boolean; order_index: number }[]>();
  for (const option of (options ?? []) as { question_id: string; option_text: string; is_correct: boolean; order_index: number }[]) {
    byQuestion.set(option.question_id, [...(byQuestion.get(option.question_id) ?? []), option]);
  }
  return ((questions ?? []) as QuizQuestionWithKey[]).map((question) => ({
    ...question,
    options: byQuestion.get(question.id) ?? [],
  }));
}

/** The teacher's quizzes and, for each question, what it would become. */
export async function listCopyableQuizzesAction(): Promise<
  { id: string; title: string; questions: CopyableQuizQuestion[] }[]
> {
  const { supabase, userId } = await requireTeacherSession();
  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const quizList = (quizzes ?? []) as { id: string; title: string }[];
  if (quizList.length === 0) return [];
  const [questions, { data: copied }] = await Promise.all([
    quizQuestionsWithKeys(quizList.map((quiz) => quiz.id)),
    supabase
      .from("practice_questions")
      .select("source_quiz_question_id")
      .eq("teacher_id", userId)
      .not("source_quiz_question_id", "is", null),
  ]);
  const copiedIds = new Set(((copied ?? []) as { source_quiz_question_id: string }[]).map((row) => row.source_quiz_question_id));
  return quizList.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    questions: questions
      .filter((question) => question.quiz_id === quiz.id)
      .map((question) => ({
        id: question.id,
        prompt: question.question_text,
        becomes: quizQuestionToPractice(question)?.type ?? null,
        alreadyCopied: copiedIds.has(question.id),
      })),
  }));
}

/** Copies quiz questions into a section (images copied too). */
export async function copyQuizQuestionsToPracticeAction(input: {
  sectionId: string;
  quizQuestionIds: string[];
}): Promise<{ copied: number; skipped: number }> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, input.sectionId);
  const ids = [...new Set(input.quizQuestionIds)];
  if (ids.length === 0) return { copied: 0, skipped: 0 };
  if (ids.length > 300) throw new ExpectedError("Copy at most 300 questions at a time");

  // Which quizzes those questions belong to, and are they this teacher's?
  const serviceRole = createServiceRoleClient();
  const { data: owners, error: ownersError } = await serviceRole
    .from("quiz_questions")
    .select("quiz_id")
    .in("id", ids);
  if (ownersError) throw ownersError;
  const quizIds = [...new Set(((owners ?? []) as { quiz_id: string }[]).map((row) => row.quiz_id))];
  const { data: ownedQuizzes, error: quizError } = await supabase
    .from("quizzes")
    .select("id")
    .eq("teacher_id", userId)
    .in("id", quizIds.length ? quizIds : ["00000000-0000-0000-0000-000000000000"]);
  if (quizError) throw quizError;
  if ((ownedQuizzes ?? []).length !== quizIds.length) throw new ExpectedError("Some of those questions aren't yours");

  const questions = (await quizQuestionsWithKeys(quizIds)).filter((question) => ids.includes(question.id));
  let position = await nextQuestionPosition(supabase, input.sectionId);
  let copied = 0;
  let skipped = 0;
  for (const question of questions) {
    const spec = quizQuestionToPractice(question);
    if (!spec || validatePracticeQuestion(spec).length) {
      skipped++;
      continue;
    }
    let imagePath: string | null = null;
    if (question.image_path) {
      const { data: blob } = await serviceRole.storage.from(QUIZ_IMAGES_BUCKET).download(question.image_path);
      if (blob) {
        const extension = question.image_path.split(".").pop() ?? "png";
        const target = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await serviceRole.storage
          .from(PRACTICE_IMAGES_BUCKET)
          .upload(target, blob, { contentType: blob.type || undefined });
        if (!uploadError) imagePath = target;
      }
    }
    const { error } = await supabase.from("practice_questions").insert({
      ...toPracticeQuestionColumns(spec),
      image_path: imagePath,
      teacher_id: userId,
      section_id: input.sectionId,
      source: "quiz",
      source_quiz_question_id: question.id,
      position: position++,
    });
    if (error) throw error;
    copied++;
  }
  return { copied, skipped: skipped + (ids.length - questions.length) };
}

// ---------------------------------------------------------------------------
// Progress, question stats, reports
// ---------------------------------------------------------------------------

/** Every student's practice: this week, all time, per section, streak and mistakes. */
export async function getPracticeProgressOverviewAction(): Promise<PracticeStudentProgress[]> {
  const { supabase } = await requireTeacherSession();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: students, error }, { data: recent }, { data: progressRows }, { data: sections }, { data: totals }, { data: counterexample }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name, withdrawn_at, student_class_assignments(classes(name))")
      .is("withdrawn_at", null)
      .order("last_name", { ascending: true }),
    supabase.from("practice_answers").select("student_id, section_id, correct, answered_at").gte("answered_at", since).limit(50_000),
    supabase.from("practice_progress").select("student_id, data"),
    supabase.from("practice_sections").select("id, name"),
    supabase.from("practice_answers").select("student_id, correct").limit(200_000),
    supabase
      .from("practice_answers")
      .select("student_id, correct, detail, mode, practice_questions!inner(type)")
      .eq("practice_questions.type", "counterexample")
      .limit(50_000),
  ]);
  if (error) throw error;
  const today = athensToday();
  const summary = summarizeAnswers((recent ?? []) as never, new Date(), athensDayOf);
  const progressBy = new Map(
    ((progressRows ?? []) as { student_id: string; data: unknown }[]).map((row) => [row.student_id, sanitizeProgress(row.data)]),
  );
  const sectionName = new Map(((sections ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));
  const allTime = new Map<string, { answers: number; right: number }>();
  for (const row of (totals ?? []) as { student_id: string; correct: boolean }[]) {
    const entry = allTime.get(row.student_id) ?? { answers: 0, right: 0 };
    entry.answers++;
    if (row.correct) entry.right++;
    allTime.set(row.student_id, entry);
  }

  const counterexampleBy = new Map<string, CounterexampleTally>();
  for (const row of (counterexample ?? []) as unknown as { student_id: string; correct: boolean; detail: string | null; mode: string | null }[]) {
    const tally = counterexampleBy.get(row.student_id) ?? emptyCounterexampleTally();
    addCounterexampleAnswer(tally, row.correct, row.detail, row.mode);
    counterexampleBy.set(row.student_id, tally);
  }

  type StudentRow = { id: string; first_name: string; last_name: string; student_class_assignments: { classes: { name: string } | null }[] | null };
  return ((students ?? []) as unknown as StudentRow[]).map((student) => {
    const answers = summary.get(student.id);
    const progress = progressBy.get(student.id) ?? null;
    return {
      studentId: student.id,
      name: `${student.first_name} ${student.last_name}`.trim(),
      classes: (student.student_class_assignments ?? []).map((row) => row.classes?.name).filter((name): name is string => Boolean(name)),
      week: answers?.week ?? { answers: 0, right: 0, days: 0 },
      allTime: allTime.get(student.id) ?? { answers: 0, right: 0 },
      lastPracticed: answers?.last ?? null,
      dailyStreak: progress ? currentDailyStreak(progress, today) : 0,
      mistakes: progress?.mistakes.length ?? 0,
      points: progress?.points ?? 0,
      sections: [...(answers?.recent ?? new Map()).entries()]
        .map(([sectionId, stats]) => ({ sectionId, name: sectionName.get(sectionId) ?? "", ...stats }))
        .sort((a, b) => b.answers - a.answers),
      counterexample: counterexampleBy.get(student.id) ?? emptyCounterexampleTally(),
    };
  });
}

/** Per question of a section: how often answered and how often right (students only - guests aren't recorded). */
export async function getPracticeQuestionStatsAction(sectionId: string): Promise<Record<string, PracticeQuestionStats>> {
  const { supabase, userId } = await requireTeacherSession();
  await ownedSection(supabase, userId, sectionId);
  const [{ data: answers }, { data: reports }] = await Promise.all([
    supabase.from("practice_answers").select("question_id, correct, detail").eq("section_id", sectionId).limit(100_000),
    supabase.from("practice_reports").select("question_id, practice_questions!inner(section_id)").is("resolved_at", null).eq("practice_questions.section_id", sectionId),
  ]);
  const stats: Record<string, PracticeQuestionStats> = {};
  for (const row of (answers ?? []) as { question_id: string | null; correct: boolean; detail: string | null }[]) {
    if (!row.question_id) continue;
    const entry = (stats[row.question_id] ??= { answers: 0, right: 0, reports: 0 });
    entry.answers++;
    if (row.correct) entry.right++;
    // Only counterexample answers carry a detail.
    if (row.detail) addCounterexampleAnswer((entry.mistakes ??= { claim: 0, h: 0, c: 0, other: 0 }), false, row.detail);
  }
  for (const row of (reports ?? []) as { question_id: string }[]) {
    (stats[row.question_id] ??= { answers: 0, right: 0, reports: 0 }).reports++;
  }
  return stats;
}

export async function listPracticeReportsAction(): Promise<PracticeReport[]> {
  const { supabase } = await requireTeacherSession();
  const { data, error } = await supabase
    .from("practice_reports")
    .select("id, question_id, message, played_prompt, created_at, students(first_name, last_name), practice_questions(prompt, section_id)")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  type Row = {
    id: string; question_id: string; message: string | null; played_prompt: string | null; created_at: string;
    students: { first_name: string; last_name: string } | null; practice_questions: { prompt: string; section_id: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    sectionId: row.practice_questions?.section_id ?? null,
    questionPrompt: row.practice_questions?.prompt ?? "",
    playedPrompt: row.played_prompt,
    message: row.message,
    studentName: row.students ? `${row.students.first_name} ${row.students.last_name}`.trim() : null,
    createdAt: row.created_at,
  }));
}

export async function resolvePracticeReportAction(reportId: string): Promise<void> {
  const { supabase } = await requireTeacherSession();
  const { error } = await supabase.from("practice_reports").update({ resolved_at: new Date().toISOString() }).eq("id", reportId);
  if (error) throw error;
}

/** A typed counterexample the AI checked (counterexample v3b), for the console. */
export interface PracticeAiCheck {
  id: string;
  typed: string;
  verdict: "valid" | "hypothesis_fails" | "conclusion_holds" | "invalid";
  teacherVerdict: PracticeAiCheck["verdict"] | null;
  reason: string | null;
  studentName: string | null;
  createdAt: string;
}

const AI_VERDICTS = ["valid", "hypothesis_fails", "conclusion_holds", "invalid"] as const;

/** A question's AI-checked typed counterexamples, newest first. */
export async function listPracticeAiChecksAction(questionId: string): Promise<PracticeAiCheck[]> {
  const { supabase } = await requireTeacherSession();
  const { data, error } = await supabase
    .from("practice_ai_checks")
    .select("id, typed, verdict, teacher_verdict, reason, created_at, students(first_name, last_name)")
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  type Row = {
    id: string; typed: string; verdict: PracticeAiCheck["verdict"]; teacher_verdict: PracticeAiCheck["verdict"] | null;
    reason: string | null; created_at: string; students: { first_name: string; last_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    typed: row.typed,
    verdict: row.verdict,
    teacherVerdict: row.teacher_verdict,
    reason: row.reason,
    studentName: row.students ? `${row.students.first_name} ${row.students.last_name}`.trim() : null,
    createdAt: row.created_at,
  }));
}

/** The teacher's own verdict on an AI check (null: agree with the AI). */
export async function correctPracticeAiCheckAction(checkId: string, verdict: PracticeAiCheck["verdict"] | null): Promise<void> {
  const { supabase } = await requireTeacherSession();
  if (verdict !== null && !AI_VERDICTS.includes(verdict)) throw new Error("Unknown verdict");
  const { error } = await supabase.from("practice_ai_checks").update({ teacher_verdict: verdict }).eq("id", checkId);
  if (error) throw error;
}
