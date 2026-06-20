# Measurement — Complete Study Guide

## Contents

### Volume & Total Surface Area of 3D Objects + SI Unit Conversions

A 3D object has two key measurements. **Total Surface Area (TSA)** is the sum of the areas of every exposed face — it is a 2D area, so it is measured in square units (mm², cm², m²). **Volume** is the amount of 3D space the object occupies, measured in cubic units (mm³, cm³, m³).

The unifying idea for Volume of any prism or cylinder is:

> **Volume = (area of base) × (perpendicular height/length).**

#### Formulas per solid

**Cube** (side s)
- TSA = 6s²  (six identical square faces, each s²)
- V = s³  (base s² × height s)

**Rectangular prism** (length ℓ, breadth b, height h)
- TSA = 2ℓb + 2bh + 2ℓh  (three pairs of rectangular faces)
- V = ℓ × b × h

**Triangular prism** (triangle base a, triangle height h, prism length H, triangle sides a, b, c)
- TSA = 2(½ a h) + (a × H) + (b × H) + (c × H)  — two triangular ends plus three rectangular sides
- V = (½ × base × height of triangle) × length of prism = ½ b h H

**Cylinder** (radius r, height h)
- TSA = 2πr² + 2πrh  (two circles + the unrolled curved side, a rectangle 2πr by h)
- V = πr²h

**Pitfall:** for the triangular prism the base area is ½ b h, not b h — students often forget the ½. For the cylinder, remember to square only r in πr², and to add BOTH circular ends (2πr²).

#### Worked example (cylinder)
Radius 7 cm, height 10 cm, π ≈ 22/7.
- V = πr²h = (22/7)(49)(10) = 1540 cm³.
- TSA = 2πr² + 2πrh = 2π(49) + 2π(70) = 98π + 140π = 238π cm² ≈ 748 cm².

#### SI unit conversions
**Rule of thumb:** going from a BIG unit to a SMALL unit you **multiply (×)**; from a SMALL unit to a BIG unit you **divide (÷)**.

Length ladder: 1 km = 1000 m, 1 m = 100 cm, 1 cm = 10 mm.
- km →(×1000)→ m →(×100)→ cm →(×10)→ mm; reverse and divide to go up.

Area (squared) units: **square the length factor**.
- 1 cm² = 10² = 100 mm²; 1 m² = 100² = 10 000 cm²; 1 km² = 1000² = 1 000 000 m².

Volume (cubed) units: **cube the length factor**.
- 1 cm³ = 10³ = 1000 mm³; 1 m³ = 100³ = 1 000 000 cm³; 1 km³ = 1000³ = 1 000 000 000 m³.

**Worked example:** 2.5 m³ → cm³. Big to small, cubed unit, so × 100³ = ×1 000 000: 2.5 × 1 000 000 = 2 500 000 cm³.

**Pitfall:** the most common error is using the length factor (×100) for squared or cubed units. Always square the factor for areas and cube it for volumes.


### Perimeter of 2D Shapes

Perimeter is the total distance around the outside of a closed 2D shape — literally the length you would walk if you traced its boundary once. Because it is a length, perimeter is always measured in plain length units (mm, cm, m, km), never in squared units. This is the single most important distinction to keep separate from area.

The universal method works for every polygon: **add up all the side lengths**. For an irregular five-sided field with sides 4, 6, 3, 5 and 7 cm, the perimeter is simply 4 + 6 + 3 + 5 + 7 = 25 cm. The only discipline required is to trace carefully around the outline so that you count each side exactly once, and to make sure every measurement is in the same unit before you add.

For the standard shapes we use shortcut formulas that come straight from this rule:

- **Square** (side s): all four sides equal, so P = 4s. With s = 9 cm, P = 36 cm.
- **Rectangle** (length ℓ, breadth b): two long sides and two short sides, so P = 2ℓ + 2b = 2(ℓ + b). With ℓ = 12 m and b = 5 m, P = 2(17) = 34 m. A frequent error is writing P = ℓ + b instead of doubling.
- **Triangle**: P = a + b + c. An equilateral triangle simplifies to P = 3s; an isosceles to P = 2s + b.
- **Parallelogram**: opposite sides equal, P = 2(a + b).
- **Rhombus**: all sides equal, P = 4s.
- **Trapezium**: four unequal sides, just add all four.

