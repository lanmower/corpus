# Exponents — Complete Study Guide

## Contents

### Exponents — The Six Laws and Simplification (Ex 4.1)

An exponent (or power) is a short way of writing repeated multiplication: aⁿ means a multiplied by itself n times, where a is the **base** and n is the **exponent**. All of Grade 9 algebra of exponents is built on six laws.

**The six laws (a, b ≠ 0):**

1. **Product law:** aᵐ × aⁿ = aᵐ⁺ⁿ — when you *multiply* powers of the *same base*, **add** the exponents.
2. **Quotient law:** aᵐ ÷ aⁿ = aᵐ⁻ⁿ — when you *divide* powers of the *same base*, **subtract** the exponents (top minus bottom).
3. **Power of a power:** (aᵐ)ⁿ = aᵐⁿ — **multiply** the exponents.
4. **Power of a product:** (a × b)ⁿ = aⁿ × bⁿ — give the power to **every** factor inside the bracket (including the number/coefficient).
5. **Zero exponent:** a⁰ = 1 — any non-zero base to the power 0 is 1.
6. **Negative exponent:** a⁻ⁿ = 1/aⁿ = (1/a)ⁿ — a negative exponent means take the **reciprocal** of the positive power.

**Key points and method:**
- Laws 1 and 2 only apply when the **bases are equal**. x²/y² cannot be simplified to x/y because x and y are different bases.
- The coefficient (the number in front) is multiplied/divided separately from the variable powers, e.g. 3x² × 2x³ = (3×2)x²⁺³ = 6x⁵.
- When simplifying a fraction, subtract the bottom exponent from the top for each base. A resulting negative exponent is moved across the fraction line to become positive (Law 6): e.g. a⁻¹ on top becomes 1/a on the bottom.
- Always leave the final answer with **positive exponents**.

**Worked example 1:** Simplify (4x³y⁷)/(8x²y⁹).
Coefficient: 4/8 = ½. x: x³⁻² = x¹. y: y⁷⁻⁹ = y⁻². So we get ½·x·y⁻² = **x/(2y²)** (the y⁻² drops to the denominator as y²).

**Worked example 2:** Simplify (−3x⁴)²(2x³).
Square the bracket first (Laws 3 & 4): (−3x⁴)² = (−3)²(x⁴)² = 9x⁸. Then 9x⁸ × 2x³ = 18x⁸⁺³ = **18x¹¹**.

**Special cases and pitfalls:**
- **a⁰ = 1, but the coefficient is not affected:** 7a⁰ = 7×1 = 7, whereas (3p)⁰ = 1 because the whole bracket is to the power 0.
- **The sign trap:** (−3)² = 9 (the bracket squares the minus too), but −3² = −9 (only the 3 is squared, the minus stays in front). Likewise (−3)⁰ = 1 but −3⁰ = −1.
- **Adding vs multiplying:** x² + x² = 2x² (like terms → add coefficients, exponent unchanged), but x² × x² = x⁴ (multiply → add exponents). Do not confuse these.
- **2³ × 2⁴ = 2⁷, not 4⁷** — when multiplying same-base powers the base never changes.

To evaluate without a calculator, convert each power to a number first: e.g. 3⁻² + 3⁰ + 3² = 1/9 + 1 + 9 = 91/9 = 10⅑. To compare powers like 2⁻⁵ and 5⁻², rewrite both with positive exponents (1/32 and 1/25); the larger denominator gives the smaller fraction, so 5⁻² (= 1/25) is larger.


### Substitution and Exponential Equations (Ex 4.2 & 4.3)

**Substitution (Ex 4.2).** You are given values for letters and must evaluate an expression. Work the powers out before multiplying/adding, and watch signs.
- Example: a × bᶜ with a = 3, b = 2, c = −1 → 3 × 2⁻¹ = 3 × ½ = 3/2.
- Example: aᵇ + bᶜ with a = 2, b = −1, c = 3 → 2⁻¹ + (−1)³ = ½ + (−1) = −½.
Remember (−1) to an odd power is −1; to an even power is +1.

**Exponential equations (Ex 4.3): the equal-base method.**
The unknown is now *in the exponent*. The strategy is:
1. Rewrite **both sides as powers of the same base.**
2. Once the bases are equal, the **exponents must be equal** — drop the bases and solve the resulting (usually linear) equation.

Useful conversions: 9 = 3², 27 = 3³, 81 = 3⁴; 8 = 2³, 64 = 2⁶, 32 = 2⁵; 1 = base⁰; a lone base = base¹; reciprocals use negative exponents (1/8 = 2⁻³, 0,1 = 10⁻¹, 0,04 = 1/25 = 5⁻²).

