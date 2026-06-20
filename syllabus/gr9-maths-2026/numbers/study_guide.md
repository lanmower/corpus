# Numbers — Complete Study Guide

## Contents

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


### Properties of Numbers & Operations

The properties of numbers describe how addition, subtraction, multiplication and division behave. Knowing them lets you simplify calculations, rearrange algebra correctly, and avoid common mistakes. They also underpin the rules of algebra you will use throughout Grade 9 and beyond.

#### The commutative property

The commutative property says that the **order** of the numbers does not change the answer — but only for addition and multiplication.

- Addition: a + b = b + a
- Multiplication: a × b = b × a

Worked example: 7 + 3 = 10 and 3 + 7 = 10, so the order made no difference. Likewise 4 × 6 = 24 and 6 × 4 = 24.

**Pitfall — subtraction and division are NOT commutative.** Order matters for them:
- 8 − 3 = 5 but 3 − 8 = −5, so 8 − 3 ≠ 3 − 8.
- 12 ÷ 4 = 3 but 4 ÷ 12 = ⅓, so 12 ÷ 4 ≠ 4 ÷ 12.

#### The associative property

The associative property says that the **grouping** (which numbers you bracket together) does not change the answer — again only for addition and multiplication.

- Addition: (a + b) + c = a + (b + c)
- Multiplication: (a × b) × c = a × (b × c)

Worked example: (2 + 5) + 4 = 7 + 4 = 11 and 2 + (5 + 4) = 2 + 9 = 11. Same answer.
For multiplication: (3 × 2) × 5 = 6 × 5 = 30 and 3 × (2 × 5) = 3 × 10 = 30.

**Pitfall — subtraction and division are NOT associative:**
- (10 − 4) − 2 = 6 − 2 = 4, but 10 − (4 − 2) = 10 − 2 = 8. Different.
- (24 ÷ 6) ÷ 2 = 4 ÷ 2 = 2, but 24 ÷ (6 ÷ 2) = 24 ÷ 3 = 8. Different.

So with − and ÷ you must respect both the order and the bracketing.

#### The distributive property

The distributive property links multiplication with addition (or subtraction). The number outside the brackets is multiplied by **every** term inside:

  a(b + c) = ab + ac    and    a(b − c) = ab − ac

Worked example 1 (over addition): 3(x + 4) = 3·x + 3·4 = 3x + 12.

Worked example 2 (over subtraction): 4(3x − 5) = 4·3x − 4·5 = 12x − 20.

Worked example 3 (negative outside the bracket): −2(x − 6) = −2·x + (−2)·(−6) = −2x + 12. Notice that negative × negative gives a positive, so the second sign flips.

You can also use distribution for fast mental maths: 6 × 47 = 6(40 + 7) = 240 + 42 = 282.

**Pitfall:** never multiply only the first term. 4(3x − 5) is 12x − 20, NOT 12x − 5. And watch the signs carefully when the outside number is negative.

#### Identity elements

An identity element leaves a number unchanged under an operation.

- **Additive identity is 0:** a + 0 = a. For example, 17 + 0 = 17.
- **Multiplicative identity is 1:** a × 1 = a. For example, 23 × 1 = 23.

#### Inverse elements

An inverse "undoes" a number, returning it to the identity.

- **Additive inverse of a is −a**, because a + (−a) = 0. The additive inverse of 7 is −7 (since 7 + (−7) = 0); the additive inverse of −5 is 5.
- **Multiplicative inverse (reciprocal) of a is 1/a**, because a × 1/a = 1. The reciprocal of 5 is ⅕ (since 5 × ⅕ = 1); the reciprocal of ⅔ is 3/2 (since ⅔ × 3/2 = 1).

**Pitfall:** 0 has no multiplicative inverse — you cannot divide by zero.

#### Order of operations — BODMAS

When a calculation mixes operations, BODMAS (also written BEDMAS) tells you the order to work in:

- **B** — Brackets
- **O** — Of / Orders (exponents and roots)
- **D** — Division
- **M** — Multiplication
- **A** — Addition
- **S** — Subtraction

Two crucial rules people forget:
1. Division and Multiplication have **equal** rank — do them left to right as they appear.
2. Addition and Subtraction have **equal** rank — do them left to right as they appear.

Worked example 1: 5 + 3 × 4. Multiplication first: 3 × 4 = 12, then 5 + 12 = 17. (Working left to right to get 8 × 4 = 32 is WRONG.)

Worked example 2: 2 × (3 + 4)² − 6.
- Brackets: (3 + 4) = 7
- Orders: 7² = 49
- Multiplication: 2 × 49 = 98
- Subtraction: 98 − 6 = 92

Worked example 3: 18 − 12 ÷ (2 + 1) + 4².
- Brackets: (2 + 1) = 3
- Orders: 4² = 16
- Division: 12 ÷ 3 = 4
- Now left to right: 18 − 4 + 16 = 14 + 16 = 30

