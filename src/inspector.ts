/**
 * Pool Table Inspector — standalone 3D viewer for CEO/QA geometry alignment.
 *
 * Purpose: overlay physics collision boundaries on the art GLB mesh so that
 * misalignment between art geometry and physics play-field is immediately visible.
 *
 * Physics values imported from physics/constants.ts (Game.unity single source of truth).
 * Jaw/rail cyan lines reuse createColliderDebug() from renderer/debug-colliders.ts.
 * GLB scale constants mirror scene.ts exactly (FROZEN — do not alter).
 *
 * Entry point: inspector.html → vite multi-page input.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  PHYSICS_MULTIPLIER,
  RAIL_LONG_X,
  RAIL_BACK_Z,
  POCKET_POSITIONS,
  POCKET_RADIUS,
  BALL_RADIUS,
} from './physics/constants';
import { createColliderDebug } from './renderer/debug-colliders';

// ─── Physics unit → metres ─────────────────────────────────────────────────────

/** Convert a physics-unit value (MULTIPLIER=10000) to metres. */
function toM(v: number): number {
  return v / PHYSICS_MULTIPLIER;
}

// ─── GLB scale — uniform 0.01, mirrors scene.ts ──────────────────────────────
// TurboSquid 9ft regulation model (cm units, Y-up). Scale 0.01 = cm→m.
// Must stay in sync with scene.ts.

const TABLE_W = 2.54;    // metres — standard 8-ball table width (same as scene.ts)
const TABLE_H = 1.27;    // metres — standard 8-ball table height

// ─── Inspector overlay (boundary rect + pocket circles + reference ball) ───────

/**
 * Build the inspector-specific physics overlay:
 *
 *  YELLOW  rectangle — play boundary (X=±RAIL_LONG_X, Z=±RAIL_BACK_Z)
 *          Sources: RAIL_LONG_X=12699→±1.2699m, RAIL_BACK_Z=6349→±0.6349m
 *          (physics/constants.ts, authoritative from Game.unity line-collider positions)
 *
 *  MAGENTA circles — pocket trigger zones at POCKET_POSITIONS (6 pockets)
 *          Source: POCKET_POSITIONS + POCKET_RADIUS=450→0.045m (KinematicTrigger radii)
 *
 *  WHITE   sphere  — reference ball at cue-ball start, R=BALL_RADIUS=285→0.0285m
 *          Placed at (−TABLE_W/4, R, 0) — same as game's opening cue position.
 */
