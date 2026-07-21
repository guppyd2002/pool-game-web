/**
 * Three.js pool table scene — 16 balls, table, cushions, lighting.
 * No physics integration (T09). Pure rendering.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPocketMeshes, animateBallSink } from './pocket-visuals';
import { createColliderDebug } from './debug-colliders';

// ─── Constants ───────────────────────────────────────────────────────────────

// Table dimensions (meters, standard 8-ball)
const TABLE_W = 2.54;
const TABLE_H = 1.27;
const BALL_RADIUS = 0.028;

// Ball colors: index 0=cue, 1-7=solids, 8=black, 9-15=stripes
const BALL_COLORS: number[] = [
  0xffffff, // 0: cue (white)
  0xffd700, // 1: yellow
  0x0000cc, // 2: blue
  0xcc0000, // 3: red
  0x800080, // 4: purple
  0xff6600, // 5: orange
  0x006600, // 6: green
  0x8b4513, // 7: brown/maroon
  0x000000, // 8: black
  0xffd700, // 9: yellow stripe
  0x0000cc, // 10: blue stripe
  0xcc0000, // 11: red stripe
  0x800080, // 12: purple stripe
  0xff6600, // 13: orange stripe
  0x006600, // 14: green stripe
  0x8b4513, // 15: brown stripe
];

// Ortho top-view frustum: table half-extents + 15% margin.
// Camera sits at (0,5,0) looking straight down, up=(0,0,-1) to avoid gimbal lock.
const ORTHO_HALF_X = (TABLE_W / 2) * 1.15;  // ~1.46 m (long axis)
const ORTHO_HALF_Z = (TABLE_H / 2) * 1.15;  // ~0.73 m (short axis)

/** Compute OrthographicCamera frustum that fits the whole table for the given viewport aspect. */
function orthoFrustum(aspect: number): [number, number, number, number] {
  const tableAspect = ORTHO_HALF_X / ORTHO_HALF_Z;
  // Fit whichever dimension is the constraint; expand the other to fill screen.
  const hw = aspect >= tableAspect ? ORTHO_HALF_Z * aspect : ORTHO_HALF_X;
  const hh = aspect >= tableAspect ? ORTHO_HALF_Z          : ORTHO_HALF_X / aspect;
  return [-hw, hw, hh, -hh]; // left, right, top, bottom
}

// ─── Scene API Interface ─────────────────────────────────────────────────────

export interface SceneAPI {
  renderer: THREE.WebGLRenderer;
  /** Perspective camera (always exists; used by tweens and orbit controls). */
  camera: THREE.PerspectiveCamera;
  /** Currently active camera — perspective normally, ortho when setOrthoTop(true). */
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

  // Perspective camera — 45° overhead view (default / play mode)
  const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50);
  camera.position.set(0, 2.5, 1.8);
  camera.lookAt(0, 0, 0);

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

  // Single PBR material (commercial_pool_table_mat) — preserve GLTFLoader output as-is.
  model.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

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
  // Standard 8-ball visual convention:
  //   Solid (1-7):  entire ball = BALL_COLORS[i]
  //   Stripe (9-15): white body + wide coloured band (BALL_COLORS[i])
  //   Cue (0): white; 8-ball: black — both use BALL_COLORS[i] unchanged.
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
  const balls: THREE.Mesh[] = [];

  for (let i = 0; i < 16; i++) {
    // Stripe balls (9-15): white body so the colour band is clearly distinct from solids.
    // Solid balls and special balls (0 cue, 8 eight-ball): full colour body.
    const isStripe = i >= 9;
    const bodyColor = isStripe ? 0xffffff : BALL_COLORS[i];
    const mat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.3,
      metalness: 0.1,
    });
    const ball = new THREE.Mesh(ballGeo, mat);
    ball.castShadow = true;

    if (isStripe) {
      // Colour band: BALL_COLORS[i] on a white body = standard stripe appearance.
      // Height R×1.0 and radius R×1.005 (slightly proud of sphere to avoid z-fighting).
      const bandGeo = new THREE.CylinderGeometry(
        BALL_RADIUS * 1.005, BALL_RADIUS * 1.005, BALL_RADIUS * 1.0, 16, 1, true,
      );
      const bandMat = new THREE.MeshStandardMaterial({ color: BALL_COLORS[i], roughness: 0.3 });
      const band = new THREE.Mesh(bandGeo, bandMat);
      ball.add(band);
    }

    balls.push(ball);
    scene.add(ball);
  }

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
    const asp = w / h;
    // Update perspective camera aspect
    camera.aspect = asp;
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
      if (balls[id]) balls[id].position.set(x, y, z);
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
