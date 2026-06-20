/**
 * CUE-002: ShotSlider domain tests — ports C# CueShotUIManager slider logic.
 *
 * C# behaviors ported:
 *   OnPointerDown  → startControl(): IsSelected=true, TriggerOthers(false) via onStartControl
 *   slider.onChange → setValue(): guard on IsSelected; Force=v, OnMove(v)
 *   MouseInfo.Up   → endControl(): auto→OnShot or OnCancel; OnEndControl; TriggerOthers(true)
 *   shotButton     → fire(): manual mode only, Force > minForce
 *   OnDisable      → disable(): if selected: reset + cancel + OnEndControl
 *   ResetShot      → reset(): zero force, clear isSelected, no callbacks
 */
import { describe, it, expect, vi } from 'vitest';
import { createShotSlider } from '../../game/shot-slider';

// ─── Initial state ────────────────────────────────────────────────────────────

describe('ShotSlider — initial state', () => {
  it('force = 0', () => {
    expect(createShotSlider().force).toBe(0);
  });

  it('isSelected = false', () => {
    expect(createShotSlider().isSelected).toBe(false);
  });
});

// ─── startControl() ───────────────────────────────────────────────────────────

describe('ShotSlider — startControl()', () => {
  it('sets isSelected = true', () => {
    const s = createShotSlider();
    s.startControl();
    expect(s.isSelected).toBe(true);
  });

  it('fires onStartControl', () => {
    const onStartControl = vi.fn();
    const s = createShotSlider({ onStartControl });
    s.startControl();
    expect(onStartControl).toHaveBeenCalledTimes(1);
  });

  it('does not fire onEndControl on startControl', () => {
    const onEndControl = vi.fn();
    const s = createShotSlider({ onEndControl });
    s.startControl();
    expect(onEndControl).not.toHaveBeenCalled();
  });

  it('does not change force', () => {
    const s = createShotSlider();
    s.startControl();
    expect(s.force).toBe(0);
  });
});

// ─── setValue() ───────────────────────────────────────────────────────────────

describe('ShotSlider — setValue()', () => {
  it('no-op when not selected: force stays 0', () => {
    const s = createShotSlider();
    s.setValue(0.5);
    expect(s.force).toBe(0);
  });

  it('no-op when not selected: onMove not called', () => {
    const onMove = vi.fn();
    const s = createShotSlider({ onMove });
    s.setValue(0.5);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('updates force when selected', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(0.7);
    expect(s.force).toBeCloseTo(0.7);
  });

  it('fires onMove with new force when selected', () => {
    const onMove = vi.fn();
    const s = createShotSlider({ onMove });
    s.startControl();
    s.setValue(0.6);
    expect(onMove).toHaveBeenCalledWith(0.6);
  });

  it('clamps negative input to 0', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(-0.5);
    expect(s.force).toBe(0);
  });

  it('clamps >1 to 1', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(1.5);
    expect(s.force).toBe(1);
  });

  it('fires onMove with clamped value', () => {
    const onMove = vi.fn();
    const s = createShotSlider({ onMove });
    s.startControl();
    s.setValue(2.0);
    expect(onMove).toHaveBeenCalledWith(1);
  });

  it('consecutive setValue calls update force each time', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(0.3);
    s.setValue(0.8);
    expect(s.force).toBeCloseTo(0.8);
  });
});

// ─── endControl() — manual mode (isAutoShot=false) ───────────────────────────

describe('ShotSlider — endControl() manual mode', () => {
  it('no-op when not selected: onEndControl not fired', () => {
    const onEndControl = vi.fn();
    const s = createShotSlider({ onEndControl });
    s.endControl();
    expect(onEndControl).not.toHaveBeenCalled();
  });

  it('no-op when not selected: isSelected stays false', () => {
    const s = createShotSlider();
    s.endControl();
    expect(s.isSelected).toBe(false);
  });

  it('sets isSelected = false', () => {
    const s = createShotSlider();
    s.startControl();
    s.endControl();
    expect(s.isSelected).toBe(false);
  });

  it('fires onEndControl', () => {
    const onEndControl = vi.fn();
    const s = createShotSlider({ onEndControl });
    s.startControl();
    s.endControl();
    expect(onEndControl).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onShot in manual mode (button fires, not release)', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot });
    s.startControl();
    s.setValue(0.8);
    s.endControl();
    expect(onShot).not.toHaveBeenCalled();
  });

  it('does NOT fire onCancel in manual mode on release', () => {
    const onCancel = vi.fn();
    const s = createShotSlider({ onCancel });
    s.startControl();
    s.setValue(0.8);
    s.endControl();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('force value persists after endControl', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(0.6);
    s.endControl();
    expect(s.force).toBeCloseTo(0.6);
  });
});

// ─── endControl() — auto mode (isAutoShot=true) ──────────────────────────────

describe('ShotSlider — endControl() auto mode', () => {
  it('fires onShot when force > minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, isAutoShot: true });
    s.startControl();
    s.setValue(0.8);
    s.endControl();
    expect(onShot).toHaveBeenCalledWith(0.8);
  });

  it('fires onCancel when force < minForce', () => {
    const onCancel = vi.fn();
    const s = createShotSlider({ onCancel, isAutoShot: true });
    s.startControl();
    s.setValue(0.02);
    s.endControl();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when force = 0', () => {
    const onCancel = vi.fn();
    const s = createShotSlider({ onCancel, isAutoShot: true });
    s.startControl();
    s.endControl();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when force exactly = minForce (not strictly greater)', () => {
    const onCancel = vi.fn();
    const s = createShotSlider({ onCancel, isAutoShot: true, minForce: 0.05 });
    s.startControl();
    s.setValue(0.05);
    s.endControl();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onEndControl BEFORE onShot (TriggerOthers re-enabled first)', () => {
    const calls: string[] = [];
    const s = createShotSlider({
      onEndControl: () => calls.push('end'),
      onShot: () => calls.push('shot'),
      isAutoShot: true,
    });
    s.startControl();
    s.setValue(0.8);
    s.endControl();
    expect(calls).toEqual(['end', 'shot']);
  });

  it('fires onEndControl BEFORE onCancel', () => {
    const calls: string[] = [];
    const s = createShotSlider({
      onEndControl: () => calls.push('end'),
      onCancel: () => calls.push('cancel'),
      isAutoShot: true,
    });
    s.startControl();
    s.setValue(0.02);
    s.endControl();
    expect(calls).toEqual(['end', 'cancel']);
  });
});

