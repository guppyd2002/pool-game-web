# UX measure #3 / #5 — Playwright (NON-REAL-DEVICE)

Method: `getBoundingClientRect` for Power/Spin DOM; Aim via Three.js `Line2.material` (no DOM box).
8BP column = static benchmark from challenge #045 (not live-measured 8BP).

## #3 Power / Spin

| Device | Orient | DPR | UA (short) | RotatePrompt | Power side | Power left px / %VW | Power right %VW | Power W×H px | Power W%VW×H%VH | 8BP Power | Spin side | Spin left %VW | Spin W×H px | 8BP Spin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iPhone-14-land | landscape | 3 | Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac… | false | RIGHT | 774.4 / 91.75% | 99.53% | 65.6×235.34 | 7.77%×60.34% | LEFT · 3.0%W×50.8%H | LEFT | 1.42% | 55.76×68.88 | RIGHT-TOP |
| iPhone-14-port | portrait | 3 | Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac… | true | RIGHT | 306 / 78.46% | 98.97% | 80×283 | 20.51%×33.53% | LEFT · 3.0%W×50.8%H | LEFT | 3.08% | 68×80 | RIGHT-TOP |
| iPad-land | landscape | 2 | Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Ap… | false | RIGHT | 940 / 91.8% | 99.61% | 80×283 | 7.81%×36.85% | LEFT · 3.0%W×50.8%H | LEFT | 1.17% | 68×80 | RIGHT-TOP |
| iPad-port | portrait | 2 | Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Ap… | true | RIGHT | 684 / 89.06% | 99.48% | 80×283 | 10.42%×27.64% | LEFT · 3.0%W×50.8%H | LEFT | 1.56% | 68×80 | RIGHT-TOP |
| iPad-Pro-port-1024 | portrait | 2 | Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Ap… | false | RIGHT | 940 / 91.8% | 99.61% | 80×283 | 7.81%×20.72% | LEFT · 3.0%W×50.8%H | LEFT | 1.17% | 68×80 | RIGHT-TOP |
| Desktop-Chrome-land | landscape | 1 | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleW… | false | RIGHT | 1196 / 93.44% | 99.69% | 80×283 | 6.25%×39.31% | LEFT · 3.0%W×50.8%H | LEFT | 0.94% | 68×80 | RIGHT-TOP |

## #5 Aim line

| Device | Orient | DPR | linewidth px | color | opacity | stroke | visible | 8BP Aim |
|---|---|---|---|---|---|---|---|---|
| iPhone-14-land | landscape | 3 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |
| iPhone-14-port | portrait | 3 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |
| iPad-land | landscape | 2 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |
| iPad-port | portrait | 2 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |
| iPad-Pro-port-1024 | portrait | 2 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |
| Desktop-Chrome-land | landscape | 1 | 2.5 | #4db8ff | 0.95 | none (single Line2; no near-black dual stroke) | true | 2px · #ffffff · opacity~1 · near-black ~1px stroke |

## Meta
- Generated: 2026-10-06T05:24:04.131Z
- Source: tests/smoke/measure-power-aim-ux.spec.ts
- Artifact JSON: tests/smoke/screenshots/ux-measure-playwright/measure.json