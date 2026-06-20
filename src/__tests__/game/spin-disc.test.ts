/**
 * CUE-006: SpinDisc domain logic tests — event-driven port of C# CueTargetingUIManager.
 *
 * C# dead-wait coroutine `while(Input.GetMouseButton)` → pointer event callbacks.
 * C# TriggerOthers(false/true) = onOpen/onClose → caller wires CUE-019 adapter mutex.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeSpinFromPosition, createSpinDisc } from '../../game/spin-disc';

// ─── computeSpinFromPosition ─────────────────────────────────────────────────

describe('computeSpinFromPosition — unit circle clamp', () => {
  it('center (0,0): returns (0,0)', () => {
    const r = computeSpinFromPosition(0, 0);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('right rim (1,0): unchanged', () => {
    const r = computeSpinFromPosition(1, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });

  it('left rim (-1,0): unchanged', () => {
    const r = computeSpinFromPosition(-1, 0);
    expect(r.x).toBeCloseTo(-1);
    expect(r.y).toBeCloseTo(0);
  });

  it('top rim (0,1): unchanged', () => {
    const r = computeSpinFromPosition(0, 1);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('bottom rim (0,-1): unchanged', () => {
    const r = computeSpinFromPosition(0, -1);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-1);
  });

  it('outside right (2,0): clamped to (1,0)', () => {
    const r = computeSpinFromPosition(2, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });

  it('outside left (-3,0): clamped to (-1,0)', () => {
    const r = computeSpinFromPosition(-3, 0);
    expect(r.x).toBeCloseTo(-1);
    expect(r.y).toBeCloseTo(0);
  });

  it('inside diagonal (0.5,0.5): unchanged (length < 1)', () => {
    const r = computeSpinFromPosition(0.5, 0.5);
    expect(r.x).toBeCloseTo(0.5);
    expect(r.y).toBeCloseTo(0.5);
  });

  it('outside diagonal (0.8,0.8): clamped, length = 1', () => {
    const r = computeSpinFromPosition(0.8, 0.8);
    const len = Math.sqrt(r.x ** 2 + r.y ** 2);
    expect(len).toBeCloseTo(1);
    expect(r.x).toBeCloseTo(r.y);  // symmetric diagonal
  });

  it('partial inside (0,0.7): unchanged', () => {
    const r = computeSpinFromPosition(0, 0.7);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0.7);
  });
});

// ─── SpinDisc — initial state ─────────────────────────────────────────────────

describe('SpinDisc — initial state', () => {
  it('isOpen = false', () => {
    const disc = createSpinDisc();
    expect(disc.isOpen).toBe(false);
  });

  it('isDragging = false', () => {
    const disc = createSpinDisc();
    expect(disc.isDragging).toBe(false);
  });

  it('spinX = 0, spinY = 0', () => {
    const disc = createSpinDisc();
    expect(disc.spinX).toBe(0);
    expect(disc.spinY).toBe(0);
  });
});

// ─── SpinDisc — open / close ─────────────────────────────────────────────────

describe('SpinDisc — open()', () => {
  it('sets isOpen = true', () => {
    const disc = createSpinDisc();
    disc.open();
    expect(disc.isOpen).toBe(true);
  });

  it('fires onOpen callback', () => {
    const onOpen = vi.fn();
    const disc = createSpinDisc({ onOpen });
    disc.open();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClose on open', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SpinDisc — close()', () => {
  it('sets isOpen = false', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.close();
    expect(disc.isOpen).toBe(false);
  });

  it('fires onClose callback', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    disc.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close() when already closed: no-op (onClose not called)', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.close();  // already closed
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close() clears isDragging', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    expect(disc.isDragging).toBe(true);
    disc.close();
    expect(disc.isDragging).toBe(false);
  });
});

// ─── SpinDisc — pointerDown ───────────────────────────────────────────────────

describe('SpinDisc — pointerDown', () => {
  it('while closed: returns false', () => {
    const disc = createSpinDisc();
    expect(disc.pointerDown(0, 0)).toBe(false);
  });

  it('while closed: no state change', () => {
    const disc = createSpinDisc();
    disc.pointerDown(0, 0);
    expect(disc.isOpen).toBe(false);
    expect(disc.isDragging).toBe(false);
  });

  it('while open, at center (0,0): returns true, isDragging=true', () => {
    const disc = createSpinDisc();
    disc.open();
    expect(disc.pointerDown(0, 0)).toBe(true);
    expect(disc.isDragging).toBe(true);
  });

  it('while open, inside boundary (1.4,0): returns true', () => {
    const disc = createSpinDisc();
    disc.open();
    expect(disc.pointerDown(1.4, 0)).toBe(true);
  });

  it('while open, at edge of hit zone (1.5,0): returns true', () => {
    const disc = createSpinDisc();
    disc.open();
    expect(disc.pointerDown(1.5, 0)).toBe(true);
  });

  it('while open, outside (2,0): returns false, closes disc', () => {
    const disc = createSpinDisc();
    disc.open();
    const result = disc.pointerDown(2, 0);
    expect(result).toBe(false);
    expect(disc.isOpen).toBe(false);
  });

  it('outside miss fires onClose', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    disc.pointerDown(2, 0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('inside hit: spin updated via computeSpinFromPosition', () => {
    const onSpinChange = vi.fn();
    const disc = createSpinDisc({ onSpinChange });
    disc.open();
    disc.pointerDown(0.5, 0.3);
    expect(onSpinChange).toHaveBeenCalledWith(0.5, 0.3);
    expect(disc.spinX).toBeCloseTo(0.5);
    expect(disc.spinY).toBeCloseTo(0.3);
  });

  it('clamped input (2,0) → spinX=1', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(2, 0);
    // outside → closes, spin unchanged (close before setting)
    // Actually outside closes, so spin stays 0
    expect(disc.spinX).toBe(0);  // closed without updating spin
  });
});

// ─── SpinDisc — pointerMove ───────────────────────────────────────────────────

describe('SpinDisc — pointerMove', () => {
  it('while not dragging: no-op', () => {
    const onSpinChange = vi.fn();
    const disc = createSpinDisc({ onSpinChange });
    disc.open();
    disc.pointerMove(0.5, 0.5);
    expect(onSpinChange).not.toHaveBeenCalled();
  });

  it('while dragging: updates spinX/Y', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerMove(0.6, -0.4);
    expect(disc.spinX).toBeCloseTo(0.6);
    expect(disc.spinY).toBeCloseTo(-0.4);
  });

  it('while dragging: calls onSpinChange', () => {
    const onSpinChange = vi.fn();
    const disc = createSpinDisc({ onSpinChange });
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerMove(0.3, 0.5);
    expect(onSpinChange).toHaveBeenLastCalledWith(0.3, 0.5);
  });

  it('while dragging: clamped spin (2,0) → spinX=1', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerMove(2, 0);
    expect(disc.spinX).toBeCloseTo(1);
    expect(disc.spinY).toBeCloseTo(0);
  });

  it('while dragging: diagonal clamp to unit circle', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerMove(1.5, 1.5);
    const len = Math.sqrt(disc.spinX ** 2 + disc.spinY ** 2);
    expect(len).toBeCloseTo(1);
  });
});

// ─── SpinDisc — pointerUp ────────────────────────────────────────────────────

describe('SpinDisc — pointerUp', () => {
  it('while not dragging: no-op', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    disc.pointerUp();
    expect(onClose).not.toHaveBeenCalled();
    expect(disc.isOpen).toBe(true);  // still open
  });

  it('while dragging: isDragging = false', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerUp();
    expect(disc.isDragging).toBe(false);
  });

  it('while dragging: closes disc', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerUp();
    expect(disc.isOpen).toBe(false);
  });

  it('while dragging: fires onClose', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    disc.pointerDown(0, 0);
    disc.pointerUp();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('spin value is preserved after pointerUp', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0.5, -0.3);
    disc.pointerUp();
    // disc is closed but spin persists (user can see their spin setting)
    expect(disc.spinX).toBeCloseTo(0.5);
    expect(disc.spinY).toBeCloseTo(-0.3);
  });
});

// ─── SpinDisc — reset ────────────────────────────────────────────────────────

describe('SpinDisc — reset()', () => {
  it('zeros spinX and spinY', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.pointerDown(0.5, 0.7);
    disc.reset();
    expect(disc.spinX).toBe(0);
    expect(disc.spinY).toBe(0);
  });

  it('fires onSpinChange(0, 0)', () => {
    const onSpinChange = vi.fn();
    const disc = createSpinDisc({ onSpinChange });
    disc.open();
    disc.pointerDown(0.5, 0.3);
    onSpinChange.mockClear();
    disc.reset();
    expect(onSpinChange).toHaveBeenCalledWith(0, 0);
  });

  it('if open: closes disc', () => {
    const disc = createSpinDisc();
    disc.open();
    disc.reset();
    expect(disc.isOpen).toBe(false);
  });

  it('if already closed: stays closed (no double onClose)', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.reset();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('if open: fires onClose', () => {
    const onClose = vi.fn();
    const disc = createSpinDisc({ onClose });
    disc.open();
    disc.reset();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
