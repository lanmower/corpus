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
