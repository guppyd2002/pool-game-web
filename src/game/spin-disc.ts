/**
 * CUE-006: SpinDisc — event-driven port of C# CueTargetingUIManager.
 *
 * C# dead-wait coroutine (while Input.GetMouseButton) → pointer-event callbacks.
 * C# TriggerOthers(false/true) → onOpen/onClose callbacks so caller wires CUE-019 mutex
 * (adapter.disable() / adapter.enable()) without this module touching DOM or Three.js.
 *
 * Mode 1 (absolute position) only — mode 2 (velocity) omitted for web MVP.
 * C# koeficient clamp (0.7) is baked into computeSpinFromPosition as unit-circle clamp;
 * callers that want the 0.7 scale apply it in the UI layer (visual radius).
 */

export interface SpinDiscOptions {
  /** Called when disc opens (CUE-008 open button): caller should call adapter.disable(). */
  onOpen?: () => void;
  /** Called when disc closes (pointer up, miss-tap, two-finger, reset): adapter.enable(). */
  onClose?: () => void;
  /**
   * Called when spin offset changes.
   * x = side english ∈ [-1, 1]: negative = right, positive = left.
   * y = top/back spin ∈ [-1, 1]: positive = topspin, negative = backspin.
   * Caller should forward to cue.setSpinOffset(x, y).
   */
  onSpinChange?: (x: number, y: number) => void;
}

export interface SpinDisc {
  readonly isOpen: boolean;
  readonly isDragging: boolean;
  readonly spinX: number;
  readonly spinY: number;

  /** CUE-008: open the targeting disc panel. Maps to C# CueTargetingUIManager.Targeting(). */
  open(): void;

  /**
   * Close the disc (two-finger interrupt, programmatic turn end).
   * Maps to C# StopTargeting() path. No-op when already closed.
   */
  close(): void;

  /**
   * Pointer down in normalized disc coords (center=0, rim=1).
   * Returns true if inside hit zone (||pos|| ≤ 1.5) → starts drag.
   * Returns false and closes disc if outside — matches C# IsHitSphere() → StopTargeting() path.
   */
  pointerDown(nx: number, ny: number): boolean;

  /** Pointer move. Only updates spin when isDragging. */
  pointerMove(nx: number, ny: number): void;

  /** Pointer up. Ends drag and closes disc. Maps to C# post-while block → StopTargeting(). */
  pointerUp(): void;

  /** Zero spin and close. Call from CueController.resetForNewTurn(). */
  reset(): void;

  /**
   * CUE-007: Set tutorial/AI suggested hit point (normalized disc coords, unit-circle clamped).
   * Maps to C# CueTargetingUIManager.SetNeedPoint(Vector2).
   */
  setNeedPoint(nx: number, ny: number): void;

  /** CUE-007: Clear need point (hide assist marker). */
  clearNeedPoint(): void;

  /** CUE-007: Current need point or null if unset. */
  getNeedPoint(): { x: number; y: number } | null;

  /**
   * CUE-007: Normalized distance from current spin to need point (0 = exact match).
   * Maps to C# GetDifferenceFromNeedPoint(): Distance(hit, need) / radius.
   * Returns 0 when no need point is set.
   */
  getDifferenceFromNeedPoint(): number;
}

/**
 * Clamp (nx, ny) to unit circle. Returns spin values ∈ [-1, 1].
 * Matches C# Vector3.ClampMagnitude(mouseDelta, radius) / radius normalisation.
 */
export function computeSpinFromPosition(nx: number, ny: number): { x: number; y: number } {
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len <= 1) return { x: nx, y: ny };
  return { x: nx / len, y: ny / len };
}

export function createSpinDisc(opts: SpinDiscOptions = {}): SpinDisc {
  let _isOpen = false;
  let _isDragging = false;
  let _spinX = 0;
  let _spinY = 0;
  // CUE-007 need-point (tutorial/AI assist); null = inactive
  let _needX: number | null = null;
  let _needY: number | null = null;

  function _applySpin(nx: number, ny: number): void {
    const s = computeSpinFromPosition(nx, ny);
    _spinX = s.x;
    _spinY = s.y;
    opts.onSpinChange?.(_spinX, _spinY);
  }

  function _close(): void {
    _isOpen = false;
    _isDragging = false;
    opts.onClose?.();
  }

  return {
    get isOpen()    { return _isOpen; },
    get isDragging(){ return _isDragging; },
    get spinX()     { return _spinX; },
    get spinY()     { return _spinY; },

    open(): void {
      _isOpen = true;
      opts.onOpen?.();
    },

    close(): void {
      if (!_isOpen) return;
      _close();
    },

    pointerDown(nx: number, ny: number): boolean {
      if (!_isOpen) return false;
      const dist = Math.sqrt(nx * nx + ny * ny);
      if (dist <= 1.5) {
        _isDragging = true;
        _applySpin(nx, ny);
        return true;
      }
      // Miss: close panel (matches C# IsHitSphere() → false → StopTargeting())
      _close();
      return false;
    },

    pointerMove(nx: number, ny: number): void {
      if (!_isDragging) return;
      _applySpin(nx, ny);
    },

    pointerUp(): void {
      if (!_isDragging) return;
      _isDragging = false;
      _close();
    },

    reset(): void {
      _spinX = 0;
      _spinY = 0;
      opts.onSpinChange?.(0, 0);
      // Need point persists across turn reset (tutorial target may stay); clear via clearNeedPoint.
      if (_isOpen) _close();
    },

    setNeedPoint(nx: number, ny: number): void {
      const s = computeSpinFromPosition(nx, ny);
      _needX = s.x;
      _needY = s.y;
    },

    clearNeedPoint(): void {
      _needX = null;
      _needY = null;
    },

    getNeedPoint(): { x: number; y: number } | null {
      if (_needX === null || _needY === null) return null;
      return { x: _needX, y: _needY };
    },

    getDifferenceFromNeedPoint(): number {
      if (_needX === null || _needY === null) return 0;
      const dx = _spinX - _needX;
      const dy = _spinY - _needY;
      return Math.sqrt(dx * dx + dy * dy);
    },
  };
}
