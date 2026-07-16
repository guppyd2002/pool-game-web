/**
 * Three.js pool table scene — 16 balls, table, cushions, lighting.
 * No physics integration (T09). Pure rendering.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPocketMeshes, animateBallSink } from './pocket-visuals';

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

  // ─── Table (PoolTable.glb — Unity FBX source, Blender 4.2 re-export) ─────────
  const tableGroup = new THREE.Group();

  const gltf = await new GLTFLoader().loadAsync('/PoolTable.glb');
  const model = gltf.scene;

  // GLB playing-surface dimensions measured by 鼬 from upward top face.
  // Full Sukno slab bounding-box X ≈ 2682 (includes apron); playing surface X = 2622.
  // GLB felt aspect ≈1.773:1; physics TABLE_W:TABLE_H = 2.54:1.27 = 2.00:1.
  // Non-uniform scale: X→TABLE_W, Z→TABLE_H so all four cushions align to physics extents.
  const GLB_PLAY_X = 2622.00;  // raw GLB units, long axis → scene X
  const GLB_PLAY_Z = 1512.58;  // raw GLB units, short axis → scene Z

  let rawFeltTopY = 0;
  model.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat.name === 'Sukno') {
        rawFeltTopY = new THREE.Box3().setFromObject(obj).max.y;
        // GLB baseColor map is grey-scale weave detail; tint green (color × map = green felt)
        (mat as THREE.MeshStandardMaterial).color.set(0x0d6b32);
      }
    }
  });

  const rawBox = new THREE.Box3().setFromObject(model);
  if (rawFeltTopY === 0) rawFeltTopY = rawBox.max.y;

  const scaleX = TABLE_W / GLB_PLAY_X;  // 2.54 / 2622.00 ≈ 9.687e-4
  const scaleZ = TABLE_H / GLB_PLAY_Z;  // 1.27 / 1512.58 ≈ 8.395e-4
  const scaleY = scaleX;                // height proportional to long axis

  const rawCenter = new THREE.Vector3();
  rawBox.getCenter(rawCenter);

  model.scale.set(scaleX, scaleY, scaleZ);
  model.position.set(
    -rawCenter.x * scaleX,
    -rawFeltTopY * scaleY,   // felt top → scene Y=0
    -rawCenter.z * scaleZ,
  );

  model.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  tableGroup.add(model);

  // Pocket hole discs at sim POCKET_POSITIONS — visual reference for ball-sink animations.
  // Positions are derived from physics constants so they always align with the sim triggers.
  createPocketMeshes(tableGroup);

  scene.add(tableGroup);

  // ─── Balls ───────────────────────────────────────────────────────────
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
  const balls: THREE.Mesh[] = [];

  for (let i = 0; i < 16; i++) {
    const isStripe = i >= 9;
    const mat = new THREE.MeshStandardMaterial({
      color: BALL_COLORS[i],
      roughness: 0.3,
      metalness: 0.1,
    });
    const ball = new THREE.Mesh(ballGeo, mat);
    ball.castShadow = true;

    // Add stripe band for balls 9-15
    if (isStripe) {
      const bandGeo = new THREE.CylinderGeometry(BALL_RADIUS * 1.01, BALL_RADIUS * 1.01, BALL_RADIUS * 0.8, 16, 1, true);
      const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
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