Two pitfalls recur. First, for the parallelogram, rhombus and trapezium, perimeter uses the **side** lengths only — never the perpendicular height or the diagonals, which belong to area. Second, missing-side questions are solved by treating the formula as an equation: given a rectangle with P = 50 cm and ℓ = 15 cm, substitute into 50 = 2(15 + b), divide by 2 to get 25 = 15 + b, and solve b = 10 cm.


### Circumference of a Circle

The circumference is just the perimeter of a circle — the distance around its curved edge. Because a circle has no straight sides to add, we use a special constant, π (pi). Pi is the fixed ratio of any circle's circumference to its diameter; it is approximately 3,14159…, and in CAPS we use either π ≈ 3,14 or π ≈ 22/7.

There are two equivalent formulas:

- **C = 2πr**, using the radius r (centre to edge), and
- **C = πd**, using the diameter d (right across, through the centre).

They are the same because the diameter is twice the radius: d = 2r. Choosing the right one is just a matter of which measurement you are given.

**From radius:** a circle with r = 7 cm and π ≈ 22/7 gives C = 2 × 22/7 × 7 = 44 cm. Choosing 22/7 is smart whenever the radius is a multiple of 7, because the 7s cancel. **From diameter:** a circle with d = 10 m and π ≈ 3,14 gives C = 3,14 × 10 = 31,4 m.

Working **backwards** is a common exam task. If C = 31,4 cm, then from C = 2πr we get 31,4 = 6,28 × r, so r = 31,4 ÷ 6,28 = 5 cm. Equivalently, find the diameter first with d = C ÷ π, then halve it.

A **semicircle's** perimeter needs care: it is half the circumference plus the straight diameter that closes the shape, P = πr + 2r. With r = 7 and π ≈ 22/7, P = 22 + 14 = 36 cm. Forgetting the straight edge is the classic mistake — half a curve on its own is not a closed figure.


### Area of 2D Shapes

Area measures how much flat surface a shape covers — the space enclosed inside its boundary. It is always expressed in **square** units (mm², cm², m², km², hectares), because area is a length multiplied by a length. Keeping this separate from perimeter (plain length units) prevents the most common error in the topic.

The CAPS area formulas to know:

- **Square**: A = s². With s = 6 cm, A = 36 cm².
- **Rectangle**: A = ℓ × b. With ℓ = 8 m, b = 5 m, A = 40 m².
- **Triangle**: A = ½ × b × h, where h is the **perpendicular** height to the chosen base — not a slanted side. With b = 10, h = 6, A = 30 cm².
- **Parallelogram**: A = b × h, again using the perpendicular height. A parallelogram shears into a rectangle of the same base and height, which is why the slant side is irrelevant.
- **Rhombus**: either A = ½ × d₁ × d₂ (the diagonals, which meet at right angles) or A = b × h. With diagonals 8 and 6 cm, A = 24 cm².
- **Trapezium**: A = ½ × (a + b) × h, where a and b are the two **parallel** sides and h the perpendicular distance between them. With a = 10, b = 6, h = 4, A = 32 cm².
- **Circle**: A = πr². With r = 5 and π ≈ 3,14, A = 78,5 cm².

Three recurring pitfalls: square the unit as well as the number (6 cm × 6 cm = 36 cm²); always use the perpendicular height, not a slant; and for circles use the **radius**, halving the diameter first if necessary (d = 14 → r = 7, A = 22/7 × 49 = 154 cm²). Missing-dimension questions are solved by substituting and dividing: A = 48 cm², ℓ = 8 → b = 48 ÷ 8 = 6 cm.


### Composite (Compound) Shapes

A composite shape is built by joining or cutting basic shapes — rectangles, triangles, circles and semicircles. The whole strategy is captured in two words: **add or subtract**. Break the figure into shapes you recognise, find each basic area, then add the pieces that are joined or subtract any piece that has been cut out.

For an **L-shape** (a 10 × 8 cm rectangle with a 4 × 3 cm corner removed), subtract: 80 − 12 = 68 cm². The same shape can be split into two rectangles and added — both routes give 68 cm², which is a useful self-check.

**Shaded-region** problems are simply outer shape minus inner shape. A 12 × 6 cm plate with a circle of radius 2 cm removed gives 72 − 12,56 = 59,44 cm². A "house" shape (rectangle plus a triangle on top) is an add problem: 40 + 12 = 52 m². When two equal **semicircles** sit on the ends of a rectangle, they combine into one full circle, so a 20 × 10 m rectangle with radius-5 m ends has area 200 + 78,5 = 278,5 m².

