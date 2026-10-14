/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { HomeworkPanel } from "@/components/teacher-app/homework-panel";
import {
  createHomeworkAction,
  deleteHomeworkAction,
  updateHomeworkAction,
} from "@/app/protected/teacher/homework-actions";

vi.mock("@/app/protected/teacher/homework-actions", () => ({
  createHomeworkAction: vi.fn(),
  updateHomeworkAction: vi.fn(),
  deleteHomeworkAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const CLASSES = [
  { id: "c1", name: "Algebra", billingType: "monthly" },
  { id: "c2", name: "Geometry", billingType: "monthly" },
];

const EXISTING = {
  id: "h1",
  class_id: "c1",
  note: "Page 42",
  due_date: "2026-10-16",
  created_at: "2026-10-13T10:00:00Z",
};

function renderPanel(props: Partial<React.ComponentProps<typeof HomeworkPanel>> = {}) {
  return render(
    <HomeworkPanel
      classes={CLASSES}
      todayClassIds={["c2"]}
      selectedClassId="c1"
      initialHomework={[EXISTING]}
      nextLessonDates={["2026-10-16", "2026-10-19", "2026-10-23"]}
      today="2026-10-14"
      classPicker
      {...props}
    />,
  );
}

describe("HomeworkPanel", () => {
  beforeEach(() => {
    vi.mocked(createHomeworkAction).mockReset();
    vi.mocked(updateHomeworkAction).mockReset();
    vi.mocked(deleteHomeworkAction).mockReset();
    push.mockReset();
  });

  it("sets homework due at the next lesson by default, with notify on", async () => {
    vi.mocked(createHomeworkAction).mockResolvedValue({
      ...EXISTING,
      id: "h2",
      note: "Exercises 1-5",
      className: "Algebra",
    } as never);
    renderPanel();

    await userEvent.type(screen.getByLabelText("New homework"), "Exercises 1-5");
    await userEvent.click(screen.getByRole("button", { name: /Set homework for Algebra/ }));

    expect(createHomeworkAction).toHaveBeenCalledWith({
      classId: "c1",
      note: "Exercises 1-5",
      dueDate: "2026-10-16",
      notify: true,
    });
    expect(await screen.findByText("Exercises 1-5")).toBeInTheDocument();
    expect(screen.getByLabelText("New homework")).toHaveValue("");
  });

  it("offers the 2nd and 3rd lessons as due dates too", async () => {
    vi.mocked(createHomeworkAction).mockResolvedValue({ ...EXISTING, id: "h2" } as never);
    renderPanel();

    expect(screen.getByRole("button", { name: "Next lesson · Fri 16 Oct" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2nd lesson · Mon 19 Oct" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New homework"), "Project");
    await userEvent.click(screen.getByRole("button", { name: "3rd lesson · Fri 23 Oct" }));
    await userEvent.click(screen.getByRole("button", { name: /Set homework/ }));

    expect(createHomeworkAction).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-10-23" }),
    );
  });

  it("can set homework quietly with no due date", async () => {
    vi.mocked(createHomeworkAction).mockResolvedValue({ ...EXISTING, id: "h2" } as never);
    renderPanel();

    await userEvent.type(screen.getByLabelText("New homework"), "Read chapter 3");
    await userEvent.click(screen.getByRole("button", { name: "No due date" }));
    await userEvent.click(screen.getByLabelText(/Notify students/));
    await userEvent.click(screen.getByRole("button", { name: /Set homework/ }));

    expect(createHomeworkAction).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null, notify: false }),
    );
  });

  it("offers 'in a week' relative to today", async () => {
    vi.mocked(createHomeworkAction).mockResolvedValue({ ...EXISTING, id: "h2" } as never);
    renderPanel({ nextLessonDates: [] });

    expect(screen.queryByRole("button", { name: /Next lesson/ })).toBeNull();
    await userEvent.type(screen.getByLabelText("New homework"), "Revise");
    await userEvent.click(screen.getByRole("button", { name: "In a week" }));
    await userEvent.click(screen.getByRole("button", { name: /Set homework/ }));

    expect(createHomeworkAction).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-10-21" }),
    );
  });

  it("lists today's classes first and switches class through the URL", async () => {
    renderPanel();

    const select = screen.getByLabelText("Class");
    const options = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Geometry", "Algebra"]);

    await userEvent.selectOptions(select, "c2");
    expect(push).toHaveBeenCalledWith("/teacher-app/homework?class=c2");
  });

  it("hides the class picker inside a lesson", () => {
    renderPanel({ classPicker: false });
    expect(screen.queryByLabelText("Class")).toBeNull();
  });

  it("edits a homework's note", async () => {
    vi.mocked(updateHomeworkAction).mockResolvedValue({
      ...EXISTING,
      note: "Page 43",
    } as never);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Edit homework" }));
    const note = screen.getByLabelText("Homework note");
    await userEvent.clear(note);
    await userEvent.type(note, "Page 43");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateHomeworkAction).toHaveBeenCalledWith("h1", {
      note: "Page 43",
      dueDate: "2026-10-16",
    });
    expect(await screen.findByText("Page 43")).toBeInTheDocument();
  });

  it("asks for a second tap before deleting", async () => {
    vi.mocked(deleteHomeworkAction).mockResolvedValue(undefined);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Delete homework" }));
    expect(deleteHomeworkAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteHomeworkAction).toHaveBeenCalledWith("h1");
    expect(screen.queryByText("Page 42")).toBeNull();
  });
});
