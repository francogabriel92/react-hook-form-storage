import { UseFormStorageAdapter } from '../types';

export const createMockRemoteStore = (options?: {
  delayMs?: number;
  shouldFailRestore?: boolean;
  shouldFailSave?: boolean;
  shouldFailClear?: boolean;
}): UseFormStorageAdapter => {
  const memory: Record<string, string> = {};
  const delay = options?.delayMs ?? 100;

  const simulateNetwork = async <T>(fn: () => T): Promise<T> => {
    await new Promise((res) => setTimeout(res, delay));
    return fn();
  };

  return {
    getItem: async (key) =>
      simulateNetwork(() => {
        if (options?.shouldFailRestore) {
          throw new Error('Simulated restore failure');
        }
        return memory[key] ?? null;
      }),

    setItem: async (key, value) =>
      simulateNetwork(() => {
        if (options?.shouldFailSave) {
          throw new Error('Simulated save failure');
        }
        memory[key] = value;
      }),

    removeItem: async (key) =>
      simulateNetwork(() => {
        if (options?.shouldFailClear) {
          throw new Error('Simulated clear failure');
        }
        delete memory[key];
      }),
  };
};
