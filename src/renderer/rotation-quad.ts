/**
 * FEAT-CAM-008 — RotationQuad boundary positioning (pure math).
 * Unity-Ref: RotationQuadManager.GetQuadPosition
 *
 * Given a horizontal rotation frame (quad) and a pivot look direction, place the
 * camera on the frame boundary in front of the pivot (with optional corner smoothing).
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Port of RotationQuadManager.GetQuadPosition.
 *
 * @param rotationQuadPos    world position of the rotation frame
 * @param scaleXHalf         0.5 * lossyScale.x of the frame
 * @param scaleZHalf         0.5 * lossyScale.z of the frame
 * @param rotationQuadRight  frame local +X in world
 * @param rotationQuadForward frame local +Z in world
 * @param pivotPosition      orbit pivot (table centre / cue look pivot)
 * @param pivotForward       view forward (horizontal)
 * @param smoothCorners01    0 = sharp rectangle, 1 = ellipse blend (Unity third-person uses 0.5)
 */
export function getQuadPosition(
  rotationQuadPos: Vec3,
  scaleXHalf: number,
  scaleZHalf: number,
  rotationQuadRight: Vec3,
  rotationQuadForward: Vec3,
  pivotPosition: Vec3,
  pivotForward: Vec3,
  smoothCorners01: number,
): Vec3 {
  const smooth = clamp01(smoothCorners01);
  const delta = {
    x: pivotPosition.x - rotationQuadPos.x,
    y: pivotPosition.y - rotationQuadPos.y,
    z: pivotPosition.z - rotationQuadPos.z,
  };

  const negFwd = { x: -pivotForward.x, y: -pivotForward.y, z: -pivotForward.z };
  const dX = dot(negFwd, rotationQuadRight);
  const dZ = dot(negFwd, rotationQuadForward);

  const v = scaleXHalf + (dX > 0 ? -delta.x : delta.x);
  const h = scaleZHalf + (dZ > 0 ? -delta.z : delta.z);

  const absDX = Math.abs(dX);
  const absDZ = Math.abs(dZ);
  // Avoid div-by-zero when forward is degenerate
  const rX = absDX < 1e-8 ? Number.POSITIVE_INFINITY : v / absDX;
  const rZ = absDZ < 1e-8 ? Number.POSITIVE_INFINITY : h / absDZ;
  let r1 = Math.min(rX, rZ);
  if (!Number.isFinite(r1)) r1 = Math.max(scaleXHalf, scaleZHalf);

  const yLift = rotationQuadPos.y - pivotPosition.y;

  if (smooth > 0) {
    const cubePosition = {
      x: delta.x - r1 * pivotForward.x,
      y: delta.y - r1 * pivotForward.y,
      z: delta.z - r1 * pivotForward.z,
    };
    const denom =
      (cubePosition.x * cubePosition.x) / (scaleXHalf * scaleXHalf) +
      (cubePosition.z * cubePosition.z) / (scaleZHalf * scaleZHalf);
    const r2 = denom > 1e-12 ? r1 / Math.sqrt(denom) : r1;
    const r = r1 + (r2 - r1) * smooth; // Lerp(r1, r2, smooth)
    return {
      x: pivotPosition.x - r * pivotForward.x,
      y: pivotPosition.y - r * pivotForward.y + yLift,
      z: pivotPosition.z - r * pivotForward.z,
    };
  }

  return {
    x: pivotPosition.x - r1 * pivotForward.x,
    y: pivotPosition.y - r1 * pivotForward.y + yLift,
    z: pivotPosition.z - r1 * pivotForward.z,
  };
}