**Common BODMAS pitfalls:**
- 20 ÷ 4 + 2 × 3 = 5 + 6 = 11. Do not invent brackets — it is not 20 ÷ (4 + 2).
- 10 − 4 − 3 = (10 − 4) − 3 = 6 − 3 = 3. Subtraction goes left to right; grouping it as 10 − (4 − 3) = 9 is WRONG.
- Remember D and M are equal, and A and S are equal — the letters in BODMAS do not mean multiplication always beats division.


### Integers

Integers are the whole numbers together with their opposites (negatives) and zero:

… −3, −2, −1, 0, 1, 2, 3 …

Positive integers lie to the right of 0 on the number line, negative integers lie to the left, and 0 is neither positive nor negative. On the number line, value increases as you move right and decreases as you move left, so −5 < −2 < 0 < 3. A common trap when comparing negatives is that the bigger digit gives the smaller number: −8 < −3, because −8 is further to the left.

The **additive inverse** (opposite) of a number is what you add to it to get 0. The opposite of 7 is −7, and the opposite of −7 is +7. So −(−7) = 7.

#### Adding integers

Use the number line as your mental model: a positive number moves you right, a negative number moves you left.

- **Same signs** → add the values and keep the common sign.
  −6 + (−4) = −10  (6 left, then 4 more left).
- **Different signs** → subtract the smaller value from the larger and keep the sign of the number with the larger value.
  −9 + 5 = −4  (9 is the larger value and is negative).

A handy shortcut for long chains: add all the positives, add all the negatives, then combine.
−3 + 8 + 5 − 11 → positives 8 + 5 = 13; negatives −3 − 11 = −14; then 13 − 14 = −1.

#### Subtracting integers — keep–change–change

To subtract, turn the subtraction into an addition:

1. **Keep** the first number.
2. **Change** the minus (subtraction) to plus (addition).
3. **Change** the sign of the second number.

Then apply the addition rules.

- 7 − (−2) → 7 + (+2) = 9
- −5 − 3 → −5 + (−3) = −8

**Subtracting a negative is the same as adding**, because the two minus signs (a "double negative") combine into a plus: −(−6) = +6. So 4 − (−6) = 4 + 6 = 10. A frequent error is writing 4 − 6 = −2; the two negatives must first become a plus.

#### Multiplying and dividing integers

The sign rules are the same for both operations:

- **Same signs → positive:** (+)(+) = + and (−)(−) = +
- **Different signs → negative:** (+)(−) = − and (−)(+) = −

Work out the digits first, then decide the sign.

- −7 × 4 = −28 (different signs)
- −6 × −8 = +48 (same signs)
- −48 ÷ 6 = −8 (different signs)
- −72 ÷ −9 = +8 (same signs)

For a product of several integers, count the negative factors: an **even** number of negatives gives a positive answer, an **odd** number gives a negative answer.
(−2)(−3)(−1)(4): three negatives (odd) → negative; 2 × 3 × 1 × 4 = 24, so the answer is −24.

#### Exponents of negatives — (−3)² vs −3²

This is one of the most common exam pitfalls. The **brackets** decide what is being squared.

- **(−3)²** means (−3) × (−3) = **+9**. The whole −3 (including its sign) is squared.
- **−3²** means −(3 × 3) = **−9**. Only the 3 is squared; the minus sign stays in front.

So (−3)² = 9 but −3² = −9. Always check whether the negative is inside the brackets.

The sign of a power of a negative base follows the parity of the exponent:

- Even exponent → positive: (−2)⁴ = +16
- Odd exponent → negative: (−2)³ = −8

#### Order of operations (BODMAS) with integers

Work in this order, applying the sign rules at every step:

- **B** – Brackets
- **O** – Of / Orders (exponents and roots)
- **D** – Division
- **M** – Multiplication
- **A** – Addition
- **S** – Subtraction

Division and multiplication rank equally and are done left to right; the same is true for addition and subtraction.

**Worked example 1:** −12 + 3 × (−4)
Multiplication first: 3 × (−4) = −12. Then −12 + (−12) = −24.
(Do not add −12 + 3 first — multiplication comes before addition.)

**Worked example 2:** (−5 + 2)² − (−4)
Brackets: −5 + 2 = −3. Exponent: (−3)² = 9. Subtract the negative: 9 − (−4) = 9 + 4 = **13**.

#### Word and contextual problems

Translate the situation into integers, then calculate. A rise/deposit/gain means add; a drop/withdrawal/loss means subtract.

- **Temperature:** Start −4 °C, rise 11 °C, then drop 6 °C: −4 + 11 − 6 = 1 °C.
- **Bank balance:** A debit (overdrawn) balance is negative. Start −R250, deposit R400, withdraw R180: −250 + 400 − 180 = −R30, i.e. R30 in debit.
- **Altitude:** Bird +25 m, diver −18 m. Vertical distance = 25 − (−18) = 25 + 18 = 43 m.

#### Common pitfalls to avoid

- Confusing −3² (= −9) with (−3)² (= 9). Check the brackets.
- Forgetting to turn subtraction of a negative into addition: 4 − (−6) = 10, not −2.
- Treating a "bigger digit" negative as the larger number: −8 is smaller than −3.
- Breaking BODMAS by adding before multiplying or dividing.
- Mixing up the sign rules: same signs give positive, different signs give negative (for × and ÷).


