# Probability — Complete Study Guide

## Contents

### Basic Probability

Probability measures how likely something is to happen. Before we can calculate anything we need four words.

An **experiment** (or trial) is any action with an uncertain result that can be repeated: tossing a coin, rolling a die, drawing a card, spinning a spinner. An **outcome** is one single result of that experiment, such as rolling a 4. The **sample space**, written S, is the set of all possible outcomes; for one die S = {1, 2, 3, 4, 5, 6}. An **event** is the outcome or group of outcomes we are interested in, for example "rolling an even number" = {2, 4, 6}. An event is always a subset of the sample space.

When every outcome is equally likely, the probability of an event is

  P(event) = (number of favourable outcomes) ÷ (total number of possible outcomes).

For example, P(even on a die) = 3/6 = 1/2, because there are three favourable outcomes {2, 4, 6} out of six. A common pitfall is putting the wrong number on the bottom: the denominator is always the TOTAL number of outcomes, never the number of categories.

Every probability is a number on the **probability scale** from 0 to 1. A value of 0 means the event is impossible; 1 means it is certain; 1/2 means an even chance. Values close to 0 are unlikely and values close to 1 are likely. Because favourable outcomes are part of the total, a probability can never be negative or greater than 1 — if you ever calculate 1,3 or −0,2 you have made a mistake.

The same probability can be written three ways. Take P = 3/4. As a fraction it is 3/4. As a decimal, divide top by bottom: 3 ÷ 4 = 0,75. As a percentage, multiply the decimal by 100: 75%. So 3/4 = 0,75 = 75% all describe the same chance. Note that a high probability like 70% means likely, not guaranteed; only P = 1 (100%) means certain.

To place an event word on the scale, work out P first, then match: P = 0 impossible, 0 < P < 1/2 unlikely, P = 1/2 even chance, 1/2 < P < 1 likely, P = 1 certain.


### Equally Likely Outcomes

The counting formula P = favourable ÷ total only works when the outcomes are **equally likely** — that is, each outcome has exactly the same chance of happening. We get this from "fair" devices: a fair coin, a fair die, a balanced spinner with equal sectors, a well-shuffled pack of cards, or balls drawn blindly from a bag. A biased or weighted device breaks the equal-chance assumption, and then we must use experimental probability instead.

**Coins.** One fair coin has S = {Heads, Tails}, so P(Heads) = P(Tails) = 1/2. The two probabilities add to 1.

**Dice.** A fair die has S = {1, 2, 3, 4, 5, 6}. To find P(a multiple of 3): the multiples are {3, 6}, so P = 2/6 = 1/3. For P(a prime number): the primes are {2, 3, 5} (remember 1 is not prime), so P = 3/6 = 1/2.

**Cards.** A standard pack has 52 cards in four suits — Hearts and Diamonds (red), Clubs and Spades (black) — with 13 cards per suit (Ace, 2–10, Jack, Queen, King). So there are 26 red cards: P(red) = 26/52 = 1/2. There are four of each value, so P(a King) = 4/52 = 1/13, and 13 of each suit, so P(a club) = 13/52 = 1/4. Do not confuse "a King" (4 cards) with "the King of clubs" (just 1 card, probability 1/52).

**Spinners.** If a spinner has 8 equal sectors numbered 1–8, then P(odd) = 4/8 = 1/2. But the equal-counting trick only works when the sectors are the same size. If sectors are unequal, use the central angle: a sector of 180° out of 360° gives P = 180/360 = 1/2.

**Coloured balls.** With 4 white, 6 black and 2 yellow balls (total 12), P(not black) = (4 + 2)/12 = 1/2, which you can also get by complement: 1 − 6/12 = 1/2.

A subtle pitfall: with two coins, the outcomes {HH, HT, TH, TT} are the four equally likely cases. "One Head and one Tail" matches {HT, TH}, giving 2/4 = 1/2 — not 1/3. Grouping outcomes that are not equally likely (two heads / one of each / two tails) gives the wrong answer.


### Relative Frequency and Experimental Probability

So far we have calculated probability by reasoning about fair devices. But sometimes we cannot reason it out — a coin might be bent, a die weighted, or we want the chance a drawing pin lands point-up. In these cases we run the experiment many times and measure what actually happens. This gives the **relative frequency**, also called the **experimental probability**:

  relative frequency = (number of times the event occurred) ÷ (total number of trials).

For example, if a drawing pin lands point-up 18 times in 50 throws, the relative frequency is 18/50 = 0,36 = 36%.

