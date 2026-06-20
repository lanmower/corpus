# Patterns — Complete Study Guide

## Contents

### Numeric Patterns with a Constant Difference (Linear Sequences)

A **linear sequence** is a list of numbers where you add (or subtract) the *same* number to move from one term to the next. That fixed number is the **constant difference**, written **d**. For example, 3, 7, 11, 15, ... adds 4 every step, so d = 4.

**Finding the constant difference.** Subtract any term from the term after it: d = T₂ − T₁ = T₃ − T₂. The difference must be identical between every consecutive pair. If it changes, the sequence is not linear and a rule of the form dn + c will not work.

**The general (nth-term) rule.** Every linear sequence can be written as

> Tₙ = dn + c

where **d** is the constant difference and **c = T₀ = first term − d**. The value c is what the sequence would be at position 0, one step before the first term. A frequent mistake is to set c equal to the first term; that is only correct when d = 0. Always compute c = T₁ − d.

**Worked example.** For 7, 12, 17, 22, ...: d = 12 − 7 = 5, and c = 7 − 5 = 2, so Tₙ = 5n + 2. Verify on two terms: T₁ = 5(1) + 2 = 7 ✓ and T₃ = 5(3) + 2 = 17 ✓. For a decreasing sequence such as 20, 17, 14, 11, ..., d is negative: d = −3, c = 20 − (−3) = 23, giving Tₙ = −3n + 23.

**Extending a sequence** can be done quickly by repeatedly adding d, or by substituting positions into the formula. The formula is essential when a question jumps far ahead.

**Finding a specific term.** Substitute the position into Tₙ. To find the 50th term of 4, 9, 14, ...: Tₙ = 5n − 1, so T₅₀ = 5(50) − 1 = 249.

**Finding which term equals a given value.** Set Tₙ equal to that value and solve for n. For 5, 8, 11, ... reaching 95: 3n + 2 = 95 → n = 31, so 95 is the 31st term. Because n counts position, it must be a **positive whole number**. If solving gives a fraction (for example n = 25.25 when testing whether 100 is in 3, 7, 11, ...), the value is **not** a term of the sequence, and you must say so.

**Using two known terms.** If T₃ = 17 and T₇ = 37, there are 4 steps between them, so 4d = 37 − 17 = 20, giving d = 5; then T₀ = 17 − 3d = 2, so Tₙ = 5n + 2.


### Patterns with a Constant Ratio and Other Special Patterns

Not every pattern grows by adding a constant. Some grow by **multiplying**, and others follow well-known number shapes.

**Geometric patterns (constant ratio).** In a geometric sequence you multiply by the same number each time to get the next term. That multiplier is the **constant ratio**, r. Find it by dividing any term by the one before it: r = T₂ ÷ T₁. For 2, 6, 18, 54, ..., r = 3. To extend, keep multiplying: 5, 10, 20, 40, 80, 160 (r = 2). The ratio may be a fraction: 64, 32, 16, 8, 4, 2 halves each time (r = ½) and still counts as geometric even though it decreases. The nth term can be written

> Tₙ = T₁ × r^(n−1)

The exponent is (n − 1) because the first term has not yet been multiplied by r. Example: for 3, 6, 12, 24, ..., T₆ = 3 × 2⁵ = 96.

**Linear vs geometric — how to decide.** Always test the **differences** first: if they are constant, the pattern is linear (Tₙ = dn + c). If not, test the **ratios**: if they are constant, it is geometric. Only if neither is constant do you look for a special pattern.

**Powers.** Sequences such as 2, 4, 8, 16, ... are powers: Tₙ = 2ⁿ. These are geometric with r equal to the base.

**Square numbers.** 1, 4, 9, 16, 25, ... count dots arranged in perfect squares: Tₙ = n². Their differences are the consecutive odd numbers 3, 5, 7, 9, ..., so the difference is not constant — square numbers are a quadratic, not a linear, pattern.

**Triangular numbers.** 1, 3, 6, 10, 15, ... are running sums 1, 1+2, 1+2+3, .... The rule is Tₙ = n(n + 1)/2; for example T₄ = 4(5)/2 = 10. Their differences increase by 1 each time.

**Fibonacci-style patterns.** Here each term is the sum of the two before it: Tₙ = Tₙ₋₁ + Tₙ₋₂. For 1, 1, 2, 3, 5, 8, 13, 21, ... you compute 5 + 8 = 13, then 8 + 13 = 21. There is no single add-or-multiply constant; you must use the previous two terms.


### Representing Patterns in Multiple Ways

The same number pattern can be shown in **four** equivalent ways, and Grade 9 expects you to convert freely between them.

**1. In words.** A verbal description such as "start at 3 and add 4 each time" captures how the sequence grows. A general verbal rule describes the formula directly, e.g. "multiply the position number by 7 and add 1."

**2. As a flow diagram.** A flow diagram feeds the **position number** n through one or more operation boxes to produce the **term value**. For Tₙ = 2n + 5 the diagram is: input n → [× 2] → [+ 5] → output Tₙ. Trace n = 4: 4 → 8 → 13, so T₄ = 13. Always apply the boxes in the order shown, left to right; for these rules that means multiply before you add.

**3. In a table.** A pattern table has two rows (or columns): the **position** n = 1, 2, 3, 4, ... and the **term value** Tₙ. For Tₙ = 4n − 1:

| n  | 1 | 2 | 3 | 4 | 5 |
|----|---|---|---|---|---|
| Tₙ | 3 | 7 | 11 | 15 | 19 |

The top row is always the input (position); the bottom row is the output (value). Feeding values where positions belong is a common error.

**4. Algebraically.** The compact formula, e.g. Tₙ = 4n − 1.

**Converting between representations.** To go from a **table** to a **formula**, read off the constant difference down the value row, then use c = first term − d. For n: 1,2,3,4 and Tₙ: 8, 13, 18, 23, d = 5 and c = 3, so Tₙ = 5n + 3. To go from a **flow diagram** to a formula, write the operations in order: n → [×3] → [+2] gives Tₙ = 3n + 2. To go from **words** to a table, just apply the description term by term. Because all four describe one pattern, a value computed one way must agree with every other way — a useful self-check.


### Patterns from Diagrams and Physical Contexts

Many exam questions present a pattern as a sequence of **pictures** — matchsticks forming squares, dots forming arrays, tiles forming borders. The skill is to turn the pictures into numbers, find a rule, and then predict any figure without drawing it.

**The general method.**
1. **Count** the items in figures 1, 2, 3 (and 4 if shown).
2. **Tabulate**: figure number n vs item count Tₙ.
3. Find the **constant difference** d.
4. Write **Tₙ = dn + c** with c = first count − d.
5. **Verify** on a known figure, then substitute the required figure number.

**Worked matchstick example.** Squares in a row use 4, 7, 10 matches for figures 1, 2, 3. The table gives d = 3, c = 4 − 3 = 1, so Tₙ = 3n + 1. Figure 20 needs T₂₀ = 3(20) + 1 = 61 matches. The structure explains the rule: the first square needs 4 matches, but each new square shares a side and adds only 3. The "+1" is the single starting vertical that is never repeated, and d = 3 is the matches added per new square. A triangle pattern 3, 5, 7, 9 works the same way: d = 2, c = 1, Tₙ = 2n + 1, so figure 50 needs 101 matches.

**Dot and tile examples.** For dots growing 2, 5, 8, 11, Tₙ = 3n − 1; to find which figure has 32 dots, solve 3n − 1 = 32 → n = 11. For a tile border 8, 12, 16, 20, Tₙ = 4n + 4, so figure 15 has 64 tiles.

**Not all diagram patterns are linear.** A square dot array 1, 4, 9, 16 has differences 3, 5, 7 (not constant), so it is **not** linear — it is Tₙ = n², because figure n is an n × n square. Always test the differences before assuming a dn + c rule.

**Predicting far-off figures.** When asked "how many matches for the 100th figure," never draw 100 pictures. Build the rule from the first few figures and substitute n = 100. For counts 5, 9, 13, Tₙ = 4n + 1, so T₁₀₀ = 401.

**Two-rule questions.** If a diagram asks separately for border tiles and inside tiles, treat each as its own sequence with its own table and rule — for example border 8, 12, 16 → 4n + 4, while inside 1, 4, 9 → n². Do not mix the two counts in one table.


### Describing the Rule, Verifying It, and Position vs Value

**Position number vs term value.** This is the single most important distinction in pattern questions. The **position number** n tells you *where* a term sits — 1st, 2nd, 3rd — and is the input. The **term value** Tₙ tells you *what* that term equals — the output. In 6, 11, 16, ..., the term in position n = 2 has value 11. So "what is the 2nd term?" asks for a **value** (11), while "which term is 11?" asks for a **position** (2). Read each question carefully and answer with the right quantity.

**Describing a rule in words.** There are two standard styles. The **recursive** style describes term-to-term growth: "start at 4 and add 5 each time." The **general** style describes position-to-value: "multiply the position by 5 and subtract 1," matching Tₙ = 5n − 1. The general style is more powerful because it gives any term directly without listing earlier terms. For a decreasing table 10, 8, 6, 4 the rule is "start at 10 and subtract 2 each time," i.e. Tₙ = −2n + 12.

**Verifying a rule.** Substitute at least **two** known positions and check the values match. Claiming Tₙ = 3n + 2 for 5, 8, 11, 14: T₁ = 5 ✓ and T₄ = 14 ✓, so it is verified. Checking only one term is not enough, because a wrong rule can fit a single term by coincidence. If a rule fails on any term it is wrong — e.g. Tₙ = 2n + 3 gives T₃ = 9 but the sequence shows 10, so it fails (and indeed 5, 7, 10, 13 has non-constant differences 2, 3, 3, so no dn + c rule fits at all).

**Common pitfalls.**
- *Dropping c.* Writing Tₙ = 5n for 8, 13, 18, 23 ignores the constant; the correct rule is Tₙ = 5n + 3 (c = 8 − 5 = 3). Check: 5(1) + 3 = 8 ✓.
- *Answering the wrong quantity.* "Determine which term has value 43" in 3, 7, 11, ... wants the **position**: 4n − 1 = 43 → n = 11, so "43 is the 11th term."
- *Equivalent rules.* Two different-looking rules can describe the same pattern; Tₙ = 3(n + 1) − 1 and Tₙ = 3n + 2 give identical values. Confirm equivalence by comparing outputs for several n.


