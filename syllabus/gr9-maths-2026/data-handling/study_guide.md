# Data Handling — Complete Study Guide

## Contents

### The Data-Handling Cycle

Data handling is not a single skill but a *cycle* of stages, each feeding the next. Working through it in order keeps an investigation honest and useful.

1. **Pose a question.** Everything starts with a clear, specific question — for example, "How many hours of sleep do Grade 9 learners at our school get on a school night?" A sharp question decides what data you need, who you collect it from, and how you will analyse it. Vague questions produce messy, unusable data.

2. **Collect data.** Gather the values that answer the question, through surveys, questionnaires, experiments, observation or existing records. Decide whether you are collecting from the whole *population* or from a *sample*, and take care to avoid bias.

3. **Organise data.** Raw data is disordered. Bring order with tally tables, frequency tables, stem-and-leaf plots, or grouped class intervals so patterns can begin to show.

4. **Represent data.** Turn the organised data into a visual — bar graph, histogram, pie chart, line graph or scatter plot — so trends and comparisons are easy to see.

5. **Summarise data.** Reduce the data to a few describing numbers: measures of central tendency (mean, median, mode) and measures of spread (range, extremes, outliers).

6. **Interpret / analyse.** Make sense of the summaries and graphs. What is typical? How spread out is it? Are there trends or outliers? Does this answer the original question?

7. **Report.** Communicate the findings clearly — a written conclusion, recommendation or presentation that ties back to the question you posed at the start.

A failure at any stage corrupts the rest: a biased sample (collect) or an overlapping class interval (organise) will lead to wrong conclusions no matter how neat the later maths is. Always trace a surprising result back through the cycle to find where it came from.


### Types of Data

Before collecting or analysing, you must know *what kind* of data you are dealing with — it determines which tables, graphs and averages are appropriate.

**Population vs sample.** The *population* is the entire group you want information about (all Grade 9 learners in South Africa). A *sample* is a smaller part of it that you actually collect from. Samples save time and money, but a good sample must be *random* and *representative* so that conclusions about the sample apply to the whole population. A *biased* sample (only your friends, only people at a gym) over- or under-represents part of the population and gives misleading results.

**Categorical vs numerical.** *Categorical* (qualitative) data describes a quality or category — eye colour, favourite sport, yes/no — and cannot be sensibly added or averaged. *Numerical* (quantitative) data consists of actual numbers you can do arithmetic with — height, marks, number of siblings. Beware of number-like labels (jersey numbers, ID numbers, bus routes): they are categorical because arithmetic on them is meaningless.

**Discrete vs continuous.** Within numerical data, *discrete* data is counted and takes only specific (usually whole) values with gaps between them — number of cars, learners in a class. *Continuous* data is measured and can take any value in a range, including decimals — height, mass, time, temperature. A quick test: "How many?" signals discrete; "How much / how long / how heavy?" signals continuous.

**Primary vs secondary sources.** *Primary* data is collected first-hand by you for your own question (a survey you run, measurements you take). *Secondary* data was collected by someone else and reused (Stats SA reports, newspapers, textbooks, online databases). Primary data is tailored but slower to get; secondary data is quick but may be outdated or not exactly what you need.

Classifying data correctly is the foundation: continuous grouped data calls for a histogram, categorical data for a bar graph or pie chart, and the mode is the only average that works for categories.


### Organising Data

Raw data straight from collection is just a jumble of values. Organising it reveals structure and prepares it for graphing and summarising.

**Tally tables.** As you read through raw data, record each value with a stroke. Group strokes in fives — four uprights with the fifth drawn diagonally across them — so they are easy to count. Tallying ensures you neither miss nor double-count a value.

**Frequency tables.** *Frequency* is how many times a value or category occurs. A frequency table lists each value alongside its frequency (often converted from the tally column). The frequencies must add up to *n*, the total number of data values — always check this total.

**Stem-and-leaf plots.** Each number is split into a *stem* (the leading digit(s), e.g. tens) and a *leaf* (the final digit). For 23, 25, 31, 34, 34, 42, 47:

```
Stem | Leaf
 2   | 3 5
 3   | 1 4 4
 4   | 2 7
```
with a key such as "2 | 3 means 23". Always order the leaves. The plot's great strength is that it shows the *shape* of the data like a histogram while still keeping every original value, so you can read off the median and range exactly.

**Grouped frequency tables (class intervals).** When data spreads over a wide range or is continuous, listing every value is impractical. Instead group values into *class intervals* and record the frequency of each interval. Rules for good intervals:
- equal width (all width 10, say);
- non-overlapping, so every value falls in exactly one class;
- a sensible number (about 5–10);
- covering the full range.

