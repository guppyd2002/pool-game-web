# Shot clock OFF prep (feature branch — not merged)

**Branch:** `prep/shot-clock-off-and-deploy-gate`  
**Base:** `11638b7` (do not push master)  
**Intent:** When CEO says **撤**, merge + deploy is minutes-scale, not a redesign.

## Product switch

| Symbol | File | Default on this branch |
|--------|------|------------------------|
| `WALL_CLOCK_SHOT_TIMER_ENABLED` | `src/renderer/shot-timer.ts` | **`false`** |

### Behaviour when `false`
- `createShotTimer().start()` does **not** schedule intervals  
- Does **not** call `onShotTimeout` / `onGameEndTimeout`  
- `main.ts` clears HUD timer (`setTimer(null)`) and double-guards timeout callbacks  
- **Unchanged:** `rule-engine.applyTimeout` / `applyGameEndTimeout`, `session.notifyShotTimeout` / `notifyGameEndTimeout` (still unit-tested; Unity fidelity retained)

### Behaviour when `true`
- Restores current live behaviour (30s → foul BIH, then game-end tier)

## Diff summary (minimal)

1. `shot-timer.ts` — export flag + early return in `start()`  
2. `main.ts` — import flag; clear HUD + guard callbacks  
3. `shot-timer.test.ts` — assert flag type/value + disabled start does not fire timeouts  

## Verify DIV-005-style “no foul on idle” after enable on prod

After this lands on whatever serves CEO:

1. Open production (or gated release) **without** `?demo=`  
2. **Play 8-Ball HotSeat**  
3. Leave idle **≥ 35 s**  
4. **Pass:** still Player 1’s turn; HUD has **no** countdown; **no** “Place cue ball” handoff  
5. **Fail:** timer digits or opponent BIH (clock still live)

Optional: Playwright smoke mirroring the prod probe used 2026-08-08.

## Time from “CEO says 撤” → prod

| Step | Est. |
|------|------|
| Merge this branch (or cherry-pick) to shippable line | 2–10 min (PR discipline) |
| Deploy (today: master auto-prod ~2–5 min; **with gate A: merge to release**) | 2–15 min |
| Smoke idle 35 s | 1 min |
| **Total** | **~5–25 min** typical |

If only need flip without branch drama: constant is one line; long pole is **deploy gate**, not code.

## If CEO says 留

- Do **not** merge this branch  
- Or merge with `WALL_CLOCK_SHOT_TIMER_ENABLED = true`  
- Delete branch either way — low sunk cost

## Out of scope
- No deletion of timer/module tests for pure helpers  
- No HVA freezes touched beyond main.ts timer guards (same wiring points as today)  
