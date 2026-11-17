"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, FlameIcon, InfoIcon, StarIcon } from "lucide-react";

import {
  drawPracticeRoundAction,
  reportPracticeQuestionAction,
  syncPracticeProgressAction,
  type PracticeAnswerUpload,
} from "@/app/practice/actions";
import { BrandMark } from "@/components/brand";
import { MathText } from "@/components/math-text";
import { PracticeGraphView } from "@/components/practice/practice-graph";
import { PracticeOriginBadge } from "@/components/practice/practice-origin-badge";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { PracticeCatalogGrade, RoundQuestion } from "@/lib/practice-server";
import {
  PROGRESS_KEY,
  RIGHTS_TO_CLEAR,
  currentDailyStreak,
  emptyProgress,
  hasProgress,
  localDay,
  mergeProgress,
  parseProgress,
  pointsFor,
  recordAnswer,
  recordRoundEnd,
  sectionMastery,
  type PracticeProgress,
} from "@/lib/practice-progress";
import { checkCounterexample, formatNumber, isCorrect, parseTypedNumber, type CounterexampleDetail } from "@/lib/practice-template";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  choice: "Πολλαπλή επιλογή",
  true_false: "Σωστό ή λάθος",
  number: "Αριθμός",
  slider: "Σύρε στην τιμή",
  point: "Στο γράφημα",
  counterexample: "Αντιπαράδειγμα",
};

/** What each counterexample option was, shown after the answer. */
const MARKER_TAG: Record<string, { text: string; good: boolean } | undefined> = {
  x: { text: "✓ αντιπαράδειγμα", good: true },
  h: { text: "✗ δεν ισχύει η υπόθεση", good: false },
  c: { text: "✗ ισχύει το συμπέρασμα", good: false },
};

const fmt = (value: number) => formatNumber(value, false);
/** Slider answers and ranges: two decimals are plenty to read. */
const fmt2 = (value: number) => formatNumber(Math.round(value * 100) / 100, false);

// The game's buttons press down (the "game" feel from the prototype).
const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-base font-bold text-brand-foreground shadow-[0_4px_0_0_hsl(var(--brand)/0.45)] transition active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0";
const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm font-semibold transition hover:border-brand/60 active:translate-y-0.5";
const CHOICE =
  "flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3.5 text-left text-base font-medium shadow-[0_4px_0_0_hsl(var(--border))] transition enabled:hover:border-brand/70 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-default";

type Viewer = { kind: "guest" | "parent" | "teacher" } | { kind: "student"; firstName: string; grade: string | null };

type Screen = "grade" | "sections" | "loading" | "question" | "summary" | "mistakes";

interface Result {
  question: RoundQuestion;
  correct: boolean;
  points: number;
}

const STUDENT_CACHE_KEY = "modus-practice-student-v1";
const PENDING_KEY = "modus-practice-pending-v1";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: play without saving locally.
  }
}

type ProgressApi = {
  progress: PracticeProgress;
  update: (change: (prev: PracticeProgress) => PracticeProgress) => void;
  /** Students: queue an answer for the account (sent in the background). */
  queueAnswer: (answer: PracticeAnswerUpload) => void;
  /** Students: a note that this device's guest progress was carried over. */
  carriedOver: boolean;
};

/**
 * Progress for guests lives in the browser. For the centre's students it
 * lives on their account: loaded with the page, a guest's progress on this
 * device folded in once, and every change saved in the background (with
 * the unsent answers kept on the device until they're through).
 * Exported for tests/practice-game-sync.test.tsx.
 */
export function useProgress(student: boolean, saved: PracticeProgress | null): ProgressApi {
  const [progress, setProgress] = React.useState<PracticeProgress>(() => saved ?? emptyProgress());
  const [carriedOver, setCarriedOver] = React.useState(false);
  const latest = React.useRef(progress);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = React.useRef(false);

  const flush = React.useCallback(async () => {
    if (!student || sending.current) return;
    sending.current = true;
    const pending = parsePending(readStorage(PENDING_KEY));
    try {
      const result = await syncPracticeProgressAction({ progress: latest.current, answers: pending });
      if (result.ok) {
        const sent = new Set(pending.map((answer) => answer.clientId));
        const left = parsePending(readStorage(PENDING_KEY)).filter((answer) => !sent.has(answer.clientId));
        writeStorage(PENDING_KEY, left.length ? JSON.stringify(left) : null);
      }
    } catch {
      // Offline or the server didn't answer: kept on the device, sent next time.
    } finally {
      sending.current = false;
    }
  }, [student]);

  const scheduleSync = React.useCallback(() => {
    if (!student) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  }, [student, flush]);

  React.useEffect(() => {
    if (!student) {
      const local = parseProgress(readStorage(PROGRESS_KEY));
      latest.current = local;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists in the browser, after hydration
      setProgress(local);
      return;
    }
    // A guest's progress on this device joins the account, once.
    const guest = parseProgress(readStorage(PROGRESS_KEY));
    const cached = parseProgress(readStorage(STUDENT_CACHE_KEY));
    let start = saved ?? (hasProgress(cached) ? cached : emptyProgress());
    if (hasProgress(guest)) {
      start = mergeProgress(start, guest);
      writeStorage(PROGRESS_KEY, null);
      setCarriedOver(true);
    }
    latest.current = start;
    setProgress(start);
    writeStorage(STUDENT_CACHE_KEY, JSON.stringify(start));
    if (hasProgress(guest) || parsePending(readStorage(PENDING_KEY)).length) void flush();

    const retry = () => void flush();
    window.addEventListener("online", retry);
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [student, saved, flush]);

  const update = React.useCallback(
    (change: (prev: PracticeProgress) => PracticeProgress) => {
      const next = change(latest.current);
      latest.current = next;
      setProgress(next);
      writeStorage(student ? STUDENT_CACHE_KEY : PROGRESS_KEY, JSON.stringify(next));
      scheduleSync();
    },
    [student, scheduleSync],
  );

  const queueAnswer = React.useCallback(
    (answer: PracticeAnswerUpload) => {
      if (!student) return;
      const pending = parsePending(readStorage(PENDING_KEY));
      writeStorage(PENDING_KEY, JSON.stringify([...pending, answer].slice(-500)));
      scheduleSync();
    },
    [student, scheduleSync],
  );

  return { progress, update, queueAnswer, carriedOver };
}

function parsePending(raw: string | null): PracticeAnswerUpload[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => item && typeof item.clientId === "string") : [];
  } catch {
    return [];
  }
}

