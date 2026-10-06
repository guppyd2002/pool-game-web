/**
 * Three.js pool table scene — 16 balls, table, cushions, lighting.
 * No physics integration (T09). Pure rendering.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPocketMeshes, animateBallSink } from './pocket-visuals';
import { createColliderDebug } from './debug-colliders';
import { makeBallMaterial } from './ball-materials';
import {
  applyTableAnisotropy,
  buildAnisotropyReport,
  type AnisotropyReport,
} from './table-anisotropy';
import { getPlayView } from './camera-tween';
import { BALL_RADIUS_M } from '../physics/constants';
import {
  TABLE_W_M,
  TABLE_H_M,
  orthoFrustum,
} from '../layout/ortho-constants';

// ─── Constants ───────────────────────────────────────────────────────────────

// Nose-to-nose meters — single source: layout/ortho-constants.ts (C-1 with felt-geometry).
const TABLE_W = TABLE_W_M;
const TABLE_H = TABLE_H_M;
/** SET-006: render radius shares physics BALL_RADIUS (0.0285 m), not a parallel constant. */
const BALL_RADIUS = BALL_RADIUS_M;

// Ball colors moved to ball-materials.ts (WPA regulation set, CEO-approved).
// Ortho frustum: orthoFrustum() from ortho-constants (ORTHO_MARGIN 1.1365).

// ─── Scene API Interface ─────────────────────────────────────────────────────

export interface SceneAPI {
  renderer: THREE.WebGLRenderer;
  /**
   * Perspective camera — overview/orbit poses live here.
   * Not always drawn: setOrthoTop(true) → render uses orthoCam instead.
   */
  camera: THREE.PerspectiveCamera;
  /**
   * Camera used by render(): orthoCam when setOrthoTop(true), else `camera`.
   * Raycasts must use this (not raw `camera`) in top view.
   */
  readonly activeCamera: THREE.Camera;
  scene: THREE.Scene;
  balls: THREE.Mesh[];
  table: THREE.Group;
  updateBallPosition(id: number, x: number, y: number, z: number): void;
  /** Hide ball with a sink animation. Replay-driver calls this instead of setting visible=false directly. */
  hideBall?: (id: number) => void;
  /**
   * Switch to/from strict orthographic top-down view.
   * true  → OrthographicCamera at (0,5,0) looking straight down, orbit controls disabled.
   * false → restore PerspectiveCamera + orbit controls.
   */
  setOrthoTop(active: boolean): void;
  /** Toggle physics collision boundary overlay (cyan lines, default off). */
  toggleColliders?(): void;
  /**
   * Phase 1 #7a A-1′ — GPU max anisotropy + table/ball texture effective values.
   * Probe page must print this (CTO / 鼬 gate).
   */
  getAnisotropyReport(): AnisotropyReport;
  render(): void;
  dispose(): void;
}

// ─── Scene Creation ──────────────────────────────────────────────────────────