**Perimeter** of a composite shape follows a different rule from area: trace only the **outer boundary**. Internal edges where two shapes meet are inside the figure and must not be counted. For curved sections use the matching fraction of the circumference (a semicircle edge contributes πr), never an area formula.

Finally, many diagrams leave some sides unlabelled. On a rectilinear shape the horizontal top edges must sum to the bottom edge, and the left edges to the right edge. If the bottom is 10 cm and the top reads 6 cm plus an unknown x, then 6 + x = 10 gives x = 4 cm. Fill in every missing length this way before computing perimeter or area.


### Units of Length and Area

Every measurement answer must be given in a sensible unit, and all measurements in a calculation must be in the **same** unit before you work with them. This section covers converting between units of length and units of area, and choosing an appropriate unit.

#### Length conversions

The basic length ladder is:

- 10 mm = 1 cm
- 100 cm = 1 m
- 1000 m = 1 km
- (so 1 m = 1000 mm)

**Rule:** going to a *smaller* unit → **multiply**; going to a *larger* unit → **divide**.

- 3,5 m = 3,5 × 100 = 350 cm (m → cm, smaller unit, multiply)
- 4200 m = 4200 ÷ 1000 = 4,2 km (m → km, larger unit, divide)

#### Area conversions — square the factor

Area is length × length, so when you convert an area unit you must **square** the linear conversion factor. This is the part learners most often get wrong.

Because 1 m = 100 cm, it follows that 1 m² = (100 cm)² = 100 × 100 = **10 000 cm²** — not 100 cm². Each of the two directions is converted, so the factor appears twice.

Key squared-unit conversions:

- 1 cm² = 100 mm²    (since 10² = 100)
- 1 m² = 10 000 cm²    (100²)
- 1 m² = 1 000 000 mm²
- 1 km² = 1 000 000 m²    (1000²)
- 1 hectare (ha) = 10 000 m²

The multiply/divide rule still applies: smaller area unit → larger one means **divide** by the squared factor.

**Worked example 1 — area conversion.** Convert 25 000 cm² to m².
cm² → m² is going to a larger unit, so divide. The factor is 10 000 (the square of 100):
25 000 ÷ 10 000 = **2,5 m²**.

#### Convert before you substitute

You must make units match *before* putting numbers into a formula.

**Worked example 2.** Find the area of a rectangle 2 m by 50 cm.
Do **not** compute 2 × 50. Convert first: 50 cm = 0,5 m.
A = 2 × 0,5 = **1 m²**.
(Check by converting the other way: 200 cm × 50 cm = 10 000 cm² = 1 m². Same answer.)

#### Choosing an appropriate unit

Pick a unit that gives a sensible number — not awkwardly huge or tiny.

- Length: coin thickness → mm; a person's height → cm or m; distance between towns → km.
- Area: a stamp → mm² or cm²; a room floor → m²; a farm → hectares or km².

#### Common pitfalls

- Using the *linear* factor (100) for area instead of the *squared* factor (10 000). Always square it for area units.
- Forgetting to convert so that all measurements share one unit before substituting.
- Mixing up multiply and divide — to a smaller unit multiply, to a larger unit divide.


### Effect of Changing Dimensions

When you scale the dimensions of a 2D shape, the perimeter and the area do **not** change in the same way. Understanding this is a core Grade 9 idea.

#### The two key rules

If **every** dimension of a 2D shape is multiplied by a factor **k**, then:

- **Perimeter is multiplied by k** (the linear factor).
- **Area is multiplied by k²** (the factor squared).

The reason: a length (perimeter) is a single "direction", so it scales by k. Area = length × length, so each length factor appears twice, giving k × k = k².

Examples of the rule:

- Sides × 3 → perimeter × 3, area × 9
- Sides × ½ → perimeter × ½, area × ¼

#### Worked example 1 — square, doubling the side

Take a square of side s. Original P = 4s and A = s².
New side = 2s, so k = 2.
- New perimeter = 4(2s) = 8s → perimeter **doubles** (× 2).
- New area = (2s)² = 4s² → area becomes **4× as big** (× 4 = 2²).

#### Worked example 2 — rectangle, tripling both sides

