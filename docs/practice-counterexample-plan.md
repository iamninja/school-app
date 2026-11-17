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
