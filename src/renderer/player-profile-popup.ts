/**
 * POPUP-002 — player profile popup (P1-T08).
 * C# PlayerProfileUI: avatar + display name; self-edit; opponent read-only.
 * P1: localStorage profile only (no PlayFab stats).
 */

const LS_NAME = 'pool.profile.name';
const LS_AVATAR = 'pool.profile.avatar';

const AVATAR_CHOICES = ['🎱', '😎', '🦊', '🐼', '🐯', '🦁', '🐸', '🦄'];

export interface PlayerProfile {
  name: string;
  avatar: string;
}

export function loadPlayerProfile(): PlayerProfile {
  return {
    name: localStorage.getItem(LS_NAME) || 'Player 1',
    avatar: localStorage.getItem(LS_AVATAR) || '🎱',
  };
}

export function savePlayerProfile(p: PlayerProfile): void {
  localStorage.setItem(LS_NAME, p.name.slice(0, 24));
  localStorage.setItem(LS_AVATAR, p.avatar);
}

export interface PlayerProfilePopup {
  show(opts?: { readOnly?: boolean; name?: string; avatar?: string }): void;
  hide(): void;
  getProfile(): PlayerProfile;
  onChange: ((p: PlayerProfile) => void) | null;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createPlayerProfilePopup(container: HTMLElement): PlayerProfilePopup {
  let profile = loadPlayerProfile();
  let readOnly = false;

  const el = document.createElement('div');
  el.id = 'popup-profile';
  el.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'z-index:360', 'pointer-events:none',
    'font-family:sans-serif', 'color:#fff',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'pointer-events:auto',
    'background:#1a1a2e', 'border-radius:12px',
    'padding:20px 24px', 'min-width:min(90vw,300px)',
    'border:1px solid rgba(255,255,255,0.15)',
    'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Player Profile';
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:14px;text-align:center;';
  card.appendChild(title);

  const avatarBig = document.createElement('div');
  avatarBig.style.cssText = 'font-size:56px;text-align:center;line-height:1;margin-bottom:12px;';
  card.appendChild(avatarBig);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 24;
  nameInput.style.cssText = [
    'width:100%', 'box-sizing:border-box',
    'padding:10px 12px', 'border-radius:6px',
    'border:1px solid rgba(255,255,255,0.25)',
    'background:rgba(0,0,0,0.35)', 'color:#fff',
    'font-size:15px', 'margin-bottom:12px',
  ].join(';');
  card.appendChild(nameInput);

  const avatarRow = document.createElement('div');
  avatarRow.style.cssText =
    'display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:14px;';
  card.appendChild(avatarRow);

  const buttons: HTMLButtonElement[] = [];
  for (const a of AVATAR_CHOICES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a;
    b.style.cssText = [
      'width:40px', 'height:40px', 'font-size:22px',
      'border-radius:8px', 'border:1px solid rgba(255,255,255,0.2)',
      'background:rgba(255,255,255,0.08)', 'cursor:pointer', 'padding:0',
    ].join(';');
    b.addEventListener('click', () => {
      if (readOnly) return;
      profile = { ...profile, avatar: a };
      avatarBig.textContent = a;
      _paintAvatarSel();
    });
    buttons.push(b);
    avatarRow.appendChild(b);
  }

  function _paintAvatarSel(): void {
    for (let i = 0; i < buttons.length; i++) {
      const on = AVATAR_CHOICES[i] === profile.avatar;
      buttons[i].style.borderColor = on ? '#4caf50' : 'rgba(255,255,255,0.2)';
      buttons[i].style.background = on ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.08)';
    }
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = [
    'flex:1', 'padding:10px', 'border:none', 'border-radius:6px',
    'background:#4caf50', 'color:#fff', 'font-size:14px', 'cursor:pointer',
  ].join(';');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = [
    'flex:1', 'padding:10px', 'border:none', 'border-radius:6px',
    'background:#555', 'color:#fff', 'font-size:14px', 'cursor:pointer',
  ].join(';');

  actions.appendChild(saveBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);
  el.appendChild(card);
  container.appendChild(el);

  const api: PlayerProfilePopup = {
    onChange: null,
    get element() { return el; },

    getProfile(): PlayerProfile {
      return { ...loadPlayerProfile() };
    },

    show(opts): void {
      readOnly = !!opts?.readOnly;
      if (opts?.name != null || opts?.avatar != null) {
        profile = {
          name: opts.name ?? profile.name,
          avatar: opts.avatar ?? profile.avatar,
        };
      } else {
        profile = loadPlayerProfile();
      }
      avatarBig.textContent = profile.avatar;
      nameInput.value = profile.name;
      nameInput.disabled = readOnly;
      nameInput.style.opacity = readOnly ? '0.7' : '1';
      saveBtn.style.display = readOnly ? 'none' : 'block';
      avatarRow.style.pointerEvents = readOnly ? 'none' : 'auto';
      avatarRow.style.opacity = readOnly ? '0.6' : '1';
      title.textContent = readOnly ? 'Opponent Profile' : 'Player Profile';
      _paintAvatarSel();
      el.style.display = 'flex';
    },

    hide(): void {
      el.style.display = 'none';
    },

    dispose(): void {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };

  saveBtn.addEventListener('click', () => {
    profile = { name: nameInput.value.trim() || 'Player 1', avatar: profile.avatar };
    savePlayerProfile(profile);
    api.onChange?.(profile);
    api.hide();
  });
  closeBtn.addEventListener('click', () => api.hide());

  return api;
}
