# Graphs — Complete Study Guide

## Contents

### The Cartesian Plane

The Cartesian plane is the grid we use to give every point an exact address. It is built from two number lines that cross at right angles: the horizontal **x-axis** and the vertical **y-axis**. The point where they meet is the **origin**, written (0;0).

Every point is named by an **ordered pair** (x;y). The first number is the x-coordinate — how far left or right of the origin — and the second is the y-coordinate — how far up or down. Order matters: (3;5) and (5;3) are different points. In South African CAPS notation we separate the two values with a semicolon: (x;y).

**Plotting a point.** Always start at the origin. Move along the x-axis first (right for positive x, left for negative x), then move parallel to the y-axis (up for positive y, down for negative y), and mark the spot. For example, to plot (−4;3): go 4 left, then 3 up.

**Reading a point.** Drop a vertical line from the point to the x-axis to read x, and a horizontal line across to the y-axis to read y, then write (x;y).

**The four quadrants.** The axes cut the plane into four regions, numbered anticlockwise from the top-right:

- Quadrant I (top-right): (+;+)
- Quadrant II (top-left): (−;+)
- Quadrant III (bottom-left): (−;−)
- Quadrant IV (bottom-right): (+;−)

Points lying exactly on an axis (where x = 0 or y = 0) are not in any quadrant. A point with x = 0 sits on the y-axis; a point with y = 0 sits on the x-axis.

**Common pitfall.** Do not swap the coordinates. The first number always moves you across (x), the second always moves you up or down (y). Mixing them is the single most frequent plotting error.


### Gradient

The **gradient** (symbol m) measures how steep a line is and in which direction it slopes. It is the amount the line rises for each unit it moves across:

m = rise/run = Δy/Δx = (y₂ − y₁)/(x₂ − x₁)

Here Δy ("delta y") is the change in y between two points, and Δx is the change in x. Up and right count as positive; down and left count as negative.

**Worked example.** For A(1;2) and B(5;10): m = (10 − 2)/(5 − 1) = 8/4 = 2. The line rises 2 units for every 1 unit across. You may take the points in either order, as long as you are consistent in numerator and denominator — (2 − 10)/(1 − 5) = −8/−4 = 2 gives the same answer.

**Four kinds of gradient.**

- **Positive** (m > 0): the line rises from left to right (/).
- **Negative** (m < 0): the line falls from left to right (\).
- **Zero** (m = 0): a horizontal line; Δy = 0, so 0 ÷ run = 0.
- **Undefined**: a vertical line; Δx = 0, and Δy ÷ 0 cannot be calculated.

The contrast is worth memorising: 0 divided by something is 0 (fine), but something divided by 0 is undefined.

**Steepness** depends on the *size* of the gradient, not its sign. A line with gradient −5 is steeper than one with gradient 4, because |−5| = 5 > 4. The sign only says which way it tilts.

**Reading gradient from a graph.** Choose two points where the line passes neatly through grid corners, count the vertical jump (rise) and horizontal jump (run), and write m = rise/run, then simplify.

**Pitfall.** Keep rise (y) on top and run (x) on the bottom — never the other way round — and subtract the coordinates of the same point first in both top and bottom.


### The Straight-Line Equation y = mx + c

Every straight line (except vertical ones) can be written in the form **y = mx + c**, where:

- **m** is the **gradient** — the steepness and direction of the line.
- **c** is the **y-intercept** — the y-value where the line crosses the y-axis (the point (0;c)).

So in y = 3x + 4, the gradient is 3 and the line cuts the y-axis at (0;4). In y = −2x + 5, the gradient is −2 and the y-intercept is 5.

**Watch the form first.** You can only read m and c straight off the equation once y stands alone with a coefficient of 1. If you are given 2y = 6x − 8, divide every term by 2 to get y = 3x − 4, then read m = 3 and c = −4. If you are given 3x + y = 7, make y the subject: y = −3x + 7 (moving 3x across flips its sign), giving m = −3 and c = 7.