A rectangle is 6 cm × 4 cm; both dimensions are tripled (k = 3).
- Old area = 6 × 4 = 24 cm².
- New dimensions = 18 cm × 12 cm, so new area = 18 × 12 = 216 cm².
- Ratio = 216 ÷ 24 = 9 = 3². This confirms area × k².

#### Circles follow the same pattern

The radius of a circle is doubled (k = 2):
- Circumference C = 2πr is linear in r → C **doubles** (× 2).
- Area A = πr² depends on r² → (2r)² = 4r² → area × 4.

The "around" measure scales by k; the "inside" measure scales by k².

#### Changing only ONE dimension

The × k² rule applies **only when all dimensions change by the same factor k**.

A = ℓ × b. If only the length doubles to 2ℓ (breadth unchanged):
new A = 2ℓ × b = 2(ℓb) → area only **doubles**, not × 4.

If length × 3 and breadth × 2, the area changes by 3 × 2 = × 6.

#### Ratios of areas

For similar shapes, **area ratio = (length ratio)²** — square each part of the side ratio.

- Sides in ratio 2 : 5 → areas in ratio 2² : 5² = **4 : 25**.
- Reverse: if areas are 9 : 49, the side ratio is √9 : √49 = **3 : 7**.

#### Common pitfalls

- Saying area doubles when the sides double — it becomes 4× as big.
- Applying × k² when only one dimension changed (then it is just × k for that dimension, or × the product of the separate factors).
- Forgetting to square (or square-root) when working with ratios of areas.


### Real-Life Measurement Problems

These problems put measurement into a context — fencing, tiling, painting, paths, costs. The single most important decision is whether the situation needs **perimeter** or **area**.

#### Perimeter or area?

Ask: am I going **around the edge**, or **covering the surface**?

- **Perimeter** (length, e.g. metres): fencing, edging, trim, skirting, a border or frame, ribbon/rope around something.
- **Area** (squared units, e.g. m²): tiling, carpeting, painting, planting grass, glass for a window, anything priced "per m²".

Choosing the wrong one is the most common exam error, so read the context carefully.

#### Fencing — uses perimeter

**Worked example.** A rectangular garden is 15 m by 9 m. Fencing costs R45 per metre. Find the total cost.
Fencing follows the perimeter:
P = 2(ℓ + b) = 2(15 + 9) = 2 × 24 = 48 m.
Cost = 48 × R45 = **R2 160**.

#### Tiling, carpeting, painting — uses area

**Tiling cost.** A floor is 4 m by 3 m; tiles cost R120 per m².
A = ℓ × b = 4 × 3 = 12 m².
Cost = 12 × R120 = **R1 440**.

**Number of tiles.** How many 25 cm × 25 cm tiles cover a 4 m × 3 m floor?
Method: total area ÷ area of one tile, in the **same unit**.
Floor = 12 m² = 120 000 cm² (since 1 m² = 10 000 cm²).
One tile = 25 × 25 = 625 cm².
Number = 120 000 ÷ 625 = **192 tiles**.
In real life, round **up** to a whole tile.

**Painting.** A wall is 5 m by 3 m. One litre of paint covers 8 m². How many litres for one coat?
Area = 5 × 3 = 15 m².
Paint = area ÷ coverage = 15 ÷ 8 = 1,875 litres → round **up** to **2 litres** so you don't run short.

#### Cost per square metre

Price per m² = total cost ÷ area.

**Worked example.** A plot of 250 m² sells for R375 000.
Price per m² = R375 000 ÷ 250 = **R1 500 per m²**.
Reverse: knowing the rate, multiply by area for the total (250 × R1 500 = R375 000).

#### Border or path problems

A border adds its width on **both** sides, so add 2 × (width) to each dimension.

**Worked example.** A 10 m × 8 m lawn has a 1 m wide paved path around the outside. Find the path's area.
Outer rectangle = (10 + 2) × (8 + 2) = 12 × 10 = 120 m².
Inner lawn = 10 × 8 = 80 m².
Path area = outer − inner = 120 − 80 = **40 m²**.

#### Common pitfalls

- Mixing up perimeter and area — go around vs cover the surface.
- Not converting to the same unit before dividing (e.g. tiles).
- Rounding the wrong way: for tiles/paint you must round **up**, or you run short.
- For a border, forgetting it adds the width to **both** ends — add 2 × width per dimension.