### Factors, Multiples & Primes

This section builds the number-theory toolkit you need for fractions, ratios and algebra: knowing how whole numbers break apart into building blocks, and how to combine those blocks to find the HCF and LCM.

#### Key definitions

- **Factor:** a whole number that divides exactly into another number with no remainder. The factors of 12 are 1, 2, 3, 4, 6, 12. List them in pairs (1×12, 2×6, 3×4) so you don't miss any. A number has a *finite* number of factors.
- **Multiple:** the result of multiplying a number by 1, 2, 3, … The first five multiples of 6 are 6, 12, 18, 24, 30. A number has *infinitely many* multiples.
- **Prime number:** a number with exactly **two different** factors — 1 and itself. The primes below 20 are 2, 3, 5, 7, 11, 13, 17, 19. **2 is the only even prime.**
- **Composite number:** a number with **more than two** factors (it has factors besides 1 and itself), e.g. 15 (factors 1, 3, 5, 15).

**Why isn't 1 prime?** A prime needs *exactly two different* factors. The number 1 has only **one** factor — itself — so it is neither prime nor composite. Excluding 1 also makes prime factorisation **unique** (otherwise you could insert 1's endlessly).

Handy facts: 1 is a factor of every number; every number is a multiple of 1; every number is both a factor and a multiple of itself.

#### Prime factorisation

Every composite number can be written as a product of primes in exactly one way (apart from order). We write the answer in **exponent form**, e.g. 360 = 2³ × 3² × 5.

**Ladder (division) method.** Divide by the *smallest* prime that fits, repeatedly, moving up only when it no longer divides:

```
2 | 360
2 | 180
2 |  90
3 |  45
3 |  15
5 |   5
  |   1
```

The primes down the side are 2, 2, 2, 3, 3, 5, so **360 = 2³ × 3² × 5**.

**Factor-tree method.** Split the number into any two factors and keep splitting until every branch is prime:

```
        84
       /  \
      4    21
     / \   / \
    2   2 3   7
```

The prime leaves are 2, 2, 3, 7, so **84 = 2² × 3 × 7**. No matter which first split you choose, the final prime factors are always the same.

#### HCF — Highest Common Factor

The HCF is the largest number that divides into all the given numbers.

**Rule:** prime factorise each number, then multiply the **common primes**, each taken to its **lowest** power. If there are no common primes, the HCF is 1.

Example — HCF of 72 and 120:
- 72 = 2³ × 3²
- 120 = 2³ × 3 × 5
- Common primes: 2 and 3. Lowest powers: 2³ and 3¹.
- **HCF = 2³ × 3 = 24**

#### LCM — Lowest Common Multiple

The LCM is the smallest number that all the given numbers divide into.

**Rule:** prime factorise each number, then multiply **all** primes that appear in any number, each taken to its **highest** power.

Example — LCM of 72 and 120 (same factorisations):
- All primes: 2, 3, 5. Highest powers: 2³, 3², 5¹.
- **LCM = 2³ × 3² × 5 = 360**

**Don't mix them up:** HCF uses **common primes, lowest powers** (answer is small); LCM uses **all primes, highest powers** (answer is big). A quick check: HCF ≤ each number ≤ LCM.

**Useful shortcut:** for two numbers, HCF × LCM = product of the numbers. Here 24 × 360 = 8 640 = 72 × 120. So LCM = (a × b) ÷ HCF.

#### Divisibility rules

| Divisor | Rule | Example |
|---|---|---|
| 2 | last digit even (0,2,4,6,8) | 130 ✓ |
| 3 | digit sum divisible by 3 | 738 → 18 ✓ |
| 4 | last **two** digits divisible by 4 | 1 316 → 16 ✓ |
| 5 | last digit 0 or 5 | 135 ✓ |
| 6 | divisible by 2 **and** 3 | 522 ✓ |
| 8 | last **three** digits divisible by 8 | 5 120 → 120 ✓ |
| 9 | digit sum divisible by 9 | 738 → 18 ✓ |
| 10 | last digit 0 | 470 ✓ |
| 11 | (sum of odd-position digits) − (sum of even-position digits) = 0 or a multiple of 11 | 2 783 → (2+8)−(7+3)=0 ✓ |

These rules let you spot prime factors fast when starting the ladder method.

#### Worked combined problems

**Lighthouses (LCM).** Two lighthouses flash every 72 s and every 120 s and flash together now. When next together? "Together again" → LCM = 2³ × 3² × 5 = 360 s = **6 minutes**.

**Packing bags (HCF).** Pack 48 pencils and 36 erasers into identical bags with none left over — greatest number of bags? "Greatest equal groups" → HCF. 48 = 2⁴ × 3, 36 = 2² × 3², so HCF = 2² × 3 = 12. **12 bags**, each with 4 pencils and 3 erasers.

**Choosing HCF vs LCM:** phrases like *greatest, largest group, share equally* signal **HCF**; phrases like *next time together, smallest length, least* signal **LCM**.

#### Common pitfalls