**Finding intercepts from the equation.** The line crosses the y-axis where x = 0 and the x-axis where y = 0.

- y-intercept: substitute x = 0. For y = 2x − 6, y = −6, so (0;−6).
- x-intercept: substitute y = 0. For 0 = 2x − 6, x = 3, so (3;0).

**Testing a point.** A point lies on a line only if its coordinates satisfy the equation. To check (2;1) on y = 3x − 5: substitute x = 2 → y = 3(2) − 5 = 1, which matches, so the point is on the line.

**Hidden coefficients.** When no number is written in front of x, the coefficient is 1 (or −1). So y = x means m = 1, c = 0; and y = −x + 2 means m = −1, c = 2.


### Drawing Straight-Line Graphs

There are three standard ways to draw a straight line. Choose whichever suits the equation.

**1. Table of values.** Pick a few x-values, calculate y for each, then plot and join the points. For y = 2x − 1 with x = −1, 0, 1, 2 you get y = −3, −1, 1, 3, giving points (−1;−3), (0;−1), (1;1), (2;3). Rule a straight line through them and extend past the ends. This always works but is the slowest method.

**2. Dual-intercept method.** Find the two points where the line crosses the axes.

- y-intercept: set x = 0.
- x-intercept: set y = 0.

For y = 2x − 4: x = 0 gives (0;−4); y = 0 gives 2x = 4, so (2;0). Plot the two intercepts and rule the line through them. This is fast and exam-friendly because only two points are needed.

**3. Gradient–intercept method.** Plot the y-intercept first, then use the gradient as rise/run to step to the next point. For y = (3/2)x + 1, plot (0;1), then go up 3 and right 2 to reach (2;4), and draw the line. For a negative gradient, step down for the rise.

**Lines through the origin.** For y = 2x both intercepts are the same point (0;0), so the dual-intercept method gives only one point. Keep (0;0) and choose one more x-value (e.g. x = 1 → (1;2)), or use the gradient to step to a second point.

**Exam checklist.** Write the equation as y = mx + c; find at least two accurate points (intercepts are easiest); use a ruler; extend and arrow the line; label it with its equation; and sanity-check — positive gradient slopes up, negative slopes down.


### Special Lines

Some lines have especially simple equations and are worth recognising instantly.

**Horizontal lines: y = c.** Every point on y = 3 has y = 3 whatever x is — for example (−2;3), (0;3), (5;3). The line lies flat, parallel to the x-axis, crossing the y-axis at (0;3). Its **gradient is 0**, because there is no rise (Δy = 0, so m = 0 ÷ run = 0).

**Vertical lines: x = c.** Every point on x = −2 has x = −2 whatever y is — for example (−2;0), (−2;3), (−2;−5). The line stands upright, parallel to the y-axis, crossing the x-axis at (−2;0). Its **gradient is undefined**, because there is no run (Δx = 0, and Δy ÷ 0 cannot be calculated).

A handy memory aid: "x = a number is a vertical line" — the x stands tall, just like a vertical line. By contrast, y = a number lies flat (horizontal).

**The line y = x.** Here the y-value always equals the x-value, so it passes through points like (−2;−2), (0;0), (1;1), (3;3). It has gradient 1 and y-intercept 0, rising at 45° through Quadrants I and III. It is the line of symmetry y = x, used to reflect points by swapping their coordinates.

**The line y = −x.** Here the y-value is the negative of x, giving points like (−2;2), (0;0), (1;−1), (3;−3). It has gradient −1 and y-intercept 0, falling at 45° through Quadrants II and IV.

**The axes themselves** are special cases: the x-axis is the line y = 0 (gradient 0), and the y-axis is the line x = 0 (gradient undefined).


### Finding the Equation of a Line

To find a line's equation you need its gradient m and its y-intercept c, then write y = mx + c.

