/**
 * P1-T12: Input handler unit tests.
 *
 * Tests the PointerStateMachine (pure logic layer) which is the INFRA-015 MouseInfo
 * + INFRA-017 ZoomManager equivalent.  The state machine is framework-agnostic so
 * these tests run in the node environment without jsdom or THREE.js.
 *
 * Covered AC:
 *   - pointer down/move/up state transitions
 *   - single-touch maps to pointer down/move/up
 *   - two-touch pinch → zoomDelta (INFRA-017)
 *   - mouse wheel → zoomDelta desktop fallback (INFRA-017)
 */
import { describe, it, expect } from 'vitest';
import {
  PointerStateMachine,
  type InputPoint,
} from '../../game/unified-input';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P = (x: number, y: number): InputPoint => ({ x, y });

// ─── Pointer state machine ─────────────────────────────────────────────────────

describe('PointerStateMachine — pointer events', () => {
  it('initial phase is none', () => {
    const sm = new PointerStateMachine();
    expect(sm.phase).toBe('none');
  });

  it('feedPointerDown → phase=down, position captured', () => {
    const sm = new PointerStateMachine();
    const snap = sm.feedPointerDown(120, 340);
    expect(snap.phase).toBe('down');
    expect(snap.position.x).toBe(120);
    expect(snap.position.y).toBe(340);
    expect(snap.isTwoTouch).toBe(false);
  });

  it('feedPointerDown → feedPointerMove → phase=press, position updated', () => {
    const sm = new PointerStateMachine();
    sm.feedPointerDown(100, 200);
    const snap = sm.feedPointerMove(150, 250);
    expect(snap.phase).toBe('press');
    expect(snap.position.x).toBe(150);
    expect(snap.position.y).toBe(250);
  });

  it('feedPointerDown → feedPointerUp → phase=up, position at release point', () => {
    const sm = new PointerStateMachine();
    sm.feedPointerDown(100, 200);
    const snap = sm.feedPointerUp(300, 400);
    expect(snap.phase).toBe('up');
    expect(snap.position.x).toBe(300);
    expect(snap.position.y).toBe(400);
  });

  it('feedPointerDown → feedPointerMove → feedPointerUp → phase=up', () => {
    const sm = new PointerStateMachine();
    sm.feedPointerDown(0, 0);
    sm.feedPointerMove(50, 50);
    const snap = sm.feedPointerUp(100, 100);
    expect(snap.phase).toBe('up');
  });

  it('feedPointerMove before down → stays none (no accidental press)', () => {
    const sm = new PointerStateMachine();
    const snap = sm.feedPointerMove(100, 200);
    expect(snap.phase).toBe('none');
  });

  it('feedPointerUp before down → stays none (no spurious up)', () => {
    const sm = new PointerStateMachine();
    const snap = sm.feedPointerUp(100, 200);
    expect(snap.phase).toBe('none');
  });

  it('after up, next feedPointerDown starts fresh down', () => {
    const sm = new PointerStateMachine();
    sm.feedPointerDown(0, 0);
    sm.feedPointerUp(100, 0);
    const snap = sm.feedPointerDown(200, 0);
    expect(snap.phase).toBe('down');
  });

  it('reset() clears any state back to none', () => {
    const sm = new PointerStateMachine();
    sm.feedPointerDown(50, 50);
    sm.feedPointerMove(80, 80);
    sm.reset();
    expect(sm.phase).toBe('none');
    expect(sm.isTwoTouch).toBe(false);
  });
});

// ─── Touch events (single-finger maps to pointer) ────────────────────────────