**Worked example 1:** Solve 9ˣ = 27.
Use base 3: 9 = 3², 27 = 3³, so 3²ˣ = 3³ ⇒ 2x = 3 ⇒ **x = 3/2**.

**Worked example 2:** Solve 3²ˣ⁺¹ = 3ˣ⁺³.
Bases already equal, so equate exponents: 2x + 1 = x + 3 ⇒ **x = 2**.

**Worked example 3 (combine first):** Solve 2ˣ·2³ = 32.
Left side: 2ˣ⁺³. Right side: 32 = 2⁵. So x + 3 = 5 ⇒ **x = 2**.

**Root-type equations.** If the unknown is the base (e.g. x³ = −8 or x⁻² = 4/9), isolate the power and take the appropriate root:
- x³ = −8 ⇒ x = ∛(−8) = −2 (a cube root *can* be negative).
- 2x³ = 54 ⇒ x³ = 27 ⇒ x = 3.
- x⁻² = 4/9 ⇒ 1/x² = 4/9 ⇒ x² = 9/4 ⇒ x = **±3/2** (an even power gives two answers, + and −).
- x⁻¹ = ½ ⇒ 1/x = ½ ⇒ x = 2.

**Pitfalls:** keep the base unchanged when combining powers (2ˣ·2³ = 2ˣ⁺³, never 4-something); convert 1 to base⁰ rather than guessing; and never forget the ± when you take an even root.


### Exponents Ex 4.1 — Worked-Solution Method

These pages show the fully worked answers to the exponent simplification problems. The marks live in the **method**, not just the final answer. Master the workflow and the six laws.

#### The golden workflow
When multiplying or dividing, deal with **signs first, then numbers, then letters — one at a time.** This stops careless errors.

#### The six laws
1. aᵐ × aⁿ = aᵐ⁺ⁿ  (same base, multiply → add exponents)
2. aᵐ ÷ aⁿ = aᵐ⁻ⁿ  (same base, divide → subtract exponents; also = 1/aⁿ⁻ᵐ)
3. (aᵐ)ⁿ = aᵐⁿ  (power of a power → multiply exponents)
4. (ab)ⁿ = aⁿbⁿ  (each factor in the bracket is raised to the power — the sign, the number AND each letter)
5. a⁰ = 1, a ≠ 0
6. a⁻ⁿ = 1/aⁿ, a ≠ 0

#### Key techniques and pitfalls
- **Negatives in exponents:** subtracting a negative adds. a²/a⁻¹ = a^(2−(−1)) = a³. In (5²·5³·x²y⁴)/(5⁶x³y²) you get 5⁻¹x⁻¹y² = y²/(5x). Tip: "gather exponents so their sum is positive" to keep answers tidy.
- **Zero exponent only on what it touches:** 3p⁰ = 3·1 but (3p)⁰ = 1. Likewise 8x⁰ = 8 while (8x)⁰ = 1. These are NOT the same.
- **Raise EVERY factor to an outer power:** (−4a⁵b³)² = (−4)²a¹⁰b⁶ = 16a¹⁰b⁶. Don't forget to raise the numerical coefficient (e.g. (3x³y)³ = 27x⁹y³, not 3x⁹y³).
- **Even powers kill negatives:** (−a)² = a²; 4(−a)² − (−2a)² = 4a² − 4a² = 0.
- **Terms joined by + or − are NOT combined by adding exponents.** Instead distribute: x⁻⁷(x¹³ + x¹¹) = x⁶ + x⁴. And x⁶ + x⁴ cannot be added (not like terms).
- **Roots:** add like terms under the root first, then take the root: √(36x³⁶ + 64x³⁶) = √(100x³⁶) = 10x¹⁸ (halve the even exponent). And √((a+2b)²) = a + 2b.

#### Worked example (fraction)
Simplify (39x¹⁷y¹⁰)/(3x⁴y⁻³).
- Numbers: 39 ÷ 3 = 13.
- x: x^(17−4) = x¹³.  y: y^(10−(−3)) = y¹³.
- Answer: 13x¹³y¹³.

#### Worked example (mixed)
Simplify ab(−2a²b³)³ / (−56b³).
- Expand bracket (Law 4, sign first): (−2a²b³)³ = −8a⁶b⁹.
- Numerator: ab·(−8a⁶b⁹) = −8a⁷b¹⁰.
- Divide: (−8a⁷b¹⁰)/(−56b³) = (1/7)a⁷b⁷ = a⁷b⁷/7  (negative ÷ negative = positive).