- Calling 1 prime, or forgetting 2 is prime.
- Stopping a factor tree before all branches are prime.
- Swapping the HCF and LCM rules (lowest vs highest powers).
- Forgetting to write the final answer in exponent form.
- Checking divisibility by 4 or 8 using only the last digit instead of the last two/three digits.


### Fractions

A fraction a/b means a parts out of b equal parts. The top number is the **numerator**, the bottom is the **denominator**. This section covers equivalent fractions, simplifying, the four operations (including mixed numbers), finding a fraction "of" a quantity, and order of operations with fractions. All money is in rand (R), as in the CAPS curriculum.

#### Equivalent fractions

Equivalent fractions have different numbers but the same value. You make them by multiplying **or** dividing the numerator and the denominator by the **same** non-zero number.

- 2/3 = (2×4)/(3×4) = 8/12
- 6/10 = (6÷2)/(10÷2) = 3/5

Pitfall: you may never **add** the same number to top and bottom. Only multiplying/dividing keeps the value the same.

#### Simplifying to lowest terms

A fraction is in **lowest terms** when the highest common factor (HCF) of numerator and denominator is 1. To simplify, divide both by their HCF.

Worked example — simplify 18/24:
- 18 = 2×3×3, 24 = 2×2×2×3, so HCF = 2×3 = 6
- 18÷6 = 3, 24÷6 = 4
- 18/24 = 3/4

You can also divide by common factors step by step until none remain: 18/24 → (÷2) 9/12 → (÷3) 3/4.

#### Mixed numbers ↔ improper fractions

An **improper fraction** has a numerator ≥ denominator (e.g. 17/5). A **mixed number** combines a whole and a fraction (e.g. 3 2/5).

Mixed → improper: (whole × denominator + numerator) / denominator.
- 3 2/5 = (3×5 + 2)/5 = 17/5

Improper → mixed: divide numerator by denominator; quotient is the whole, remainder is the new numerator.
- 23/4 = 23÷4 = 5 remainder 3 = 5 3/4

#### Adding and subtracting fractions

You can only add or subtract fractions that have the **same denominator**. Find the LCM of the denominators, rewrite each as an equivalent fraction over that LCM, then add/subtract **numerators only** (the denominator stays the same).

Finding the LCM (e.g. of 6 and 8): use prime factors — 6 = 2×3, 8 = 2³ — take the highest power of each prime: 2³×3 = 24. Or list multiples until you find the first shared one.

Worked example — add 2/3 + 1/4:
- LCM(3,4) = 12
- 2/3 = 8/12, 1/4 = 3/12
- 8/12 + 3/12 = 11/12

Worked example — subtract 5/6 − 1/4:
- LCM(6,4) = 12
- 5/6 = 10/12, 1/4 = 3/12
- 10/12 − 3/12 = 7/12

**Mixed numbers (addition).** Either add wholes and fractions separately, or convert to improper fractions first.

Worked example — 2 1/2 + 1 2/3:
- Wholes: 2 + 1 = 3
- Fractions: 1/2 + 2/3 = 3/6 + 4/6 = 7/6 = 1 1/6
- Total: 3 + 1 1/6 = 4 1/6

**Mixed numbers (subtraction with borrowing).** Converting to improper fractions avoids tricky borrowing.

Worked example — 4 1/4 − 1 2/3:
- 4 1/4 = 17/4, 1 2/3 = 5/3
- LCM(4,3) = 12: 17/4 = 51/12, 5/3 = 20/12
- 51/12 − 20/12 = 31/12 = 2 7/12

Pitfall: never add or subtract the denominators. 1/2 + 1/3 is **not** 2/5; it is 5/6.

#### Multiplying fractions

No common denominator is needed. Multiply numerator × numerator and denominator × denominator, then simplify. It is easier to **cross-cancel** common factors first so numbers stay small.

Worked example — 3/8 × 4/9:
- Cancel 3 with 9 (9→3) and 4 with 8 (8→2): (1/2) × (1/3)
- (1×1)/(2×3) = 1/6

**Mixed numbers:** convert to improper fractions first, never multiply whole parts separately.

Worked example — 1 1/3 × 2 1/4:
- 1 1/3 = 4/3, 2 1/4 = 9/4
- 4/3 × 9/4 = 36/12 = 3

#### Dividing fractions

Use **keep-flip-change** (keep–change–flip): keep the first fraction, change ÷ to ×, and flip the second fraction to its **reciprocal**. The reciprocal of a/b is b/a; the reciprocal of 4 (= 4/1) is 1/4.

Worked example — 3/5 ÷ 2/7:
- 3/5 ÷ 2/7 = 3/5 × 7/2 = 21/10 = 2 1/10

**Mixed numbers:** convert to improper first.

Worked example — 2 1/2 ÷ 1 1/4:
- 5/2 ÷ 5/4 = 5/2 × 4/5 = 20/10 = 2

#### "of" means multiply — fractions of quantities

The word "of" means **multiply**.

- 1/3 of 12 = 1/3 × 12 = 4
- 3/4 of R120: 120 ÷ 4 = 30, then 30 × 3 = R90
- 2/5 of R150: 150 ÷ 5 = 30, then 30 × 2 = R60 (the other 3/5 is R90)