// ─── fire() — manual mode ────────────────────────────────────────────────────

describe('ShotSlider — fire() manual mode', () => {
  it('fires onShot when force > minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot });
    s.startControl();
    s.setValue(0.8);
    s.fire();
    expect(onShot).toHaveBeenCalledWith(0.8);
  });

  it('no-op when force < minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot });
    s.startControl();
    s.setValue(0.02);
    s.fire();
    expect(onShot).not.toHaveBeenCalled();
  });

  it('no-op when force = 0', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot });
    s.startControl();
    s.fire();
    expect(onShot).not.toHaveBeenCalled();
  });

  it('can fire without being selected (force persists after endControl)', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot });
    s.startControl();
    s.setValue(0.8);
    s.endControl();  // deselects, but force persists
    s.fire();
    expect(onShot).toHaveBeenCalledWith(0.8);
  });

  it('no-op when force exactly = minForce (not strictly greater)', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, minForce: 0.05 });
    s.startControl();
    s.setValue(0.05);
    s.fire();
    expect(onShot).not.toHaveBeenCalled();
  });
});

// ─── fire() — auto mode ───────────────────────────────────────────────────────

describe('ShotSlider — fire() auto mode', () => {
  it('no-op in auto mode (auto fires on endControl)', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, isAutoShot: true });
    s.startControl();
    s.setValue(0.8);
    s.fire();
    expect(onShot).not.toHaveBeenCalled();
  });
});

// ─── disable() ────────────────────────────────────────────────────────────────

describe('ShotSlider — disable()', () => {
  it('no-op when not selected', () => {
    const onEndControl = vi.fn();
    const onCancel = vi.fn();
    const s = createShotSlider({ onEndControl, onCancel });
    s.disable();
    expect(onEndControl).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('sets isSelected = false when selected', () => {
    const s = createShotSlider();
    s.startControl();
    s.disable();
    expect(s.isSelected).toBe(false);
  });

  it('zeros force', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(0.7);
    s.disable();
    expect(s.force).toBe(0);
  });

  it('fires onMove(0)', () => {
    const onMove = vi.fn();
    const s = createShotSlider({ onMove });
    s.startControl();
    s.setValue(0.5);
    onMove.mockClear();
    s.disable();
    expect(onMove).toHaveBeenCalledWith(0);
  });

  it('fires onEndControl', () => {
    const onEndControl = vi.fn();
    const s = createShotSlider({ onEndControl });
    s.startControl();
    s.disable();
    expect(onEndControl).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel', () => {
    const onCancel = vi.fn();
    const s = createShotSlider({ onCancel });
    s.startControl();
    s.disable();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ─── reset() ─────────────────────────────────────────────────────────────────

describe('ShotSlider — reset()', () => {
  it('zeros force', () => {
    const s = createShotSlider();
    s.startControl();
    s.setValue(0.8);
    s.reset();
    expect(s.force).toBe(0);
  });

  it('clears isSelected', () => {
    const s = createShotSlider();
    s.startControl();
    s.reset();
    expect(s.isSelected).toBe(false);
  });

  it('does not fire any callbacks', () => {
    const onShot = vi.fn();
    const onCancel = vi.fn();
    const onMove = vi.fn();
    const onEndControl = vi.fn();
    const s = createShotSlider({ onShot, onCancel, onMove, onEndControl });
    s.startControl();
    s.setValue(0.5);
    onMove.mockClear();
    s.reset();
    expect(onShot).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onEndControl).not.toHaveBeenCalled();
  });
});

// ─── Custom minForce ─────────────────────────────────────────────────────────

describe('ShotSlider — custom minForce', () => {
  it('fire() no-op below custom minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, minForce: 0.1 });
    s.startControl();
    s.setValue(0.08);  // above default 0.05 but below custom 0.1
    s.fire();
    expect(onShot).not.toHaveBeenCalled();
  });

  it('fire() fires above custom minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, minForce: 0.1 });
    s.startControl();
    s.setValue(0.15);
    s.fire();
    expect(onShot).toHaveBeenCalledWith(0.15);
  });

  it('auto endControl() fires onShot above custom minForce', () => {
    const onShot = vi.fn();
    const s = createShotSlider({ onShot, isAutoShot: true, minForce: 0.1 });
    s.startControl();
    s.setValue(0.15);
    s.endControl();
    expect(onShot).toHaveBeenCalledWith(0.15);
  });
});
