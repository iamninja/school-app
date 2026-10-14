/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LastHomework } from "@/components/teacher-app/last-homework";

const HOMEWORK = {
  id: "h1",
  class_id: "c1",
  note: "Exercises 3-7, page 42",
  due_date: "2026-10-14",
  created_at: "2026-10-12T09:00:00Z",
};

describe("LastHomework", () => {
  it("shows when it was set, when it's due and the note", () => {
    render(<LastHomework homework={HOMEWORK} today="2026-10-14" homeworkHref="/hw" />);

    expect(screen.getByText("Last homework · set Mon 12 Oct · due today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exercises 3-7/ })).toHaveClass("line-clamp-2");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/hw");
  });

  it("expands the note on tap", async () => {
    render(<LastHomework homework={HOMEWORK} today="2026-10-13" homeworkHref="/hw" />);

    expect(screen.getByText(/due Wed 14 Oct/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Exercises 3-7/ }));
    expect(screen.getByRole("button", { name: /Exercises 3-7/ })).not.toHaveClass("line-clamp-2");
  });

  it("offers to set one when the class has none", () => {
    render(<LastHomework homework={null} today="2026-10-14" homeworkHref="/hw" />);

    expect(screen.getByText("No homework set for this class yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set one" })).toHaveAttribute("href", "/hw");
  });
});
