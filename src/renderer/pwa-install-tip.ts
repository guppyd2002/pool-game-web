/**
 * Phase 1 / 0-G — one-shot “Add to Home Screen” tip.
 * Install is user-driven; tip only appears outside standalone / fullscreen.
 * Dismiss persists in localStorage. No service worker required for the tip itself.
 */

const STORAGE_KEY = 'hp.pwaInstallTip.dismissed';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

export function createPwaInstallTip(container: HTMLElement): { dispose(): void } {
  if (isStandaloneDisplay()) return { dispose() { /* noop */ } };
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return { dispose() { /* noop */ } };
  } catch {
    /* private mode */
  }

  // Prefer coarse / narrow — skip wide desktop mouse sessions.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const narrow = window.matchMedia?.('(max-width: 1024px)').matches;
  if (!coarse && !narrow) return { dispose() { /* noop */ } };

  const tip = document.createElement('div');
  tip.id = 'pwa-install-tip';
  tip.setAttribute('role', 'status');
  tip.style.cssText = [
    'position:fixed',
    'z-index:250',
    'left:50%',
    'transform:translateX(-50%)',
    'bottom:max(12px, env(safe-area-inset-bottom, 0px))',
    'max-width:min(420px, calc(100vw - 24px))',
    'padding:10px 12px',
    'border-radius:8px',
    'background:rgba(10,10,26,0.92)',
    'border:1px solid rgba(255,255,255,0.22)',
    'color:#fff',
    'font:12px/1.4 sans-serif',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.45)',
  ].join(';');

  const text = document.createElement('div');
  text.style.cssText = 'flex:1;min-width:0';
  text.textContent =
    'Add to Home Screen for fullscreen play (Safari Share → Add to Home Screen).';

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = '✕';
  dismiss.title = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss install tip');
  dismiss.style.cssText = [
    'flex:0 0 auto',
    'min-width:44px',
    'min-height:44px',
    'background:transparent',
    'border:none',
    'color:#fff',
    'font-size:16px',
    'cursor:pointer',
  ].join(';');

  const hide = (): void => {
    tip.remove();
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  dismiss.addEventListener('click', hide);

  tip.appendChild(text);
  tip.appendChild(dismiss);
  container.appendChild(tip);

  return {
    dispose(): void {
      tip.remove();
    },
  };
}
