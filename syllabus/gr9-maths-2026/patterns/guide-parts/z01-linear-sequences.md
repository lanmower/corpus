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
