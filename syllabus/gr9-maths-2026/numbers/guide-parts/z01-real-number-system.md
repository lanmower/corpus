### The Real Number System

Every number you use in Grade 9 Mathematics belongs to the **real number system (R)**. The real numbers are simply all the numbers that can be placed on a number line. Inside R there are several smaller, named sets that fit neatly inside one another. Knowing these sets — and being able to classify a number into all the sets it belongs to — is a core CAPS skill.

#### The named sets of numbers

- **Natural numbers (N)** — the counting numbers: N = {1, 2, 3, 4, ...}. They start at 1. No zero, no negatives, no fractions.
- **Whole numbers (N₀)** — the naturals together with 0: N₀ = {0, 1, 2, 3, ...}. The only difference from N is that 0 is included.
- **Integers (Z)** — all whole numbers and their negatives: Z = {..., -3, -2, -1, 0, 1, 2, 3, ...}. Still no fractions or decimals.
- **Rational numbers (Q)** — any number that can be written as a fraction a/b where a and b are integers and b ≠ 0.
- **Irrational numbers (Q')** — real numbers that *cannot* be written as such a fraction.
- **Real numbers (R)** — everything above combined; every point on the number line.

#### The subset chain

Each set sits inside the next larger one:

**N ⊂ N₀ ⊂ Z ⊂ Q ⊂ R**

In words: every natural number is also a whole number, every whole number is an integer, every integer is rational (e.g. 5 = 5/1), and every rational number is real. The irrationals Q' are the *other* part of R — the numbers that are real but not rational. So:

**R = Q ∪ Q'**, and every real number is *either* rational *or* irrational, never both.

#### Rational numbers in detail

A number is rational if it **can** be written as a/b with integers a and b and b ≠ 0. This covers more than it first appears:

- all integers: 6 = 6/1, -4 = -4/1
- ordinary fractions: ¾, 7/2, -⅔
- terminating decimals: 0.25 = 1/4, 0.125 = 1/8
- recurring decimals: 0.333... = 1/3, 0.727272... = 8/11

The denominator may **never** be 0, because division by zero is undefined. Note that 0 itself is rational (0 = 0/1) — it just may never sit on the *bottom* of the fraction.

#### Terminating, recurring and irrational decimals

The decimal form of a number is a quick test for which type it is:

- **Terminating** — the decimal stops: 0.5, 0.375, 3.2. Always **rational**.
- **Recurring** — a block of digits repeats forever: 0.333..., 0.727272..., 0.16666.... Always **rational**. We mark the repeat with a dot over the repeating digit(s): 0.3̇, 0.7̇2̇, 0.16̇.
- **Non-terminating and non-recurring** — the digits run on forever with **no** repeating pattern. These are the **irrational** numbers.

So the rule is: a rational number's decimal always either *terminates* or *recurs*. An irrational number's decimal does **neither**.

#### Why √2 and π are irrational

√2 = 1.41421356237... and π = 3.14159265358... Both expansions never end and never settle into a repeating block, so neither can be written as a fraction of two integers — that is exactly what "irrational" means. Be careful: 3.14 and 22/7 are common **approximations** of π, but they are themselves *rational* and are *not* equal to π.

For square roots there is a handy shortcut: **√n is rational only if n is a perfect square.** So √16 = 4 is rational, but √2, √7, √20 are irrational. To locate √20, trap it between the nearest perfect squares: 16 < 20 < 25, so 4 < √20 < 5 (√20 ≈ 4.47).

#### Worked example: classifying a number

Classify -4, ⅔ and √16 into all sets they belong to.

- **-4** is a negative integer. Not natural (no negatives), not whole. So -4 ∈ Z, Q, R.
- **⅔** = 0.666... is a fraction of integers, so ⅔ ∈ Q, R only.
- **√16** = 4, a perfect square, so √16 ∈ N, N₀, Z, Q, R (it is in every set).

#### Worked example: converting a recurring decimal to a fraction

This is the most important method to master. The idea: multiply by a power of 10 so the repeating tails line up, then subtract to cancel them.

**Example A — one repeating digit: convert 0.4̇ (0.444...) to a fraction.**

1. Let x = 0.444...   ...(1)
2. One digit repeats, so multiply by 10: 10x = 4.444...   ...(2)
3. Subtract (1) from (2) — the recurring tails cancel:
   10x − x = 4.444... − 0.444...
   9x = 4
4. Solve: x = 4/9.

So 0.4̇ = 4/9. Check: 4 ÷ 9 = 0.444... ✓

**Example B — two repeating digits: convert 0.7̇2̇ (0.727272...) to a fraction.**

1. Let x = 0.727272...   ...(1)
2. The block "72" is **two** digits, so multiply by 100: 100x = 72.727272...   ...(2)
3. Subtract (1) from (2):
   100x − x = 72.7272... − 0.7272...
   99x = 72
4. Solve and simplify: x = 72/99 = 8/11 (dividing top and bottom by 9).

So 0.7̇2̇ = 8/11.

**The general rule:** if the repeating block is 1 digit, multiply by 10; if 2 digits, multiply by 100; for n digits, multiply by 10ⁿ. Then subtract the original to remove the recurring tail.

A famous surprise: applying this to 0.9̇ gives 10x − x = 9, so 9x = 9 and x = 1. That is, 0.999... = 1 exactly.

#### Common pitfalls

- **0 is not a natural number** in CAPS — N starts at 1. But 0 *is* a whole number, integer, rational and real.
- **Negatives are not whole numbers.** -3 is an integer but not in N₀.
- **Not every root is irrational.** √36 = 6 is rational; only non-perfect-square roots are irrational.
- **π ≠ 22/7 and π ≠ 3.14.** Those are rational approximations, not π itself.
- **Recurring decimals are rational.** Students often mislabel 0.333... as irrational — it equals 1/3.
- **When subtracting recurring decimals, line up the repeating tails exactly** (e.g. for 0.16̇ both lines must end in ...6666) so they cancel cleanly.