**From a graph.** Read c directly — the y-value where the line crosses the y-axis. Find m by counting rise/run between two clear points, or using m = (y₂ − y₁)/(x₂ − x₁). If a line cuts the y-axis at 2 and rises 3 for every 1 across, the equation is y = 3x + 2.

**From a point and the gradient.** If the point given is the y-intercept, you already have c. For gradient 4 through (0;−3): c = −3, so y = 4x − 3.

If the point is not on the y-axis, substitute it to find c. For gradient 2 through (3;5): start with y = 2x + c, then 5 = 2(3) + c gives c = −1, so y = 2x − 1. Always check by substituting back: 2(3) − 1 = 5 ✓.

**From two points.** First find the gradient, then find c.

For A(1;3) and B(4;9): m = (9 − 3)/(4 − 1) = 2. Then y = 2x + c; substitute (1;3): 3 = 2 + c, so c = 1, giving y = 2x + 1. Check with B: 2(4) + 1 = 9 ✓.

For (−2;7) and (2;−1): m = (−1 − 7)/(2 − (−2)) = −8/4 = −2. Then −1 = −2(2) + c gives c = 3, so y = −2x + 3.

**Special lines from a point.** A horizontal line through (4;−2) is y = −2 (use the y-value); a vertical line through (4;−2) is x = 4 (use the x-value).

**Pitfall.** After finding the gradient, do not stop at y = mx. Unless the line passes through the origin, you must substitute a point to find c. Finish every problem: find m, then c, then write y = mx + c.


### Gradient Relationships: Parallel Lines

The gradient tells us how two lines are related.

**Parallel lines** never meet, so they have exactly the same steepness: their gradients are **equal**, m₁ = m₂. For example, y = 3x + 1 and y = 3x − 4 are parallel — both have gradient 3, differing only in their y-intercepts. To test whether two lines are parallel, put each in y = mx + c form and compare the gradients. For y = 2x + 5 and 2y = 4x − 3, divide the second by 2 to get y = 2x − 3/2; both have gradient 2, so they are parallel.

To find a line parallel to y = −3x + 2 through (1;4): the gradient stays −3, so y = −3x + c; substituting (1;4) gives 4 = −3 + c, so c = 7 and the equation is y = −3x + 7.

**Pitfall.** Read the gradient m only once y is the subject of the equation — don't compare the x-terms before making y the subject (e.g. 2y = 4x − 3 has gradient 2, not 4).


### Interpreting Real-Life Graphs

Real-life graphs use the same gradient and intercept ideas, but now they describe something physical. Always read the axis labels and units first, because the same shape means different things depending on what the axes measure.

**Distance–time graphs.** The gradient is the change in distance divided by the change in time, which is **speed**.

- A steeper line means a faster speed; a gentler slope means slower.
- A horizontal line (gradient 0) means distance is not changing — the object is **stationary**.
- A downward (negative) slope means distance is decreasing — the object is **returning** toward the start, reaching it when distance hits 0.

A typical journey graph might rise (moving away at steady speed), go flat (resting), then rise more steeply (moving again, faster). Reading the slopes in order tells the whole story.

**Rate graphs and cost graphs.** Consider a taxi fare of R8 per km plus a R20 call-out fee: cost = 8 × (km) + 20, which mirrors y = mx + c. The **y-intercept (20)** is the fixed starting cost before any travel; the **gradient (8)** is the rate — the cost per extra km. In general, the intercept is the base/fixed amount and the gradient is the rate of change per unit. A water-tank graph works the same way: the gradient is the filling rate in litres per minute, and a flat section means the tap is off or the tank is full.

**Continuous vs discrete data.** Continuous data (time, distance, temperature) can take any value, so we join points with a solid line — in-between values have meaning. Discrete data (number of learners, number of cars) takes only separate whole values, so we plot separate points and do not join them, because something like 2.5 cars is meaningless. The rule: join points only if every value between them makes real-world sense.


