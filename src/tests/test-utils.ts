import { UseFormStorageAdapter } from '../types';

export const createMockRemoteStore = (options?: {
  delayMs?: number;
  /**
   * Per-call latency for setItem, by call index. Lets a test make an earlier
   * write slower than a later one to provoke out-of-order completion. Calls
   * beyond the end of the list fall back to `delayMs`.
   */
  saveDelaysMs?: number[];
  shouldFailRestore?: boolean;
  shouldFailSave?: boolean;
  shouldFailClear?: boolean;
}): UseFormStorageAdapter & {
  /** Values that actually reached setItem, in completion order. */
  writes: string[];
} => {
  const memory: Record<string, string> = {};
  const delay = options?.delayMs ?? 100;
  const writes: string[] = [];
  let saveCall = 0;

  const simulateNetwork = async <T>(fn: () => T, ms = delay): Promise<T> => {
    await new Promise((res) => setTimeout(res, ms));
    return fn();
  };

  return {
    writes,

    getItem: async (key) =>
      simulateNetwork(() => {
        if (options?.shouldFailRestore) {
          throw new Error('Simulated restore failure');
        }
        return memory[key] ?? null;
      }),

    setItem: async (key, value) => {
      const saveDelay = options?.saveDelaysMs?.[saveCall] ?? delay;
      saveCall += 1;

      return simulateNetwork(() => {
        if (options?.shouldFailSave) {
          throw new Error('Simulated save failure');
        }
        memory[key] = value;
        writes.push(value);
      }, saveDelay);
    },

    removeItem: async (key) =>
      simulateNetwork(() => {
        if (options?.shouldFailClear) {
          throw new Error('Simulated clear failure');
        }
        delete memory[key];
      }),
  };
};
