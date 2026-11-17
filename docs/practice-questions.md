<!--
MODUS PRACTICE QUESTIONS - FORMAT AND INSTRUCTIONS
===================================================

This file is both a template and a specification. Import it on the
Practice tab of the Modus console ("Import from file"). Everything inside
<!-- ... --> comments is ignored by the importer.

INSTRUCTIONS FOR AN AI WRITING QUESTIONS IN THIS FORMAT
-------------------------------------------------------
You are writing practice questions for Greek secondary-school maths
students. Follow these rules exactly:

1. Write the questions, options and explanations in Greek. Keep the
   keywords (Answer, Type, Tolerance, Range, Step, Window, Plot, Roots,
   Row, Mode, Variables, Condition, Explanation, Source) in English, as
   below.
2. Put ALL mathematics in LaTeX between single dollar signs: $x^2 - 4$,
   $\frac{1}{2}$, $\sqrt{50}$. Never use $$...$$ display maths. Use a
   decimal comma inside maths as {,} : $7{,}5$.
3. One question per "## " heading. The heading is the question; extra
   lines right under it continue the question text.
4. Every question gets an "Explanation:" - one or two short sentences a
   student can learn from: the method, not just the result.
5. Questions must be checkable automatically. Use only the types below.
   Never ask for a proof, a sketch or a written answer.
6. Each question must have exactly one correct answer (for multi: one
   correct set of options). Make the wrong options the mistakes students
   really make (sign errors, forgetting a case, a wrong formula) - not
   random numbers.
7. Prefer templates with random numbers (see VARIABLES) for routine
   exercises, so practice never repeats the same numbers. Use fixed
   questions for concepts and definitions.
8. Stay within the chapter or section you were given. Start the file with
   "# <section name>". For several sections, put them in one file, each
   under its own "# <section name>" heading: every question goes into the
   section above it.
9. Mix the types, and order questions from easier to harder.
10. Add "Source:" only when a question really comes from somewhere, and
   never invent one. See SOURCE below.
11. When you are given the school book, follow it: its terminology, its
   notation and its order of topics. A question taken or adapted from one
   of its exercises gets "Source: Σχολικό βιβλίο σελ. N, άσκ. M" - only
   with the real page and exercise; if you aren't sure of them, write just
   "Source: Σχολικό βιβλίο". "Source: Πανελλαδικές <year> · Θέμα <letter>"
   only for a question from an actual past paper you were given.
12. Every question must stand on its own: no "as in exercise 3". Say
   "στο σχήμα" only when the question has its own figure (see FIGURES).
13. Check each question before writing it down: solve it yourself, make
   sure the answer and the explanation agree, and that every wrong option
   really is wrong. For a template, try a few draws and check the numbers
   stay friendly and the Condition can be met.
14. Reply with the file only - one Markdown code block, starting with
   "# <section name>", nothing before or after it. Unless you are asked
   for a number, write 15 to 25 questions per section.

THE TYPES
---------
choice      Multiple choice. 2 to 6 options, exactly one marked [x].
multi       Tick all that apply. 2 to 8 options, one or more marked [x];
            right only when exactly those are ticked.
true_false  "Answer: Σωστό" or "Answer: Λάθος" (True/False also work).
number      The student types a number. "Answer:" is the number or an
            expression; add "Tolerance: 0.01" when the answer isn't exact.
            Students may type 7,5 or 7.5 or a fraction like 1/4.
slider      The student drags a marker along a number line.
            "Range: 0..10" (required), "Answer:", optional "Tolerance:"
            (default: a fortieth of the range) and "Step:".
point       The student drags a point on a coordinate grid (snaps to 0.5).
            "Answer: (2, 1)", optional "Window: -1..5, -1..5" (x range,
            then y range; default -5..5 for both), "Plot: x + 1" to draw
            a curve on the grid (repeatable), optional "Tolerance:"
            (default 0.25).
interval    The student builds an interval: two endpoints and a bracket at
            each end. "Type: interval" is required. "Answer: [-1, 3)",
            "(-∞, {{a}}]" (also -inf/+inf). Endpoints may be expressions
            (sqrt(2), a/2); students may type 3/4, √2, 2π.
order       The student puts items in order. Write them in the RIGHT order
            as a numbered list "1. ...", "2. ..." (2 to 8 items); the game
            shuffles them. No "Answer:".
match       The student pairs items. One line per pair, "- left -> right"
            (2 to 6 pairs; → works too); the game shuffles the right side.
            No "Answer:".
