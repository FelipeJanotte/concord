# Edge-case enumeration

Use categories relevant to the selected behavior gap and its plausible failures. Do not build
a category-by-requirement matrix or invent cases for unchanged tool behavior. Record a material
applicable risk left unverified; omit categories that have no bearing on the change.

| Category | Ask |
|---|---|
| Empty | no items, empty string, null, missing key, zero rows |
| One | exactly one element, the smallest legal input |
| Boundary | the maximum, the maximum plus one, zero, negative, the exact threshold, the day it expires |
| Order | reversed, unsorted, duplicates, stable sort expected |
| Type | wrong type at the seam, a number as a string, a date as text, unicode in a name |
| Composition | two requirements at once, the same input through two paths, repeated application |
| Idempotence | run twice, same result; run on already-applied state |
| Failure | the dependency errors, times out, returns partial data; what the caller sees, what is rolled back |
| Concurrency | two callers, same resource; the second one's view |
| Time | now, clock skew, timezone, the last second of the period |
| Unchanged | the `SHALL CONTINUE TO` lines: the old behaviour on the old input, byte for byte where it matters |
| Size | large enough to cross a page, a batch, a buffer |

## Randomness

- Random bytes only reach the rejection path. Generate valid structures with random content, aimed at the success path.
- One assertion per drawn value is the default. State one invariant and check it on every input the generator produces.
- The default draw is a comfortable middle size. Draw the count as well, from a range whose bottom is the degenerate case.
- Asserting the expected item is present passes a reader that stops at the first hit. Assert the whole output, in order.
- A generator left to wander produces far-misses forever, which prove only that obviously wrong input is refused. Draw one input that differs from the accepted value by a single unit: one case flip, one space, one trailing character.
- An unrecorded draw is a failure nobody can replay. Record the seed in the held-out table's `angle` cell, offer an environment override to replay another draw, and write the smallest failing input beside it when one is found.
- Green at one seed is one example. Run a few more seeds before reading it as green.
