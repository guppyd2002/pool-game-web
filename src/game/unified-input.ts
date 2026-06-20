/**
 * Unified pointer/touch input state machine — INFRA-015 (MouseInfo) + INFRA-017 (ZoomManager) port.
 *
 * Pure logic: no DOM dependencies.  The DOM wiring in input-handler.ts maps browser events
 * to these feed* methods.  State mirrors C# MouseInfo: None → Down → Press → Up → None.
 *
 * Pinch zoom (INFRA-017): two-finger distance delta, normalized to screen-independent units.
 * Wheel zoom (INFRA-017): desktop fallback — negative deltaY (scroll up) = positive zoomDelta.
 */

/** Screen-space coordinate (clientX/clientY or touch.clientX/clientY). */
export interface InputPoint { x: number; y: number; }

/** Mirrors C# MouseInfo.State: None / Down (this frame) / Press (held) / Up (released this frame). */
export type InputPhase = 'none' | 'down' | 'press' | 'up';

/** Snapshot of input state at a point in time. */
export interface PointerSnapshot {
  phase: InputPhase;
  position: InputPoint;
  isTwoTouch: boolean;
}

/** Result of a pinch or wheel zoom event. */
export interface ZoomResult {
  zoomDelta: number; // positive = zoom in, negative = zoom out
}

function dist(a: InputPoint, b: InputPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Pure input state machine — translates raw pointer/touch/wheel events into a
 * consistent state (phase, position, isTwoTouch) + zoom deltas.
 *
 * C# equivalents:
 *   feedPointerDown/Move/Up  ↔  MouseInfo.Down / Press / Up
 *   feedTouchStart/Move/End  ↔  Input.GetTouch() path in MouseInfo.Update()
 *   feedPinch                ↔  ZoomManager.Update() two-touch distance delta
 *   feedWheel                ↔  ZoomManager desktop fallback (scroll wheel)
 */
export class PointerStateMachine {
  private _phase: InputPhase = 'none';
  private _pos: InputPoint = { x: 0, y: 0 };
  private _isTwoTouch = false;
  private _pinchDist = 0;

  /** Pointer (mouse or single touch via PointerEvents) pressed down. */
  feedPointerDown(x: number, y: number): PointerSnapshot {
    this._phase = 'down';
    this._pos = { x, y };
    this._isTwoTouch = false;
    return this._snap();
  }

  /** Pointer moved while held. Only transitions to 'press' if already 'down' or 'press'. */
  feedPointerMove(x: number, y: number): PointerSnapshot {
    if (this._phase === 'down' || this._phase === 'press') {
      this._phase = 'press';
      this._pos = { x, y };
    }
    return this._snap();
  }

  /** Pointer released. Only transitions to 'up' if was 'down' or 'press'. */
  feedPointerUp(x: number, y: number): PointerSnapshot {
    if (this._phase === 'down' || this._phase === 'press') {
      this._phase = 'up';
      this._pos = { x, y };
    }
    return this._snap();
  }

  /**
   * Touch start.
   * - 1 touch → 'down' (same as pointer down)
   * - 2 touches → isTwoTouch=true, begin pinch tracking; phase stays 'none' (suppress shot)
   */
  feedTouchStart(touches: InputPoint[]): PointerSnapshot {
    if (touches.length === 1) {
      this._phase = 'down';
      this._pos = touches[0];
      this._isTwoTouch = false;
    } else if (touches.length >= 2) {
      this._isTwoTouch = true;
      this._phase = 'none';
      this._pinchDist = dist(touches[0], touches[1]);
    }
    return this._snap();
  }

  /** Touch move (single finger). Transitions to 'press' if was 'down'. */
  feedTouchMove(touches: InputPoint[]): PointerSnapshot {
    if (touches.length === 1) {
      return this.feedPointerMove(touches[0].x, touches[0].y);
    }
    return this._snap();
  }

  /**
   * Two-finger pinch move.  Call after feedTouchStart with 2 touches to get incremental delta.
   * Returns zoomDelta: positive = fingers spreading apart (zoom in), negative = squeezing (zoom out).
   */
  feedPinch(touches: [InputPoint, InputPoint]): ZoomResult {
    const newDist = dist(touches[0], touches[1]);
    const delta = newDist - this._pinchDist;
    this._pinchDist = newDist;
    return { zoomDelta: delta };
  }

  /**
   * Touch end.
   * - 0 remaining touches → 'up' (if was dragging single finger)
   * - 1 remaining touch (was 2) → clear isTwoTouch, phase='none' (no accidental shot)
   */
  feedTouchEnd(remainingTouches: InputPoint[]): PointerSnapshot {
    if (remainingTouches.length === 0) {
      if (this._phase === 'down' || this._phase === 'press') {
        this._phase = 'up';
      }
      this._isTwoTouch = false;
    } else if (remainingTouches.length === 1 && this._isTwoTouch) {
      // Dropped from 2 → 1 finger: suppress shot to avoid unintended fire
      this._isTwoTouch = false;
      this._phase = 'none';
    }
    return this._snap();
  }

  /**
   * Mouse wheel zoom — desktop fallback for INFRA-017.
   * WheelEvent.deltaY: negative = scroll up = zoom in → positive zoomDelta.
   * Normalized by /100 to keep magnitude independent of OS scroll sensitivity.
   */
  feedWheel(deltaY: number): ZoomResult {
    return { zoomDelta: -deltaY / 100 };
  }

  /** Reset to idle (e.g. when input is disabled mid-drag). */
  reset(): void {
    this._phase = 'none';
    this._isTwoTouch = false;
  }

  get phase(): InputPhase { return this._phase; }
  get position(): InputPoint { return { ...this._pos }; }
  get isTwoTouch(): boolean { return this._isTwoTouch; }

  private _snap(): PointerSnapshot {
    return {
      phase: this._phase,
      position: { ...this._pos },
      isTwoTouch: this._isTwoTouch,
    };
  }
}
