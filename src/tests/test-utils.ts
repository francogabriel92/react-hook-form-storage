import { UseFormStorageAdapter } from '../types';

export const createMockRemoteStore = (options?: {
  delayMs?: number;
  shouldFail?: boolean;
}): UseFormStorageAdapter => {
  const memory: Record<string, string> = {};
  const delay = options?.delayMs ?? 100;
  const shouldFail = options?.shouldFail ?? false;

  const maybeFail = () => {
    if (shouldFail) {
      throw new Error('Remote store failed');
    }
  };

  const simulateNetwork = async <T>(fn: () => T): Promise<T> => {
    await new Promise((res) => setTimeout(res, delay));
    maybeFail();
    return fn();
  };

  return {
    getItem: async (key) =>
      simulateNetwork(() => {
        return memory[key] ?? null;
      }),

    setItem: async (key, value) =>
      simulateNetwork(() => {
        memory[key] = value;
      }),

    removeItem: async (key) =>
      simulateNetwork(() => {
        delete memory[key];
      }),
  };
};
