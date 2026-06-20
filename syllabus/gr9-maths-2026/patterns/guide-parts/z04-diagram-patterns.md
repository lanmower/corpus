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