function createInspectorOverlay(): THREE.Group {
  const group = new THREE.Group();
  const Y_LINE = 0.003; // 3mm above felt (Y=0) — clears art mesh, avoids z-fighting

  // ── Play-boundary rectangle (yellow) ────────────────────────────────────────
  const bx = toM(RAIL_LONG_X); // 1.2699 m — long rail inner face
  const bz = toM(RAIL_BACK_Z); // 0.6349 m — end rail inner face
  const boundaryPts = [
    new THREE.Vector3(-bx, Y_LINE, -bz),
    new THREE.Vector3( bx, Y_LINE, -bz),
    new THREE.Vector3( bx, Y_LINE,  bz),
    new THREE.Vector3(-bx, Y_LINE,  bz),
    new THREE.Vector3(-bx, Y_LINE, -bz), // close loop
  ];
  const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryPts);
  const boundaryMat = new THREE.LineBasicMaterial({
    color: 0xffff00, // yellow — distinct from cyan detail colliders
    depthTest: false,
  });
  const boundaryLine = new THREE.Line(boundaryGeo, boundaryMat);
  boundaryLine.renderOrder = 1001; // above cyan detail lines (renderOrder=999)
  group.add(boundaryLine);

  // ── Pocket circles: trigger (magenta 45mm) + capture (orange 73.5mm) ────────
  // ⚠️ INTENTIONAL DEVIATION from Unity source — CEO decision 3fa92431 (C6 overlay fix).
  // Physics capture check (cm-rigidbody.ts:600): sqrDist ≤ (ball.radius+trigger.radius)²
  // True capture radius = BALL_RADIUS(285) + POCKET_RADIUS(450) = 735 units = 73.5mm.
  // Inner magenta = trigger radius (POCKET_RADIUS 45mm, reference only — NOT the capture boundary).
  // Outer orange  = TRUE ball-capture boundary (73.5mm) — use this for QA alignment.
  const pocketR  = toM(POCKET_RADIUS);               // 0.045 m — trigger
  const captureR = toM(BALL_RADIUS + POCKET_RADIUS); // 0.0735 m — true capture
  const triggerMat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false }); // magenta
  const captureMat = new THREE.LineBasicMaterial({ color: 0xff6600, depthTest: false }); // orange
  const SEGS = 32;
  for (const [px, pz] of POCKET_POSITIONS) {
    const cx = toM(px);
    const cz = toM(pz);
    for (const [r, mat] of [[pocketR, triggerMat], [captureR, captureMat]] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= SEGS; i++) {
        const angle = (i / SEGS) * Math.PI * 2;
        pts.push(new THREE.Vector3(cx + Math.cos(angle) * r, Y_LINE, cz + Math.sin(angle) * r));
      }
      const circle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      circle.renderOrder = 1001;
      group.add(circle);
    }
  }

  // ── Reference ball — white sphere ─────────────────────────────────────────────
  // R = BALL_RADIUS=285 → 0.0285 m (physics/constants.ts)
  // Placed at cue ball start: X = −TABLE_W/4, Z = 0, Y = radius (resting on felt)
  const ballR = toM(BALL_RADIUS); // 0.0285 m
  const ballGeo = new THREE.SphereGeometry(ballR, 32, 24);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05 });
  const refBall = new THREE.Mesh(ballGeo, ballMat);
  refBall.position.set(-TABLE_W / 4, ballR, 0);
  refBall.castShadow = true;
  group.add(refBall);

  return group;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const container = document.getElementById('canvas-container')!;
  const loading   = document.getElementById('loading')!;
  const loadBar   = document.getElementById('load-bar') as HTMLElement;

  // ── Renderer ────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ── Scene ───────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);

  // ── Camera — perspective overview ───────────────────────────────────────────
  const aspect = window.innerWidth / window.innerHeight;
  const perspCam = new THREE.PerspectiveCamera(50, aspect, 0.01, 50);
  perspCam.position.set(0, 2.5, 2.2);
  perspCam.lookAt(0, 0, 0);

  // Orthographic top-down camera (toggled by "View" button)
  const hw = (TABLE_W / 2) * 1.2;
  const hh = (TABLE_H / 2) * 1.2;
  const orthoCam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 50);
  orthoCam.position.set(0, 5, 0);
  orthoCam.up.set(0, 0, -1);
  orthoCam.lookAt(0, 0, 0);

  let useOrtho = false;
  const activeCamera = (): THREE.Camera => useOrtho ? orthoCam : perspCam;

  // ── OrbitControls (all buttons enabled for inspector) ───────────────────────
  const controls = new OrbitControls(perspCam, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.01;

  // ── Lighting ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const spot = new THREE.SpotLight(0xfff5e0, 2, 6, Math.PI / 4, 0.5, 1);
  spot.position.set(0, 2, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  const point = new THREE.PointLight(0xfff0d0, 0.5, 5);
  point.position.set(0, 1.5, 0);
  scene.add(point);

  // ── Grid helper (5×3 m, 50 divisions) ───────────────────────────────────────
  const grid = new THREE.GridHelper(5, 50, 0x333344, 0x1a1a2a);
  grid.position.y = -0.015;
  scene.add(grid);

  // ── XYZ axes helper (0.4 m arms, X=red Y=green Z=blue) ──────────────────────
  const axes = new THREE.AxesHelper(0.4);
  axes.position.y = 0.001;
  scene.add(axes);

  // ── Load GLB ─────────────────────────────────────────────────────────────────
  const loader = new GLTFLoader();
  const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) => {
    loader.load(
      '/PoolTable.glb',
      gltf => { loadBar.style.width = '100%'; resolve(gltf); },
      evt  => { if (evt.total) loadBar.style.width = `${(evt.loaded / evt.total) * 90}%`; },
      reject,
    );
  });
  const model = gltf.scene;

  // Single PBR material (commercial_pool_table_mat) — preserve GLTFLoader output as-is.
  model.traverse(obj => {
    if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });

  const rawBox = new THREE.Box3().setFromObject(model);
  // ⚠️ INTENTIONAL DEVIATION from Unity source — CEO decision 3fa92431 "physics follows model".
  // Rail tops protrude 51.5mm above felt (5.15cm). Measured: rail top rawY≈83.73cm, felt rawY≈78.58cm.
  // DO NOT revert to 0.509 (was wrong by ×10 — caused 46mm ball float, C4 bug).
  const rawFeltTopY = rawBox.max.y - 5.15;
  const rawCenter = new THREE.Vector3();
  rawBox.getCenter(rawCenter);

  // GLB scale — uniform, must match scene.ts. TurboSquid 9ft, cm units → 0.01 = m.
  const scaleU = 0.01;

  model.scale.set(scaleU, scaleU, scaleU);
  model.position.set(
    -rawCenter.x * scaleU,
    -rawFeltTopY * scaleU,  // felt top → scene Y=0
    -rawCenter.z * scaleU,
  );

  scene.add(model);

  // ── Physics overlay — reuse existing createColliderDebug() ──────────────────
  // Draws all jaw/rail lines from physics/constants.ts (Game.unity ground-truth).
  // In the inspector we default to visible=true (game defaults to false for production).
  const detailOverlay = createColliderDebug();
  detailOverlay.visible = true;
  scene.add(detailOverlay);

  // ── Inspector overlay — boundary rect, pocket circles, reference ball ────────
  const inspectorOverlay = createInspectorOverlay();
  inspectorOverlay.visible = true;
  scene.add(inspectorOverlay);

  // ── Hide loading screen ──────────────────────────────────────────────────────
  loading.style.display = 'none';

  // ── UI wiring ────────────────────────────────────────────────────────────────
  const btnOverlay = document.getElementById('btn-overlay')!;
  const btnGrid    = document.getElementById('btn-grid')!;
  const btnAxes    = document.getElementById('btn-axes')!;
  const btnTopdown = document.getElementById('btn-topdown')!;
  const btnReset   = document.getElementById('btn-reset')!;

  // Toggle physics overlay (both detail lines + boundary/pockets/ball)
  btnOverlay.addEventListener('click', () => {
    const v = !detailOverlay.visible;
    detailOverlay.visible = v;
    inspectorOverlay.visible = v;
    btnOverlay.textContent = `Physics Overlay: ${v ? 'ON' : 'OFF'}`;
    btnOverlay.classList.toggle('active', v);
  });

  // Toggle grid
  btnGrid.addEventListener('click', () => {
    grid.visible = !grid.visible;
    btnGrid.textContent = `Grid: ${grid.visible ? 'ON' : 'OFF'}`;
    btnGrid.classList.toggle('active', grid.visible);
  });

  // Toggle axes
  btnAxes.addEventListener('click', () => {
    axes.visible = !axes.visible;
    btnAxes.textContent = `Axes: ${axes.visible ? 'ON' : 'OFF'}`;
    btnAxes.classList.toggle('active', axes.visible);
  });

  // Toggle perspective ↔ top-down ortho
  btnTopdown.addEventListener('click', () => {
    useOrtho = !useOrtho;
    controls.enabled = !useOrtho; // orbit only in perspective
    if (useOrtho) {
      const asp = window.innerWidth / window.innerHeight;
      const hw2 = (TABLE_W / 2) * 1.2 * Math.max(1, asp / (TABLE_W / TABLE_H));
      const hh2 = hw2 / asp;
      orthoCam.left = -hw2; orthoCam.right = hw2;
      orthoCam.top = hh2;   orthoCam.bottom = -hh2;
      orthoCam.updateProjectionMatrix();
    }
    btnTopdown.textContent = useOrtho ? 'View: Top-Down' : 'View: Perspective';
    btnTopdown.classList.toggle('active', useOrtho);
  });

  // Reset perspective camera to overview angle
  btnReset.addEventListener('click', () => {
    useOrtho = false;
    controls.enabled = true;
    perspCam.position.set(0, 2.5, 2.2);
    perspCam.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    btnTopdown.textContent = 'View: Perspective';
    btnTopdown.classList.remove('active');
  });

  // ── Resize handler ───────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const asp = window.innerWidth / window.innerHeight;
    perspCam.aspect = asp;
    perspCam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Render loop ──────────────────────────────────────────────────────────────
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, activeCamera());
  }
  animate();
}

main().catch(err => {
  console.error('Inspector failed to initialize:', err);
  const loading = document.getElementById('loading');
  if (loading) loading.innerHTML = `<div style="color:#f55">Error: ${err.message}</div>`;
});
