# Functions And Relationships — Complete Study Guide

## Contents

### Functions & Relationships (Ex 6.1)

A **function** (or relationship) links an **input** (x) to an **output** (y) by a fixed rule. You meet it in three forms: flow diagrams, tables, and formulae (equations). The skill is to move freely between them.

**Flow diagrams.** A box contains the rule; arrows carry inputs in and outputs out.
- Apply the rule **forwards** to find an unknown output.
- Apply the rule **backwards** (do the inverse operation) to find an unknown input.
- Example, rule 3x: input 1 → output 3; output 15 → input 15÷3 = 5; input −2 → output −6.
- A two-step diagram (box a then box b) hides two operations. Find them from the input→output pattern: if outputs are 15, 24, 9, 0 for inputs 4, 7, 2, −1, the rule is ×3 then +3 (so a = ×3, b = +3), because output = 3x + 3.
- For a rule like x² + 1, square first then add: (−3)² + 1 = 10, 0² + 1 = 1. Mind the sign trap: (−3)² = 9, not −9.

**Tables and finding the formula.** Look at how y changes as x increases by 1.
- A **constant difference** between consecutive y-values means the relationship is **linear** (a straight line). That common difference is the **gradient** (m).
- Write y = mx + c. Find c by substituting any one (x, y) pair, or read it off as the y-value when x = 0.
- Example: x = 1,2,3,4,5,6 give y = 4,7,10,… The difference is +3, so m = 3 and y = 3x + 1 (since at x=1, 3+c=4 ⇒ c=1). Continue the row: 13, 16, 19.
- A *decreasing* table (e.g. 5, 2, −1, …) has a negative gradient: difference −3 ⇒ y = −3x + 8.

**Deciding linear vs non-linear.** Linear ⇔ equal change in y for equal change in x. If the differences are not constant, test candidate equations by substituting the x-values: e.g. for x = 1,2,3 → y = 0,3,8, only y = x² − 1 fits all three, so it is a non-linear (quadratic) function.

**Worked example (word problem):** A reservoir gains water: t = 10,20,…,60 min give V = 7,12,17,22,27,32 kℓ.
- Increase every 10 min = 5 kℓ (constant ⇒ linear).
- Rate per minute = 5 ÷ 10 = 0,5 kℓ/min (this is the gradient).
- Formula: V = 0,5t + c; at t = 10, V = 7 ⇒ 5 + c = 7 ⇒ c = 2. So **V = 0,5t + 2**, where 2 kℓ is the starting volume.

**Pitfalls:** reverse the operations in the correct order when working backwards through a flow diagram; do not treat a decreasing table as if the gradient were positive; and always check your formula against a second point from the table.


### Input and Output Values: Flow Diagrams

A flow diagram (or function machine) is a picture of a relationship. An **input** enters on the left, travels through one or more **operation boxes** (the rule), and an **output** leaves on the right. To use it, apply each operation **in order, left to right**.

**Applying the rule (forwards).** For the machine `input → ×4 → +1 → output`, an input of 3 becomes 3×4 = 12, then 12+1 = 13. Always finish the first box before starting the next, and respect the order of operations shown by the boxes — if the ×-box comes first, multiply before you add or subtract.

**One or more operations.** A machine may have a single box (e.g. `×3` or `x²`) or several in a row. Squaring is a common single operation, and learners must watch the sign trap: a negative input squared is **positive**, because negative × negative = positive. So (−5)² = 25, not −25.

**Working backwards (inverse operations).** Often the output is given and the input is unknown. To reverse a machine you do two things: replace every operation with its **inverse** (+↔−, ×↔÷, x²↔√), and apply those inverses in the **reverse order** to the forward steps. For `input → ×2 → +7 → output` with output 19: undo +7 first (19−7 = 12), then undo ×2 (12÷2 = 6), giving input 6. Always check by running the input forwards.

**Common pitfalls.** Undoing operations in the wrong order; forgetting that the *last* forward operation is the *first* one to undo; and dropping the sign on negatives. Encourage learners to always verify their reversed answer by substituting it forwards through the machine.


### Determining the Rule from a Table

Given a table of input–output pairs, the goal is to find the rule that links them, and to state it both **in words** and **as an equation** such as y = 3x − 1.

**The method for a linear rule.**
1. Check that x increases by a constant step (often 1).
2. Find the **first difference**: how much y changes per step in x. If x goes up by 1, this constant change is the gradient m. If x steps by more than 1, then m = Δy ÷ Δx.
3. Write y = mx + c.
4. Find c by substituting any one (x, y) pair and solving.
5. Verify with a second pair.

**Worked example.** x = 1,2,3,4 → y = 2,5,8,11. First differences are all 3, so m = 3. Using (1,2): 3(1)+c = 2 ⇒ c = −1. Rule: y = 3x − 1, in words "multiply the input by 3, then subtract 1." Check (4,11): 3(4)−1 = 11 ✓.

**Reading c directly.** If the table includes x = 0, then c is simply the y-value there (the y-intercept). For direct proportion (y = mx, c = 0), y ÷ x gives the same constant for every pair.

**When it is not linear.** If the first differences are not constant, the rule is not y = mx + c. Inspect the y-values for patterns: 1, 4, 9, 16 are the squares, giving y = x². A constant **second** difference signals a quadratic relationship.

**Pitfall.** When x does not increase by 1, the raw first difference in y is *not* the gradient — always divide the change in y by the matching change in x.


