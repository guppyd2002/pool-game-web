/**
 * POPUP-009 — cue select / equip popup (P1-T08).
 * C# CuesPopupUI: browse groups, equip. Purchase/upgrade DEFERRED P3.
 * P1: free starter set; equip persists to localStorage.
 */

import { getDefaultPlayerDataManager } from '../game/player-data-manager';
import { setEquippedCue as setEquippedOnData, addAndSetCue } from '../game/player-data';

export interface CueDef {
  readonly id: string;
  readonly name: string;
  /** Aim assist flavour 0–1 (display only for now). */
  readonly aim: number;
  /** Power flavour 0–1 (display only). */
  readonly power: number;
  /** Owned if free starter or in PlayerData.ownedCues. */
  readonly owned: boolean;
}

/** Starter cue catalogue (no IAP). Legend locked until unlock/P3. */
export const CUE_CATALOGUE_BASE: readonly Omit<CueDef, 'owned'>[] = [
  { id: 'standard', name: 'Standard', aim: 0.5, power: 0.5 },
  { id: 'pro', name: 'Pro Stick', aim: 0.7, power: 0.6 },
  { id: 'sniper', name: 'Sniper', aim: 0.9, power: 0.45 },
  { id: 'legend', name: 'Legend', aim: 0.85, power: 0.85 },
];

/** Dynamic catalogue with owned flags from player data. */
export function getCueCatalogue(): readonly CueDef[] {
  const owned = new Set(getDefaultPlayerDataManager().getPlayerData().ownedCues);
  // Free starters always owned
  owned.add('standard');
  owned.add('pro');
  owned.add('sniper');
  return CUE_CATALOGUE_BASE.map((c) => ({ ...c, owned: owned.has(c.id) }));
}

/** @deprecated use getCueCatalogue — kept for tests that expect static list shape */
export const CUE_CATALOGUE: readonly CueDef[] = CUE_CATALOGUE_BASE.map((c) => ({
  ...c,
  owned: c.id !== 'legend',
}));

export function loadEquippedCueId(): string {
  const p = getDefaultPlayerDataManager().getPlayerData();
  const cat = getCueCatalogue();
  return cat.some((c) => c.id === p.cueId && c.owned) ? p.cueId : 'standard';
}

export function saveEquippedCueId(id: string): void {
  const mgr = getDefaultPlayerDataManager();
  const next = setEquippedOnData(mgr.getPlayerData(), id);
  if (next) mgr.savePlayerData(next);
}

/** DATA-007: unlock + equip (e.g. reward path). */
export function unlockAndEquipCue(id: string): void {
  const mgr = getDefaultPlayerDataManager();
  mgr.savePlayerData(addAndSetCue(mgr.getPlayerData(), id));
}

export function getEquippedCue(): CueDef {
  const id = loadEquippedCueId();
  return getCueCatalogue().find((c) => c.id === id) ?? getCueCatalogue()[0];
}

export interface CuesPopup {
  show(): void;
  hide(): void;
  getEquippedId(): string;
  onEquip: ((cue: CueDef) => void) | null;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createCuesPopup(container: HTMLElement): CuesPopup {
  let equipped = loadEquippedCueId();

  const el = document.createElement('div');
  el.id = 'popup-cues';
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
    'padding:18px 20px', 'min-width:min(92vw,320px)', 'max-width:360px',
    'border:1px solid rgba(255,255,255,0.15)',
    'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Cues';
  title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:6px;text-align:center;';
  card.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = 'Equip a stick · Buy/upgrade in a later update';
  sub.style.cssText = 'font-size:11px;opacity:0.55;margin-bottom:12px;text-align:center;';
  card.appendChild(sub);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow:auto;';
  card.appendChild(list);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = [
    'margin-top:14px', 'width:100%',
    'padding:10px', 'border:none', 'border-radius:6px',
    'background:#555', 'color:#fff', 'font-size:14px', 'cursor:pointer',
  ].join(';');
  card.appendChild(closeBtn);

  el.appendChild(card);
  container.appendChild(el);

  const api: CuesPopup = {
    onEquip: null,
    get element() { return el; },
    getEquippedId: () => loadEquippedCueId(),

    show(): void {
      equipped = loadEquippedCueId();
      _renderList();
      el.style.display = 'flex';
    },

    hide(): void {
      el.style.display = 'none';
    },

    dispose(): void {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };

  function _renderList(): void {
    list.innerHTML = '';
    equipped = loadEquippedCueId();
    for (const cue of getCueCatalogue()) {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:10px 12px', 'border-radius:8px',
        'border:1px solid ' + (cue.id === equipped ? '#4caf50' : 'rgba(255,255,255,0.12)'),
        'background:' + (cue.id === equipped ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)'),
      ].join(';');

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      info.innerHTML =
        `<div style="font-weight:700;font-size:14px;">${cue.name}</div>` +
        `<div style="font-size:11px;opacity:0.65;">Aim ${Math.round(cue.aim * 100)} · Power ${Math.round(cue.power * 100)}</div>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (!cue.owned) {
        btn.textContent = 'Soon';
        btn.disabled = true;
        btn.style.cssText =
          'padding:6px 12px;border-radius:6px;border:none;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);font-size:12px;';
      } else if (cue.id === equipped) {
        btn.textContent = 'Equipped';
        btn.disabled = true;
        btn.style.cssText =
          'padding:6px 12px;border-radius:6px;border:none;background:#4caf50;color:#fff;font-size:12px;';
      } else {
        btn.textContent = 'Equip';
        btn.style.cssText =
          'padding:6px 12px;border-radius:6px;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:12px;cursor:pointer;';
        btn.addEventListener('click', () => {
          saveEquippedCueId(cue.id);
          equipped = cue.id;
          api.onEquip?.(cue);
          _renderList();
        });
      }

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  closeBtn.addEventListener('click', () => api.hide());
  return api;
}