For discrete data use intervals like 0–9, 10–19, 20–29. For continuous data use boundaries like 0 ≤ x < 10, 10 ≤ x < 20 to leave no gap and no overlap. A common error is writing 0–10, 10–20 — the boundary value 10 then belongs to two classes. Grouping makes data manageable and ready for a histogram, but the trade-off is that the individual values are lost.


### Representing Data

A graph turns organised data into a picture so trends and comparisons jump out. Choosing the right type is half the skill.

**Bar graph.** For categorical (or discrete) data. Each category gets an equal-width bar whose height is its frequency, and the bars are *separated by gaps*. Good for comparing categories such as favourite sports.

**Double bar graph.** Shows two data sets side-by-side for each category, in two colours with a legend — ideal for comparing two groups (boys vs girls, 2025 vs 2026) across the same categories.

**Histogram.** For numerical data grouped into class intervals (typically continuous). Crucially, the bars *touch* with no gaps, because the intervals form a continuous number line. This is the key difference from a bar graph: histogram bars touch (continuous data), bar-graph bars are separated (distinct categories).

**Pie chart.** Shows parts of a whole as slices of a circle. The whole circle (360°) is 100% of the data, and each slice's angle is:

> angle = (frequency ÷ total) × 360° = (category fraction) × 360°

Worked example — 20 learners, 10 soccer, 6 netball, 4 hockey:
- soccer: (10/20) × 360° = 180°
- netball: (6/20) × 360° = 108°
- hockey: (4/20) × 360° = 72°

Check: 180 + 108 + 72 = 360°. Draw each angle from the centre with a protractor.

**Line / broken-line graph.** Points joined by straight segments, used to show how a quantity changes over time (temperature through a day, sales per month). The slope shows the rate of change.

**Scatter plot.** Plots pairs (x, y) as unjoined dots to reveal a *relationship* between two numerical variables. An upward trend is positive correlation, downward is negative, and a shapeless cloud means no correlation.

**Pictogram.** Uses repeated icons, each standing for a fixed amount (key: one apple = 5 apples), with partial icons for parts. Eye-catching but imprecise.

**Choosing the right graph:** trend over time → line graph; parts of a whole → pie chart; comparing categories → bar graph (double bar for two groups); relationship between two variables → scatter plot; grouped continuous data → histogram. Whatever the choice, every good graph needs a title, labelled axes with units, an even scale, and a key where needed.


### Measures of Central Tendency

A measure of central tendency is a single value that represents the "typical" or "centre" of a data set. There are three, and choosing the right one matters.

**Mean.** The arithmetic average:

> mean = Σx ÷ n = (sum of all values) ÷ (number of values)

For 4, 7, 9, 4, 6: Σx = 30, n = 5, mean = 6. Because the mean uses every value, it is strongly affected by outliers. From a frequency table, mean = Σ(value × frequency) ÷ Σ(frequency); divide by the *total* frequency, not by the number of different values. A useful rearrangement is Σx = mean × n — if the mean of 5 numbers is 12, their sum is 60, which lets you find a missing value.

**Median.** The middle value of the *ordered* data. For an odd count, it is the single middle value (position (n+1)/2). For an even count, average the two middle values: 3, 5, 8, 9 gives (5+8)/2 = 6.5. From a frequency table, find the middle position and add frequencies cumulatively until you reach it. The biggest mistake is forgetting to order the data first. The median is *resistant* to outliers.

**Mode.** The value that occurs most often. Data can have one mode, two (bimodal), or none (all values appear once). The mode is the only average that works for categorical data — the most popular colour or sport.

**Outliers and which average to use.** Consider 2, 3, 4, 5, 100. The mean is 22.8 (misleading), while the median is 4 (genuinely typical). The mean is most affected by outliers; the median and mode are barely affected. So:
- use the **mean** for numerical data with no big outliers (uses all the data);
- use the **median** when outliers or skew are present (house prices, salaries);
- use the **mode** for categorical data or when you want the most common value.

Always pick the average that best represents what is typical for that particular data set.


### Measures of Dispersion

Two data sets can share the same mean yet look completely different — one tightly clustered, one widely scattered. *Dispersion* (spread) describes how spread out the data is.

**Range.** The simplest measure:

> range = maximum − minimum

For 4, 7, 9, 15, 2: range = 15 − 2 = 13. A large range means widely spread data; a small range means values close together. Its weakness is that it uses *only* the two extreme values and ignores everything in between.

**Extremes.** The extremes are the smallest value (minimum) and largest value (maximum) of the ordered data. They define the range.

