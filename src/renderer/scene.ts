/**
 * Three.js pool table scene — 16 balls, table, cushions, lighting.
 * No physics integration (T09). Pure rendering.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Constants ───────────────────────────────────────────────────────────────

// Table dimensions (meters, standard 8-ball)
const TABLE_W = 2.54;
const TABLE_H = 1.27;
const CUSHION_HEIGHT = 0.04;
const CUSHION_WIDTH = 0.05;
const RAIL_WIDTH = 0.08;
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

// ─── Scene API Interface ─────────────────────────────────────────────────────

export interface SceneAPI {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  balls: THREE.Mesh[];
  table: THREE.Group;
  updateBallPosition(id: number, x: number, y: number, z: number): void;
  render(): void;
  dispose(): void;
}

// ─── Scene Creation ──────────────────────────────────────────────────────────

export function createScene(container: HTMLElement): SceneAPI {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  // Camera — 45° overhead view
  const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 50);
  camera.position.set(0, 2.5, 1.8);
  camera.lookAt(0, 0, 0);

  // OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;

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

  // ─── Table ───────────────────────────────────────────────────────────
  const tableGroup = new THREE.Group();

  // Felt surface (play area)
  const feltGeo = new THREE.PlaneGeometry(TABLE_W, TABLE_H);
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x0d6b32, roughness: 0.9 });
  const felt = new THREE.Mesh(feltGeo, feltMat);
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  tableGroup.add(felt);

  // Rail (outer frame)
  const railMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.6 });
  const railH = RAIL_WIDTH;
  const railY = CUSHION_HEIGHT / 2;

  // Long rails (left/right along Z)
  const longRailGeo = new THREE.BoxGeometry(RAIL_WIDTH, CUSHION_HEIGHT, TABLE_H + RAIL_WIDTH * 2);
  const railL = new THREE.Mesh(longRailGeo, railMat);
  railL.position.set(-(TABLE_W / 2 + RAIL_WIDTH / 2), railY, 0);
  railL.castShadow = true;
  tableGroup.add(railL);
  const railR = new THREE.Mesh(longRailGeo, railMat);
  railR.position.set(TABLE_W / 2 + RAIL_WIDTH / 2, railY, 0);
  railR.castShadow = true;
  tableGroup.add(railR);

  // Short rails (top/bottom along X)
  const shortRailGeo = new THREE.BoxGeometry(TABLE_W + RAIL_WIDTH * 2, CUSHION_HEIGHT, RAIL_WIDTH);
  const railT = new THREE.Mesh(shortRailGeo, railMat);
  railT.position.set(0, railY, -(TABLE_H / 2 + RAIL_WIDTH / 2));
  railT.castShadow = true;
  tableGroup.add(railT);
  const railB = new THREE.Mesh(shortRailGeo, railMat);
  railB.position.set(0, railY, TABLE_H / 2 + RAIL_WIDTH / 2);
  railB.castShadow = true;
  tableGroup.add(railB);

  // Cushions (green rubber on inner edge)
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0x0a5e2a, roughness: 0.7 });
  // Left/right cushions
  const cushionLongGeo = new THREE.BoxGeometry(CUSHION_WIDTH, CUSHION_HEIGHT, TABLE_H - 0.1);
  const cL = new THREE.Mesh(cushionLongGeo, cushionMat);
  cL.position.set(-(TABLE_W / 2 - CUSHION_WIDTH / 2), railY, 0);
  tableGroup.add(cL);
  const cR = new THREE.Mesh(cushionLongGeo, cushionMat);
  cR.position.set(TABLE_W / 2 - CUSHION_WIDTH / 2, railY, 0);
  tableGroup.add(cR);
  // Top/bottom cushions
  const cushionShortGeo = new THREE.BoxGeometry(TABLE_W - 0.1, CUSHION_HEIGHT, CUSHION_WIDTH);
  const cT = new THREE.Mesh(cushionShortGeo, cushionMat);
  cT.position.set(0, railY, -(TABLE_H / 2 - CUSHION_WIDTH / 2));
  tableGroup.add(cT);
  const cBt = new THREE.Mesh(cushionShortGeo, cushionMat);
  cBt.position.set(0, railY, TABLE_H / 2 - CUSHION_WIDTH / 2);
  tableGroup.add(cBt);

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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // ─── API ─────────────────────────────────────────────────────────────
  return {
    renderer,
    camera,
    scene,
    balls,
    table: tableGroup,
    updateBallPosition(id: number, x: number, y: number, z: number) {
      if (balls[id]) balls[id].position.set(x, y, z);
    },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