describe('PointerStateMachine — touch events', () => {
  it('single touchStart → phase=down, isTwoTouch=false', () => {
    const sm = new PointerStateMachine();
    const snap = sm.feedTouchStart([P(200, 300)]);
    expect(snap.phase).toBe('down');
    expect(snap.isTwoTouch).toBe(false);
    expect(snap.position.x).toBe(200);
  });

  it('single touchStart → touchMove → phase=press', () => {
    const sm = new PointerStateMachine();
    sm.feedTouchStart([P(100, 100)]);
    const snap = sm.feedTouchMove([P(150, 120)]);
    expect(snap.phase).toBe('press');
    expect(snap.position.x).toBe(150);
  });

  it('single touchStart → touchEnd → phase=up', () => {
    const sm = new PointerStateMachine();
    sm.feedTouchStart([P(100, 100)]);
    const snap = sm.feedTouchEnd([]);
    expect(snap.phase).toBe('up');
  });

  it('two-touch start → isTwoTouch=true, phase=none (no shot while pinching)', () => {
    const sm = new PointerStateMachine();
    const snap = sm.feedTouchStart([P(100, 200), P(300, 200)]);
    expect(snap.isTwoTouch).toBe(true);
    expect(snap.phase).toBe('none');
  });

  it('drop from 2 touches to 1 → isTwoTouch cleared, phase=none (no accidental shot)', () => {
    const sm = new PointerStateMachine();
    sm.feedTouchStart([P(100, 200), P(300, 200)]);
    const snap = sm.feedTouchEnd([P(100, 200)]);
    expect(snap.isTwoTouch).toBe(false);
    expect(snap.phase).toBe('none');
  });
});

// ─── Pinch-to-zoom (INFRA-017) ────────────────────────────────────────────────

describe('PointerStateMachine — pinch zoom', () => {
  it('pinch open (fingers spread) → zoomDelta > 0 (zoom in)', () => {
    const sm = new PointerStateMachine();
    // Initial distance = 100
    sm.feedTouchStart([P(100, 200), P(200, 200)]);
    // New distance = 200 (spread apart)
    const result = sm.feedPinch([P(50, 200), P(250, 200)]);
    expect(result.zoomDelta).toBeGreaterThan(0);
  });

  it('pinch close (fingers squeeze) → zoomDelta < 0 (zoom out)', () => {
    const sm = new PointerStateMachine();
    // Initial distance = 200
    sm.feedTouchStart([P(50, 200), P(250, 200)]);
    // New distance = 60 (pinched closer)
    const result = sm.feedPinch([P(120, 200), P(180, 200)]);
    expect(result.zoomDelta).toBeLessThan(0);
  });

  it('pinch delta magnitude proportional to distance change', () => {
    const sm = new PointerStateMachine();
    sm.feedTouchStart([P(0, 0), P(100, 0)]); // dist=100

    const smallSpread = sm.feedPinch([P(0, 0), P(110, 0)]);  // dist=110, delta=+10
    sm.feedTouchStart([P(0, 0), P(100, 0)]); // reset
    const largeSpread = sm.feedPinch([P(0, 0), P(200, 0)]);  // dist=200, delta=+100

    expect(largeSpread.zoomDelta).toBeGreaterThan(smallSpread.zoomDelta);
  });

  it('feedPinch accumulates from last position (incremental)', () => {
    const sm = new PointerStateMachine();
    sm.feedTouchStart([P(0, 0), P(100, 0)]); // dist=100
    const r1 = sm.feedPinch([P(0, 0), P(150, 0)]); // dist=150, delta=+50
    const r2 = sm.feedPinch([P(0, 0), P(200, 0)]); // dist=200, delta=+50
    // Both increments are equal (50 each)
    expect(Math.abs(r1.zoomDelta - r2.zoomDelta)).toBeLessThan(0.001);
  });
});

// ─── Mouse wheel zoom fallback (INFRA-017, desktop) ──────────────────────────

describe('PointerStateMachine — wheel zoom', () => {
  it('scroll up (deltaY < 0) → zoomDelta > 0 (zoom in)', () => {
    const sm = new PointerStateMachine();
    const result = sm.feedWheel(-100);
    expect(result.zoomDelta).toBeGreaterThan(0);
  });

  it('scroll down (deltaY > 0) → zoomDelta < 0 (zoom out)', () => {
    const sm = new PointerStateMachine();
    const result = sm.feedWheel(100);
    expect(result.zoomDelta).toBeLessThan(0);
  });

  it('wheel zoom magnitude is proportional to deltaY', () => {
    const sm = new PointerStateMachine();
    const small = sm.feedWheel(-50);
    const large = sm.feedWheel(-500);
    expect(large.zoomDelta).toBeGreaterThan(small.zoomDelta);
  });

  it('wheel zoom delta is normalized (not raw pixels)', () => {
    const sm = new PointerStateMachine();
    // A 100px wheel event should produce a delta well within [-1, 1] range
    const result = sm.feedWheel(100);
    expect(Math.abs(result.zoomDelta)).toBeLessThan(5);
  });
});
