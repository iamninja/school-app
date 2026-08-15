import katex from "katex";
import type { ReactNode } from "react";

/**
 * Renders teacher-authored text with inline ($...$) and display ($$...$$)
 * LaTeX math rendered via KaTeX. Falls through to a plain text node when the
 * string has no "$", so it's a drop-in replacement for `{text}`.
 *
 * SECURITY: only pass teacher-authored content here (question text, option
 * text). Never pass a student's free-text `textAnswer` - this injects
 * KaTeX's HTML output via dangerouslySetInnerHTML.
 */
const MATH_PATTERN = /\$\$([^$]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

export function MathText({ text }: { text: string }) {
  if (!text.includes("$")) {
    return <>{text}</>;
  }

  const pattern = new RegExp(MATH_PATTERN);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const displayExpr = match[1];
    const inlineExpr = match[2];
    const expr = displayExpr ?? inlineExpr ?? "";

    const html = katex.renderToString(expr, {
      throwOnError: false,
      displayMode: displayExpr !== undefined,
    });

    nodes.push(
      <span key={key++} dangerouslySetInnerHTML={{ __html: html }} />,
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}