It helps to compare two ideas. **Theoretical probability** is worked out by reasoning, P = favourable ÷ total, assuming the device is fair — for a coin, P(Heads) = 1/2. **Experimental probability** is measured from real data. The two are usually close but not exactly equal. Theory predicts; experiment measures.

Why do they tend to agree? Because of the **Law of Large Numbers**. In a small number of trials, luck can make results lopsided — 7 Heads in 10 tosses is a relative frequency of 0,7, far from 0,5. But as the number of trials grows, the relative frequency settles down and **converges** toward the true theoretical value. More trials means a more reliable estimate. So if a coin shows 118 Heads in 200 tosses (0,59), that is a bit above the theoretical 0,5, and we would expect it to drift closer to 0,5 with more tosses; a small difference is completely normal.

This also tells us how to judge whether a device is fair. If a die shows the number 6 on 18 of 60 rolls, the experimental P(6) = 0,3 is well above the theoretical 1/6 ≈ 0,17 — suspicious, but 60 rolls is not many, so chance alone could explain it. To be sure, roll thousands of times: if P(6) stays near 0,3, the die is probably biased.

The formula rearranges usefully. If the relative frequency is 0,28 over 50 trials, then the number of times the event occurred is 0,28 × 50 = 14. And when given a frequency table — say Red 24, Blue 36, Green 60 — the total trials is 120, so the estimated P(Blue) = 36/120 = 0,3. Always divide by the grand total, not by the number of categories.


### Complementary Events

**The complement** of an event A — written **"not A"** or **A′** — is everything in the sample space that is **not** A. For example, if A is "rolling a 6" on a die, then "not A" is "rolling a 1, 2, 3, 4 or 5".

**Probabilities sum to 1**

In any experiment *something* must happen, and certainty has probability 1. So the probabilities of all the separate outcomes in a sample space always add up to **1**.

For a fair die:
1/6 + 1/6 + 1/6 + 1/6 + 1/6 + 1/6 = 6/6 = 1.

This is a useful **check**: if your outcome probabilities do not add to 1, you have made an error somewhere.

**The complement rule**

Because an event and its complement together fill the whole sample space:

> **P(A) + P(not A) = 1**, which rearranges to **P(not A) = 1 − P(A)**.

For example, if P(rain) = 0,3 then P(no rain) = 1 − 0,3 = 0,7.

**Why the complement is useful**

Using the complement is *faster* whenever "not A" is much simpler to count than A. Classic case: "at least one".

> **Worked example 1 — Faulty bulbs**
> P(picking a faulty bulb) = 3/40. Find P(good bulb).
> "Good" is the complement of "faulty":
> P(good) = 1 − P(faulty) = 1 − 3/40.
> Write 1 as 40/40: P(good) = 40/40 − 3/40 = **37/40** = 0,925 = 92,5%.

> **Worked example 2 — Finding a missing probability**
> A spinner has P(red) = 0,4, P(blue) = 0,35, P(green) = x. Find x.
> All outcomes sum to 1:
> 0,4 + 0,35 + x = 1
> 0,75 + x = 1
> x = 1 − 0,75 = **0,25**.
> Check: 0,4 + 0,35 + 0,25 = 1. ✓

> **Worked example 3 — "At least" shortcut**
> Find P(rolling at least 2) on a fair die.
> Counting directly means adding P(2,3,4,5,6). Instead use the complement: "not at least 2" is rolling a 1, so P = 1/6.
> P(at least 2) = 1 − 1/6 = **5/6**. Much quicker than adding five fractions.

**Expressing a complement in different forms**

If P(pass) = 85%, then P(fail) = 100% − 85% = 15% = 15/100 = 3/20 = 0,15. A probability can be given as a fraction, decimal or percentage — all equal.

**Pitfalls**

- The complement of A is **everything else**, not just one other outcome. The complement of "rolling a 6" is {1, 2, 3, 4, 5}, so P(not 6) = 5/6 — **not** 1/6.
- Always compute a complement as **1 (or 100%) minus** the given value; do not guess "the rest".
- When subtracting, write 1 as a fraction with the same denominator (e.g. 1 = 40/40) before subtracting.


### Compound Events

A **compound (two-stage) event** involves two or more actions, such as tossing two coins, rolling two dice, or spinning a spinner and tossing a coin. To find probabilities you first need the full **sample space** — the list of every possible outcome.

**Three tools for listing the sample space**

1. **Systematic listing** — write out every outcome in an orderly way.
2. **A two-way table (grid)** — rows for one action, columns for the other.
3. **A tree diagram** — branches for each stage.

**The fundamental counting principle**

