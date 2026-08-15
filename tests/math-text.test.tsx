import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MathText } from "@/components/math-text";

describe("MathText", () => {
  it("renders plain text as a plain text node with no math delimiters", () => {
    const { container } = render(<MathText text="What is 2 + 2?" />);
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("renders KaTeX output for inline math", () => {
    const { container } = render(<MathText text="Solve $x^2$ for x" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders display-mode KaTeX for $$...$$ as a single block, not two inline matches", () => {
    const { container } = render(<MathText text="$$\frac{1}{2}$$" />);
    const katexNodes = container.querySelectorAll(".katex");
    expect(katexNodes.length).toBe(1);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("does not throw on malformed LaTeX and shows KaTeX's error styling", () => {
    expect(() =>
      render(<MathText text="Bad expr $\frac{1}{$ here" />),
    ).not.toThrow();
  });

  it("leaves currency-style text with two dollar signs as literal text", () => {
    const { container } = render(
      <MathText text="Apples are $2 each and oranges are $3 each" />,
    );
    expect(container.querySelector(".katex")).toBeNull();
    expect(
      screen.getByText(/apples are \$2 each and oranges are \$3 each/i),
    ).toBeInTheDocument();
  });
});
