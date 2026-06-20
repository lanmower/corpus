### Describing the Rule, Verifying It, and Position vs Value

**Position number vs term value.** This is the single most important distinction in pattern questions. The **position number** n tells you *where* a term sits — 1st, 2nd, 3rd — and is the input. The **term value** Tₙ tells you *what* that term equals — the output. In 6, 11, 16, ..., the term in position n = 2 has value 11. So "what is the 2nd term?" asks for a **value** (11), while "which term is 11?" asks for a **position** (2). Read each question carefully and answer with the right quantity.

**Describing a rule in words.** There are two standard styles. The **recursive** style describes term-to-term growth: "start at 4 and add 5 each time." The **general** style describes position-to-value: "multiply the position by 5 and subtract 1," matching Tₙ = 5n − 1. The general style is more powerful because it gives any term directly without listing earlier terms. For a decreasing table 10, 8, 6, 4 the rule is "start at 10 and subtract 2 each time," i.e. Tₙ = −2n + 12.

**Verifying a rule.** Substitute at least **two** known positions and check the values match. Claiming Tₙ = 3n + 2 for 5, 8, 11, 14: T₁ = 5 ✓ and T₄ = 14 ✓, so it is verified. Checking only one term is not enough, because a wrong rule can fit a single term by coincidence. If a rule fails on any term it is wrong — e.g. Tₙ = 2n + 3 gives T₃ = 9 but the sequence shows 10, so it fails (and indeed 5, 7, 10, 13 has non-constant differences 2, 3, 3, so no dn + c rule fits at all).

**Common pitfalls.**
- *Dropping c.* Writing Tₙ = 5n for 8, 13, 18, 23 ignores the constant; the correct rule is Tₙ = 5n + 3 (c = 8 − 5 = 3). Check: 5(1) + 3 = 8 ✓.
- *Answering the wrong quantity.* "Determine which term has value 43" in 3, 7, 11, ... wants the **position**: 4n − 1 = 43 → n = 11, so "43 is the 11th term."
- *Equivalent rules.* Two different-looking rules can describe the same pattern; Tₙ = 3(n + 1) − 1 and Tₙ = 3n + 2 give identical values. Confirm equivalence by comparing outputs for several n.
