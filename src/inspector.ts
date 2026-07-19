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

// ─── GLB scale — FROZEN, mirrors scene.ts ─────────────────────────────────────
// Source: scene.ts (commit d43ce79). Chief-architect directive: never recalculate.
// Anchor: felt-slab long edge aligns to RAIL_LONG_X (physics wall ±1.2699 m).

const TABLE_W = 2.54;    // metres — standard 8-ball table width (same as scene.ts)
const TABLE_H = 1.27;    // metres — standard 8-ball table height
const GLB_SLAB_X = 26.824;   // Three.js units (2682.40 mm ÷ 100), long axis anchor
const GLB_PLAY_Z = 15.1258;  // Three.js units (1512.58 mm ÷ 100), short axis anchor

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

  // ── Pocket trigger circles (magenta) ─────────────────────────────────────────
  const pocketR = toM(POCKET_RADIUS); // 0.045 m
  const pocketMat = new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false });
  for (const [px, pz] of POCKET_POSITIONS) {
    const cx = toM(px);
    const cz = toM(pz);
    const SEGS = 32;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const angle = (i / SEGS) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        cx + Math.cos(angle) * pocketR,
        Y_LINE,
        cz + Math.sin(angle) * pocketR,
      ));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const circle = new THREE.Line(circleGeo, pocketMat.clone());
    circle.renderOrder = 1001;
    group.add(circle);
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

  // Apply Sukno (felt) material fix — unlit green, same as scene.ts shipped state.
  // Reason: lit MeshStandardMaterial on split-vertex mesh shows facet grid.
  // Color 0x0f7b3a = perceived luminance ≈ 83 (Rec.601 target); map:null removes
  // the grey Cloth2 texture that compressed lit luminance from 83 down to 19.
  let rawFeltTopY = 0;
  model.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat.name === 'Sukno') {
        rawFeltTopY = Math.max(rawFeltTopY, new THREE.Box3().setFromObject(obj).max.y);
        const unlit = new THREE.MeshBasicMaterial({ color: 0x0f7b3a });
        if (Array.isArray(obj.material)) {
          const idx = (obj.material as THREE.Material[]).indexOf(mat);
          if (idx !== -1) (obj.material as THREE.Material[])[idx] = unlit;
        } else {
          obj.material = unlit;
        }
      }
    }
  });

  const rawBox = new THREE.Box3().setFromObject(model);
  if (rawFeltTopY === 0) rawFeltTopY = rawBox.max.y;
  const rawCenter = new THREE.Vector3();
  rawBox.getCenter(rawCenter);

  // GLB scale — FROZEN, must match scene.ts. scaleX = TABLE_W / GLB_SLAB_X.
  const scaleX = TABLE_W / GLB_SLAB_X;  // ≈ 9.468e-2
  const scaleZ = TABLE_H / GLB_PLAY_Z;  // ≈ 8.395e-2
  const scaleY = scaleX;                // Y proportional to long axis

  model.scale.set(scaleX, scaleY, scaleZ);
  model.position.set(
    -rawCenter.x * scaleX,
    -rawFeltTopY * scaleY,  // felt top → scene Y=0
    -rawCenter.z * scaleZ,
  );

  model.traverse(obj => {
    if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });

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
