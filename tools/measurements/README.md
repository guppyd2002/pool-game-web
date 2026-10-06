# Phase 1 measurements (`pool-game-web`)

| Artifact | What |
|----------|------|
| `glb-orm-metal-histogram.py` | **#7a B-1** — ORM blue (metal) histograms: global / felt / rail / legs. Read-only. |
| `orm-metal-histogram.json` | Machine-readable B-1 output |
| `orm-metal-histogram.md` | Human summary + boolean (legs authored metal?) |

Related upstream scripts (CTO attribution for A-1 null-on-top): `pool-game-digital-twin/tools/measurements/`.

```bash
python3 tools/measurements/glb-orm-metal-histogram.py
```

Requires: `python3`, `numpy`, `Pillow`.
