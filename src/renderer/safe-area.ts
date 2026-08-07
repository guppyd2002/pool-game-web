/**
 * P1-T11 / FEAT-SET-008 — Safe area + orientation helpers (web port of
 * ScreenSizeManager / SafeAreaManager / LayoutTool).
 *
 * Unity reads Screen.safeArea + banner height; web uses CSS env(safe-area-inset-*)
 * and viewport metrics. Pure helpers for layout + tests.
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportMetrics {
  width: number;
  height: number;
  aspect: number;
  isLandscape: boolean;
  /** Short landscape phone (e.g. 844×390). */
  isShortLandscape: boolean;
  /** Narrow portrait phone — game shows rotate prompt. */
  isPortraitMobile: boolean;
  safe: SafeAreaInsets;
}

/** Parse `env(safe-area-inset-*)` via a probe element (0 when unsupported). */
export function readSafeAreaInsets(
  getComputed: (prop: string) => string = (p) =>
    (typeof getComputedStyle !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(p)
      : '0'),
): SafeAreaInsets {
  const n = (v: string) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };
  // Prefer CSS variables if host set them; else 0 (env() only works in CSS styles).
  return {
    top: n(getComputed('--safe-area-top') || getComputed('env(safe-area-inset-top)') || '0'),
    right: n(getComputed('--safe-area-right') || '0'),
    bottom: n(getComputed('--safe-area-bottom') || '0'),
    left: n(getComputed('--safe-area-left') || '0'),
  };
}

/**
 * Pure metrics from width/height (testable without DOM).
 * Mirrors index.html media breakpoints:
 *   short landscape: landscape && h ≤ 440
 *   portrait mobile: portrait && w ≤ 900
 */
export function computeViewportMetrics(
  width: number,
  height: number,
  safe: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 },
): ViewportMetrics {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const aspect = w / Math.max(1, h);
  const isLandscape = w >= h;
  return {
    width: w,
    height: h,
    aspect,
    isLandscape,
    isShortLandscape: isLandscape && h <= 440,
    isPortraitMobile: !isLandscape && w <= 900,
    safe,
  };
}

/** CSS padding string that respects safe-area insets (LayoutTool equiv). */
export function safeAreaPaddingCss(extraPx = 0): string {
  const e = Math.max(0, extraPx);
  return [
    `padding-top:max(${e}px, env(safe-area-inset-top, 0px))`,
    `padding-right:max(${e}px, env(safe-area-inset-right, 0px))`,
    `padding-bottom:max(${e}px, env(safe-area-inset-bottom, 0px))`,
    `padding-left:max(${e}px, env(safe-area-inset-left, 0px))`,
  ].join(';');
}

/**
 * Install CSS custom properties on :root so JS can read insets if the UA
 * exposes them via env() on a full-screen fixed probe.
 */
export function installSafeAreaCssVars(root: HTMLElement = document.documentElement): void {
  // Fixed probe uses env() in style; then we copy computed padding into vars.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed', 'visibility:hidden', 'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  root.style.setProperty('--safe-area-top', cs.paddingTop || '0px');
  root.style.setProperty('--safe-area-right', cs.paddingRight || '0px');
  root.style.setProperty('--safe-area-bottom', cs.paddingBottom || '0px');
  root.style.setProperty('--safe-area-left', cs.paddingLeft || '0px');
  probe.remove();
}