function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** /practice: pick a grade and sections, play rounds of 10, review mistakes. */
export function PracticeGame({
  catalog,
  viewer,
  savedProgress = null,
  startGrade = null,
}: {
  catalog: PracticeCatalogGrade[];
  viewer: Viewer;
  /** Open at this grade's sections (/practice?grade=..., from the homepage). */
  startGrade?: string | null;
  /** A student's progress from their account. */
  savedProgress?: PracticeProgress | null;
}) {
  const { progress, update: updateProgress, queueAnswer, carriedOver } = useProgress(viewer.kind === "student", savedProgress);
  const today = localDay();
  const ownGrade = viewer.kind === "student" && viewer.grade && catalog.some((grade) => grade.code === viewer.grade) ? viewer.grade : null;
  // The grade to open at: the one asked for, else a student's own.
  const studentGrade = (startGrade && catalog.some((grade) => grade.code === startGrade) ? startGrade : null) ?? ownGrade;

  const [screen, setScreen] = React.useState<Screen>(studentGrade ? "sections" : "grade");
  const [grade, setGrade] = React.useState<string | null>(studentGrade);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [round, setRound] = React.useState<RoundQuestion[]>([]);
  const [index, setIndex] = React.useState(0);
  const [results, setResults] = React.useState<Result[]>([]);
  const [streak, setStreak] = React.useState(0);
  const [bestStreak, setBestStreak] = React.useState(0);
  const [mistakesRound, setMistakesRound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bestBefore, setBestBefore] = React.useState(0);
  const [restored, setRestored] = React.useState(false);
  const [noticeClosed, setNoticeClosed] = React.useState(false);

  // Last time's grade and sections, once progress has loaded from storage.
  if (!restored && (progress.lastGrade || progress.lastSections.length)) {
    setRestored(true);
    if (!studentGrade && progress.lastGrade && catalog.some((item) => item.code === progress.lastGrade)) {
      setGrade(progress.lastGrade);
    }
    setPicked(new Set(progress.lastSections));
  }

  const gradeInfo = catalog.find((item) => item.code === grade) ?? null;
  const validPicked = gradeInfo ? gradeInfo.sections.filter((section) => picked.has(section.id)) : [];
  const pickedCount = validPicked.reduce((sum, section) => sum + section.count, 0);
  const dailyStreak = currentDailyStreak(progress, today);
  const roundPoints = results.reduce((sum, result) => sum + result.points, 0);

  const start = async (onlyMistakes: boolean) => {
    setError(null);
    setScreen("loading");
    const response = await drawPracticeRoundAction({
      sectionIds: validPicked.map((section) => section.id),
      mistakeIds: progress.mistakes.map((mistake) => mistake.id),
      mistakesOnly: onlyMistakes,
    }).catch(() => ({ ok: false as const, error: "Κάτι πήγε στραβά - έλεγξε τη σύνδεση και ξαναδοκίμασε." }));
    if (!response.ok) {
      setError(response.error);
      setScreen(onlyMistakes ? "mistakes" : "sections");
      return;
    }
    if (!onlyMistakes) {
      updateProgress((prev) => ({ ...prev, lastGrade: grade, lastSections: validPicked.map((section) => section.id) }));
    }
    setBestBefore(progress.bestScore);
    setMistakesRound(onlyMistakes);
    setRound(response.questions);
    setIndex(0);
    setResults([]);
    setStreak(0);
    setBestStreak(0);
    setScreen("question");
  };

  const answer = (correct: boolean, detail: CounterexampleDetail | null = null) => {
    const question = round[index];
    const nextStreak = correct ? streak + 1 : 0;
    const points = correct ? pointsFor(nextStreak) : 0;
    setStreak(nextStreak);
    setBestStreak((value) => Math.max(value, nextStreak));
    setResults((prev) => [...prev, { question, correct, points }]);
    updateProgress((prev) =>
      recordAnswer(
        prev,
        { id: question.id, sectionId: question.sectionId, sectionName: question.sectionName, type: question.type, prompt: question.prompt, correct },
        points,
        today,
      ),
    );
    queueAnswer({
      clientId: newClientId(),
      questionId: question.id,
      sectionId: question.sectionId,
      correct,
      points,
      answeredAt: new Date().toISOString(),
      ...(detail ? { detail } : {}),
    });
    return { points, streak: nextStreak };
  };

  const next = () => {
    if (index + 1 >= round.length) {
      const score = results.filter((result) => result.correct).length;
      updateProgress((prev) => (mistakesRound ? prev : recordRoundEnd(prev, Math.round((score / round.length) * 10))));
      setScreen("summary");
      return;
    }
    setIndex(index + 1);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-2 px-4">
          <Link href={viewer.kind === "guest" ? "/" : "/start"} className="flex items-center gap-2 font-semibold" aria-label="Modus - αρχική">
            <BrandMark className="h-5 w-[22px] text-foreground" />
            <span className="text-lg font-bold tracking-tight">Modus</span>
            <span className="text-sm font-medium text-muted-foreground">Εξάσκηση</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums" title="Μέρες στη σειρά">
              <FlameIcon className="size-3.5 text-orange-500" aria-hidden="true" />
              {dailyStreak}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums" title="Πόντοι">
              <StarIcon className="size-3.5 text-brand" aria-hidden="true" />
              {progress.points}
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-6">
        {carriedOver && !noticeClosed ? (
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm" role="status">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="flex-1">Η πρόοδός σου από αυτή τη συσκευή μεταφέρθηκε στον λογαριασμό σου.</span>
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => setNoticeClosed(true)}>
              ΟΚ
            </button>
          </p>
        ) : null}
        {catalog.length === 0 ? (
          <EmptyCatalog viewer={viewer} />
        ) : screen === "grade" ? (
          <GradeScreen
            catalog={catalog}
            grade={grade}
            viewer={viewer}
            onPick={(code) => setGrade(code)}
            onNext={() => setScreen("sections")}
            mistakes={progress.mistakes.length}
            onMistakes={() => setScreen("mistakes")}
          />
        ) : screen === "sections" && gradeInfo ? (
          <SectionsScreen
            grade={gradeInfo}
            picked={picked}
            progress={progress}
            pickedCount={pickedCount}
            error={error}
            onToggle={(id) =>
              setPicked((prev) => {
                const nextSet = new Set(prev);
                if (nextSet.has(id)) nextSet.delete(id);
                else nextSet.add(id);
                return nextSet;
              })
            }
            onAll={(all) => setPicked(all ? new Set(gradeInfo.sections.map((section) => section.id)) : new Set())}
            onStart={() => void start(false)}
            onOtherGrade={() => setScreen("grade")}
            mistakes={progress.mistakes.length}
            onMistakes={() => setScreen("mistakes")}
          />
        ) : screen === "loading" ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground" role="status">
            Ετοιμάζω τον γύρο…
          </div>
        ) : screen === "question" && round[index] ? (
          <QuestionScreen
            key={`${round[index].id}-${index}`}
            question={round[index]}
            index={index}
            total={round.length}
            results={results}
            onAnswer={answer}
            onNext={next}
          />
        ) : screen === "summary" ? (
          <SummaryScreen
            results={results}
            total={round.length}
            roundPoints={roundPoints}
            bestStreak={bestStreak}
            dailyStreak={dailyStreak}
            bestBefore={bestBefore}
            mistakesRound={mistakesRound}
            mistakesCount={progress.mistakes.length}
            onAgain={() => void start(mistakesRound)}
            onMistakes={() => setScreen("mistakes")}
            onSections={() => setScreen(gradeInfo ? "sections" : "grade")}
            viewer={viewer}
          />
        ) : screen === "mistakes" ? (
          <MistakesScreen
            progress={progress}
            error={error}
            onPlay={() => void start(true)}
            onBack={() => setScreen(results.length ? "summary" : gradeInfo ? "sections" : "grade")}
          />
        ) : (
          <GradeScreen
            catalog={catalog}
            grade={grade}
            viewer={viewer}
            onPick={(code) => setGrade(code)}
            onNext={() => setScreen("sections")}
            mistakes={progress.mistakes.length}
            onMistakes={() => setScreen("mistakes")}
          />
        )}
      </main>
    </div>
  );
}

