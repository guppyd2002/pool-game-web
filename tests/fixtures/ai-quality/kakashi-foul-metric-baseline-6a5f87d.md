# Kakashi-metric AI foul quality baseline

- **measure commit**: `6a5f87d58916efaeae924c2c564c04c3d1c6f40f`
- **repro**: `npx vitest run src/__tests__/game/kakashi-foul-metric-sweep.test.ts` @ that commit
- **metric**: foulPerShot = foul shots / applyShot count (post-settle isBallInHand)
- **quality number**: completed-only median (cap-hit games excluded)
- **cap-hit rate**: reported separately; never folded into quality median

## Summary

| group | seed deriv | completed-only foul median | cap-hit rate | completion |
|---|---|---:|---:|---:|
| self-play symmetric rank3 | `seed + globalShotIndex * 7919 (both seats share global index…` | 0.091 | 6/20 (30%) | 14/20 (70%) |
| self-play symmetric rank4 (SP-004 path) | `seed + globalShotIndex * 7919 (both seats share global index…` | 0.107 | 9/20 (45%) | 11/20 (55%) |
| HVA product path rank3 | `P1 attachHumanVsAI: AI-local *7919; P0 stand-in: global *791…` | 0.148 | 1/20 (5%) | 19/20 (95%) |

## self-play symmetric rank3

- **id**: `self-play-symmetric-rank3`
- **seedDeriv**: seed + globalShotIndex * 7919 (both seats share global index)
- **completed-only foul median**: 0.091
- **cap-hit**: 6/20 (30%)
- **completion**: 14/20 (70%)

| seed | shots | fouls | foulPerShot | completed | cap-hit | winner |
|---:|---:|---:|---:|:---:|:---:|---:|
| 0 | 23 | 2 | 0.087 | true | false | 1 |
| 1 | 31 | 2 | 0.065 | true | false | 0 |
| 2 | 29 | 4 | 0.138 | true | false | 0 |
| 3 | 33 | 5 | 0.152 | true | false | 0 |
| 4 | 21 | 2 | 0.095 | true | false | 1 |
| 5 | 36 | 2 | 0.056 | true | false | 1 |
| 6 | 26 | 2 | 0.077 | true | false | 0 |
| 7 | 29 | 3 | 0.103 | true | false | 1 |
| 8 | 200 | 172 | 0.860 | false | true | null |
| 9 | 25 | 1 | 0.040 | true | false | 0 |
| 10 | 21 | 2 | 0.095 | true | false | 1 |
| 11 | 200 | 188 | 0.940 | false | true | null |
| 12 | 28 | 5 | 0.179 | true | false | 0 |
| 13 | 200 | 183 | 0.915 | false | true | null |
| 14 | 200 | 185 | 0.925 | false | true | null |
| 15 | 19 | 0 | 0.000 | true | false | 0 |
| 16 | 200 | 176 | 0.880 | false | true | null |
| 17 | 25 | 5 | 0.200 | true | false | 1 |
| 18 | 21 | 1 | 0.048 | true | false | 0 |
| 19 | 200 | 191 | 0.955 | false | true | null |

## self-play symmetric rank4 (SP-004 path)

- **id**: `self-play-symmetric-rank4-sp004`
- **seedDeriv**: seed + globalShotIndex * 7919 (both seats share global index)
- **completed-only foul median**: 0.107
- **cap-hit**: 9/20 (45%)
- **completion**: 11/20 (55%)

| seed | shots | fouls | foulPerShot | completed | cap-hit | winner |
|---:|---:|---:|---:|:---:|:---:|---:|
| 0 | 200 | 191 | 0.955 | false | true | null |
| 1 | 32 | 4 | 0.125 | true | false | 1 |
| 2 | 200 | 192 | 0.960 | false | true | null |
| 3 | 8 | 0 | 0.000 | true | false | 1 |
| 4 | 28 | 3 | 0.107 | true | false | 0 |
| 5 | 17 | 1 | 0.059 | true | false | 0 |
| 6 | 200 | 188 | 0.940 | false | true | null |
| 7 | 23 | 3 | 0.130 | true | false | 1 |
| 8 | 200 | 178 | 0.890 | false | true | null |
| 9 | 200 | 182 | 0.910 | false | true | null |
| 10 | 200 | 172 | 0.860 | false | true | null |
| 11 | 22 | 1 | 0.045 | true | false | 0 |
| 12 | 24 | 3 | 0.125 | true | false | 0 |
| 13 | 200 | 190 | 0.950 | false | true | null |
| 14 | 34 | 4 | 0.118 | true | false | 1 |
| 15 | 22 | 4 | 0.182 | true | false | 0 |
| 16 | 35 | 2 | 0.057 | true | false | 0 |
| 17 | 200 | 198 | 0.990 | false | true | null |
| 18 | 200 | 182 | 0.910 | false | true | null |
| 19 | 1 | 0 | 0.000 | true | false | 1 |

## HVA product path rank3

- **id**: `hva-product-rank3`
- **seedDeriv**: P1 attachHumanVsAI: AI-local *7919; P0 stand-in: global *7919 at fire (NOT comparable 1:1 to pure self-play)
- **completed-only foul median**: 0.148
- **cap-hit**: 1/20 (5%)
- **completion**: 19/20 (95%)

| seed | shots | fouls | foulPerShot | completed | cap-hit | winner |
|---:|---:|---:|---:|:---:|:---:|---:|
| 0 | 17 | 3 | 0.176 | true | false | 0 |
| 1 | 27 | 4 | 0.148 | true | false | 1 |
| 2 | 34 | 4 | 0.118 | true | false | 1 |
| 3 | 22 | 4 | 0.182 | true | false | 1 |
| 4 | 29 | 4 | 0.138 | true | false | 0 |
| 5 | 21 | 5 | 0.238 | true | false | 0 |
| 6 | 26 | 2 | 0.077 | true | false | 0 |
| 7 | 46 | 20 | 0.435 | true | false | 1 |
| 8 | 28 | 9 | 0.321 | true | false | 0 |
| 9 | 4 | 1 | 0.250 | true | false | 0 |
| 10 | 41 | 6 | 0.146 | true | false | 0 |
| 11 | 5 | 0 | 0.000 | true | false | 1 |
| 12 | 32 | 9 | 0.281 | true | false | 0 |
| 13 | 26 | 6 | 0.231 | true | false | 1 |
| 14 | 20 | 8 | 0.400 | true | false | 1 |
| 15 | 14 | 0 | 0.000 | true | false | 0 |
| 16 | 39 | 3 | 0.077 | true | false | 1 |
| 17 | 11 | 1 | 0.091 | true | false | 0 |
| 18 | 21 | 2 | 0.095 | true | false | 0 |
| 19 | 200 | 177 | 0.885 | false | true | null |