A handy method: divide the quantity by the denominator to get one part, then multiply by the numerator.

#### Order of operations with fractions

Fractions follow the same **BODMAS** order as whole numbers:
**B**rackets, **O**f/Orders (powers and roots), **D**ivision and **M**ultiplication (left to right), **A**ddition and **S**ubtraction (left to right). "Of" is handled as multiplication.

Worked example — 2/3 + 1/4 × 8/9:
- Multiply first: 1/4 × 8/9 = 2/9
- Then add: 2/3 + 2/9 = 6/9 + 2/9 = 8/9

Worked example — (1/2 + 1/3) ÷ 5/6:
- Brackets first: 1/2 + 1/3 = 3/6 + 2/6 = 5/6
- Then divide: 5/6 ÷ 5/6 = 5/6 × 6/5 = 1

#### Common pitfalls checklist

- Do not add/subtract straight across — find a common denominator first.
- Do not find an LCM for multiplication or division — only for + and −.
- Always convert mixed numbers to improper fractions before × or ÷.
- For ÷, flip the **second** fraction, not the first.
- Always simplify your final answer to lowest terms.


### Decimals

Decimals are another way of writing fractions whose denominators are powers of ten (10, 100, 1000, ...). The decimal point separates the whole-number part (on the left) from the fractional part (on the right). Mastering decimals means understanding place value first, then applying it to the four operations, to rounding, and to sensible estimation.

#### Place value of decimals

Each position to the right of the decimal point is ten times smaller than the one before it:

- 1st place = tenths (1/10)
- 2nd place = hundredths (1/100)
- 3rd place = thousandths (1/1000)

Example: 4.728 = 4 ones + 7 tenths + 2 hundredths + 8 thousandths = 4 + 0.7 + 0.02 + 0.008.

Reading words into digits: "three and forty-five thousandths" = 3.045. Thousandths needs 3 decimal places, and 45 only fills two of them, so we pad the empty tenths place with a zero. Writing 3.45 would mean forty-five hundredths, which is wrong.

Comparing decimals: give the numbers the same number of decimal places by adding trailing zeros, then compare as whole numbers. Is 0.4 or 0.38 bigger? Write 0.4 = 0.40, then compare 40 hundredths with 38 hundredths, so 0.4 > 0.38. Pitfall: more digits does not mean a bigger number.

#### Adding and subtracting decimals

1. Line up the decimal points so matching place-value columns sit under each other.
2. Pad with zeros so every number has the same number of decimal places.
3. Add or subtract column by column, carrying or borrowing as normal.
4. Bring the decimal point straight down into the answer.

Worked example (add): 12.6 + 3.45 + 0.8
```
  12.60
   3.45
+  0.80
-------
  16.85
```

Worked example (subtract): 9.3 − 4.78. Write 9.3 as 9.30 first.
```
  9.30
- 4.78
------
  4.52
```
Pitfall: never line the numbers up by their right-hand ends. Always align the decimal points.

#### Multiplying decimals

1. Ignore the decimal points and multiply as whole numbers.
2. Count the total number of decimal places in both factors.
3. Put that many decimal places into the answer.

Worked example: 1.25 × 3.4. Whole numbers: 125 × 34 = 4250. Decimal places: 2 + 1 = 3, so place the point 3 from the right: 4.250 = 4.25. Estimate check: 1.3 × 3 ≈ 4, which is close.

Worked example: 0.2 × 0.3. Digits: 2 × 3 = 6. Decimal places: 1 + 1 = 2, so the answer needs 2 places: 0.06 (not 0.6). Pitfall: remember to insert the leading zero to make up the required number of places.

#### Dividing decimals

Make the divisor a whole number by multiplying both the divisor and the dividend by the same power of 10 (this shifts both points the same number of places and keeps the value unchanged).

Worked example: 4.5 ÷ 0.5. The divisor 0.5 has 1 decimal place, so multiply both by 10: 45 ÷ 5 = 9.

Worked example: 7.5 ÷ 0.25. The divisor has 2 decimal places, so multiply both by 100: 750 ÷ 25 = 30. Note that dividing by a number less than 1 makes the answer bigger, so 30 > 7.5 is expected.

When the divisor is already a whole number, just divide and keep the decimal point in the quotient directly above the point in the dividend: 6.4 ÷ 8 = 0.8.

#### Multiplying and dividing by powers of 10

Shift the decimal point, one place for each zero.

- Multiplying moves the point to the RIGHT: 3.45 × 10 = 34.5; 3.45 × 100 = 345; 0.7 × 1000 = 700.
- Dividing moves the point to the LEFT: 56.2 ÷ 10 = 5.62; 56.2 ÷ 100 = 0.562; 8 ÷ 1000 = 0.008.

Insert zeros as placeholders whenever you run out of digits.

#### Rounding to a number of decimal places (dp)

1. Find the digit in the last place you are keeping.
2. Look at the next digit to the right (the decider).
3. If the decider is 5 or more, round up; if 4 or less, leave the kept digit unchanged.
4. Drop everything after the rounding place.