function EmptyCatalog({ viewer }: { viewer: Viewer }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold">Η εξάσκηση έρχεται σύντομα</h1>
      <p className="max-w-sm text-muted-foreground">
        {viewer.kind === "teacher"
          ? "Πρόσθεσε ενότητες και ερωτήσεις από την καρτέλα Practice της κονσόλας."
          : "Δεν υπάρχουν ακόμα ερωτήσεις για εξάσκηση. Ξαναπέρασε σε λίγες μέρες."}
      </p>
    </div>
  );
}

function GradeScreen({
  catalog,
  grade,
  viewer,
  onPick,
  onNext,
  mistakes,
  onMistakes,
}: {
  catalog: PracticeCatalogGrade[];
  grade: string | null;
  viewer: Viewer;
  onPick: (code: string) => void;
  onNext: () => void;
  mistakes: number;
  onMistakes: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Βήμα 1 από 2</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">Ποια τάξη θα εξασκήσεις;</h1>
        <p className="text-muted-foreground">Γύροι των 10 ερωτήσεων, όσες φορές θέλεις.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {catalog.map((item) => (
          <button
            key={item.code}
            type="button"
            aria-pressed={grade === item.code}
            onClick={() => onPick(item.code)}
            className={cn(
              "flex flex-col gap-0.5 rounded-2xl border-2 bg-card px-4 py-3.5 text-left font-semibold shadow-[0_4px_0_0_hsl(var(--border))] transition active:translate-y-1 active:shadow-none",
              grade === item.code ? "border-brand bg-brand/10" : "border-border hover:border-brand/60",
            )}
          >
            {item.label}
            <span className="text-sm font-normal text-muted-foreground">{item.count} ερωτήσεις</span>
          </button>
        ))}
      </div>
      {viewer.kind === "guest" ? (
        <p className="flex gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Παίζεις ως επισκέπτης: η πρόοδος μένει σε αυτή τη συσκευή. Μαθητής του φροντιστηρίου;{" "}
            <Link href="/auth/student-login" className="font-semibold text-foreground underline underline-offset-2">
              Σύνδεσου
            </Link>{" "}
            για όλες τις ενότητες.
          </span>
        </p>
      ) : null}
      <div className="mt-auto grid gap-2">
        <button type="button" className={PRIMARY} disabled={!grade} onClick={onNext}>
          Συνέχεια
        </button>
        {mistakes > 0 ? (
          <button type="button" className={SECONDARY} onClick={onMistakes}>
            Τα λάθη μου ({mistakes})
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SectionsScreen({
  grade,
  picked,
  progress,
  pickedCount,
  error,
  onToggle,
  onAll,
  onStart,
  onOtherGrade,
  mistakes,
  onMistakes,
}: {
  grade: PracticeCatalogGrade;
  picked: Set<string>;
  progress: PracticeProgress;
  pickedCount: number;
  error: string | null;
  onToggle: (id: string) => void;
  onAll: (all: boolean) => void;
  onStart: () => void;
  onOtherGrade: () => void;
  mistakes: number;
  onMistakes: () => void;
}) {
  const all = grade.sections.every((section) => picked.has(section.id));
  const row = (on: boolean) =>
    cn(
      "flex w-full items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left font-semibold transition",
      on ? "border-brand bg-brand/10" : "border-border hover:border-brand/60",
    );
  const box = (on: boolean) =>
    cn("grid size-6 shrink-0 place-items-center rounded-md border-2", on ? "border-brand bg-brand text-brand-foreground" : "border-border");
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Βήμα 2 από 2 · {grade.label}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Από ποιες ενότητες;</h1>
      </div>
      <div className="grid gap-2">
        <button type="button" aria-pressed={all} className={row(all)} onClick={() => onAll(!all)}>
          <span className={box(all)}>{all ? <CheckIcon className="size-4" aria-hidden="true" /> : null}</span>
          <span className="flex-1">Όλες οι ενότητες</span>
          <span className="text-sm font-normal tabular-nums text-muted-foreground">{grade.count}</span>
        </button>
        {grade.sections.map((section) => {
          const on = picked.has(section.id);
          const mastery = sectionMastery(progress, section.id);
          return (
            <button key={section.id} type="button" aria-pressed={on} className={row(on)} onClick={() => onToggle(section.id)}>
              <span className={box(on)}>{on ? <CheckIcon className="size-4" aria-hidden="true" /> : null}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{section.name}</span>
                {mastery !== null ? (
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" title="Πόσο την κατέχεις">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(mastery * 100)}%` }} />
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-normal tabular-nums text-muted-foreground">{section.count}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">Οι ερωτήσεις που έχεις κάνει λάθος έρχονται πιο συχνά.</p>
      {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-auto grid gap-2">
        <button type="button" className={PRIMARY} disabled={pickedCount === 0} onClick={onStart}>
          {pickedCount ? `Παίξε ${Math.min(10, pickedCount)} από ${pickedCount} ερωτήσεις` : "Διάλεξε τουλάχιστον μία"}
        </button>
        <div className="flex justify-center gap-4 text-sm">
          <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onOtherGrade}>
            Άλλη τάξη
          </button>
          {mistakes > 0 ? (
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onMistakes}>
              Τα λάθη μου ({mistakes})
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ index, total, results }: { index: number; total: number; results: Result[] }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-label={`Ερώτηση ${index + 1} από ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full",
            i < results.length ? (results[i].correct ? "bg-emerald-500" : "bg-red-500") : i === index ? "bg-brand" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

/** Exported for tests. */
export function QuestionScreen({
  question,
  index,
  total,
  results,
  onAnswer,
  onNext,
}: {
  question: RoundQuestion;
  index: number;
  total: number;
  results: Result[];
  onAnswer: (correct: boolean, detail?: CounterexampleDetail | null) => { points: number; streak: number };
  onNext: () => void;
}) {
  const [given, setGiven] = React.useState<number | { x: number; y: number } | null>(null);
  const [feedback, setFeedback] = React.useState<{ correct: boolean; points: number; streak: number } | null>(null);
  const [typed, setTyped] = React.useState("");
  const [typedError, setTypedError] = React.useState(false);
  const [slider, setSlider] = React.useState(() => (question.slider ? (question.slider.min + question.slider.max) / 2 : 0));
  const [point, setPoint] = React.useState({ x: 0, y: 0 });
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const answered = feedback !== null;
  // Counterexample: step 1 (the claim called true/false), then step 2 (the pick).
  const [claim, setClaim] = React.useState<boolean | null>(null);
  const [pick, setPick] = React.useState<number | null>(null);

  const finishCounterexample = (claimTrue: boolean, picked: number | null) => {
    if (answered) return;
    const result = checkCounterexample(question, claimTrue, picked);
    setFeedback({ correct: result.correct, ...onAnswer(result.correct, result.detail) });
    setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
  };
  const chooseClaim = (claimTrue: boolean) => {
    if (answered || claim !== null) return;
    setClaim(claimTrue);
    // A false claim called false goes on to step 2; anything else ends here.
    if (claimTrue || question.answer === 1) finishCounterexample(claimTrue, null);
  };
  const choosePick = (i: number) => {
    if (answered || pick !== null) return;
    setPick(i);
    finishCounterexample(false, i);
  };
  const counterexample = question.type === "counterexample" ? question.options.find((option) => option.marker === "x") ?? null : null;

  const submit = (value: number | { x: number; y: number }) => {
    if (answered) return;
    setGiven(value);
    const correct = isCorrect(question, value);
    setFeedback({ correct, ...onAnswer(correct) });
    setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
  };

  const correctText =
    question.type === "choice"
      ? null
      : question.type === "counterexample"
        ? claim === null || claim === (question.answer === 1)
          ? null
          : question.answer === 1
            ? "ο ισχυρισμός είναι αληθής"
            : "ο ισχυρισμός είναι ψευδής"
      : question.type === "true_false"
        ? question.answer ? "Σωστό" : "Λάθος"
        : question.type === "point"
          ? `(${fmt(question.answer)}, ${fmt(question.answerY)})`
          : question.type === "slider"
            ? `${fmt2(question.answer)} (δεκτό ${fmt2(question.answer - question.tolerance)} ως ${fmt2(question.answer + question.tolerance)})`
            : fmt(question.answer);

  return (
    <section className="relative flex flex-1 flex-col gap-5">
      <ProgressBar index={index} total={total} results={results} />
      <div className="flex items-baseline justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span className="truncate">{TYPE_LABEL[question.type]} · {question.sectionName}</span>
        <span className="tabular-nums">{index + 1} / {total}</span>
      </div>
      {question.originLabel ? <PracticeOriginBadge label={question.originLabel} className="-mb-2 self-start" /> : null}
      <p className="whitespace-pre-line text-[1.35rem] font-bold leading-snug text-balance">
        <MathText text={question.prompt} />
      </p>
      {question.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public bucket image of any size
        <img src={question.imageUrl} alt="" className="max-h-60 self-start rounded-xl border object-contain" />
      ) : null}

      {question.type === "choice" ? (
        <div className="grid gap-2.5">
          {question.options.map((option, i) => {
            const state = !answered ? "" : option.correct ? "right" : given === i ? "wrong" : "dim";
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => submit(i)}
                className={cn(
                  CHOICE,
                  state === "right" && "animate-[practice-bump_.35s_ease-out] border-emerald-500 bg-emerald-500/10",
                  state === "wrong" && "animate-[practice-shake_.35s_ease-out] border-red-500 bg-red-500/10",
                  state === "dim" && "opacity-50",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-border text-xs font-bold text-muted-foreground">
                  {"ΑΒΓΔΕΣ"[i]}
                </span>
                <span className="min-w-0 flex-1"><MathText text={option.text} /></span>
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "counterexample" ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-muted-foreground">Είναι αληθής ή ψευδής;</p>
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((value) => {
                const state = claim === null ? "" : value === (question.answer === 1) && answered ? "right" : claim === value ? (answered && !feedback?.correct && claim !== (question.answer === 1) ? "wrong" : "picked") : "dim";
                return (
                  <button
                    key={String(value)}
                    type="button"
                    disabled={claim !== null}
                    onClick={() => chooseClaim(value)}
                    className={cn(
                      CHOICE,
                      "justify-center py-4 text-lg font-bold",
                      state === "right" && "border-emerald-500 bg-emerald-500/10",
                      state === "picked" && "border-brand bg-brand/10",
                      state === "wrong" && "animate-[practice-shake_.35s_ease-out] border-red-500 bg-red-500/10",
                      state === "dim" && "opacity-50",
                    )}
                  >
                    {value ? "Αληθής" : "Ψευδής"}
                  </button>
                );
              })}
            </div>
          </div>

          {claim === false && question.answer === 0 ? (
            <div className="grid animate-[practice-rise_.28s_ease-out] gap-2">
              <p className="text-sm font-semibold text-muted-foreground">Σωστά, είναι ψευδής. Διάλεξε ένα αντιπαράδειγμα:</p>
              {question.options.map((option, i) => {
                const tag = answered ? MARKER_TAG[option.marker ?? ""] : undefined;
                const state = !answered ? "" : option.marker === "x" ? "right" : pick === i ? "wrong" : "dim";
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={answered}
                    onClick={() => choosePick(i)}
                    className={cn(
                      CHOICE,
                      "flex-col items-stretch gap-1.5",
                      state === "right" && "border-emerald-500 bg-emerald-500/10",
                      state === "wrong" && "animate-[practice-shake_.35s_ease-out] border-red-500 bg-red-500/10",
                      state === "dim" && "opacity-75",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-border text-xs font-bold text-muted-foreground">
                        {"ΑΒΓΔΕΣ"[i]}
                      </span>
                      <span className="min-w-0 flex-1"><MathText text={option.text} /></span>
                      {tag ? (
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", tag.good ? "bg-emerald-600 text-white" : "bg-red-500/15 text-red-700 dark:text-red-300")}>
                          {tag.text}
                        </span>
                      ) : null}
                    </span>
                    {answered && option.reason ? (
                      <span className="pl-10 text-sm font-normal text-muted-foreground"><MathText text={option.reason} /></span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {question.type === "true_false" ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 0].map((value) => {
            const state = !answered ? "" : value === question.answer ? "right" : given === value ? "wrong" : "dim";
            return (
              <button
                key={value}
                type="button"
                disabled={answered}
                onClick={() => submit(value)}
                className={cn(
                  CHOICE,
                  "justify-center py-5 text-lg font-bold",
                  state === "right" && "border-emerald-500 bg-emerald-500/10",
                  state === "wrong" && "animate-[practice-shake_.35s_ease-out] border-red-500 bg-red-500/10",
                  state === "dim" && "opacity-50",
                )}
              >
                {value ? "Σωστό" : "Λάθος"}
              </button>
            );
          })}
        </div>
      ) : null}

      {question.type === "number" ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = parseTypedNumber(typed);
            if (value === null) {
              setTypedError(true);
              return;
            }
            submit(value);
          }}
        >
          <input
            id="practice-number"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            disabled={answered}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setTypedError(false);
            }}
            placeholder={typedError ? "Γράψε έναν αριθμό" : "Η απάντησή σου"}
            aria-label="Η απάντησή σου"
            className={cn(
              "min-w-0 flex-1 rounded-2xl border-2 bg-card px-4 py-3 text-2xl font-bold tabular-nums outline-none focus:border-brand",
              typedError && "border-destructive",
              answered && (feedback?.correct ? "border-emerald-500" : "border-red-500"),
            )}
          />
          <button type="submit" className={PRIMARY} disabled={answered}>
            Έλεγχος
          </button>
        </form>
      ) : null}

      {question.type === "slider" && question.slider ? (
        <div className="space-y-3">
          <p className="text-center font-[family-name:var(--font-round)] text-4xl font-bold tabular-nums">{fmt2(slider)}</p>
          <input
            id="practice-slider"
            type="range"
            min={question.slider.min}
            max={question.slider.max}
            step={question.slider.step}
            value={slider}
            disabled={answered}
            onChange={(event) => setSlider(Number(event.target.value))}
            aria-label="Τιμή"
            className="practice-range w-full"
          />
          <div className="relative mx-[15px] h-2.5">
            {answered ? (
              <span
                className="absolute top-0 h-2.5 rounded-full border-2 border-emerald-500 bg-emerald-500/20"
                style={{
                  left: `${((question.answer - question.tolerance - question.slider.min) / (question.slider.max - question.slider.min)) * 100}%`,
                  width: `${((2 * question.tolerance) / (question.slider.max - question.slider.min)) * 100}%`,
                }}
              />
            ) : null}
          </div>
          <div className="flex justify-between px-2 text-xs tabular-nums text-muted-foreground">
            {[0, 1, 2, 3, 4, 5].map((t) => (
              <span key={t}>{fmt(question.slider!.min + ((question.slider!.max - question.slider!.min) * t) / 5)}</span>
            ))}
          </div>
          {!answered ? (
            <button type="button" className={cn(PRIMARY, "w-full")} onClick={() => submit(slider)}>
              Έλεγχος
            </button>
          ) : null}
        </div>
      ) : null}

      {question.type === "point" && question.graph ? (
        <div className="flex flex-col items-center gap-3">
          <PracticeGraphView
            graph={question.graph}
            point={point}
            onPick={answered ? undefined : setPoint}
            answer={answered ? { x: question.answer, y: question.answerY } : null}
            className="w-full max-w-[340px]"
            label="Επίπεδο συντεταγμένων: σύρε το σημείο"
          />
          <p className="font-[family-name:var(--font-round)] text-lg font-bold tabular-nums">
            ({fmt(point.x)}, {fmt(point.y)})
          </p>
          {!answered ? (
            <button type="button" className={cn(PRIMARY, "w-full")} onClick={() => submit(point)}>
              Έλεγχος
            </button>
          ) : null}
        </div>
      ) : null}

      {feedback && feedback.correct && [3, 5, 8].includes(feedback.streak) ? <StreakPop streak={feedback.streak} /> : null}

      {feedback ? (
        <div
          className={cn(
            "-mx-4 mt-auto flex animate-[practice-rise_.28s_ease-out] flex-col gap-3 border-t-2 px-4 pb-2 pt-4",
            feedback.correct ? "border-emerald-500 bg-emerald-500/10" : "border-red-500 bg-red-500/10",
          )}
          role="status"
        >
          <h2 className={cn("flex items-center gap-2 text-xl font-extrabold", feedback.correct ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {feedback.correct ? "Σωστό!" : "Όχι ακριβώς"}
            {feedback.correct ? (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">+{feedback.points}</span>
            ) : null}
            {feedback.correct && feedback.streak >= 3 ? (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground">σερί {feedback.streak}</span>
            ) : null}
          </h2>
          {!feedback.correct && correctText ? (
            <p>
              <span className="font-semibold">Σωστή απάντηση:</span> {correctText}
            </p>
          ) : null}
          {question.type === "counterexample" && !feedback.correct && claim !== false && counterexample ? (
            <p>
              <span className="font-semibold">Αντιπαράδειγμα:</span> <MathText text={counterexample.text} />
              {counterexample.reason ? (
                <>
                  {" - "}
                  <MathText text={counterexample.reason} />
                </>
              ) : null}
            </p>
          ) : null}
          {question.explanation ? (
            <p className="whitespace-pre-line text-[0.95rem]">
              <MathText text={question.explanation} />
            </p>
          ) : null}
          <button ref={nextRef} type="button" className={PRIMARY} onClick={onNext}>
            {index + 1 >= total ? "Δες το αποτέλεσμα" : "Επόμενη"}
          </button>
          <ReportQuestion questionId={question.id} playedPrompt={question.prompt} />
        </div>
      ) : null}
    </section>
  );
}

/** "Κάτι δεν πάει καλά;" - a note to the teacher about this question. */
function ReportQuestion({ questionId, playedPrompt }: { questionId: string; playedPrompt: string }) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | string>("idle");
  if (state === "sent") return <p className="text-center text-sm text-muted-foreground">Ευχαριστούμε - ο καθηγητής θα το δει.</p>;
  if (!open) {
    return (
      <button type="button" className="self-center text-sm text-muted-foreground underline underline-offset-2" onClick={() => setOpen(true)}>
        Κάτι δεν πάει καλά με την ερώτηση;
      </button>
    );
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setState("sending");
        const result = await reportPracticeQuestionAction({ questionId, message, playedPrompt }).catch(() => ({ ok: false as const, error: "Η αναφορά δεν στάλθηκε - ξαναδοκίμασε." }));
        setState(result.ok ? "sent" : result.error);
      }}
    >
      <label htmlFor="practice-report" className="text-sm font-semibold">Τι δεν πάει καλά;</label>
      <textarea
        id="practice-report"
        rows={2}
        maxLength={1000}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="π.χ. η σωστή απάντηση είναι λάθος, ή κάτι λείπει"
        className="rounded-xl border-2 bg-card px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {state !== "idle" && state !== "sending" ? <p className="text-sm text-destructive">{state}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className={cn(SECONDARY, "flex-1")} disabled={state === "sending"}>
          {state === "sending" ? "Στέλνω…" : "Στείλε στον καθηγητή"}
        </button>
        <button type="button" className="px-3 text-sm text-muted-foreground underline underline-offset-2" onClick={() => setOpen(false)}>
          Άκυρο
        </button>
      </div>
    </form>
  );
}

function StreakPop({ streak }: { streak: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const width = (canvas.width = canvas.offsetWidth);
    const height = (canvas.height = canvas.offsetHeight);
    const context = canvas.getContext("2d");
    if (!context) return;
    const styles = getComputedStyle(document.documentElement);
    const gold = `hsl(${styles.getPropertyValue("--brand").trim()})`;
    const ink = `hsl(${styles.getPropertyValue("--foreground").trim()})`;
    const colors = [gold, gold, ink, "#3ecf8e"];
    const parts = Array.from({ length: 80 }, (_, i) => ({
      x: width / 2, y: 40, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7 - 2, size: 4 + Math.random() * 5, color: colors[i % colors.length], rotation: Math.random() * 6,
    }));
    let frame = 0;
    let handle = 0;
    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const part of parts) {
        part.vy += 0.25;
        part.x += part.vx;
        part.y += part.vy;
        part.rotation += 0.1;
        context.save();
        context.translate(part.x, part.y);
        context.rotate(part.rotation);
        context.fillStyle = part.color;
        context.fillRect(-part.size / 2, -part.size / 4, part.size, part.size / 2);
        context.restore();
      }
      if (++frame < 90) handle = requestAnimationFrame(draw);
      else context.clearRect(0, 0, width, height);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, []);
  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 top-0 z-10 h-80 w-full" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-10 z-20 -translate-x-1/2 animate-[practice-pop_1.4s_ease-out_forwards] whitespace-nowrap rounded-full bg-brand px-4 py-2 font-[family-name:var(--font-round)] font-bold text-brand-foreground shadow-lg">
        {streak} σωστές στη σειρά!
      </div>
    </>
  );
}

function SummaryScreen({
  results,
  total,
  roundPoints,
  bestStreak,
  dailyStreak,
  bestBefore,
  mistakesRound,
  mistakesCount,
  onAgain,
  onMistakes,
  onSections,
  viewer,
}: {
  results: Result[];
  total: number;
  roundPoints: number;
  bestStreak: number;
  dailyStreak: number;
  bestBefore: number;
  mistakesRound: boolean;
  mistakesCount: number;
  onAgain: () => void;
  onMistakes: () => void;
  onSections: () => void;
  viewer: Viewer;
}) {
  const right = results.filter((result) => result.correct).length;
  const outOfTen = Math.round((right / Math.max(total, 1)) * 10);
  const newBest = !mistakesRound && outOfTen > bestBefore && bestBefore > 0;
  const wrong = results.filter((result) => !result.correct);
  const headline = right === total ? "Τέλεια!" : right / total >= 0.7 ? "Πολύ καλά!" : right / total >= 0.5 ? "Καλή προσπάθεια" : "Ξαναπροσπάθησε, θα βγει";
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{mistakesRound ? "Γύρος λαθών" : "Τέλος γύρου"}</p>
        <p className="font-[family-name:var(--font-round)] text-6xl font-bold tabular-nums">
          {right}
          <span className="text-3xl text-muted-foreground">/{total}</span>
        </p>
        <h1 className="text-2xl font-extrabold">{headline}</h1>
        {newBest ? (
          <span className="rounded-full bg-brand px-3 py-0.5 text-sm font-bold text-brand-foreground">Νέο ρεκόρ!</span>
        ) : bestBefore > 0 && !mistakesRound ? (
          <p className="text-sm text-muted-foreground">Ρεκόρ σου: {bestBefore}/10</p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          [`+${roundPoints}`, "πόντοι"],
          [String(bestStreak), "σερί σωστών"],
          [String(dailyStreak), dailyStreak === 1 ? "μέρα στη σειρά" : "μέρες στη σειρά"],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col items-center rounded-2xl bg-muted px-2 py-3">
            <span className="font-[family-name:var(--font-round)] text-xl font-bold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      {wrong.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Μπήκαν στα λάθη σου</p>
          {wrong.map((result) => (
            <div key={result.question.id} className="flex gap-3 rounded-2xl border bg-card px-4 py-3">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
              <div className="min-w-0 text-[0.95rem]">
                <MathText text={result.question.prompt.split("\n")[0]} />
                <p className="text-xs text-muted-foreground">{result.question.sectionName}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-auto grid gap-2">
        <button type="button" className={PRIMARY} onClick={onAgain}>
          {mistakesRound ? "Ξανά τα λάθη μου" : "Άλλος ένας γύρος"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={SECONDARY} onClick={onMistakes} disabled={mistakesCount === 0}>
            Τα λάθη μου ({mistakesCount})
          </button>
          <button type="button" className={SECONDARY} onClick={onSections}>
            Άλλαξε ενότητες
          </button>
        </div>
        {viewer.kind !== "guest" ? (
          <Link href="/start" className="py-1 text-center text-sm text-muted-foreground underline underline-offset-2">
            Πίσω στην αρχική
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MistakesScreen({
  progress,
  error,
  onPlay,
  onBack,
}: {
  progress: PracticeProgress;
  error: string | null;
  onPlay: () => void;
  onBack: () => void;
}) {
  const count = progress.mistakes.length;
  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Τα λάθη μου</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {count ? `${count} ${count === 1 ? "ερώτηση" : "ερωτήσεις"} να ξαναδείς` : "Κανένα λάθος!"}
        </h1>
        <p className="text-muted-foreground">
          Μια ερώτηση φεύγει από εδώ όταν την απαντήσεις σωστά {RIGHTS_TO_CLEAR === 2 ? "δύο φορές" : `${RIGHTS_TO_CLEAR} φορές`}.
        </p>
      </div>
      <div className="grid gap-2">
        {progress.mistakes.slice(0, 50).map((mistake) => (
          <div key={mistake.id} className="flex gap-3 rounded-2xl border bg-card px-4 py-3">
            <span className="mt-2 size-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-[0.95rem]">
              <MathText text={mistake.prompt.split("\n")[0]} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {mistake.sectionName} · {TYPE_LABEL[mistake.type] ?? ""}
                <span className="inline-flex gap-1" title="Σωστές απαντήσεις μέχρι να φύγει">
                  {Array.from({ length: RIGHTS_TO_CLEAR }, (_, i) => (
                    <span key={i} className={cn("size-2 rounded-full border border-emerald-500", i < mistake.right && "bg-emerald-500")} />
                  ))}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-auto grid gap-2">
        <button type="button" className={PRIMARY} disabled={count === 0} onClick={onPlay}>
          Παίξε έναν γύρο με τα λάθη σου
        </button>
        <button type="button" className="py-1 text-sm text-muted-foreground underline underline-offset-2" onClick={onBack}>
          Πίσω
        </button>
      </div>
    </section>
  );
}
