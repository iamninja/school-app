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
   keywords (Answer, Type, Tolerance, Range, Step, Window, Plot,
   Variables, Condition, Explanation, Source) in English, as below.
2. Put ALL mathematics in LaTeX between single dollar signs: $x^2 - 4$,
   $\frac{1}{2}$, $\sqrt{50}$. Never use $$...$$ display maths. Use a
   decimal comma inside maths as {,} : $7{,}5$.
3. One question per "## " heading. The heading is the question; extra
   lines right under it continue the question text.
4. Every question gets an "Explanation:" - one or two short sentences a
   student can learn from: the method, not just the result.
5. Questions must be checkable automatically. Use only the five types
   below. Never ask for a proof, a sketch or a written answer.
6. Each question must have exactly one correct answer. For multiple choice,
   make the wrong options the mistakes students really make (sign errors,
   forgetting a case, a wrong formula) - not random numbers.
7. Prefer templates with random numbers (see VARIABLES) for routine
   exercises, so practice never repeats the same numbers. Use fixed
   questions for concepts and definitions.
8. Stay within the chapter or section you were given. Start the file with
   "# <section name>".
9. Mix the types, and order questions from easier to harder.
10. Add "Source:" only when a question really comes from somewhere, and
   never invent one. See SOURCE below.

THE FIVE TYPES
--------------
choice      Multiple choice. 2 to 6 options, exactly one marked [x].
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
If "Type:" is left out it is worked out: options -> choice, Range ->
slider, a point answer or Window/Plot -> point, Σωστό/Λάθος -> true_false,
otherwise number.

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