The total number of outcomes is found by **multiplying** the number of outcomes at each stage:

> total outcomes = (outcomes of action 1) × (outcomes of action 2)

For two coins: 2 × 2 = 4. For two dice: 6 × 6 = 36.

**Two coins**

Treating the coins as Coin 1 then Coin 2:
S = {HH, HT, TH, TT} → **4** equally likely outcomes, each with probability 1/4.

> **Worked example 1 — At least one Head**
> Find P(at least one Head) when two coins are tossed.
> "At least one Head" = {HH, HT, TH} → 3 outcomes, so P = **3/4**.
> Quicker with the complement: the only outcome with no Head is TT (P = 1/4), so P(at least one Head) = 1 − 1/4 = 3/4.

**Two dice — the two-way table**

Build a 6 × 6 grid: rows = die 1 (1–6), columns = die 2 (1–6). Each cell is an **ordered pair** (d1, d2). There are 6 × 6 = **36** equally likely outcomes. Note that (1, 3) and (3, 1) are **different** outcomes, so P(any single pair) = 1/36.

> **Worked example 2 — Sum of two dice**
> Find P(sum = 7).
> Pairs giving 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) → 6 outcomes.
> P(sum = 7) = 6/36 = **1/6**. (Sum 7 is the most likely total.)
> Compare: sum = 2 occurs only as (1,1) → P = 1/36 (the rarest), and a **double** {(1,1),(2,2),(3,3),(4,4),(5,5),(6,6)} → 6/36 = 1/6.

> **Worked example 3 — Sum greater than 9**
> "Greater than 9" means 10, 11 or 12.
> 10: (4,6),(5,5),(6,4) = 3; 11: (5,6),(6,5) = 2; 12: (6,6) = 1.
> Favourable = 3 + 2 + 1 = 6, so P(sum > 9) = 6/36 = **1/6**.

**Tree diagrams — multiply along, add across**

Each branch shows an outcome with its probability. To find the probability of one **path**, **multiply** along the branches. For two coins: P(HT) = P(H) × P(T) = 1/2 × 1/2 = **1/4**. To combine several paths (an "or"), **add** the path probabilities.

**Two-way tables of real data**

A two-way table can sort people by two features (e.g. gender and whether they wear glasses). The **inner cells** give "and" probabilities (the intersection of a row and column); the **row/column totals (margins)** give single-event probabilities; the **grand total** in the corner is the whole group.

> **Worked example 4 — Reading a data table**
> 30 learners are sorted by gender and glasses. The cell that is both "girl" and "glasses" = 6.
> P(girl and glasses) = 6/30 = **1/5**.

**Combining different actions**

> **Worked example 5 — Spinner and coin**
> A spinner (1, 2, 3) is spun and a coin tossed.
> S = {1H, 1T, 2H, 2T, 3H, 3T} → 6 outcomes (3 × 2).
> "Even number and Tail" = {2T} → 1 outcome, so P = **1/6**.

**Pitfalls**

- For two dice, count **ordered** pairs: (3,4) and (4,3) are separate outcomes.
- "Greater than 9" excludes 9 itself; read inequality words carefully.
- On a tree diagram: **multiply** along a single path, but **add** when combining paths.
- (This is Grade 9 — use lists, tables and tree diagrams only; Venn diagrams are not used here.)


### Mutually Exclusive Events

Two events are **mutually exclusive** if they **cannot happen at the same time** — they share no common outcomes.

- **Example:** on one roll of a die, "getting a 2" and "getting a 5" are mutually exclusive — a single roll cannot be both.
- **Non-example:** "getting an even number" and "getting a number greater than 3" are **not** mutually exclusive, because a 4 or a 6 satisfies both at once.

**Testing for mutual exclusivity**

List the outcomes of each event and look for any **shared** outcome:

- No common outcome → mutually exclusive → P(A and B) = 0.
- At least one common outcome → not mutually exclusive → there is an overlap to subtract.

Quick check: ask "**can both happen in a single trial?**" If no, they are mutually exclusive.

**The addition rule**

When A and B **are** mutually exclusive (no overlap to double-count):

> **P(A or B) = P(A) + P(B)**

When A and B are **not** mutually exclusive (they overlap):

> **P(A or B) = P(A) + P(B) − P(A and B)**

You subtract the overlap P(A and B) because the outcomes lying in both events were counted twice. Note that if A and B are mutually exclusive, P(A and B) = 0 and the second rule collapses into the first — so the second rule is really the general one.

