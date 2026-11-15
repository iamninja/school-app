import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncPracticeProgressAction, type PracticeAnswerUpload } from "@/app/practice/actions";
import { useProgress } from "@/components/practice/practice-game";
import { PROGRESS_KEY, emptyProgress, type PracticeProgress } from "@/lib/practice-progress";

vi.mock("@/app/practice/actions", () => ({
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));

const PENDING_KEY = "modus-practice-pending-v1";
const STUDENT_CACHE_KEY = "modus-practice-student-v1";
const sync = vi.mocked(syncPracticeProgressAction);

const answer = (clientId: string): PracticeAnswerUpload => ({
  clientId, questionId: "q1", sectionId: "s1", correct: true, points: 10, answeredAt: "2026-11-15T10:00:00Z",
});
const withPoints = (points: number): PracticeProgress => ({ ...emptyProgress(), points });
const pending = () => JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]").map((item: PracticeAnswerUpload) => item.clientId);
/** The page passes the account's progress once; a fresh object every render would loop. */
const mount = (student: boolean, saved: PracticeProgress | null) => renderHook(() => useProgress(student, saved));
/** Lets the debounce fire and the (mocked) server answer. */
const settle = async (ms = 1500) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sync.mockReset().mockResolvedValue({ ok: true, saved: 1 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a guest", () => {
  it("keeps progress in the browser and never talks to the server", async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(withPoints(40)));
    const { result } = mount(false, null);
    expect(result.current.progress.points).toBe(40);

    act(() => {
      result.current.update((prev) => ({ ...prev, points: prev.points + 10 }));
      result.current.queueAnswer(answer("a1"));
    });
    await settle();

    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!).points).toBe(50);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("a student", () => {
  it("sends answers in one batch after a short pause, then forgets them", async () => {
    const { result } = mount(true, withPoints(100));
    act(() => {
      result.current.queueAnswer(answer("a1"));
      result.current.update((prev) => ({ ...prev, points: prev.points + 10 }));
      result.current.queueAnswer(answer("a2"));
    });
    expect(pending()).toEqual(["a1", "a2"]);
    await settle(1000);
    expect(sync).not.toHaveBeenCalled();
    await settle(600);

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][0].answers.map((a) => a.clientId)).toEqual(["a1", "a2"]);
    expect((sync.mock.calls[0][0].progress as PracticeProgress).points).toBe(110);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("keeps answers on the device while offline and sends them when back online", async () => {
    sync.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { result } = mount(true, withPoints(0));
    act(() => result.current.queueAnswer(answer("a1")));
    await settle();
    expect(pending()).toEqual(["a1"]);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync.mock.calls[1][0].answers.map((a) => a.clientId)).toEqual(["a1"]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("keeps answers when the server says no, for the next try", async () => {
    sync.mockResolvedValueOnce({ ok: false, error: "rate limited" });
    const { result } = mount(true, withPoints(0));
    act(() => result.current.queueAnswer(answer("a1")));
    await settle();
    expect(pending()).toEqual(["a1"]);
  });

  it("sends answers left from an earlier visit as soon as the page opens", async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify([answer("old")]));
    mount(true, withPoints(0));
    await settle(0);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][0].answers.map((a) => a.clientId)).toEqual(["old"]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("doesn't lose an answer given while the previous batch is on its way, nor send it twice", async () => {
    let answerServer: (value: { ok: true; saved: number }) => void = () => {};
    sync.mockImplementationOnce(() => new Promise((resolve) => (answerServer = resolve)));
    const { result } = mount(true, withPoints(0));
    act(() => result.current.queueAnswer(answer("a1")));
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);

    // a2 arrives while a1's batch is still on its way; the debounce fires
    // while that send is in flight and must not start a second one.
    act(() => result.current.queueAnswer(answer("a2")));
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);

    await act(async () => answerServer({ ok: true, saved: 1 }));
    expect(pending()).toEqual(["a2"]);

    // The next change sends what's left - a2 only.
    act(() => result.current.update((prev) => prev));
    await settle();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync.mock.calls[1][0].answers.map((a) => a.clientId)).toEqual(["a2"]);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("sends what's waiting when the student leaves the page", async () => {
    const { result } = mount(true, withPoints(0));
    act(() => result.current.queueAnswer(answer("a1")));
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sync).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
});

describe("carrying a guest's progress over to the account", () => {
  it("adds it to the account once and clears it from the device", async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(withPoints(40)));
    const first = mount(true, withPoints(100));
    expect(first.result.current.progress.points).toBe(140);
    expect(first.result.current.carriedOver).toBe(true);
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    await settle(0);
    expect((sync.mock.calls[0][0].progress as PracticeProgress).points).toBe(140);
    first.unmount();

    // Next visit: the server has 140; nothing is added a second time.
    const again = mount(true, withPoints(140));
    expect(again.result.current.progress.points).toBe(140);
    expect(again.result.current.carriedOver).toBe(false);
  });

  it("starts from this device's copy when the account had nothing to load", () => {
    localStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify(withPoints(70)));
    const { result } = mount(true, null);
    expect(result.current.progress.points).toBe(70);
  });
});