Examples: 3.7846 to 2 dp → decider 4 → 3.78. And 0.4567 to 1 dp → decider 5 → 0.5; to 3 dp → decider 7 → 0.457. When rounding up causes a carry, keep trailing zeros to show the required dp: 0.198 to 2 dp → 0.20.

#### Significant figures (sig figs)

Significant figures are the digits that tell us about the size of a number. Rules:

1. All non-zero digits are significant.
2. Zeros between non-zero digits are significant (3.05 has 3 sf).
3. Leading zeros are NOT significant (0.0042 has 2 sf).
4. Trailing zeros after a decimal point ARE significant (0.300 has 3 sf).

To round to sig figs, find the first significant digit, count along to the last one you keep, then use the next digit as the decider exactly as in dp rounding. Keep placeholder zeros so the number stays the right size.

Examples: 0.04736 to 2 sf → first two sig figs are 4 and 7, decider 3 → 0.047. And 23 947 to 2 sf → sig figs 2 and 3, decider 9 → round up to 24 000 (the zeros are placeholders, not significant).

#### Estimation and approximation

Before or after a calculation, round each number (often to 1 significant figure) and do an easy mental sum. This checks that your answer is reasonable and catches place-value or decimal-point errors.

Example: 38.7 × 5.2 ≈ 40 × 5 = 200, so the exact 201.24 is reasonable. Example: 612 ÷ 2.9 ≈ 600 ÷ 3 = 200, so a candidate answer of 21.1 is about ten times too small and must be a decimal-point error (the true answer is about 211).

#### Decimals and fractions

A terminating decimal can be written over a power of 10 and simplified: 0.375 = 375/1000 = 3/8. Check by dividing: 3 ÷ 8 = 0.375.

#### Common pitfalls

- Aligning numbers by their ends instead of by the decimal point when adding or subtracting.
- Forgetting placeholder zeros (3.45 vs 3.045; 0.6 vs 0.06).
- Thinking a decimal with more digits is automatically larger.
- Counting leading zeros as significant figures.
- Forgetting to multiply BOTH numbers when making a divisor whole.
- Dropping a trailing zero that is needed to show the rounding place (0.20).


### Ratio, Rate & Proportion

This section shows how to compare quantities using ratios and rates, how to share an amount in a given ratio, and how to solve direct and inverse (indirect) proportion problems. Work carefully with units and always check your answer makes sense.

#### 1. What is a ratio?

A **ratio** compares two or more quantities **of the same kind**, telling us how much of one there is compared to another. We write it with a colon, for example 3:5.

- The ratio 3:5 means "for every 3 parts of the first quantity, there are 5 parts of the second."
- **Order matters:** 3:5 is not the same as 5:3.
- A ratio has **no units** — the units cancel because we compare like with like.
- The total number of parts is 3 + 5 = 8.

Example: in a class with 3 boys for every 5 girls, out of every 8 learners, 3 are boys and 5 are girls.

#### 2. Simplifying ratios

To simplify a ratio, divide **every** part by the **HCF** (highest common factor) of the numbers, until the parts share no common factor except 1.

Worked example — simplify 18:24:
- HCF of 18 and 24: 18 = 2 × 3 × 3, 24 = 2 × 2 × 2 × 3, so HCF = 2 × 3 = 6.
- Divide: 18 ÷ 6 = 3, 24 ÷ 6 = 4.
- So 18:24 = **3:4**.

**Ratios with fractions or decimals:** clear them first.
- ½ : ¾ → multiply each part by the LCD (4): 2:3.
- 0,4 : 0,6 → multiply each part by 10: 4:6 → 2:3.

#### 3. Equivalent ratios

**Equivalent ratios** show the same relationship. You obtain them by multiplying or dividing every part by the same non-zero number.

2:3 = 4:6 = 6:9 = 10:15 (multiplying by 2, 3, 5).

Use equivalent ratios to find a missing value:
- 2:3 = 10:? Since 2 × 5 = 10, the missing value is 3 × 5 = **15**.

#### 4. Ratios with units — convert first

A ratio must compare quantities in the **same unit**. Always convert before writing the ratio.

Worked example — write 50 cm to 2 m as a ratio:
- Convert: 2 m = 200 cm.
- Ratio: 50:200, simplify by 50 → **1:4**.

Worked example — write 45 minutes to 1½ hours:
- Convert: 1½ h = 90 min.
- Ratio: 45:90 → **1:2**.

**Pitfall:** never write 50:2 (cm vs m) or 45:1½ (min vs h). Mixing units gives a wrong answer.

#### 5. Three-part ratios

A ratio can compare three quantities, written a:b:c. Simplify by dividing **all** parts by their common HCF.

- 12:18:30, HCF = 6 → **2:3:5**. Total parts = 2 + 3 + 5 = 10.

#### 6. Sharing an amount in a given ratio

Method:
1. Add the parts to get the **total** number of parts.
2. Find the value of **one part** = amount ÷ total parts.
3. Multiply one part by each share's number of parts.
4. Check the shares add up to the original amount.