> **Worked example 1 — Mutually exclusive (no overlap)**
> From a 52-card pack, find P(a King or a Queen).
> A card cannot be a King and a Queen at once → mutually exclusive.
> P(King) = 4/52, P(Queen) = 4/52.
> P(King or Queen) = 4/52 + 4/52 = 8/52 = **2/13**. (Nothing to subtract.)

> **Worked example 2 — Overlapping events**
> From a 52-card pack, find P(a King or a Heart).
> A card **can** be both — the King of Hearts → **not** mutually exclusive.
> P(King) = 4/52, P(Heart) = 13/52, P(King and Heart) = 1/52.
> P(King or Heart) = 4/52 + 13/52 − 1/52 = 16/52 = **4/13**.
> Forgetting to subtract the King of Hearts gives the wrong answer 17/52.

> **Worked example 3 — Checking by listing**
> On one die roll, find P(even or greater than 3).
> Even = {2, 4, 6}, greater than 3 = {4, 5, 6}; overlap = {4, 6} → not mutually exclusive.
> P(even) = 3/6, P(>3) = 3/6, P(both) = 2/6.
> P(even or >3) = 3/6 + 3/6 − 2/6 = 4/6 = **2/3**.
> Check by listing the union {2, 4, 5, 6} = 4 outcomes → 4/6. ✓

**Link to complementary events**

Complementary events (A and "not A") are **always** mutually exclusive **and** together fill the whole sample space, so their probabilities add to 1. But mutually exclusive events are **not** always complementary: "roll a 2" and "roll a 5" are mutually exclusive yet their probabilities add to only 1/3, not 1 — they do not cover everything.

**Pitfalls**

- Do not use the simple rule P(A) + P(B) when the events overlap — you must subtract P(A and B).
- Always check for a shared outcome **before** adding; the King-of-Hearts trap (Example 2) is the classic mistake.
- "Mutually exclusive" is about having no common outcome; it does **not** mean the two events together cover the whole sample space.


### Predicting Outcomes

Once you know the probability of an event, you can **predict** roughly how often it will happen over many trials. This is called the **expected number**.

**The formula**

> **Expected number = probability of the event × number of trials**
> Expected = P(event) × n

The expected number is the best *prediction*; the actual count will usually be close but **not exactly** equal — real experiments vary.

> **Worked example 1 — Sixes on a die**
> A fair die is rolled 300 times. How many 6s are expected?
> P(6) = 1/6, so Expected = 1/6 × 300 = **50**.
> About 50 sixes. You would not necessarily get exactly 50, but 50 is the best prediction.

> **Worked example 2 — Heads and Tails**
> A coin is tossed 80 times.
> P(Heads) = 1/2 → Expected Heads = 1/2 × 80 = **40**; Expected Tails = 1/2 × 80 = **40**.
> Check: 40 + 40 = 80 = total trials. ✓ (The expected counts should add up to n.)

**Using decimal or percentage probabilities**

You can multiply by a decimal directly — no need to convert to a fraction first. Convert a **percentage to a decimal** before multiplying.

> **Worked example 3 — Spinner**
> A spinner lands on red with P(red) = 0,3. In 200 spins: Expected reds = 0,3 × 200 = **60**.

> **Worked example 4 — Survey prediction**
> A survey finds 35% of people prefer tea. In a town of 4000, predict how many prefer tea.
> Expected = 35% × 4000 = 0,35 × 4000 = **1400** people. (This uses experimental probability from the survey to predict for a larger group.)

> **Worked example 5 — Quality control**
> A factory finds 2% of bulbs are faulty. In a batch of 1500: Expected faulty = 0,02 × 1500 = **30** bulbs.

**Working backwards**

Rearrange the formula to find a missing value:

> **n = expected ÷ P**

> **Worked example 6 — Find the number of trials**
> A die was rolled n times and about 25 fours were expected, with P(4) = 1/6.
> 25 = 1/6 × n → multiply both sides by 6 → n = 25 × 6 = **150**. The die was rolled about 150 times.

**Linking to compound events**

First find the probability from the sample space, then multiply by the number of trials.

> **Worked example 7 — Sum of two dice**
> Two dice are rolled 180 times. How many sums of 7 are expected?
> P(sum = 7) = 6/36 = 1/6, so Expected = 1/6 × 180 = **30** times.

**Pitfalls**

- Convert a **percentage to a decimal** (35% → 0,35) before multiplying.
- The expected number is a **prediction**, not a guarantee; the real result varies from trial to trial.
- Expected counts for all the outcomes of one experiment should add up to the total number of trials — a handy check.
- To find the number of trials, divide: n = expected ÷ P (do not multiply by P again).