sign_table  The student fills the sign (+/-) of an expression in each
            interval between its roots. "Roots: -1, 2" (smallest first,
            "Roots: none" for none), "Answer: + - +" (one sign per interval:
            one more than the roots), optional "Row: $f'(x)$" (what the
            sign is of).
expression  The student types an expression in x. "Type: expression" is
            required; "Answer: 3x^2 + 2" (may use the variables). Checked
            by value at many x, so any equal form counts - it can't insist
            on a form ("factorise" is not checkable).
counterexample  A claim the student marks Αληθής/Ψευδής; if false, they
            then pick the counterexample. "Type: counterexample" is
            required. "Answer: Σωστό" (no options) or "Answer: Λάθος" with
            2 to 6 options: [x] the counterexample, [h] an option where
            the hypothesis fails, [c] one where the conclusion still
            holds, [ ] wrong for another reason. Under each option, an
            indented line says why it is or isn't a counterexample. No
            Variables/Condition in this type. Write each option as
            "$f(x) = ...$" (optionally ", στο $x_0 = 0$") when you can:
            then a student who knows the question may type the
            counterexample instead of picking it. Optional "Mode: options"
            keeps a question multiple choice; "Mode: typed" always asks
            for it typed (default: auto).
If "Type:" is left out it is worked out: options -> choice (multi if
several are [x]), numbered items -> order, "->" pairs -> match, Roots ->
sign_table, Range -> slider, a point answer or Window/Plot -> point,
Σωστό/Λάθος -> true_false, otherwise number. Interval, expression and
counterexample questions always need their "Type:".
Students may type exact values in number answers too: 3/4, √2, 2π.

WHAT TO ASK WITH EACH TYPE
--------------------------
choice      Concepts, choosing the right formula or method, recognising a
            property or a graph; also answers that are intervals, sets,
            expressions or signs (they can't be typed, so offer them as
            options).
true_false  Definitions, theorems and their conditions, properties students
            mix up (e.g. "if f'(x0) = 0 then f has an extremum at x0").
multi       Properties that several items have: which numbers are
            rational, which points lie on the line, which functions are
            increasing. Mix true and false ones; vary how many are right.
number      Calculations with one numeric result: solutions of equations,
            values of f, f', limits, slopes, areas, probabilities.
slider      Estimating where a value lies: roots, square roots, a
            probability between 0 and 1, a percentage.
point       Coordinates: a vertex, an intersection, a point on a line, a
            symmetric point, an extremum of a plotted function.
interval    Solutions of inequalities, domains, where f is increasing or
            positive.
order       Numbers to sort (fractions, roots, negatives, powers), or the
            steps of a method in order.
match       Function <-> derivative or graph property, equation <-> slope or
            solution, term <-> definition.
sign_table  The sign of a polynomial, a product or f' - the step before
            monotonicity and inequalities.
expression  Derivatives, simplified forms, a line's or parabola's equation.
counterexample  Claims students believe but are false (converse of a
            theorem, a dropped condition): "continuous => differentiable",
            "f'(x0) = 0 => extremum". Make the wrong options one [h] and
            one [c] at least - the two checks every counterexample needs.
            Mix in some true claims, so the answer isn't always Ψευδής.