Worked example — share R240 in the ratio 3:5:
- Total parts = 3 + 5 = 8.
- One part = R240 ÷ 8 = R30.
- First share = 3 × R30 = **R90**; second share = 5 × R30 = **R150**.
- Check: R90 + R150 = R240. ✓

Worked example — share R600 among A, B, C in 1:2:3:
- Total parts = 6; one part = R600 ÷ 6 = R100.
- A = R100, B = R200, C = R300. Check: R100 + R200 + R300 = R600. ✓

#### 7. Rates

A **rate** compares two quantities of **different** kinds (different units), written with "per" or "/", for example km/h, R/kg, beats/min. Unlike a ratio, a rate **has units**.

A **unit rate** gives the amount per **one** unit. To find it, divide so the second quantity becomes 1.

- A car travels 240 km in 3 hours → 240 ÷ 3 = **80 km/h** (80 km each hour).

#### 8. Unit price and best buy

To compare value, find the **unit price** (cost per same unit) of each option. The lowest unit price is the better buy.

Worked example — 500 g for R30, or 800 g for R44:
- Option A: R30 ÷ 500 = R0,06 per g.
- Option B: R44 ÷ 800 = R0,055 per g.
- R0,055 < R0,06, so the **800 g pack** is the better buy.

#### 9. Speed, distance and time

Speed is a rate (distance per time):
- speed = distance ÷ time
- distance = speed × time
- time = distance ÷ speed

Keep units consistent (km with h gives km/h).

Worked example — a cyclist rides 45 km in 1 h 30 min:
- Convert time: 1 h 30 min = 1,5 h.
- speed = 45 ÷ 1,5 = **30 km/h**.
- Pitfall: divide by 1,5 (not 1,30); 30 min = 0,5 h.

Worked example — a car at 90 km/h for 2½ h:
- distance = 90 × 2,5 = **225 km**.

#### 10. Direct proportion

In **direct proportion**, as one quantity increases, the other increases in the **same ratio** (halve one, the other halves). The ratio y/x stays constant: y = kx.

Use the **unitary method**: find the value of one, then multiply.

Worked example — 4 pens cost R20, find the cost of 7 pens:
- 1 pen = R20 ÷ 4 = R5.
- 7 pens = 7 × R5 = **R35**.
- Check with ratios: 4:20 = 7:35. ✓

Worked example — a recipe for 6 people needs 450 g flour; for 10 people:
- 1 person = 450 ÷ 6 = 75 g; 10 people = 10 × 75 = **750 g**.

More items → more cost; more people → more flour. This is direct.

#### 11. Inverse (indirect) proportion

In **inverse proportion**, as one quantity increases, the other **decreases**, so that their **product stays constant**: x × y = k, so y = k/x.

Method: find the constant (the product), then divide by the new value.

Worked example — 6 workers build a wall in 8 days; how long for 4 workers?
- Constant = 6 × 8 = 48 worker-days (the total work).
- 4 workers: 48 ÷ 4 = **12 days**.
- Sense check: fewer workers → more time. ✓
- Pitfall: do **not** scale directly (4/6 × 8) — that is the wrong direction.

Worked example — a tank fills in 20 min using 3 taps; with 5 taps?
- Constant = 3 × 20 = 60. With 5 taps: 60 ÷ 5 = **12 min**.

#### 12. Direct vs inverse — how to decide

Ask: when one quantity goes **up**, what happens to the other?

- Both go up together (or down together) → **direct** proportion. Ratio y/x constant; use the unitary method (find one, multiply).
- One goes up while the other goes down → **inverse** proportion. Product x×y constant; find the constant, then divide.

Clues for **inverse**: more workers / taps / machines → less time; faster speed → less time.
Clues for **direct**: more items → more cost; more hours worked → more pay.

#### Common pitfalls to avoid

- Forgetting to convert to the **same unit** before writing a ratio.
- Not dividing by the **HCF**, leaving the ratio unsimplified.
- Swapping the order of a ratio (3:5 ≠ 5:3).
- Treating an inverse problem as direct (scaling the wrong way).
- Converting time wrongly: 1 h 30 min = 1,5 h, not 1,30 h.
- Always **check** that shares add back to the original total.


### Squares, Cubes & Roots

This section covers how to square and cube numbers, how to find square roots and cube roots, and how to handle these operations with large numbers, fractions, decimals, and inside longer calculations. Mastering the perfect squares and cubes by heart makes the rest of the work fast and reliable in an exam.

#### Squares and square roots

To **square** a number means to multiply it by itself. We write this with a small raised 2, called an exponent.

- 7² = 7 × 7 = 49
- 12² = 12 × 12 = 144

A common mistake is to read 7² as 7 × 2 = 14. The exponent tells you how many times the number is used as a factor, not what to multiply by. So 7² uses 7 twice: 7 × 7.

A **perfect square** is a number you get by squaring a whole number. You should know these by heart:

1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144

(these are 1² up to 12²).

The **square root** of a number, written with the symbol √, asks the reverse question: "Which positive number, multiplied by itself, gives this number?" Square root is the inverse of squaring.