export async function createScene(container: HTMLElement): Promise<SceneAPI> {
  // Renderer
  // preserveDrawingBuffer: allows Playwright/pixel-sampling smoke tests to read canvas pixels
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  // Environment map for clearcoat reflections on PBR ball materials.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // Perspective camera — play view (SP-Harden-3b: short-landscape pulls back)
  const initW = container.clientWidth || window.innerWidth;
  const initH = container.clientHeight || window.innerHeight;
  const aspect = initW / Math.max(1, initH);
  const initView = getPlayView(initW, initH);
  const camera = new THREE.PerspectiveCamera(initView.fov, aspect, 0.1, 50);
  camera.position.set(...initView.pose.position);
  camera.lookAt(...initView.pose.lookAt);

  // Orthographic camera — strict top-down view for 'T' mode
  // up=(0,0,-1): -Z is screen-up, avoids degenerate lookAt along -Y with default up=(0,1,0).
  const [ol, or_, ot, ob] = orthoFrustum(aspect);
  const orthoCam = new THREE.OrthographicCamera(ol, or_, ot, ob, 0.1, 50);
  orthoCam.position.set(0, 5, 0);
  orthoCam.up.set(0, 0, -1);
  orthoCam.lookAt(0, 0, 0);

  let _useOrtho = false;

  // OrbitControls — right-click rotate, middle-click pan (left-click reserved for shooting)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.mouseButtons = {
    LEFT: null as unknown as THREE.MOUSE,       // disabled — used by input-handler
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };

  // ─── Lighting ────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  // Table lamp (overhead)
  const spotLight = new THREE.SpotLight(0xfff5e0, 2, 6, Math.PI / 4, 0.5, 1);
  spotLight.position.set(0, 2, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(1024, 1024);
  scene.add(spotLight);

  const pointLight = new THREE.PointLight(0xfff0d0, 0.5, 5);
  pointLight.position.set(0, 1.5, 0);
  scene.add(pointLight);

  // ─── Table (PoolTable.glb — TurboSquid 9ft regulation, Blender pack, Y-up, cm) ──
  const tableGroup = new THREE.Group();

  const gltf = await new GLTFLoader().loadAsync('/PoolTable.glb');
  const model = gltf.scene;

  // Single PBR material (commercial_pool_table_mat) — preserve GLTF maps as-is,
  // then Phase 1 #7a A-1′ anisotropy (unless ?tableAniso=0 for A/B baseline).
  model.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  const _tableAnisoOff =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('tableAniso') === '0';
  applyTableAnisotropy(renderer, model, !_tableAnisoOff);

  const rawBox = new THREE.Box3().setFromObject(model);
  // ⚠️ INTENTIONAL DEVIATION from Unity source — CEO decision 3fa92431 "physics follows model".
  // Rail tops protrude 51.5mm above felt (5.15cm). Measured: rail top rawY≈83.73cm, felt rawY≈78.58cm.
  // DO NOT revert to 0.509 (was wrong by ×10 — caused 46mm ball float, C4 bug).
  const rawFeltTopY = rawBox.max.y - 5.15;

  // Scale = 0.01: cm → m. Regulation 9ft cushion nose-to-nose = 254×127 cm → 2.54×1.27 m ≡ physics.
  const scaleU = 0.01;

  const rawCenter = new THREE.Vector3();
  rawBox.getCenter(rawCenter);

  model.scale.set(scaleU, scaleU, scaleU);
  // ⚠️ INTENTIONAL DEVIATION — CEO decision 3fa92431 C2: center on playing-field, not bbox.
  // 鼬 raycast: long-rail nose x midpoint = rawCenter.x − 0.2592cm (native GLB).
  // Centering on playing-field pulls long-rail asymmetry from −8.9/+3.7mm → ±6.3mm symmetric.
  const rawPlayCenterX = rawCenter.x - 0.2592; // measured GLB offset; DO NOT remove
  model.position.set(
    -rawPlayCenterX * scaleU,
    -rawFeltTopY * scaleU,   // felt top → scene Y=0
    -rawCenter.z * scaleU,
  );

  tableGroup.add(model);

  // Pocket hole discs at sim POCKET_POSITIONS — visual reference for ball-sink animations.
  // Positions are derived from physics constants so they always align with the sim triggers.
  createPocketMeshes(tableGroup);

  scene.add(tableGroup);

  // ─── Physics collision debug overlay (off by default, toggle via API) ────
  const colliderDebug = createColliderDebug();
  scene.add(colliderDebug);

  // ─── Balls ───────────────────────────────────────────────────────────
  // SDF fragment shader (CEO bake-off Method C) via makeBallMaterial():
  //   Cue (0): plain white PBR, no injection.
  //   Solid (1-7, 8): per-ball color + two white-disc+number patches at ±Z poles.
  //   Stripe (9-15): white body + narrow equatorial color band + equatorial number patches.
  // Sphere segments 48×32 — smooth enough for closeup PBR without being excessive.
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 48, 32);
  const balls: THREE.Mesh[] = [];

  for (let i = 0; i < 16; i++) {
    const ball = new THREE.Mesh(ballGeo, makeBallMaterial(i));
    ball.castShadow = true;
    balls.push(ball);
    scene.add(ball);
  }

  // ─── Per-ball last-rendered position for rolling rotation ───────────
  // Null until the ball's first updateBallPosition call; avoids spurious
  // rotation from the arbitrary gap between initial placement and first replay.
  const _ballPrevPos: (THREE.Vector3 | null)[] = Array.from({ length: 16 }, () => null);
  // Pre-allocated temporaries — reused every frame to avoid GC pressure.
  const _rotAxis = new THREE.Vector3();
  const _rotDq   = new THREE.Quaternion();

  // ─── Initial ball positions (standard rack) ────────────────────────
  // Cue ball at left 1/4
  balls[0].position.set(-TABLE_W / 4, BALL_RADIUS, 0);

  // Triangle rack at right 1/4
  const rackX = TABLE_W / 4;
  const spacing = BALL_RADIUS * 2 + 0.001; // Touching
  // Standard 8-ball rack order (8 in center)
  const rackOrder = [1, 2, 3, 8, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = rackX + row * spacing * Math.cos(Math.PI / 6);
      const z = (col - row / 2) * spacing;
      const ballId = rackOrder[idx];
      balls[ballId].position.set(x, BALL_RADIUS, z);
      idx++;
    }
  }

  // ─── Resize handler ──────────────────────────────────────────────────
  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const asp = w / Math.max(1, h);
    // SP-Harden-3b: reframe perspective play view on short landscape so corners
    // aren't clipped by top HUD / bottom pill (only when not mid-orbit away from play).
    const view = getPlayView(w, h);
    camera.fov = view.fov;
    camera.aspect = asp;
    // Re-apply play pose only when orbit target is still table centre (user hasn't
    // panned away). Avoid fighting free orbit exploration.
    const tgt = controls.target;
    if (Math.hypot(tgt.x, tgt.z) < 0.15) {
      camera.position.set(...view.pose.position);
      camera.lookAt(...view.pose.lookAt);
      controls.target.set(0, 0, 0);
    }
    camera.updateProjectionMatrix();
    // Update ortho frustum so table still fills view after resize
    const [l, r, t, b] = orthoFrustum(asp);
    orthoCam.left = l; orthoCam.right = r;
    orthoCam.top = t; orthoCam.bottom = b;
    orthoCam.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // ─── API ─────────────────────────────────────────────────────────────
  return {
    renderer,
    camera,
    get activeCamera(): THREE.Camera { return _useOrtho ? orthoCam : camera; },
    scene,
    balls,
    table: tableGroup,
    updateBallPosition(id: number, x: number, y: number, z: number) {
      const mesh = balls[id];
      if (!mesh) return;
      // Rolling rotation from position delta (no-slip: arc = R·θ).
      // Only horizontal displacement (XZ plane) drives rolling; Y is vertical.
      // axis = normalize(Δz, 0, −Δx) — perpendicular to direction of motion in XZ.
      const prev = _ballPrevPos[id];
      if (prev !== null) {
        const dx = x - prev.x;
        const dz = z - prev.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 1e-6) {
          _rotAxis.set(dz / dist, 0, -dx / dist);
          _rotDq.setFromAxisAngle(_rotAxis, dist / BALL_RADIUS);
          mesh.quaternion.premultiply(_rotDq);
        }
        prev.set(x, y, z);
      } else {
        _ballPrevPos[id] = new THREE.Vector3(x, y, z);
      }
      mesh.position.set(x, y, z);
    },
    hideBall(id: number) {
      const mesh = balls[id];
      if (!mesh || !mesh.visible) return;
      animateBallSink(mesh, scene);  // visual clone sinks before disappearing
      mesh.visible = false;
    },
    setOrthoTop(active: boolean): void {
      _useOrtho = active;
      // Orbit controls orbit the perspective camera only; disable in ortho to avoid confusion.
      controls.enabled = !active;
    },
    toggleColliders(): void {
      colliderDebug.visible = !colliderDebug.visible;
    },
    getAnisotropyReport(): AnisotropyReport {
      return buildAnisotropyReport(renderer, tableGroup, balls, !_tableAnisoOff);
    },
    render() {
      controls.update();
      renderer.render(scene, _useOrtho ? orthoCam : camera);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
