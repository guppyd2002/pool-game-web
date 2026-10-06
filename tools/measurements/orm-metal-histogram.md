# B-1 ORM metal-channel survey

- GLB: `/home/guppyd/pool-game-web/public/PoolTable.glb`
- ORM size: 4096×4096
- JSON: `tools/measurements/orm-metal-histogram.json`

## Global metal (B)
- mean=117.23  frac>200=0.197  frac>250=0.195

## ROI metal means
- **global**: mean=117.23  p50=84.00  frac>200=0.197  frac>250=0.195  n=16777216
- **felt**: mean=83.60  p50=83.00  frac>200=0.000  frac>250=0.000  n=1164
- **rail**: mean=133.04  p50=85.00  frac>200=0.288  frac>250=0.277  n=9234
- **legs**: mean=254.33  p50=255.00  frac>200=1.000  frac>250=1.000  n=4907

## Boolean
- Q: Are table legs / trim authored as metal in the ORM blue channel?
- **Answer: YES** (legs mean=254.32667617689015)
- YES — legs already metal in asset; envMapIntensity may read as chrome (still whole-material; needs felt/ball ROI if ever applied). Global metalness must NOT be raised (already factor 1.0) or lowered (would demetal legs).

_Measurement only — no material parameters changed._