- √49 = 7, because 7 × 7 = 49
- √144 = 12, because 12 × 12 = 144

#### Cubes and cube roots

To **cube** a number means to use it as a factor three times. We write this with a raised 3.

- 4³ = 4 × 4 × 4 = 64
- 10³ = 10 × 10 × 10 = 1000

Again, do not confuse 4³ with 4 × 3 = 12. The 3 means three factors of 4.

A **perfect cube** is a number you get by cubing a whole number. Useful ones to memorise:

1, 8, 27, 64, 125, 216, 343, 512, 729, 1000

(these are 1³ up to 10³).

The **cube root**, written ∛, reverses cubing: "Which number, used three times as a factor, gives this number?"

- ∛27 = 3, because 3 × 3 × 3 = 27
- ∛1000 = 10, because 10 × 10 × 10 = 1000

#### Finding roots of large numbers using prime factorisation

For large numbers you cannot guess, prime factorisation gives a sure method.

**Square root via prime factors — find √576**

1. Prime factorise: 576 = 2 × 2 × 2 × 2 × 2 × 2 × 3 × 3 = 2⁶ × 3².
2. For a square root, divide each exponent by 2 (or pair the factors and take one from each pair).
3. 2⁶ → 2³ and 3² → 3¹.

So √576 = 2³ × 3 = 8 × 3 = **24**. Check: 24 × 24 = 576. ✓

Another example, **√324**: 324 = 2² × 3⁴. Halving the exponents gives 2¹ × 3² = 2 × 9 = **18**.

**Cube root via prime factors — find ∛1728**

1. Prime factorise: 1728 = 2⁶ × 3³.
2. For a cube root, divide each exponent by 3 (or group the factors in threes and take one from each group).
3. 2⁶ → 2² and 3³ → 3¹.

So ∛1728 = 2² × 3 = 4 × 3 = **12**. Check: 12 × 12 × 12 = 1728. ✓

Another example, **∛3375**: 3375 = 3³ × 5³. Dividing each exponent by 3 gives 3 × 5 = **15**.

**Why pair vs group in threes?** A square root undoes an exponent of 2, so each pair of identical primes produces one factor. A cube root undoes an exponent of 3, so each group of three identical primes produces one factor. The shortcut is simply: divide every exponent by 2 (square root) or by 3 (cube root).

#### Estimating roots of non-perfect numbers

Many numbers are not perfect squares or cubes. We estimate by trapping the root between two consecutive integers using the nearest perfect squares/cubes.

**Estimate √50.** The nearest perfect squares are 49 = 7² and 64 = 8². Since 49 < 50 < 64, we have 7 < √50 < 8. Because 50 is very close to 49, √50 ≈ 7,07, which lies between 7 and 8.

**Estimate √90.** Nearest perfect squares: 81 = 9² and 100 = 10². So 9 < √90 < 10, and √90 ≈ 9,49.

**Estimate ∛100.** Nearest perfect cubes: 64 = 4³ and 125 = 5³. So 4 < ∛100 < 5, and ∛100 ≈ 4,64.

Note the South African convention: decimals use a comma, so we write 7,07 not 7.07.

#### Squares and cubes of fractions and decimals

For a **fraction**, apply the power to both the numerator and the denominator.

- (2/3)² = 2²/3² = 4/9
- (1/2)³ = 1³/2³ = 1/8

Do not square only the top. (2/3)² is 4/9, never 4/3.

For a **root of a fraction**, take the root of the top and the bottom separately.

- √(9/16) = √9 / √16 = 3/4

For **decimals**, multiply out carefully and count the decimal places.

- 0,3² = 0,3 × 0,3 = 0,09 (one decimal place squared gives two)
- √0,64 = 0,8, because 0,8 × 0,8 = 0,64

A common error is writing 0,3² = 0,9. Always multiply the decimal by itself.

#### Order of operations with roots and powers

Roots and exponents are handled at the same stage as powers, after brackets but before × ÷ and + −. A root sign also acts like a bracket: simplify everything inside it first.

**Example: √(36 + 64).** Simplify inside first: 36 + 64 = 100, then √100 = 10. It is wrong to write √36 + √64 = 6 + 8 = 14. In general √(a + b) ≠ √a + √b.

**Example: 3² + ∛27 × 2.** Powers/roots first: 3² = 9 and ∛27 = 3, giving 9 + 3 × 2. Multiply before adding: 9 + 6 = 15.

**Example: √144 − 2³ + 5².** Evaluate roots and powers: 12 − 8 + 25. Then work left to right: 12 − 8 = 4, and 4 + 25 = 29.

#### Common pitfalls

- 7² means 7 × 7, not 7 × 2; 4³ means 4 × 4 × 4, not 4 × 3.
- √(a + b) ≠ √a + √b. Simplify under the root first.
- (−5)² = 25 (the brackets square the negative sign too), but −5² = −(5²) = −25 (only the 5 is squared). These are different.
- When taking a root by prime factorisation, divide exponents by 2 for square roots and by 3 for cube roots — do not mix them up.
- Keep the South African decimal comma in all answers, e.g. √50 ≈ 7,07.


