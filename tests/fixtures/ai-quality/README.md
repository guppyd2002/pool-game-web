# AI quality measurement — three rulers

**First line of any AI number you report: which ruler?**

The same question (“how good is the AI?”) has **three incompatible worlds**. Mixing them produced the 100% vs 70% self-play fight and the 0.94 foul-median disaster. Numbers from different rulers **must not be compared or cited as each other**.

Registered context: **DIV-008** (was: web BIH null → respot vs Unity in-place; **(b) on feature `7b7620c+` removes product respot**); **DIV-004** (symmetric self-play cap-hit band — diagnosis valid, June geometry numbers may be stale after pocket shift `3fa92431`).

**Branch skew (read before citing A):**

| Tree | Product AI null placement |
|------|---------------------------|
| **`master` `11638b7` (prod)** | Still **respot** head-spot on null `cueBallNewPos` |
| **Feature `prep/…` @ `7b7620c+`** | **No respot** — place only if non-null; else in-place forceShot (Unity-aligned) |

---

## The three rulers

| Ruler | What it measures | BIH when AI returns no placement | Typical harness / path |
|-------|------------------|----------------------------------|-------------------------|
| **A. Production (web product)** | What CEO / player experiences | **Feature (b):** in-place (no respot). **Master/prod:** still respot → head-spot | `attachHumanVsAI`, `attachAIDemo`, `headless-game` / `pickValidSeed`, live `?demo=ai-selfplay` |
| **B. SP-004 faithful harness** | Deterministic REC-1 / DIV-004 evidence path | **No respot** (always): place only if `cueBallNewPos !== null`; else leave cue, still forceShot | `ai-self-play.test.ts` (`runSelfPlay`), kakashi self-play rows, `run-seed-batch --harness sp004` |
| **C. Unity C# original** | Ground-truth engine behaviour | **No respot**: `ResetCueBallPosition` only if position changed; else **shoot from current transform** | `BallPoolAIManager.cs` `:266-269` / `:319-322` |

```
                    null placement after CalculateBestShot
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   (A) product            (B) SP-004           (C) Unity C#
   master: respot         no place/no respot   keep transform
   feature(b): in-place   forceShot in place   then Shot()
         │                    │                    │
    check which tree      DIV-004 / REC-1       fidelity GT
```

After (b) **on the feature branch**, A’s **null-placement policy matches C**. A and B can still disagree because **seed formula / seat stream / harness loop** differ — never merge tables.

**Do not:**
- Use **B** completion % as “product quality for CEO”
- Use master respot numbers as “post-(b) product”
- Compare `--harness sp004` vs `--harness headless` as one ruler
- “Fix” Mode A record playback `cueBallPlaced else respot` — that is **replay of recorded positions**, not live AI null (DIV-008 scope excludes it)

---

## Harness → ruler map

| Code / artifact | Ruler | Notes |
|-----------------|-------|--------|
| `ai-self-play.test.ts` (SP-004 / SP-001…005) | **B** | Canonical DIV-004 evidence path. Args correct since birth (`ee41c83`). Production table factory. |
| `kakashi-foul-metric-sweep.test.ts` self-play arms | **B** | Intentionally SP-004 placement parity (no respot). |
| `kakashi-foul-metric-baseline-6a5f87d.*` | **B** (self-play) + **A-shaped HVA** | Measured **pre-(b)** @ `6a5f87d` — HVA rows still had product respot. Do not re-use as post-(b) truth without remeasure. |
| `hva-foul-seed-sweep.test.ts` self-play | historical **A-like** | Had **`else respotCueBall()`** → rank3 looked 100% complete; **not** SP-004. |
| `attachHumanVsAI` / Play vs Robot | **A** | Product; placement policy = tree (master respot / feature (b) in-place). |
| `ai-demo.ts` / `headless-game.ts` | **A** | Same tree split as HVA for null placement. Headless seed = `seed+shotCount` (≠ `*7919`). |
| `scripts/run-seed-batch.mjs` | **B** or headless-A formula | Explicit `--harness`; output has `measureCommit`. |
| `BallPoolAIManager.cs` | **C** | Unity. |

---

## Seed derivation (also not interchangeable)

| Formula | Used by | Do not mix with |
|---------|---------|-----------------|
| `seed + shotIndex * 7919` (global) | SP-004 both seats; HVA human stand-in | `seed + shotCount` (headless consecutive) |
| `seed + AI-localIndex * 7919` | HVA AI seat only (intentional asymmetry) | Global self-play stream |
| `seed + shotCount` (no stride) | `headless-game` / some demo paths | `*7919` tables |

