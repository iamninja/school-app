# Plan: a `counterexample` question type for Modus practice

## Why

The Panhellenic papers have Α/Ψ items: «Θεωρήστε τον ισχυρισμό … Να γράψετε αν είναι αληθής (Α) ή ψευδής (Ψ) και να αιτιολογήσετε την απάντησή σας». The reason is always a counterexample. Two existing types can't capture this:
- **true_false** only checks Α/Ψ.
- **choice** can offer counterexamples, but it shows one explanation for all of them. Students need to know why the option they picked doesn't work.

A wrong counterexample fails in one of two ways, and students make both mistakes:
- **the hypothesis fails.** For «γνησίως αύξουσα ⇒ f′ > 0», the student picks $x^2$, which isn't even increasing.
- **the conclusion holds.** The student picks $e^x$, which does have $f' > 0$, so it doesn't disprove anything.

The new type teaches these two checks.

## What the student sees

1. **Step 1.** The claim, and two buttons: **Αληθής** / **Ψευδής**.
   - If the answer is wrong, the question ends as wrong. Show the correct counterexample and the Explanation.
   - If the claim is true and they picked Αληθής, the question ends as correct and shows the Explanation.
2. **Step 2** (only for a false claim the student called Ψευδής). Prompt: «Διάλεξε ένα αντιπαράδειγμα». The options appear shuffled, one tap each.
3. **Feedback after step 2:**
   - Every option shows its reason line, with the picked one highlighted. A small tag on each option says what is wrong with it:
     - `[x]` gets **✓ αντιπαράδειγμα**
     - `[h]` gets **✗ δεν ισχύει η υπόθεση**
     - `[c]` gets **✗ ισχύει το συμπέρασμα**
     - `[ ]` has no tag, only its reason
   - Then the Explanation.

**Scoring:** the question counts as correct only if both steps are right. Store which step failed and, for a wrong step 2, the marker of the picked option (`h`, `c` or blank). The teacher can then see whether a student keeps failing on hypotheses or on conclusions.

## File format

```markdown
## Ο ισχυρισμός «αν η $f$ είναι παραγωγίσιμη και γνησίως αύξουσα στο $\mathbb{R}$, τότε $f'(x) > 0$ για κάθε $x \in \mathbb{R}$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = x^3$
  Είναι γνησίως αύξουσα, αλλά $f'(0) = 0$.
- [c] $f(x) = e^x$
  Ισχύει $f'(x) = e^x > 0$ για κάθε $x$, οπότε δεν διαψεύδει τον ισχυρισμό.
- [h] $f(x) = x^2$
  Δεν είναι γνησίως αύξουσα στο $\mathbb{R}$.
- [h] $f(x) = -x^3$
  Είναι γνησίως φθίνουσα.
Explanation: Ισχύει μόνο το «$f' > 0 \Rightarrow$ γνησίως αύξουσα». Το αντίστροφο είναι ψευδές.
Source: Πανελλαδικές 2020 · Θέμα Α
```

A true claim has no options. It looks the same to the student, so they can't learn that "every claim in this type is false":

```markdown
## Ο ισχυρισμός «αν η $f$ είναι παραγωγίσιμη στο $x_0$, τότε είναι συνεχής στο $x_0$».
Type: counterexample
Answer: Σωστό
Explanation: Είναι θεώρημα: $f(x) - f(x_0) = \frac{f(x) - f(x_0)}{x - x_0}(x - x_0) \to f'(x_0) \cdot 0 = 0$.
```

### Parser rules

| Item | Rule |
|---|---|
| `Type: counterexample` | Required. Do not infer it: these options would otherwise parse as `choice`. |
| Heading | The claim. The app adds the prompt «Είναι αληθής ή ψευδής;» itself. |
| `Answer:` | `Σωστό`/`Λάθος` (also `True`/`False`, `Αληθής`/`Ψευδής`). |
| Options, Answer Λάθος | 2 to 6 options, exactly one `[x]`. |
| Options, Answer Σωστό | None allowed. Import error if present. |
| Markers | `[x]` the counterexample, `[h]` the hypothesis fails, `[c]` the conclusion holds, `[ ]` wrong for another reason (e.g. not defined at $x_0$). Any other marker is an import error. |
| Reason line | The indented line(s) directly under an option, joined with spaces. Required for every non-`[x]` option (import warning if missing), optional for `[x]`. Use indentation, not a separator character: `\|` appears in LaTeX ($\|x\|$). |
| Other fields | `Explanation:` (required) and `Source:` as in other types. `Variables`/`Condition` are not supported in v1: ignore them with a warning. |
| Markers in `choice` questions | Still only `[x]`/`[ ]`. An `[h]`/`[c]` there is an import error that suggests `Type: counterexample`. |

### Text to add to the template spec

Under **THE FIVE TYPES**, which becomes **THE SIX TYPES**:

