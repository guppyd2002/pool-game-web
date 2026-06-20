/**
 * CUE-002: ShotSlider — event-driven port of C# CueShotUIManager slider logic.
 *
 * C# dead-wait pattern (Input.GetMouseButton in UpdateControl) → pointer-event callbacks.
 * C# TriggerOthers(false/true) → onStartControl/onEndControl so caller wires CUE-019
 * mutex (adapter.disable() / adapter.enable()) without this module touching DOM.
 *
 * Manual mode (default): slider drag sets force; shot button explicitly fires.
 * Auto mode (isAutoShot=true): shot fires automatically on slider release if force > minForce.
 */

/** Default minimum force threshold to fire a shot (C# minForce = 0.05f). */
const MIN_FORCE_DEFAULT = 0.05;

export interface ShotSliderOptions {
  /** C# OnStartControl (TriggerOthers(false)): caller should disable adapter. */
  onStartControl?: () => void;
  /** C# OnEndControl (TriggerOthers(true)): caller should enable adapter. */
  onEndControl?: () => void;
  /** C# OnMove: force value changed during drag. */
  onMove?: (force: number) => void;
  /** C# OnShot: shot is being fired with this force fraction. */
  onShot?: (force: number) => void;
  /** C# OnCancel: shot cancelled (too little power, or disabled while selected). */
  onCancel?: () => void;
  /** C# IsAutoShot: fire on slider release. Default false (manual: fire via button). */
  isAutoShot?: boolean;
  /** C# minForce = 0.05: minimum force to fire. Default 0.05. */
  minForce?: number;
}

export interface ShotSlider {
  readonly force: number;
  readonly isSelected: boolean;

  /** C# OnPointerDown: begin slider control. Fires onStartControl (mutex). */
  startControl(): void;

  /**
   * C# slider.onValueChanged: update force.
   * No-op when !isSelected (C# guard: if (!IsSelected) slider.value = 0).
   */
  setValue(v: number): void;

  /**
   * C# MouseInfo.Up path: end slider control.
   * Auto mode: if force > minForce → onShot; else → onCancel.
   * Manual mode: only fires onEndControl (button fires the shot).
   * No-op when !isSelected.
   */
  endControl(): void;

  /**
   * C# shotButton.onClick: fire the shot (manual mode only).
   * No-op in auto mode (auto fires on endControl).
   * No-op if force ≤ minForce.
   */
  fire(): void;

  /**
   * C# OnDisable while selected: reset force to 0, clear selection, fire
   * onMove(0) + onEndControl + onCancel.
   * No-op when not selected.
   */
  disable(): void;

  /** C# ResetShot: zero force + clear isSelected. No callbacks. */
  reset(): void;
}

export function createShotSlider(opts: ShotSliderOptions = {}): ShotSlider {
  let _force = 0;
  let _isSelected = false;
  const _minForce = opts.minForce ?? MIN_FORCE_DEFAULT;
  const _isAutoShot = opts.isAutoShot ?? false;

  return {
    get force()      { return _force; },
    get isSelected() { return _isSelected; },

    startControl(): void {
      _isSelected = true;
      opts.onStartControl?.();
    },

    setValue(v: number): void {
      if (!_isSelected) return;  // C#: !IsSelected → slider.value=0, ignore
      _force = Math.max(0, Math.min(1, v));
      opts.onMove?.(_force);
    },

    endControl(): void {
      if (!_isSelected) return;
      _isSelected = false;
      opts.onEndControl?.();  // TriggerOthers(true) — re-enable before firing
      if (_isAutoShot) {
        if (_force > _minForce) {
          opts.onShot?.(_force);
        } else {
          opts.onCancel?.();
        }
      }
    },

    fire(): void {
      if (_isAutoShot) return;  // auto fires on release, not button
      if (_force > _minForce) {
        opts.onShot?.(_force);
      }
    },

    disable(): void {
      if (!_isSelected) return;  // C# OnDisable only acts if currently selected
      _isSelected = false;
      _force = 0;
      opts.onMove?.(0);
      opts.onEndControl?.();
      opts.onCancel?.();
    },

    reset(): void {
      // C# ResetShot: just zeros, no callbacks
      _force = 0;
      _isSelected = false;
    },
  };
}
