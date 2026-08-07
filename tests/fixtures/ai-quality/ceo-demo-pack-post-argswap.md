# CEO demo pack — post arg-swap corrected AI

**RULER: A (web production demo behaviour)**  
`attachAIDemo` + `pickValidSeed` / `runHeadlessGame`  
BIH null placement → `respotCueBall` (same as live `?demo=ai-selfplay`)  
Seed formula: **`seed + shotCount`** (not `*7919` — that is SP-004 / ruler B)

**MEASURE_COMMIT:** `72c54f5e1d004acae61017687643134f0abb0f46`  
(all four former arg-swap call sites fixed: demo / headless / HVA / replay-controller re-derive)

**METRIC note:** expected shot counts and winners below are from a deterministic headless re-run of the **same loop as production demo** at the measure commit. They are **not** SP-004 (`*7919`) numbers and **not** Unity C#. See `README.md` (three rulers).

---

## Why asymmetric r0=4 / r1=2?

Symmetric same-rank self-play (ruler B / SP-004) still hits a large **cap-hit / deadlock** band — that is a real property of identical AIs, not “we hid the bad games.”  
For a **watchable full game** (someone wins before 200 shots, with back-and-forth), production demo has long used **asymmetric ranks**: higher skill P0 vs lower skill P1 breaks lockstep.  

We are **not** handing you only “AI looks unbeatable.” P1 (r1=2) wins several of the vetted seeds below. The asymmetry is about **completion**, not about dressing the stronger seat as invincible.

Default product demo ranks (`AI_DEMO_DEFAULTS`) are already `r0=4, r1=2`.

---

## How these seeds were chosen (honest)

| Bucket | Meaning |
|--------|---------|
| **Vetted “watchable”** | Complete game (`won`), **18–55 shots**, **≥4 seat turn-changes**, foul rate not absurd — **filtered** so a human can sit through a full match |
| **Unfiltered sample** | Fixed seed list with **no quality filter** — short blowouts, messier foul games, whatever the engine does |

**These are not a random sample of all seeds.**  
If you only open the vetted URLs, you are seeing a **curated subset**. Use the unfiltered list to see “what happens if I just pick a number.”

Scan: `r0=4 r1=2`, seeds `0..100` headless at measure commit → 97/101 completed (production ruler A is kinder than SP-004’s no-respot world).

---

## A. Vetted watchable games (3–5)

Base URL: wherever the app is served, e.g. local `http://localhost:5173/` or your deploy origin.  
**Path query only (append to origin):**

### 1. seed=30 — P2 wins, longer exchange, low foul

| field | value |
|-------|--------|
| URL | `?demo=ai-selfplay&seed=30&r0=4&r1=2` |
| Expected shots | **39** |
| Winner | **P1 seat index 1 → “Player 2”** (r1=2 side) |
| Turn seat-changes | 26 |
| Fouls (turn bih starts) | 3 (~0.08 / shot) |
| Why picked | Complete, mid-length, clear back-and-forth, **weaker seat wins** |

### 2. seed=52 — P0 wins, mid-length

| field | value |
|-------|--------|
| URL | `?demo=ai-selfplay&seed=52&r0=4&r1=2` |
| Expected shots | **36** |
| Winner | **Player 1** (r0=4) |
| Turn seat-changes | 27 |
| Fouls | 6 (~0.17 / shot) |
| Why picked | Balanced length; higher rank seat wins without a one-shot blowout |

### 3. seed=5 — P0 wins, cleaner

| field | value |
|-------|--------|
| URL | `?demo=ai-selfplay&seed=5&r0=4&r1=2` |
| Expected shots | **33** |
| Winner | **Player 1** (r0=4) |
| Turn seat-changes | 23 |
| Fouls | 4 (~0.12 / shot) |
| Why picked | Solid mid game; lower foul clutter for a first re-watch |

### 4. seed=64 — P2 wins again

| field | value |
|-------|--------|
| URL | `?demo=ai-selfplay&seed=64&r0=4&r1=2` |
| Expected shots | **32** |
| Winner | **Player 2** (r1=2) |
| Turn seat-changes | 20 |
| Fouls | 4 (~0.13 / shot) |
| Why picked | Second case of underdog seat winning — not a one-off fluke in the filter |

### 5. seed=9999 — also reachable via pickValidSeed spread

| field | value |
|-------|--------|
| URL | `?demo=ai-selfplay&seed=9999&r0=4&r1=2` |
| Expected shots | **30** |
| Winner | **Player 2** (r1=2) |
| Turn seat-changes | 19 |
| Fouls | 4 (~0.13 / shot) |
| Why picked | Mid length; sits in the same `pickValidSeed` candidate space (`startSeed` paths that land on 9999) |

**Example full local URL:**  
`http://localhost:5173/?demo=ai-selfplay&seed=30&r0=4&r1=2`

---

## B. Unfiltered sample (not curated for “nice”)

Same ranks. **No length / turn / foul filter.** Open these if you want “I typed a number.”

| seed | URL query | shots | winner | cap? | notes |
|-----:|-----------|------:|--------|:----:|-------|
| 7 | `?demo=ai-selfplay&seed=7&r0=4&r1=2` | 23 | P1 | no | Was a **false deadlock probe under swapped headless AI**; now completes |
| 8 | `?demo=ai-selfplay&seed=8&r0=4&r1=2` | 22 | P1 | no | Same story as seed 7 |
| 13 | `?demo=ai-selfplay&seed=13&r0=4&r1=2` | **3** | P1 | no | **Blowout** — short, not a “match” |
| 37 | `?demo=ai-selfplay&seed=37&r0=4&r1=2` | 18 | P2 | no | Short but complete |
| 88 | `?demo=ai-selfplay&seed=88&r0=4&r1=2` | 33 | P1 | no | Messier fouls (~0.36) |
| 777 | `?demo=ai-selfplay&seed=777&r0=4&r1=2` | 59 | P2 | no | Long, high foul (~0.47) — honest grind, not showcase |

Also useful: omit `seed` so the page calls **`pickValidSeed` at load** (still only guarantees *a* complete game, not a pretty one):

`?demo=ai-selfplay&r0=4&r1=2`

---

## C. What we are **not** claiming

- These vetted games are **not** the median SP-004 self-play quality (ruler **B**, `*7919`, no respot).  
- They are **not** proof the old pre-arg-swap demos were fair.  
- Symmetric `r0=r1=4` is available for curiosity (`&r0=4&r1=4`) but expect more **cap / stall** under ruler B; production demo still respots BIH.

---

## D. Known issues (honest, no parameter tuning)

While scanning for this pack we did **not** retune ranks, force, or AI. Observations under ruler A at this commit:

1. **Very short games exist** (e.g. seed 13 → 3 shots). “AI self-play” can still look abrupt.  
2. **High-foul complete games exist** (e.g. seed 777). Completion ≠ pretty pool.  
3. **Underdog (r1=2) can win** — filter did not force P0 sweeps.  
4. If something still **looks** dumb (scratch loops, aim nowhere), that is real signal for a later AI pass — report it; do not “fix” the demo pack.

---

## E. Repro

```bash
git checkout 72c54f5e1d004acae61017687643134f0abb0f46
npm run dev
# open e.g. http://localhost:5173/?demo=ai-selfplay&seed=30&r0=4&r1=2
```

Headless re-check of expected shots/winner (same seed formula as demo):

```bash
# optional: run a one-off using runHeadlessGame / attachAIDemo loop at that SHA
```

Document generated for CEO re-evaluation after arg-swap honesty report.  
Fleet freeze unchanged: HVA product path / HS-002 assertion not modified for this pack.
