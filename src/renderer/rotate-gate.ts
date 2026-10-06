/**
 * B-11 / challenge #046 — JS-owned rotate-device gate (single source of truth).
 *
 * Formula (R1, 鼬 CONDITIONAL PASS):
 *   show = portrait && width <= maxWidth && (pointer:coarse || hover:none)
 *
 * - Keeps max-width (never pure orientation:portrait — desktop tall windows).
 * - Never uses the any-pointer media feature (Windows touch laptops false-positive).
 * - Known miss: iPad + Magic Keyboard / trackpad may report pointer:fine → no prompt.
 *
 * Flags (dev/QA/CEO only; sunset — first trigger wins):
 *   (a) CEO D2 + 14 days  (b) next UX package merge  (c) ROTATE_GATE_FLAG_SUNSET_ISO
 * After sunset, flag reads no-op (+ one console.warn).
 */

export const ROTATE_GATE_DEFAULT_MAX_WIDTH = 1366;
export const ROTATE_GATE_LEGACY_MAX_WIDTH = 900;

/**
 * Hard calendar sunset for rotateGateMax / rotateGateLegacy (PR merge 2026-10-06 + 30d).
 * Also delete on CEO D2+14d or before next UX package merge — whichever comes first.
 */
export const ROTATE_GATE_FLAG_SUNSET_ISO = '2026-11-05';

export const ROTATE_GATE_ACTIVE_CLASS = 'rotate-gate-active';

export interface PointerMedia {
  pointerCoarse: boolean;
  hoverNone: boolean;
}

export interface RotateGateFlags {
  /** Effective max width (default 1366; flag may set 900). */
  maxWidth: number;
  /** Legacy path: portrait && w<=900 only (no coarse/hover). */
  legacy: boolean;
  /** True when a flag was requested but ignored past sunset. */
  flagsExpired: boolean;
}

export interface RotateGateInput {
  width: number;
  height: number;
  pointerCoarse: boolean;
  hoverNone: boolean;
  maxWidth?: number;
  legacy?: boolean;
}

/** Pure: portrait = width < height (matches safe-area isLandscape = w >= h). */
export function computeShouldShowRotatePrompt(input: RotateGateInput): boolean {
  const w = Math.max(0, input.width);
  const h = Math.max(0, input.height);
  const portrait = w < h;
  if (!portrait) return false;

  if (input.legacy) {
    return w <= ROTATE_GATE_LEGACY_MAX_WIDTH;
  }

  const maxW = input.maxWidth ?? ROTATE_GATE_DEFAULT_MAX_WIDTH;
  if (w > maxW) return false;
  return input.pointerCoarse || input.hoverNone;
}

export function flagsExpired(now: Date = new Date()): boolean {
  // Compare calendar date UTC YYYY-MM-DD
  const today = now.toISOString().slice(0, 10);
  return today >= ROTATE_GATE_FLAG_SUNSET_ISO;
}

/**
 * Read URL (?rotateGateMax= / ?rotateGateLegacy=1) then localStorage.
 * After sunset → ignore overrides (prod no-op).
 */
export function readRotateGateFlags(
  search: string = typeof location !== 'undefined' ? location.search : '',
  storage: Pick<Storage, 'getItem'> | null =
    typeof localStorage !== 'undefined' ? localStorage : null,
  now: Date = new Date(),
): RotateGateFlags {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const legacyRaw = params.get('rotateGateLegacy') ?? storage?.getItem('rotateGateLegacy');
  const maxRaw = params.get('rotateGateMax') ?? storage?.getItem('rotateGateMax');
  const wantsLegacy = legacyRaw === '1' || legacyRaw === 'true';
  const wantsMax = maxRaw != null && maxRaw !== '';

  if ((wantsLegacy || wantsMax) && flagsExpired(now)) {
    if (typeof console !== 'undefined') {
      // One-shot warn per page load is enough for QA.
      console.warn(
        `[rotate-gate] flags expired after ${ROTATE_GATE_FLAG_SUNSET_ISO}; ignoring overrides`,
      );
    }
    return {
      maxWidth: ROTATE_GATE_DEFAULT_MAX_WIDTH,
      legacy: false,
      flagsExpired: true,
    };
  }

  let maxWidth = ROTATE_GATE_DEFAULT_MAX_WIDTH;
  if (wantsMax) {
    const n = Number.parseInt(String(maxRaw), 10);
    if (Number.isFinite(n) && n > 0) maxWidth = n;
  }

  return {
    maxWidth,
    legacy: wantsLegacy,
    flagsExpired: false,
  };
}

/** Browser matchMedia — never query any-pointer (primary pointer / hover only). */
export function readPointerMedia(
  matchMediaFn: (q: string) => { matches: boolean } = (q) =>
    typeof matchMedia !== 'undefined' ? matchMedia(q) : { matches: false },
): PointerMedia {
  return {
    pointerCoarse: matchMediaFn('(pointer: coarse)').matches,
    hoverNone: matchMediaFn('(hover: none)').matches,
  };
}

/**
 * Apply gate class on <html> and subscribe to resize / orientation / pointer media changes.
 * Returns dispose().
 */
export function installRotateGate(
  root: HTMLElement = document.documentElement,
): () => void {
  const coarseMql =
    typeof matchMedia !== 'undefined' ? matchMedia('(pointer: coarse)') : null;
  const hoverMql =
    typeof matchMedia !== 'undefined' ? matchMedia('(hover: none)') : null;

  const apply = (): void => {
    const flags = readRotateGateFlags();
    const media = readPointerMedia();
    const show = computeShouldShowRotatePrompt({
      width: window.innerWidth,
      height: window.innerHeight,
      pointerCoarse: media.pointerCoarse,
      hoverNone: media.hoverNone,
      maxWidth: flags.maxWidth,
      legacy: flags.legacy,
    });
    root.classList.toggle(ROTATE_GATE_ACTIVE_CLASS, show);
  };

  apply();

  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  const onMql = (): void => {
    apply();
  };
  // Modern + Safari legacy
  coarseMql?.addEventListener?.('change', onMql);
  hoverMql?.addEventListener?.('change', onMql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (coarseMql as any)?.addListener?.(onMql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (hoverMql as any)?.addListener?.(onMql);

  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
    coarseMql?.removeEventListener?.('change', onMql);
    hoverMql?.removeEventListener?.('change', onMql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (coarseMql as any)?.removeListener?.(onMql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (hoverMql as any)?.removeListener?.(onMql);
  };
}
