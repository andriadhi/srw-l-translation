export type PatchState =
  | 'idle'
  | 'hashing'
  | 'verified'
  | 'fetching'
  | 'decrypting'
  | 'patching'
  | 'validating'
  | 'done'
  | 'failed'
  | 'cancelled';

const ALLOWED: Record<PatchState, PatchState[]> = {
  idle: ['hashing'],
  hashing: ['verified', 'failed', 'cancelled'],
  verified: ['fetching', 'hashing', 'idle'],
  fetching: ['decrypting', 'failed', 'cancelled'],
  decrypting: ['patching', 'failed', 'cancelled'],
  patching: ['validating', 'failed', 'cancelled'],
  validating: ['done', 'failed', 'cancelled'],
  done: ['verified', 'idle'],
  failed: ['idle', 'hashing'],
  cancelled: ['idle', 'hashing'],
};

export class IllegalTransition extends Error {
  constructor(from: PatchState, to: PatchState) {
    super(`transisi state tidak sah: ${from} → ${to}`);
    this.name = 'IllegalTransition';
  }
}

export const BUSY_STATES: readonly PatchState[] = [
  'hashing',
  'fetching',
  'decrypting',
  'patching',
  'validating',
];

export class PatchStateMachine {
  #state: PatchState = 'idle';
  #history: PatchState[] = ['idle'];

  get state(): PatchState {
    return this.#state;
  }

  get history(): readonly PatchState[] {
    return this.#history;
  }

  get actionEnabled(): boolean {
    return this.#state === 'verified';
  }

  get downloadVisible(): boolean {
    return this.#state === 'done';
  }

  get isBusy(): boolean {
    return BUSY_STATES.includes(this.#state);
  }

  canTransition(to: PatchState): boolean {
    return ALLOWED[this.#state].includes(to);
  }

  transition(to: PatchState): PatchState {
    if (!this.canTransition(to)) {
      throw new IllegalTransition(this.#state, to);
    }
    this.#state = to;
    this.#history.push(to);
    return this.#state;
  }

  reset(): void {
    this.#state = 'idle';
    this.#history = ['idle'];
  }

  assertCanPatch(): void {
    if (this.#state !== 'verified') {
      throw new IllegalTransition(this.#state, 'fetching');
    }
  }
}
