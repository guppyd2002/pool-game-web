/**
 * P1-T11 / FEAT-SET-001~003 — SettingsUI + BallPool Settings persistence.
 * Unity-Ref: SettingsUI.cs / Settings static class (AudioIsOn, MusicIsOn, IsAutoControl).
 *
 * - SET-001 sfx  → localStorage + live consumers (AudioManager reads isSfxOn)
 * - SET-002 music → localStorage + OnMusic subscribers (no BGM player in P1)
 * - SET-003 autoCue → localStorage + OnCueIsAuto subscribers (CUE reads isAutoCueOn)
 * FB DEFERRED (SET-004).
 */

const LS_MUSIC = 'pool.settings.music';
const LS_SFX = 'pool.settings.sfx';
const LS_AUTO_CUE = 'pool.settings.autoCue';

export interface SettingsState {
  music: boolean;
  sfx: boolean;
  autoCue: boolean;
}

export type SettingsListener = (s: SettingsState) => void;

const _listeners = new Set<SettingsListener>();

/** Subscribe to settings changes (Unity Settings.OnAudio / OnMusic / OnCueIsAutoToggle). */
export function subscribeSettings(fn: SettingsListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function _notify(s: SettingsState): void {
  for (const fn of _listeners) fn(s);
}

export function loadSettings(): SettingsState {
  return {
    // Unity: PlayerPrefs "MusicIsOf" / "AudioIsOf" — 0 means ON (inverted). We store 1=on.
    music: localStorage.getItem(LS_MUSIC) !== '0',
    sfx: localStorage.getItem(LS_SFX) !== '0',
    // Unity default IsAutoControl=1 (ON). Web P1-T07 locked default OFF (tests + top-view UX).
    autoCue: localStorage.getItem(LS_AUTO_CUE) === '1',
  };
}

export function saveSettings(s: SettingsState): void {
  localStorage.setItem(LS_MUSIC, s.music ? '1' : '0');
  localStorage.setItem(LS_SFX, s.sfx ? '1' : '0');
  localStorage.setItem(LS_AUTO_CUE, s.autoCue ? '1' : '0');
  _notify(s);
}

/** SET-001 live read (AudioManager). */
export function isSfxOn(): boolean {
  return loadSettings().sfx;
}

/** SET-002 live read (BGM when present). */
export function isMusicOn(): boolean {
  return loadSettings().music;
}

/** SET-003 live read (cue auto-control / aim assist preference). */
export function isAutoCueOn(): boolean {
  return loadSettings().autoCue;
}

export interface SettingsPanel {
  show(): void;
  hide(): void;
  getState(): SettingsState;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createSettingsPanel(container: HTMLElement): SettingsPanel {
  let state = loadSettings();
  const inputs = new Map<keyof SettingsState, HTMLInputElement>();

  const el = document.createElement('div');
  el.id = 'settings-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Settings');
  el.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.72)',
    'color:#fff', 'font-family:sans-serif',
    'z-index:350',
    'padding:max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px))',
    'box-sizing:border-box',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#1a1a2e', 'border-radius:12px',
    'padding:20px 24px', 'min-width:min(88vw,280px)', 'max-width:min(92vw,320px)',
    'width:100%',
    'border:1px solid rgba(255,255,255,0.15)',
    'box-sizing:border-box',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Settings';
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:16px;text-align:center;';
  card.appendChild(title);

  function _row(label: string, key: keyof SettingsState): void {
    const row = document.createElement('label');
    row.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin:10px 0;font-size:14px;cursor:pointer;gap:12px;';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state[key];
    input.setAttribute('data-setting', key);
    input.style.width = '18px';
    input.style.height = '18px';
    input.style.flexShrink = '0';
    input.addEventListener('change', () => {
      state = { ...state, [key]: input.checked };
      saveSettings(state);
    });
    inputs.set(key, input);
    row.appendChild(span);
    row.appendChild(input);
    card.appendChild(row);
  }

  _row('Music', 'music');
  _row('Sound effects', 'sfx');
  _row('Auto cue (AI assist)', 'autoCue');

  const note = document.createElement('div');
  note.textContent = 'SFX applies immediately. Music toggle is stored for BGM.';
  note.style.cssText = 'font-size:11px;opacity:0.5;margin-top:8px;text-align:center;line-height:1.35;';
  card.appendChild(note);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = [
    'margin-top:16px', 'width:100%',
    'padding:10px', 'border:none', 'border-radius:6px',
    'background:#4caf50', 'color:#fff', 'font-size:15px', 'cursor:pointer',
  ].join(';');
  close.addEventListener('click', () => {
    el.style.display = 'none';
  });
  card.appendChild(close);

  el.appendChild(card);
  el.addEventListener('click', (e) => {
    if (e.target === el) el.style.display = 'none';
  });
  container.appendChild(el);

  function _syncInputs(): void {
    state = loadSettings();
    for (const [key, input] of inputs) {
      input.checked = state[key];
    }
  }

  return {
    get element() { return el; },
    show(): void {
      _syncInputs();
      el.style.display = 'flex';
    },
    hide(): void {
      el.style.display = 'none';
    },
    getState(): SettingsState {
      return { ...state };
    },
    dispose(): void {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