---

## Foul metric (Kakashi-ruled — independent of ruler A/B/C)

These rules apply **inside** whichever ruler you chose:

1. **Denominator = shots** (`applyShot` / legal forceShot count), never turn events  
2. **One applyShot → at most one foul** (post-settle `isBallInHand`)  
3. **Report completed-only foul median**  
4. **Cap-hit / deadlock rate separate** — never fold deadlocks into the quality median  

Folding cap-hits into an all-seed foul median recreated the **0.94 illusion**.

---

## How to report a number

```
RULER: B (SP-004 faithful harness)
METRIC: Kakashi foulPerShot, completed-only median
SEED: seed + globalShot * 7919
N: 20, maxShots: 200, rank: 4 / rankLast: 5
MEASURE_COMMIT: <full sha>
RESULT: completed-only foul median=…; cap-hit=…; completion=…
```

If the first line is missing, the number is not usable for CEO or for DIV register.

---

## Baseline artifact in this directory

| File | Content |
|------|---------|
| `kakashi-foul-metric-baseline-6a5f87d.json` | Machine-readable per-seed rows |
| `kakashi-foul-metric-baseline-6a5f87d.md` | Human-readable tables |

- **Measure commit (games under test):** `6a5f87d58916efaeae924c2c564c04c3d1c6f40f`  
- **Artifact commit (this tree may be later):** see git history of these files  
- **Repro:**  
  `npx vitest run src/__tests__/game/kakashi-foul-metric-sweep.test.ts`  
  at measure commit (checkout that SHA to avoid commit skew)

---

## Related lessons (do not re-learn)

1. **Arg-swap:** first wrong call site became a template (`ai-demo` → headless / replay / HVA). Signature was always correct; callers were not.  
2. **Harness vs production:** respot in product/demo, absent in SP-004 — same “secret kindness” class of bug as parallel tables.  
3. **Bug-derived goldens:** HS-002 seed=7 cap probe was measured under swapped headless AI (`d371b76`); left red until QA mechanism bands (`9b3a170` fix).  
4. **No hash → rumor:** every measured number needs a full commit SHA (DIV register rule).

---

## Seed-batch runner (permanent measurement infra)

In-process multi-seed sweeps OOM because physics frames accumulate on one heap.
`scripts/run-seed-batch.mjs` runs **one child process per seed** so each game frees after exit.

```bash
# SP-004 ruler B, rank 4v4, seeds 0..49 — resume-safe partials
node scripts/run-seed-batch.mjs \
  --harness sp004 --rank0 4 --rank1 4 --n 50 \
  --out tests/fixtures/ai-quality/sp004-r4-n50.json \
  --partial-dir /tmp/seed-partials-sp004-r4

# Headless formula (seed+shotCount), post-DIV-008(b) no respot
node scripts/run-seed-batch.mjs --harness headless --rank0 4 --rank1 2 --from 0 --to 19 \
  --out /tmp/headless-r4v2.json --partial-dir /tmp/seed-partials-hl
```

| Flag | Meaning |
|------|---------|
| `--harness sp004\|headless` | Ruler B `*7919` / headless `seed+shot` |
| `--rank0` / `--rank1` / `--rankLast` | AI ranks |
| `--n` or `--from`/`--to` | Seed range |
| `--maxShots` | Cap (default 200) |
| `--out` | Final Kakashi-shaped JSON artifact (includes `measureCommit`) |
| `--partial-dir` | Per-seed JSON for interrupt/resume |
| `--concurrency` | Default 1 (raise carefully) |

Heap: child gets `--max-old-space-size=8192` (override with `SEED_BATCH_HEAP_MB`).  
Commit field: `git rev-parse HEAD`, or `MEASURE_SHA=…` override.

Output schema matches `kakashi-foul-metric-baseline-*.json` (`schemaVersion`, `measureCommit`, `groups[].seeds[]` with shots/fouls/foulPerShot/completed/capHit/winner).

**Do not compare sp004 vs headless groups as the same ruler.**

---

## Freeze note (ops)

Product freezes (HVA path, replay-controller, HS-002 assertion rewrite) are fleet decisions. This README is **documentation only** — it does not change runtime behaviour.