The format can't check proofs, sketches, full tables of variation or
answers with several parts. Turn such exercises into one of the above:
ask for one value (f'(2), the coefficient of x), the interval, the signs,
or the expression.

VARIABLES (random numbers)
--------------------------
Variables: a=2..9, x=-10..10, b=-20..20 !0, c=a*x+b
  a=2..9               a whole number from 2 to 9
  p=0.5..3 step 0.5    0.5, 1, 1.5, ... 3
  b=-20..20 !0         exclude a value (several: !0 !1)
  s=-1|1               one of a list
  c=a*x+b              computed from earlier variables
Condition: a != b      every draw must satisfy it (and, or, not, ==, !=, <, >)
Use {{a}} in the question, options, answer and explanation for a value,
{{a*x+b}} for any expression, and {{+b}} for a signed value ("x {{+b}}"
gives "x + 3" or "x - 3"). In "Answer:" you can write the expression
directly: "Answer: x". Choose ranges so the numbers stay friendly
(no 1x, no 0x, no huge results) - use exclusions and Condition for that.
Don't name a variable x in a question that has a Plot (x is the axis).
Expressions know + - * / ^, sqrt abs round(v, digits) floor ceil min max
mod gcd lcm, sin cos tan (radians), sind cosd tand (degrees), ln log log2
exp, pi and e.

FIGURES (optional)
------------------
A question may have one figure, written in TikZ inside a ```tikz block
(or a bare \begin{tikzpicture} ... \end{tikzpicture}) anywhere under its
heading. The app draws it; students never see the code. Supported:
  \coordinate (A) at (0,0);   points: (1,2)  (A)  (30:2)  ++(1,0)
                              ($(A)!0.5!(B)$)  ($(B)+(D)-(A)$)  (M |- 0,0)
  \draw / \fill / \filldraw [options] path;   with -- , -- cycle,
      circle (r), arc (a:b:r), rectangle (P), grid (P),
      node[midway, above] {$a$}, coordinate (M)
  \node[below left] at (A) {$A$};
  \pic[draw] {right angle = B--A--C};
  \pic[draw, "$\omega$", angle eccentricity=1.6] {angle = C--B--A};
  options: thick, very thick, dashed, dotted, red/blue/green/orange/...,
  fill=blue!15, ->, <->, help lines; \begin{tikzpicture}[scale=0.8].
  Inside {...} numbers, sin/cos take degrees, as in TikZ.
Not supported (the import says so): \foreach, \clip, tkz-euclide,
decorations, plots. Use {{a}} in coordinates and labels for random
numbers: (0,{{b}}) and {$ {{a}} $}. Keep figures simple and label every
point the question names.

SOURCE (optional)
-----------------
Students see where a question comes from as a small label. One per question:
Source: Πανελλαδικές 2019 · Θέμα Β
Source: Σχολικό βιβλίο σελ. 45, άσκ. 3
Source: Μαθηματική Εταιρεία
  Πανελλαδικές (or Πανελλήνιες) and Σχολικό βιβλίο are recognised, with
  whatever follows as the detail. Anything else is taken as the source's
  name. "Πηγή:" works as well as "Source:".
-->

# Η ευθεία

## Ποια είναι η κλίση της ευθείας $y = 3x - 2$;
- [x] $3$
- [ ] $-2$
- [ ] $\frac{2}{3}$
- [ ] $-3$
Explanation: Στη μορφή $y = λx + β$ η κλίση είναι το $λ$, εδώ $3$. Το $-2$ είναι η τεταγμένη επί την αρχή.

## Η ευθεία $x = 4$ είναι παράλληλη στον άξονα $y'y$.
Answer: Σωστό
Explanation: Όλα τα σημεία της έχουν $x = 4$, άρα είναι κατακόρυφη.
Source: Σχολικό βιβλίο

## Λύσε την εξίσωση ${{a}}x {{+b}} = {{c}}$. Πόσο είναι το $x$;
Answer: x
Variables: a=2..9, x=-10..10, b=-20..20 !0, c=a*x+b
Explanation: ${{a}}x = {{c - b}}$, άρα $x = \frac{ {{c - b}} }{ {{a}} } = {{x}}$.

## Ποια είναι η κλίση της ευθείας που περνά από τα $A({{x1}}, {{y1}})$ και $B({{x2}}, {{y2}})$;
- [x] ${{(y2 - y1)/(x2 - x1)}}$
- [ ] ${{(x2 - x1)/(y2 - y1)}}$
- [ ] ${{-(y2 - y1)/(x2 - x1)}}$
Variables: x1=-4..4, y1=-4..4, x2=-4..4, y2=-4..4
Condition: x2 != x1 and y2 != y1 and abs(y2 - y1) != abs(x2 - x1) and mod(y2 - y1, x2 - x1) == 0
Explanation: $λ = \frac{y_2 - y_1}{x_2 - x_1} = \frac{ {{y2 - y1}} }{ {{x2 - x1}} } = {{(y2 - y1)/(x2 - x1)}}$.

## Πού βρίσκεται το $\sqrt{50}$ στην αριθμογραμμή;
Range: 0..10
Answer: sqrt(50)
Tolerance: 0.25
Explanation: $7^2 = 49$ και $8^2 = 64$, οπότε το $\sqrt{50}$ είναι λίγο πάνω από το $7$ (περίπου $7{,}07$).

## Βάλε το σημείο τομής των ευθειών $y = x {{+p}}$ και $y = -x {{+q}}$.
Answer: ((q - p)/2, (q + p)/2)
Window: -6..6, -6..6
Plot: x + p
Plot: -x + q
Variables: p=-4..4 !0, q=-4..4 !0
Condition: mod(q - p, 2) == 0 and q != p
Explanation: $x {{+p}} = -x {{+q}}$, άρα $x = {{(q - p)/2}}$ και $y = {{(q + p)/2}}$.

## Βάλε την κορυφή της παραβολής $y = (x {{+(-k)}})^2 {{+l}}$.
Type: point
Answer: (k, l)
Window: -5..5, -5..5
Plot: (x - k)^2 + l
Variables: k=-3..3 !0, l=-3..3
Explanation: Η $y = (x - κ)^2 + λ$ έχει κορυφή το $(κ, λ)$, εδώ $({{k}}, {{l}})$.

## Ο ισχυρισμός «αν η $f$ είναι συνεχής στο $x_0$, τότε είναι παραγωγίσιμη στο $x_0$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = |x|$ στο $x_0 = 0$
  Είναι συνεχής στο $0$, αλλά δεν είναι παραγωγίσιμη εκεί (γωνία).
- [c] $f(x) = x^2$ στο $x_0 = 0$
  Είναι παραγωγίσιμη στο $0$, οπότε δεν διαψεύδει τον ισχυρισμό.
- [h] $f(x) = \frac{|x|}{x}$ στο $x_0 = 0$
  Δεν ορίζεται στο $0$, άρα δεν είναι συνεχής εκεί.
Explanation: Ισχύει το αντίστροφο: παραγωγίσιμη στο $x_0$ $\Rightarrow$ συνεχής στο $x_0$.

## Ποια σημεία ανήκουν στην ευθεία $y = 2x - 1$;
- [x] $(0, -1)$
- [x] $(2, 3)$
- [ ] $(1, 3)$
- [ ] $(-1, -1)$
Explanation: Ένα σημείο ανήκει στην ευθεία όταν οι συντεταγμένες του επαληθεύουν την εξίσωση: $2 \cdot 2 - 1 = 3$, ενώ $2 \cdot 1 - 1 = 1 \neq 3$.

## Βάλε τις ευθείες στη σειρά, από τη μικρότερη κλίση στη μεγαλύτερη.
1. $y = -3x + 1$
2. $y = -\frac{1}{2}x$
3. $y = 4$
4. $y = x - 5$
5. $y = 3x + 2$
Explanation: Συγκρίνουμε μόνο τους συντελεστές του $x$: $-3 < -\frac{1}{2} < 0 < 1 < 3$.

## Αντιστοίχισε κάθε ευθεία με την κλίση της.
- $y = 2x + 1$ -> $2$
- $2y = x$ -> $\frac{1}{2}$
- $y = -x + 3$ -> $-1$
- $y = 5$ -> $0$
Explanation: Λύνουμε ως προς $y$: η κλίση είναι ο συντελεστής του $x$.

## Βρες το πρόσημο της $y = {{a}}x {{+(-a*r)}}$.
Roots: {{r}}
Answer: - +
Variables: a=2..4, r=-4..4 !0
Explanation: Για $a > 0$ η $y = ax + β$ είναι αρνητική αριστερά από τη ρίζα της $x = {{r}}$ και θετική δεξιά.

## Για ποια $x$ είναι ${{a}}x {{+b}} \ge 0$;
Type: interval
Answer: [-b/a, +∞)
Variables: a=2..5, b=-10..10 !0, k=b/a
Condition: k == round(k)
Explanation: ${{a}}x \ge {{-b}}$, άρα $x \ge {{-b/a}}$.

## Γράψε την εξίσωση της ευθείας με κλίση ${{a}}$ που τέμνει τον $y'y$ στο ${{b}}$.
Type: expression
Answer: a x + b
Variables: a=-4..4 !0 !1, b=-5..5 !0
Explanation: Η ευθεία $y = λx + β$ έχει κλίση $λ$ και τέμνει τον $y'y$ στο $β$: $y = {{a}}x {{+b}}$.

## Στο σχήμα, πόση είναι η υποτείνουσα $B\Gamma$;
Answer: sqrt(a^2 + b^2)
Variables: a=3|6|5, b=4|8|12
Condition: (a == 3 and b == 4) or (a == 6 and b == 8) or (a == 5 and b == 12)
Explanation: Από το Πυθαγόρειο θεώρημα $B\Gamma^2 = {{a}}^2 + {{b}}^2 = {{a^2 + b^2}}$, άρα $B\Gamma = {{sqrt(a^2 + b^2)}}$.
```tikz
\coordinate (A) at (0,0);
\coordinate (B) at ({{b}},0);
\coordinate (C) at (0,{{a}});
\draw[thick] (A) -- (B) -- (C) -- cycle;
\pic[draw] {right angle = B--A--C};
\node[below left] at (A) {$A$};
\node[below right] at (B) {$B$};
\node[above left] at (C) {$\Gamma$};
\path (A) -- (B) node[midway, below] {$ {{b}} $};
\path (A) -- (C) node[midway, left] {$ {{a}} $};
```
