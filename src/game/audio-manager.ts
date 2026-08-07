/**
 * P1-T10 — AudioManager (FEAT-AUD-001~004).
 * C# AudioManager.cs: force/speed-tiered clips + Settings.AudioIsOn.
 *
 * Web: Web Audio API procedural SFX (no sample assets in repo).
 * - AUD-001 cue shot by force01
 * - AUD-002 ball-ball / cushion by relative intensity (0.35s ball-ball throttle)
 * - AUD-003 pocket / out-of-table
 * - AUD-004 mute via isSfxOn() (settings.sfx)
 *
 * Unlock AudioContext on first user gesture (WebGL/browser autoplay policy).
 */

import type { ContactEvent, ShotResult } from './ball-pool-physics';

/** Global volume multiplier (Unity globalVolume ≈ 0.3). */
export const AUDIO_GLOBAL_VOLUME = 0.35;

/** Ball-ball throttle (Unity 0.35s). */
export const BALL_HIT_THROTTLE_S = 0.35;

/** Number of synthetic "clip" tiers (Unity uses AudioClip[] length). */
export const SFX_TIER_COUNT = 4;

/**
 * Map 0–1 intensity to clip index 0..n-1 (Unity GetIndex).
 * Pure — unit-tested.
 */
export function clipIndexFrom01(t01: number, n: number = SFX_TIER_COUNT): number {
  if (n <= 1) return 0;
  const t = Math.max(0, Math.min(1, t01));
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

/** Impulse magnitude / maxForce → 0–1. */
export function force01FromImpulseMag(mag: number, maxForce: number): number {
  if (maxForce <= 0) return 0;
  return Math.max(0, Math.min(1, mag / maxForce));
}

export type SfxKind =
  | 'cueShot'
  | 'ballHitBall'
  | 'ballHitCushion'
  | 'ballInPocket'
  | 'ballOutOfTable';

export interface AudioManager {
  /** Call from first pointer/click (unlocks AudioContext). */
  unlock(): void;
  playCueShot(force01: number): void;
  /** Real shot only — never call during pure visual replay re-sim. */
  playShotResult(result: ShotResult, force01: number): void;
  playUnselectCueBall(): void;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  dispose(): void;
}

export function createAudioManager(opts?: {
  isSfxOn?: () => boolean;
  nowS?: () => number;
}): AudioManager {
  const isSfxOn = opts?.isSfxOn ?? (() => true);
  const nowS = opts?.nowS ?? (() => performance.now() / 1000);

  let ctx: AudioContext | null = null;
  let enabled = true;
  let lastBallHitS = -Infinity;

  function _ctx(): AudioContext | null {
    if (typeof AudioContext === 'undefined' && typeof (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext === 'undefined') {
      return null;
    }
    if (!ctx) {
      const AC = AudioContext || (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    return ctx;
  }

  function _muted(): boolean {
    return !enabled || !isSfxOn();
  }

  /** Procedural one-shot: noise burst + optional tone. */
  function _beep(kind: SfxKind, intensity01: number): void {
    if (_muted()) return;
    const ac = _ctx();
    if (!ac) return;
    if (ac.state === 'suspended') {
      void ac.resume();
    }

    const t = ac.currentTime;
    const tier = clipIndexFrom01(intensity01);
    const gainBase = AUDIO_GLOBAL_VOLUME * (0.35 + 0.65 * intensity01);

    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    // Noise buffer (short)
    const dur = kind === 'cueShot' ? 0.12 + tier * 0.03
      : kind === 'ballInPocket' ? 0.25
        : kind === 'ballOutOfTable' ? 0.35
          : 0.06 + tier * 0.02;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const env = 1 - i / n;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const noise = ac.createBufferSource();
    noise.buffer = buf;

    const filter = ac.createBiquadFilter();
    // Shape by kind
    switch (kind) {
      case 'cueShot':
        filter.type = 'lowpass';
        filter.frequency.value = 400 + tier * 350;
        break;
      case 'ballHitBall':
        filter.type = 'bandpass';
        filter.frequency.value = 1200 + tier * 800;
        filter.Q.value = 2;
        break;
      case 'ballHitCushion':
        filter.type = 'lowpass';
        filter.frequency.value = 280 + tier * 200;
        break;
      case 'ballInPocket':
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        break;
      case 'ballOutOfTable':
        filter.type = 'highpass';
        filter.frequency.value = 200;
        break;
    }

    noise.connect(filter);
    filter.connect(master);

    // Optional tone layer for cue / pocket
    if (kind === 'cueShot' || kind === 'ballInPocket') {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      const base = kind === 'cueShot' ? 80 + tier * 30 : 220 - intensity01 * 80;
      osc.frequency.setValueAtTime(base, t);
      if (kind === 'ballInPocket') {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.4), t + dur);
      }
      const og = ac.createGain();
      og.gain.value = gainBase * 0.4;
      osc.connect(og);
      og.connect(master);
      osc.start(t);
      osc.stop(t + dur);
    }

    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(gainBase, t + 0.005);
    master.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.start(t);
    noise.stop(t + dur + 0.02);
  }

  return {
    unlock(): void {
      const ac = _ctx();
      if (ac && ac.state === 'suspended') void ac.resume();
    },

    playCueShot(force01: number): void {
      _beep('cueShot', Math.max(0, Math.min(1, force01)));
    },

    playShotResult(result: ShotResult, force01: number): void {
      // AUD-001
      this.playCueShot(force01);

      // AUD-002 contacts — first N only to avoid spam; ball-ball throttled
      const maxContacts = 24;
      for (let i = 0; i < Math.min(result.contacts.length, maxContacts); i++) {
        const c = result.contacts[i];
        // Intensity fades with contact index (proxy without per-contact velocity)
        const intensity = Math.max(0.15, 1 - i * 0.04) * (0.4 + 0.6 * force01);
        if (c.kind === 'ball') {
          const t = nowS();
          if (t - lastBallHitS < BALL_HIT_THROTTLE_S) continue;
          lastBallHitS = t;
          _beep('ballHitBall', intensity);
        } else {
          _beep('ballHitCushion', intensity);
        }
      }

      // AUD-003 — cue pocket still plays soft (Unity OnBallInPocket)
      for (const p of result.pocketed) {
        const intensity = p.ballId === 0
          ? 0.35 + 0.2 * force01
          : 0.55 + 0.3 * force01;
        _beep('ballInPocket', intensity);
      }
      for (const _o of result.outOfTable) {
        _beep('ballOutOfTable', 0.7);
      }
    },

    playUnselectCueBall(): void {
      _beep('ballHitCushion', 0.25);
    },

    setEnabled(on: boolean): void {
      enabled = on;
    },

    isEnabled(): boolean {
      return enabled && isSfxOn();
    },

    dispose(): void {
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}

/** Pure helper: play schedule description for tests (no AudioContext). */
export function planShotSfx(
  contacts: readonly ContactEvent[],
  pocketedCount: number,
  outCount: number,
  force01: number,
  nowS: number,
  lastBallHitS: number,
): { kinds: SfxKind[]; nextBallHitS: number } {
  const kinds: SfxKind[] = ['cueShot'];
  let last = lastBallHitS;
  const maxContacts = 24;
  for (let i = 0; i < Math.min(contacts.length, maxContacts); i++) {
    const c = contacts[i];
    if (c.kind === 'ball') {
      if (nowS - last < BALL_HIT_THROTTLE_S) continue;
      last = nowS;
      kinds.push('ballHitBall');
    } else {
      kinds.push('ballHitCushion');
    }
  }
  for (let i = 0; i < pocketedCount; i++) kinds.push('ballInPocket');
  for (let i = 0; i < outCount; i++) kinds.push('ballOutOfTable');
  void force01;
  return { kinds, nextBallHitS: last };
}