**Outliers and their effect.** An outlier is a value much smaller or larger than the rest, standing far apart from the cluster — the 90 in 21, 23, 22, 25, 90, or the 60 in 12, 14, 13, 15, 60. Spot one by ordering the data and looking for a big gap. Outliers have a dramatic effect:
- they greatly **increase the range** (with 60 the range is 48; without it, just 3);
- they pull the **mean** towards themselves;
- the **median** and **mode** stay almost unchanged.

So when outliers are present, report the median rather than the mean, and note the outlier separately. An outlier may be a recording error or a genuine unusual case — investigate before discarding it.

Because the range is so easily distorted by a single outlier, always read it together with a measure of central tendency (usually the median) so the spread is described fairly.


### Interpreting Data

Once data has been collected, organised and summarised, the final step is to **interpret and analyse** it — to draw meaning and conclusions from the numbers, tables and graphs. Collecting data is pointless if you cannot read the story it tells, so this section is about turning pictures and statistics into sensible, *honest* conclusions, and about spotting when someone is trying to mislead you.

**What it means to interpret and analyse data**

To analyse data is to look at the organised information and answer questions like:

- What is the **typical** or central value? (the mean, median or mode)
- How **spread out** is the data? (the range — the difference between the largest and smallest values)
- Are there **trends or patterns**? (Are values rising, falling, repeating?)
- Are there **outliers** — values that lie far from the rest?
- Does the data actually **answer the original question** that was asked?

A good interpretation reports these findings in plain words, for example: "Most learners scored between 50 and 70, the mean was 61, and one unusually low score of 12 pulled the average down."

**Reading graphs and tables**

Different graphs answer different questions, so read them carefully:

- **Bar graphs / pictograms** — compare separate categories (e.g. favourite sports).
- **Line graphs** — show how something changes over time (a trend).
- **Pie charts** — show how a whole is divided into parts (proportions).
- **Tables** — give exact values; read the correct row and column.

Always start by reading the **title, the axis labels, the units and the scale** before you read any values. The numbers mean nothing until you know what they count.

**Bias**

**Bias** is anything that makes results unfairly favour one outcome, so they do not truly represent the whole population. Bias produces *wrong conclusions even when every calculation is correct*. Two common sources:

- **Sampling bias** — the sample is not representative (e.g. surveying only your friends, or only people outside a gym about exercise habits). A fair sample should be **random** and **large enough**.
- **Question bias** — leading or loaded questions push people towards an answer, e.g. "Don't you agree our delicious food is the best?" A fair question is neutral: "How would you rate the food?"

Other sources include very small samples, many non-responses, and misleading graphs.

**Misleading graphs**

A graph can be technically "correct" yet designed to deceive. Watch for:

- **Broken (truncated) vertical axis** — the y-axis does not start at 0. Small differences then look huge. A bar of 102 next to one of 100 can look twice as tall if the axis starts at 99.
- **Uneven or inconsistent scale** — gaps that jump by 2, then by 10, distorting the shape.
- **Missing labels or no scale** — you cannot judge the real size of anything.
- **Different-sized pictogram icons** — see the worked example below.
- **3-D effects** — exaggerate or hide differences.
- **Cherry-picked time range** — choosing only the months that show the trend you want.

> **Worked example 1 — Critiquing a truncated axis**
> A shop's graph shows sales "soaring", but the y-axis runs only from 480 to 500. A rise from 485 to 495 fills most of the graph and looks dramatic.
> *Critique:* The y-axis is truncated (it does not start at 0) and covers a tiny range (480–500), so a change of only 10 units looks enormous. In reality 485 → 495 is about a 2% increase. Redraw with the y-axis starting at 0 to show the true, modest change. The original is built to mislead.

> **Worked example 2 — Misleading pictogram**
> A pictogram doubles a value by drawing one icon **twice as tall and twice as wide**.
> Because both dimensions double, the icon's **area** becomes 2 × 2 = 4 times bigger. The eye reads a 4× difference instead of the true 2×.
> *Fair method:* use **identical** icons with a clear key (each icon = a fixed amount), and show "more" by drawing **more icons**, never bigger ones.

**Critical-reading checklist**

When reading any data or graph, ask:

- Who collected it and how? (sample size, randomness, possible bias)
- Does the y-axis start at 0? Is the scale even?
- Are the axes and units labelled?
- Is the right type of graph used for this data?
- Are outliers hidden or exaggerated?
- Does the stated conclusion actually follow from the data?

**Pitfalls**

- A correct calculation on a **biased** sample still gives a wrong conclusion — check the data source first.
- Do not trust a graph's "story" before reading its axes; a truncated axis is the most common trick.
- The complement of "double the icon" is not double the area — scaling both width and height multiplies area, not length.
- Correlation seen in a graph does not prove one thing **causes** another; only report what the data actually supports.


