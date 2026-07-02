/**
 * 8BP v2.1 F-③ C-1 H-3: CueAdapter tap-to-aim integration tests.
 *
 * Drives the SHIPPING pointer handler path (onPointerDown/onPointerMove/onPointerUp)
 * via a lightweight event-capture harness — no jsdom, no pure-function re-implementation.
 *
 * Coverage:
 *   - C-1: tap direction = positive toward tap point (not reversed)
 *   - H-3: NO time gate — any elapsed with small displacement is a tap
 *   - Drag (displacement > TAP_MOVE_THRESH) → NOT a tap path
 *   - TAP_MOVE_THRESH export constant
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { createCueAdapter, TAP_MOVE_THRESH } from '../../game/cue-adapter';
import type { CueController, TablePoint } from '../../game/cue-controller';

// ─── Stubs for document/window (adapter registers key+blur listeners on them) ──

let _origDoc: unknown, _origWin: unknown;
beforeAll(() => {
  _origDoc = (global as Record<string, unknown>).document;
  _origWin = (global as Record<string, unknown>).window;
  (global as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  (global as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {} };
});
afterAll(() => {
  (global as Record<string, unknown>).document = _origDoc;
  (global as Record<string, unknown>).window = _origWin;
});

// ─── Harness helpers ─────────────────────────────────────────────────────────

/**
 * Minimal element mock that captures addEventListener callbacks for direct invocation.
 * getBoundingClientRect returns a fixed 200×200 rect at origin.
 */
function makeEventCapture(w = 200, h = 200) {
  const _map: Record<string, EventListener> = {};
  const el = {
    addEventListener(type: string, fn: EventListener) { _map[type] = fn; },
    removeEventListener(type: string, fn: EventListener) {
      if (_map[type] === fn) delete _map[type];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
    },
    setPointerCapture() {},
  } as unknown as HTMLElement;

  function fire(type: string, init: { clientX: number; clientY: number; timeStamp?: number }): void {
    const e = {
      type,
      clientX: init.clientX,
      clientY: init.clientY,
      timeStamp: init.timeStamp ?? 0,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    _map[type]?.(e as unknown as Event);
  }

  return { el, fire };
}

/**
 * Recording controller that captures onDragStart / onDragMove / cancel calls.
 * The tap path calls onDragStart+onDragMove+cancel after the normal pointerdown
 * onDragStart, so a successful tap produces starts.length >= 2.
 */
function makeRecording() {
  const starts: TablePoint[] = [];
  const moves: TablePoint[] = [];
  let cancelCount = 0;

  const ctrl: CueController = {
    phase: 'idle' as const,
    isEnabled: true,
    aimLineVisible: true,
    onShotApplied: null,
    onShotData: null,
    onDragStart(pt: TablePoint) { starts.push({ x: pt.x, z: pt.z }); },
    onDragMove(pt: TablePoint) { moves.push({ x: pt.x, z: pt.z }); },
    onDragEnd: () => false,
    cancel() { cancelCount++; },
    getPowerFraction: () => 0,
    getAimHit: () => null,
    hasEnergy: () => true,
    dragDistToForce: () => 0,
    setSpinOffset: () => {},
    getSpinOffset: () => ({ x: 0, y: 0 }),
    setVerticalAngle: () => {},
    getVerticalAngle: () => 0,
    enable: () => {},
    disable: () => {},
    fireNow: () => false,
    resetForNewTurn: () => {},
    getAimState: () => ({ start: null, current: null }),
    setFineAimCurrent: () => {},
    toggleAimLine: () => {},
  };

  return { ctrl, starts, moves, get cancelCount() { return cancelCount; } };
}

/**
 * PerspectiveCamera at (0, 4, 3) looking at origin — avoids straight-down singularity.
 * Right half of canvas (clientX > width/2) maps to positive world X.
 */
function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 4, 3);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

