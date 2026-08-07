/**
 * UI-007 / POPUP-005 structure — settings panel (P1-T07).
 * Toggles persist to localStorage. Audio wiring deferred to P1-T10 (AUD).
 * Structure only: music/sfx/auto-cue; FB DEFERRED.
 */

const LS_MUSIC = 'pool.settings.music';
const LS_SFX = 'pool.settings.sfx';
const LS_AUTO_CUE = 'pool.settings.autoCue';

export interface SettingsState {
  music: boolean;
  sfx: boolean;
  autoCue: boolean;
}

export function loadSettings(): SettingsState {
  return {
    music: localStorage.getItem(LS_MUSIC) !== '0',
    sfx: localStorage.getItem(LS_SFX) !== '0',
    autoCue: localStorage.getItem(LS_AUTO_CUE) === '1',
  };
}

export function saveSettings(s: SettingsState): void {
  localStorage.setItem(LS_MUSIC, s.music ? '1' : '0');
  localStorage.setItem(LS_SFX, s.sfx ? '1' : '0');
  localStorage.setItem(LS_AUTO_CUE, s.autoCue ? '1' : '0');
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

  const el = document.createElement('div');
  el.id = 'settings-panel';
  el.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.72)',
    'color:#fff', 'font-family:sans-serif',
    'z-index:350',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'background:#1a1a2e', 'border-radius:12px',
    'padding:20px 24px', 'min-width:min(88vw,280px)',
    'border:1px solid rgba(255,255,255,0.15)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Settings';
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:16px;text-align:center;';
  card.appendChild(title);

  function _row(label: string, key: keyof SettingsState): void {
    const row = document.createElement('label');
    row.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin:10px 0;font-size:14px;cursor:pointer;';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state[key];
    input.style.width = '18px';
    input.style.height = '18px';
    input.addEventListener('change', () => {
      state = { ...state, [key]: input.checked };
      saveSettings(state);
    });
    row.appendChild(span);
    row.appendChild(input);
    card.appendChild(row);
  }

  _row('Music', 'music');
  _row('Sound effects', 'sfx');
  _row('Auto cue (AI assist)', 'autoCue');

  const note = document.createElement('div');
  note.textContent = 'Audio hooks land in P1-T10';
  note.style.cssText = 'font-size:11px;opacity:0.5;margin-top:8px;text-align:center;';
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

  return {
    get element() { return el; },
    show(): void {
      state = loadSettings();
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
