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