const CUE_BALL = { x: 0, z: 0 };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CueAdapter tap-to-aim — drives shipping pointer handler path', () => {
  it('TAP_MOVE_THRESH is 10px', () => {
    expect(TAP_MOVE_THRESH).toBe(10);
  });

  it('C-1: right-half tap → aim direction has positive X (toward tap)', () => {
    const { el, fire } = makeEventCapture();
    const { ctrl, starts, moves } = makeRecording();
    createCueAdapter({
      camera: makeCamera(),
      element: el,
      cueBallMesh: new THREE.Mesh(),
      controller: ctrl,
      getCueBallWorld: () => CUE_BALL,
    });

    // Tiny displacement, any duration — pure displacement gate after Fix 1
    fire('pointerdown', { clientX: 150, clientY: 100, timeStamp: 0 });
    fire('pointerup',   { clientX: 151, clientY: 100, timeStamp: 100 });

    // pointerdown calls onDragStart once; tap path in pointerup calls it again
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const tapStart   = starts[starts.length - 1];  // tap pair.start
    const tapCurrent = moves[moves.length - 1];     // tap pair.current = cueBall

    // C-1: (start − current) must point rightward toward tap
    expect(tapStart.x - tapCurrent.x).toBeGreaterThan(0);
  });

  it('C-1 NOT reversed: left-half tap → aim direction has negative X', () => {
    const { el, fire } = makeEventCapture();
    const { ctrl, starts, moves } = makeRecording();
    createCueAdapter({
      camera: makeCamera(),
      element: el,
      cueBallMesh: new THREE.Mesh(),
      controller: ctrl,
      getCueBallWorld: () => CUE_BALL,
    });

    fire('pointerdown', { clientX: 50, clientY: 100, timeStamp: 0 });
    fire('pointerup',   { clientX: 51, clientY: 100, timeStamp: 100 });

    expect(starts.length).toBeGreaterThanOrEqual(2);
    const tapStart   = starts[starts.length - 1];
    const tapCurrent = moves[moves.length - 1];
    expect(tapStart.x - tapCurrent.x).toBeLessThan(0);
  });

  it('H-3: 300ms elapsed (> old 200ms hard gate) → STILL a tap (no time gate)', () => {
    const { el, fire } = makeEventCapture();
    const { ctrl, starts } = makeRecording();
    createCueAdapter({
      camera: makeCamera(),
      element: el,
      cueBallMesh: new THREE.Mesh(),
      controller: ctrl,
      getCueBallWorld: () => CUE_BALL,
    });

    // 2px displacement, 300ms — previously swallowed by elapsed < 200ms hard gate
    fire('pointerdown', { clientX: 150, clientY: 100, timeStamp: 0 });
    fire('pointerup',   { clientX: 152, clientY: 100, timeStamp: 300 });

    // tap path must fire → second onDragStart exists
    expect(starts.length).toBeGreaterThanOrEqual(2);
  });

  it('H-3: 700ms elapsed with tiny displacement → STILL a tap', () => {
    const { el, fire } = makeEventCapture();
    const { ctrl, starts } = makeRecording();
    createCueAdapter({
      camera: makeCamera(),
      element: el,
      cueBallMesh: new THREE.Mesh(),
      controller: ctrl,
      getCueBallWorld: () => CUE_BALL,
    });

    fire('pointerdown', { clientX: 150, clientY: 100, timeStamp: 0 });
    fire('pointerup',   { clientX: 151, clientY: 100, timeStamp: 700 });

    expect(starts.length).toBeGreaterThanOrEqual(2);
  });

  it('drag (displacement > TAP_MOVE_THRESH via pointermove) → NOT tap path', () => {
    const { el, fire } = makeEventCapture();
    const { ctrl, starts } = makeRecording();
    createCueAdapter({
      camera: makeCamera(),
      element: el,
      cueBallMesh: new THREE.Mesh(),
      controller: ctrl,
      getCueBallWorld: () => CUE_BALL,
    });

    fire('pointerdown', { clientX: 100, clientY: 100, timeStamp: 0 });
    fire('pointermove', { clientX: 120, clientY: 100, timeStamp: 50 }); // 20px → clears _tapEligible
    fire('pointerup',   { clientX: 120, clientY: 100, timeStamp: 200 });

    // Drag path: only the initial pointerdown onDragStart, NO second from tap pair
    expect(starts).toHaveLength(1);
  });
});
