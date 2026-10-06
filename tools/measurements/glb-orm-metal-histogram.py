#!/usr/bin/env python3
"""
Phase 1 #7a B-1 — ORM metal-channel survey (read-only).

Unpacks PoolTable.glb occlusionRoughnessMetallic (B = metalness),
reports global + felt / rail / legs ROI histograms.

Does NOT change any renderer / material parameters.

Usage:
  python3 tools/measurements/glb-orm-metal-histogram.py \\
    [--glb public/PoolTable.glb] \\
    [--out tools/measurements/orm-metal-histogram.json]
"""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GLB = ROOT / "public" / "PoolTable.glb"
DEFAULT_OUT = Path(__file__).resolve().parent / "orm-metal-histogram.json"


def load_glb(path: Path):
    data = path.read_bytes()
    off = 12
    js = None
    bin_ = None
    while off < len(data):
        ln, ty = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off : off + ln]
        off += ln
        if ty == 0x4E4F534A:
            js = json.loads(chunk)
        elif ty == 0x004E4942:
            bin_ = chunk
    if js is None or bin_ is None:
        raise SystemExit(f"bad GLB: {path}")
    return js, bin_


def accessor(g, bin_, i):
    a = g["accessors"][i]
    v = g["bufferViews"][a["bufferView"]]
    ct = {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    base = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    return (
        np.frombuffer(bin_, dtype=ct, count=a["count"] * n, offset=base)
        .reshape(a["count"], n)
        .astype(np.float64)
    )


def decode_image(g, bin_, image_index: int) -> Image.Image:
    im = g["images"][image_index]
    v = g["bufferViews"][im["bufferView"]]
    blob = bin_[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
    return Image.open(io.BytesIO(blob)).convert("RGB")


def hist_stats(channel: np.ndarray, bins: int = 16) -> dict:
    flat = channel.ravel().astype(np.float64)
    counts, edges = np.histogram(flat, bins=bins, range=(0, 256))
    return {
        "count": int(flat.size),
        "mean": float(flat.mean()) if flat.size else None,
        "std": float(flat.std()) if flat.size else None,
        "min": float(flat.min()) if flat.size else None,
        "max": float(flat.max()) if flat.size else None,
        "p50": float(np.percentile(flat, 50)) if flat.size else None,
        "p90": float(np.percentile(flat, 90)) if flat.size else None,
        "frac_gt_200": float((flat > 200).mean()) if flat.size else None,
        "frac_gt_250": float((flat > 250).mean()) if flat.size else None,
        "histogram_16": {
            "bin_edges": edges.tolist(),
            "counts": counts.astype(int).tolist(),
        },
    }


def sample_uv_region(P, N, UV, T, lo, hi, up_normal: bool | None):
    """Collect UV samples for triangles in Y band; optional +Y / not-+Y filter."""
    pts = []
    for t in T:
        y = P[t, 1]
        if not (y.min() >= lo and y.max() <= hi):
            continue
        n = N[t].mean(0)
        n = n / (np.linalg.norm(n) + 1e-12)
        if up_normal is True and n[1] < 0.9:
            continue
        if up_normal is False and abs(n[1]) > 0.35:
            continue
        pts.append(UV[t])
    if not pts:
        return None
    return np.concatenate(pts, 0)


def sample_channel_at_uv(
    channel: np.ndarray,
    uv: np.ndarray,
    max_samples: int = 50000,
    *,
    flip_v: bool = False,
) -> np.ndarray:
    """Sample channel at UVs. flip_v=False matches 鼬 #049 ORM pre-check (felt≈83)."""
    H, W = channel.shape
    px = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
    if flip_v:
        py = np.clip(((1.0 - uv[:, 1]) * H).astype(int), 0, H - 1)
    else:
        py = np.clip((uv[:, 1] * H).astype(int), 0, H - 1)
    if px.size > max_samples:
        rng = np.random.default_rng(42)
        idx = rng.choice(px.size, size=max_samples, replace=False)
        px, py = px[idx], py[idx]
    return channel[py, px]


def sample_legs_metal(P, UV, T, metal: np.ndarray, felt_y: float) -> np.ndarray | None:
    """
    Legs ROI: triangles with centroid Y < felt−10 AND centroid texel metal > 250.
    Matches #049 finding (legs metal ≈253–255) without diluting into apron.
    """
    H, W = metal.shape
    samples = []
    for t in T:
        y = float(P[t, 1].mean())
        if y >= felt_y - 10.0:
            continue
        u = UV[t].mean(0)
        px = int(np.clip(u[0] * W, 0, W - 1))
        py = int(np.clip(u[1] * H, 0, H - 1))
        m = int(metal[py, px])
        if m > 250:
            samples.append(m)
    if not samples:
        return None
    return np.asarray(samples, dtype=np.float64)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--glb", type=Path, default=DEFAULT_GLB)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    g, bin_ = load_glb(args.glb)
    prim = g["meshes"][0]["primitives"][0]
    P = accessor(g, bin_, prim["attributes"]["POSITION"])
    N = accessor(g, bin_, prim["attributes"]["NORMAL"])
    UV = accessor(g, bin_, prim["attributes"]["TEXCOORD_0"])
    T = accessor(g, bin_, prim["indices"]).ravel().astype(int).reshape(-1, 3)

    mat = g["materials"][0]["pbrMetallicRoughness"]
    mr_tex = mat["metallicRoughnessTexture"]["index"]
    img_i = g["textures"][mr_tex]["source"]
    orm_img = decode_image(g, bin_, img_i)
    orm = np.asarray(orm_img)
    # glTF ORM: R=occlusion, G=roughness, B=metalness
    metal = orm[:, :, 2]
    rough = orm[:, :, 1]
    occ = orm[:, :, 0]

    felt_y = float(P[:, 1].max() - 5.15)
    y_max = float(P[:, 1].max())
    y_min = float(P[:, 1].min())

    # Y-band ROIs (felt / rail). UV sample with flip_v=False (= #049).
    regions = {
        "felt": (felt_y - 0.6, felt_y + 0.6, True),
        "rail": (felt_y + 4.0, y_max + 0.1, True),
    }

    report = {
        "task": "Phase 1 #7a B-1 ORM metal-channel survey",
        "glb": str(args.glb),
        "orm_image": {
            "index": img_i,
            "size": [orm_img.width, orm_img.height],
            "mime": g["images"][img_i].get("mimeType"),
        },
        "note": (
            "B channel = metalness. UV V not flipped (matches #049 felt≈83). "
            "Measurement only — no material params changed."
        ),
        "uv_v_flip": False,
        "metallicFactor_unset_means": 1.0,
        "geometry_y": {"min": y_min, "max": y_max, "felt_top_cm": felt_y},
        "channels": {},
        "regions_metal": {},
        "boolean_answer": {},
    }

    report["channels"]["metal_global"] = hist_stats(metal)
    report["channels"]["roughness_global"] = hist_stats(rough)
    report["channels"]["occlusion_global"] = hist_stats(occ)
    report["regions_metal"]["global"] = hist_stats(metal)

    for name, spec in regions.items():
        lo, hi, up = spec
        uv = sample_uv_region(P, N, UV, T, lo, hi, up)
        if uv is None:
            report["regions_metal"][name] = {"error": "no triangles in Y band", "y_band": [lo, hi]}
            continue
        samples = sample_channel_at_uv(metal, uv, flip_v=False)
        entry = hist_stats(samples)
        entry["y_band_cm"] = [lo, hi]
        entry["up_normal_filter"] = up
        entry["uv_vertices_sampled"] = int(uv.shape[0])
        report["regions_metal"][name] = entry

    legs_samples = sample_legs_metal(P, UV, T, metal, felt_y)
    if legs_samples is None:
        report["regions_metal"]["legs"] = {
            "error": "no high-metal low-Y triangles",
            "filter": "Y < felt-10 AND centroid metal > 250",
        }
    else:
        entry = hist_stats(legs_samples)
        entry["filter"] = "Y < felt-10 AND centroid metal > 250"
        report["regions_metal"]["legs"] = entry

    legs = report["regions_metal"].get("legs", {})
    felt = report["regions_metal"].get("felt", {})
    rail = report["regions_metal"].get("rail", {})
    legs_metal = legs.get("mean")
    legs_hi = legs.get("frac_gt_250")
    report["boolean_answer"] = {
        "question": "Are table legs / trim authored as metal in the ORM blue channel?",
        "legs_mean_metal": legs_metal,
        "legs_frac_gt_250": legs_hi,
        "answer": bool(legs_metal is not None and legs_metal >= 200),
        "felt_mean_metal": felt.get("mean"),
        "rail_mean_metal": rail.get("mean"),
        "implication": (
            "YES — legs already metal in asset; envMapIntensity may read as chrome "
            "(still whole-material; needs felt/ball ROI if ever applied). "
            "Global metalness must NOT be raised (already factor 1.0) or lowered "
            "(would demetal legs)."
            if legs_metal is not None and legs_metal >= 200
            else "NO / inconclusive — do not force metalness; chrome needs asset work (D-3)."
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    md_path = args.out.with_suffix(".md")
    lines = [
        "# B-1 ORM metal-channel survey",
        "",
        f"- GLB: `{args.glb}`",
        f"- ORM size: {orm_img.width}×{orm_img.height}",
        f"- JSON: `{args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}`",
        "",
        "## Global metal (B)",
        f"- mean={report['channels']['metal_global']['mean']:.2f}  "
        f"frac>200={report['channels']['metal_global']['frac_gt_200']:.3f}  "
        f"frac>250={report['channels']['metal_global']['frac_gt_250']:.3f}",
        "",
        "## ROI metal means",
    ]
    for k in ("global", "felt", "rail", "legs"):
        r = report["regions_metal"].get(k, {})
        if "mean" in r and r["mean"] is not None:
            lines.append(
                f"- **{k}**: mean={r['mean']:.2f}  p50={r['p50']:.2f}  "
                f"frac>200={r['frac_gt_200']:.3f}  frac>250={r['frac_gt_250']:.3f}  n={r['count']}"
            )
        else:
            lines.append(f"- **{k}**: {r}")
    ba = report["boolean_answer"]
    lines += [
        "",
        "## Boolean",
        f"- Q: {ba['question']}",
        f"- **Answer: {'YES' if ba['answer'] else 'NO/inconclusive'}** "
        f"(legs mean={ba['legs_mean_metal']})",
        f"- {ba['implication']}",
        "",
        "_Measurement only — no material parameters changed._",
        "",
    ]
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(md_path.read_text())
    print(f"Wrote {args.out}", file=sys.stderr)
    print(f"Wrote {md_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
