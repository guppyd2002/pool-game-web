/**
 * State serialization — port of C# CmRigidbodyState, CmSpaceState, CmKinematicState.
 * Format: fields separated by ":", states separated by "|".
 */

import type { Fixed } from './fixed-math';
import { CmVector } from './cm-vector';
import { CmSimpleVector } from './cm-vector';

// Forward reference type for CmRigidbody (avoid circular import)
import type { CmRigidbody } from './cm-rigidbody';

// ─── CmRigidbodyState ────────────────────────────────────────────────────────

/** Rigidbody state for save/restore (matches C# CmRigidbodyState) */
export class CmRigidbodyState {
  isActive = false;
  isKinematic = false;
  isOutOfCube = false;
  kinematicTriggerId = 0;
  position = CmVector.zero;
  right = CmVector.Right;
  up = CmVector.Up;
  forward = CmVector.Forward;
  velocity = CmVector.zero;
  angularVelocity = CmVector.zero;
  firstHitDirection = CmVector.zero;

  /** Create from rigidbody */
  static fromBody(body: CmRigidbody): CmRigidbodyState {
    const s = new CmRigidbodyState();
    s.isActive = body.isActive;
    s.isKinematic = body.isKinematic;
    s.isOutOfCube = body.isOutOfCube;
    s.kinematicTriggerId = body.kinematicTriggerId;
    s.position = body.collider.position;
    s.right = body.collider.right;
    s.up = body.collider.up;
    s.forward = body.collider.forward;
    s.velocity = body.velocity;
    s.angularVelocity = body.angularVelocity;
    s.firstHitDirection = body.firstHitDirection;
    return s;
  }

  /** Deserialize from string "isActive:isKinematic:isOutOfCube:triggerId:pos:right:up:fwd:vel:angVel:firstHitDir" */
  static fromString(stringState: string): CmRigidbodyState {
    const s = new CmRigidbodyState();
    let str = '';
    let id = 0;
    for (const ch of stringState) {
      if (ch === ':') {
        switch (id) {
          case 0: s.isActive = str === '1'; break;
          case 1: s.isKinematic = str === '1'; break;
          case 2: s.isOutOfCube = str === '1'; break;
          case 3: s.kinematicTriggerId = parseInt(str, 10) || 0; break;
          case 4: s.position = CmVector.fromString(str); break;
          case 5: s.right = CmVector.fromString(str); break;
          case 6: s.up = CmVector.fromString(str); break;
          case 7: s.forward = CmVector.fromString(str); break;
          case 8: s.velocity = CmVector.fromString(str); break;
          case 9: s.angularVelocity = CmVector.fromString(str); break;
        }
        str = '';
        id++;
      } else {
        str += ch;
      }
    }
    // Last field (firstHitDirection) has no trailing ':'
    s.firstHitDirection = CmVector.fromString(str);
    return s;
  }

  /** Serialize to string */
  toStringState(): string {
    return (this.isActive ? '1' : '0') + ':' +
      (this.isKinematic ? '1' : '0') + ':' +
      (this.isOutOfCube ? '1' : '0') + ':' +
      this.kinematicTriggerId + ':' +
      this.position.toString() + ':' +
      this.right.toString() + ':' +
      this.up.toString() + ':' +
      this.forward.toString() + ':' +
      this.velocity.toString() + ':' +
      this.angularVelocity.toString() + ':' +
      this.firstHitDirection.toString();
  }
}

// ─── CmSpaceState ────────────────────────────────────────────────────────────

/** Space state — array of body states (matches C# CmSpaceState) */
export class CmSpaceState {
  states: CmRigidbodyState[];

  constructor(states: CmRigidbodyState[]) {
    this.states = states;
  }

  /** Serialize to string "state1|state2|...|stateN" */
  toStringState(): string {
    return this.states.map(s => s.toStringState()).join('|');
  }

  /** Deserialize from string */
  static fromString(stringState: string): CmSpaceState {
    let str = '';
    const statesList: CmRigidbodyState[] = [];
    for (const ch of stringState) {
      if (ch === '|') {
        statesList.push(CmRigidbodyState.fromString(str));
        str = '';
      } else {
        str += ch;
      }
    }
    statesList.push(CmRigidbodyState.fromString(str));
    return new CmSpaceState(statesList);
  }
}

// ─── CmKinematicState ────────────────────────────────────────────────────────

/** Kinematic state for network sync (matches C# CmKinematicState) */
export class CmKinematicState {
  constructor(
    public id: number,
    public time: Fixed,
    public isActive: boolean,
    public position: CmSimpleVector,
    public velocity: CmSimpleVector,
    public angularVelocity: CmSimpleVector,
    public isKinematic: boolean,
    public kinematicTriggerId: number,
    public isOutOfCube: boolean,
  ) {}

  toString(): string {
    return this.id + ':' + this.time + ':' + this.isActive + ':' +
      this.position.toString() + ':' + this.isKinematic + ':' +
      this.kinematicTriggerId + ':' + this.isOutOfCube + ':' +
      this.velocity.toString() + ':' + this.angularVelocity.toString() + ':';
  }

  /** Deserialize from toString() output (single state, trailing colon included or omitted).
   *
   *  Serialization order (toString):  id:time:isActive:pos:isKinematic:triggerId:isOutOfCube:vel:angVel:
   *  Constructor order:               id, time, isActive, pos, vel, angVel, isKinematic, triggerId, isOutOfCube
   *  The two orders differ — vel/angVel appear at serialized slots 7/8 but are constructed at slots 4/5.
   */
  static fromString(s: string): CmKinematicState {
    // CmSimpleVector.toString() never emits ':', so split(':') on a single state gives 10 parts (last = '').
    const p = s.split(':');
    return new CmKinematicState(
      parseInt(p[0], 10),               // id
      parseInt(p[1], 10),               // time
      p[2] === 'true',                   // isActive
      CmSimpleVector.fromString(p[3]),   // position   (serialized slot 3, constructed slot 3)
      CmSimpleVector.fromString(p[7]),   // velocity   (serialized slot 7, constructed slot 4)
      CmSimpleVector.fromString(p[8]),   // angVel     (serialized slot 8, constructed slot 5)
      p[4] === 'true',                   // isKinematic (serialized slot 4, constructed slot 6)
      parseInt(p[5], 10) || 0,         // triggerId  (serialized slot 5, constructed slot 7)
      p[6] === 'true',                   // isOutOfCube (serialized slot 6, constructed slot 8)
    );
  }

  /** Parse the concatenated kinematicStates stream back into individual states.
   *  Each state is 9 colon-delimited fields followed by a trailing ':', so every
   *  9 tokens in the split array forms one state. */
  static parseStream(stream: string): CmKinematicState[] {
    if (!stream) return [];
    const parts = stream.split(':');
    const states: CmKinematicState[] = [];
    for (let i = 0; i + 9 <= parts.length; i += 9) {
      states.push(CmKinematicState.fromString(parts.slice(i, i + 9).join(':') + ':'));
    }
    return states;
  }
}