### Multiple Representations of the Same Relationship

One relationship can be shown in six different forms, and Grade 9 learners must convert freely between them:

1. **Verbal description** — words: "multiply by 2 and add 3."
2. **Flow diagram** — `input → ×2 → +3 → output`.
3. **Table** — rows of input and output values.
4. **Formula / equation** — y = 2x + 3.
5. **Ordered pairs** — (x, y), e.g. (0,3), (1,5), (2,7).
6. **Graph** — points or a line on the Cartesian plane.

**Converting between forms.** From a verbal rule, build the flow diagram box by box, then the equation, then substitute chosen x-values to fill a table. Each table row written as (input, output) is an ordered pair, and each ordered pair plotted — first number across (x), second number up (y) — is a point on the graph. A linear equation produces a straight line.

**Reading backwards.** From a graph or table you can recover the equation: turn the points into a table, find the gradient m from the first difference (or Δy ÷ Δx), and read c as the y-value where x = 0. For points (0,−1), (1,1), (2,3), (3,5): m = 2, c = −1, so y = 2x − 1.

**They must all agree.** Because every form describes the *same* rule, tracing one input through all six must give the same output every time. This is the best self-check: if the table, equation and graph disagree, one of them is wrong.


### Substituting into a Formula and Solving for the Input

**Finding the output (substitution).** To find an output, replace the variable with its value — always in brackets — and simplify using the order of operations. For y = 4x − 7 with x = 3: y = 4(3) − 7 = 12 − 7 = 5.

**Negatives and squares.** Brackets are essential for negative inputs. For y = −3x + 5 at x = −2: y = −3(−2) + 5 = 6 + 5 = 11, because negative × negative is positive. With squares, do the squaring first: y = x² + 2x at x = −4 gives (−4)² + 2(−4) = 16 − 8 = 8.

**Finding the input (solving).** When the output is given and the input is unknown, substitute the output and solve the equation by inverse operations — the algebra version of working backwards through a flow diagram. For y = 2x + 1 with y = 13: 13 = 2x + 1 ⇒ 12 = 2x ⇒ x = 6. Always check by substituting back.

**Negative gradients.** For y = −2x + 3 with y = 11: 11 = −2x + 3 ⇒ 8 = −2x ⇒ x = −4. Dividing by a negative changes the sign, so 8 ÷ (−2) = −4.

**Real-life use.** With a cost formula C = 5n + 10, substituting n = 8 gives the cost (C = R50), while setting C = 60 and solving gives the number of items (n = 10). Forwards finds the output; backwards finds the input.

**Pitfalls.** Forgetting brackets on negatives, breaking the order of operations, and dropping a sign when dividing by a negative.


### Linear versus Non-linear Relationships

The key Grade 9 test from a table is the **first difference**. First make sure x increases by a constant step, then find how much y changes between consecutive rows.

- If the first differences are **constant**, the relationship is **linear** — it has the form y = mx + c and graphs as a straight line.
- If the first differences are **not constant**, the relationship is **non-linear**.

**Linear example.** x = 1,2,3,4,5 → y = 2,5,8,11,14. The differences are 3,3,3,3 — constant — so it is linear (rule y = 3x − 1). The exam-style reason: "the first difference between consecutive y-values is constant."

**Non-linear example.** x = 1,2,3,4 → y = 3,6,11,18. The differences 3,5,7 are not constant, so it is non-linear. (Here the *second* differences are constant at 2, which signals a quadratic: y = x² + 2.)

**Unequal x-steps — a common trap.** If x jumps unevenly you cannot compare raw y-differences; compare the rate Δy ÷ Δx instead. For x = 1,2,4,7 → y = 2,4,8,14, the rate is 2 throughout, so the relationship is linear (y = 2x) even though the y-differences 2,4,6 look uneven.

**From equation or graph.** An equation is linear if x appears only to the power 1, with no x², √x or 1/x. Linear relationships plot as straight lines; non-linear ones plot as curves.


### Continuous vs Discrete Relationships, and Dependent vs Independent Variables

**Discrete or continuous.** A **discrete** relationship allows the input only separate, countable values — usually whole numbers — with gaps between them, such as the number of learners, cars or loaves of bread. A **continuous** relationship allows the input any value in a range, including fractions and decimals, such as time, length, mass or temperature. A quick test is to ask whether a half makes sense: half a person does not (discrete), but half a minute does (continuous). Counted things tend to be discrete; measured things tend to be continuous.

**On a graph,** discrete relationships are drawn as separate dots that must **not** be joined, because the in-between points have no meaning (e.g. you cannot buy 2,5 CDs). Continuous relationships are drawn as an unbroken line or curve.

**Independent and dependent variables.** The **independent** variable is the input — the value you choose; it goes on the horizontal x-axis. The **dependent** variable is the output — its value depends on the input; it goes on the vertical y-axis. The test is "which one depends on the other?" Since cost depends on the number of items, the number of items is independent (x) and cost is dependent (y).

**Real-life contexts.** Consider cost = R5 × number of items + R10, i.e. C = 5n + 10. Here n is independent and C is dependent. The constant R10 is the fixed start value (the cost when n = 0, a call-out fee), and the R5 is the rate of change — the gradient, the cost per item. In general the constant c is the starting/fixed amount and the gradient m is the rate per unit (rand per item, litres per minute, and so on). Because items are whole, this relationship is discrete; because R5 is added per item, it is linear.