```
counterexample  A claim the student marks Αληθής/Ψευδής; if false, they
            then pick the counterexample. "Type: counterexample" is
            required. "Answer: Σωστό" (no options) or "Answer: Λάθος" with
            2 to 6 options: [x] the counterexample, [h] an option where
            the hypothesis fails, [c] one where the conclusion still
            holds, [ ] wrong for another reason. Under each option, an
            indented line says why it is or isn't a counterexample.
```

Under **WHAT TO ASK WITH EACH TYPE**:

```
counterexample  Claims students believe but are false (converse of a
            theorem, a dropped condition): "continuous => differentiable",
            "f'(x0) = 0 => extremum". Make the wrong options one [h] and
            one [c] at least - the two checks every counterexample needs.
            Mix in some true claims.
```

## After the app supports it

I convert `panellinies-sl.md`. Each of the 8 «Ποια συνάρτηση αποδεικνύει…» choice questions becomes one `counterexample` question, with the four «Ο ισχυρισμός … είναι αληθής.» Σ/Λ items merged into them. The plain Σ/Λ statements stay `true_false`. The markers already follow from the current explanations, e.g. for |x| ("continuous ⇒ differentiable"): $x^2$ `[c]`, $\frac{|x|}{x}$ `[h]`, $\sqrt{x}$ at 4 `[c]`.

## v3: the student writes their own counterexample

Decided 2026-11-17. v1 (pick from options) and v2 (mistakes shown to the
teacher) are live. In v3 the same question can also be answered by typing
a counterexample.

### Options or typed: chosen per student, not at random

The server already draws each round, so it decides the mode for each
question and sends it with the question (`RoundQuestion.mode: "options" | "typed"`).

| Who / when | Mode |
|---|---|
| Guest (not logged in) | options, always (the AI check costs money; typed is for students only) |
| Student who hasn't answered this question right yet | options |
| Student who has answered it right before (a `practice_answers` row with `correct = true` for this question) | typed |
| A true claim | unchanged: one step, Αληθής |

Picking from options tests recognition. Writing one is the real skill, and
it makes more sense once the student has seen what a good counterexample
looks like. A random mix is ruled out: the same student would get the easy
and the hard version unpredictably, and Progress would mean less.

**Teacher override, per question:** `auto` (default), `options` (always),
`typed` (always, for logged-in students; guests still get options).
"Always options" is for counterexamples that are awkward to type: piecewise
functions, a sequence described in words, a set. New column
`practice_questions.counterexample_mode text not null default 'auto'`, with
a check on the three values. In the file format: `Mode: auto|options|typed`.

### Typed mode in the game

1. Step 1 is unchanged: Αληθής / Ψευδής.
2. Step 2: "Γράψε ένα αντιπαράδειγμα". The maths keyboard (x, x², √, |x|,
   eˣ, ln, sin, fraction, π, x₀ =) with the live preview from the expression
   type (lib/practice-expr.ts `exprToTex`, `normalizeTyped`).
3. The check:
   - **First, a numeric comparison with the teacher's options.** If the typed
     function equals one of the options at the sample points, it gets that
     option's marker (`x` right, `h` / `c` / other wrong). This is instant,
     free and needs no AI.
   - **Otherwise, the Claude API.** A server action receives the claim, the
     typed function and the teacher's counterexample and options as
     reference, and answers with JSON:
     `{ verdict: "valid" | "hypothesis_fails" | "conclusion_holds" | "invalid", reason: "<one sentence in Greek>" }`.
     The answer is labelled "Έλεγχος από AI" and carries the existing
     "Κάτι δεν πάει καλά;" report link.
   - **The AI check fails or times out:** the question switches to the
     options, without counting against the student.
4. **"Δείξε μου επιλογές" escape:** the student can switch to the options
   at any time, for fewer points.

### Points

| Answer | Points |
|---|---|
| Typed, right | 15 |
| Options, right (as now) | 10 |
| Switched to options, then right | 5 |
| Wrong | 0 |

### What is stored

`practice_answers` gets `mode text` (`options` / `typed` / `switched`, null
for other types) and `typed text` (what the student wrote, for the
teacher). `detail` keeps its meaning: a wrong typed answer gets `h` / `c` /
`other` from the numeric match or the AI verdict, the same as a wrong pick.
So the v2 breakdown covers both modes without changes.

### For the teacher (extends v2)

- Progress > a student: typed / with options / switched, alongside the
  mistake bars.
- Section list: the answers students typed for a question, wrong ones
  first, with the AI's sentence. A teacher who disagrees marks one; the
  option to add it to the question as a new option, with its marker, comes
  later.

### Limits

- **Logged-in students only.** A cap per student per day (e.g. 20 AI
  checks); past it, typed questions fall back to options for the day.
- **Model and cost:** the latest small Claude model, with a short prompt and
  short JSON output. Cost and usage tracking as in the TODO item on AI spend.
- **Same keyboard for the `expression` type:** it gets the keyboard too, but
  needs no AI, since it is checked by value.
