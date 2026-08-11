/**
 * Independent verification of the four 1.3.2 stabilization claims.
 *
 * These are deliberately NOT copies of the existing suite's assertions: each
 * test here exercises the same bug through a different angle (fake timers
 * instead of real ones, causal ordering instead of wall-clock settling, N=3
 * instead of N=2, a three-way key rotation instead of a two-way one) so a fix
 * that only satisfies the existing test's specific shape would still be
 * caught here.
 */
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { UseFormStorageAdapter, UseFormStorageOptions } from '../types';
import { useFormStorage } from '../use-react-hook-form-storage';
import { createMockRemoteStore } from './test-utils';

type Form = { name: string; email: string };

const DEFAULTS: Form = { name: '', email: '' };
const KEY = 'claims-key';

const renderStorageHook = (
  options: Partial<UseFormStorageOptions<Form>> = {},
  key = KEY
) =>
  renderHook(
    (props: { storageKey: string; options: Partial<UseFormStorageOptions<Form>> }) => {
      const form = useForm<Form>({ defaultValues: DEFAULTS });
      const formStorage = useFormStorage(
        props.storageKey,
        form,
        props.options as UseFormStorageOptions<Form>
      );
      return { form, formStorage };
    },
    { initialProps: { storageKey: key, options } }
  );

const settle = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

beforeEach(() => {
  jest.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Claim 1: a debounced save must not resurrect data after clear()', () => {
  it('cancels the pending timer so it never fires, then still autosaves fresh edits', async () => {
    jest.useFakeTimers();
    const DEBOUNCE = 250;
    const onSave = jest.fn();

    const { result } = renderStorageHook({ debounce: DEBOUNCE, onSave });

    // Two keystrokes coalesce into one pending timer.
    act(() => {
      result.current.form.setValue('name', 'draft-1');
      result.current.form.setValue('name', 'draft-2');
    });

    await act(async () => {
      await result.current.formStorage.clear();
    });

    // Advance exactly past the debounce window with no further input: if the
    // timer were not cancelled, this is precisely when it would fire. Flushed
    // with a real microtask tick each time: the write chain resolves through
    // several `await`s of real Promises, which fake timers do not advance.
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE + 10);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();

    // The debouncer itself must still work afterwards: a later edit is a new
    // user action and is expected to autosave.
    act(() => {
      result.current.form.setValue('name', 'post-clear-edit');
    });
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE + 10);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'post-clear-edit' })
      );
    });
    jest.useRealTimers();
  });

  it('does not let a debounced save resurrect data even with an async adapter mid-flight', async () => {
    // Real timers + a slow removeItem: the debounced save's timer callback and
    // clear()'s queued removal are both in play at once, unlike the sync
    // localStorage case above.
    const store = createMockRemoteStore({ delayMs: 40 });
    const { result } = renderStorageHook({ storage: store, debounce: 30 });

    act(() => {
      result.current.form.setValue('name', 'typed');
    });

    await act(async () => {
      await result.current.formStorage.clear();
    });

    // Long past both the debounce window and the adapter's own latency.
    await settle(400);

    expect(await store.getItem(KEY)).toBeNull();
  });
});

describe('Claim 2: clear() must never silently no-op', () => {
  it('deletes even when three saves are queued behind it, and only resolves once the delete actually ran', async () => {
    let removeStarted = false;
    let removeFinished = false;
    const memory: Record<string, string> = { [KEY]: 'seed' };

    const adapter: UseFormStorageAdapter = {
      getItem: async (key) => memory[key] ?? null,
      setItem: async (key, value) => {
        await new Promise((res) => setTimeout(res, 5));
        memory[key] = value;
      },
      removeItem: async (key) => {
        removeStarted = true;
        await new Promise((res) => setTimeout(res, 30));
        delete memory[key];
        removeFinished = true;
      },
    };

    const { result } = renderStorageHook({ storage: adapter, autoRestore: false });

    let clearResolved = false;
    let clearPromise!: Promise<void>;
    act(() => {
      clearPromise = result.current.formStorage.clear();
    });

    // Three more saves are issued after clear() but before it has had its turn
    // in the chain (removeItem has not even started yet).
    act(() => {
      result.current.form.setValue('name', 'q1');
      void result.current.formStorage.save();
      result.current.form.setValue('name', 'q2');
      void result.current.formStorage.save();
      result.current.form.setValue('name', 'q3');
      void result.current.formStorage.save();
    });

    expect(removeStarted).toBe(false); // still queued at this point

    await act(async () => {
      await clearPromise;
      clearResolved = true;
    });

    // The critical causal claim: clear() cannot resolve before its own delete
    // actually completed, regardless of what got queued behind it.
    expect(clearResolved).toBe(true);
    expect(removeFinished).toBe(true);
    expect(memory[KEY]).toBeUndefined();
  });

  it('a second clear() queued behind the first still results in a deleted key, not a skipped one', async () => {
    const store = createMockRemoteStore({ delayMs: 20 });
    await store.setItem(KEY, JSON.stringify({ name: 'x', email: '' }));

    const { result } = renderStorageHook({ storage: store, autoRestore: false });

    await act(async () => {
      await Promise.all([
        result.current.formStorage.clear(),
        result.current.formStorage.clear(),
      ]);
    });

    // Both calls resolved; storage must actually be gone, not just "resolved".
    expect(await store.getItem(KEY)).toBeNull();
    expect(store.removes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Claim 3: an explicit save() must never be dropped', () => {
  it('three concurrent save() calls each write their own distinct value and each fire onSave', async () => {
    const onSave = jest.fn();
    const store = createMockRemoteStore({ delayMs: 15 });
    const { result } = renderStorageHook({ storage: store, autoSave: false, onSave });

    const pending: Promise<unknown>[] = [];
    act(() => {
      result.current.form.setValue('name', 'V1');
      pending.push(result.current.formStorage.save());
      result.current.form.setValue('name', 'V2');
      pending.push(result.current.formStorage.save());
      result.current.form.setValue('name', 'V3');
      pending.push(result.current.formStorage.save());
    });

    await act(async () => {
      await Promise.all(pending);
    });

    expect(store.writes).toHaveLength(3);
    expect(store.writes.map((w) => JSON.parse(w).name)).toEqual(['V1', 'V2', 'V3']);
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(onSave.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual([
      'V1',
      'V2',
      'V3',
    ]);
  });

  it('autosave may still coalesce even while explicit saves around it may not', async () => {
    // Distinguishes the two code paths: the autosave-triggered writes from
    // rapid typing are allowed to collapse, but an explicit save() call must
    // still land regardless of what autosave happened to coalesce.
    const onSave = jest.fn();
    const store = createMockRemoteStore({ delayMs: 15 });
    const { result } = renderStorageHook({ storage: store, onSave });

    act(() => {
      // Rapid typing: autosave is free to coalesce these.
      result.current.form.setValue('name', 'a');
      result.current.form.setValue('name', 'ab');
      result.current.form.setValue('name', 'abc');
    });

    const explicitSave = result.current.formStorage.save();
    await act(async () => {
      await explicitSave;
    });

    // The explicit call's own write must be present among whatever autosave
    // did; it is never itself the one that gets silently coalesced away.
    expect(store.writes.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(store.writes[store.writes.length - 1]).name).toBe('abc');
    expect(onSave).toHaveBeenCalled();
  });
});

describe('Claim 4: a write for one key must never discard a pending write for another', () => {
  // NOTE: these must drive the write through AUTOSAVE (setValue -> the watch
  // subscription, which passes { supersedable: true }), not through the
  // explicit save() used elsewhere in this file. save() is never supersedable
  // regardless of the counter's scope, so a test built on save() alone cannot
  // exercise the per-key counter at all — it would pass identically whether
  // the counter were per-key or global. That is exactly the vacuous shape a
  // first draft of this file had.
  it('a queued autosave write for the old key is not superseded by one enqueued for a new key', async () => {
    const store = createMockRemoteStore({ delayMs: 0, saveDelaysMs: [80, 0, 0] });
    const { result, rerender } = renderStorageHook(
      { storage: store, autoRestore: false },
      'K1'
    );

    // First K1 write goes in flight (80ms); the second is left QUEUED, which is
    // the only state a cross-key write could wrongly supersede.
    act(() => {
      result.current.form.setValue('name', 'K1-OLD');
    });
    await settle(10);
    act(() => {
      result.current.form.setValue('name', 'K1-LATEST');
    });

    // Switch key while K1's second write is still queued, then autosave once
    // for each of two more keys.
    await act(async () => {
      rerender({ storageKey: 'K2', options: { storage: store, autoRestore: false } });
    });
    act(() => {
      result.current.form.setValue('name', 'FOR-K2');
    });

    await act(async () => {
      rerender({ storageKey: 'K3', options: { storage: store, autoRestore: false } });
    });
    act(() => {
      result.current.form.setValue('name', 'FOR-K3');
    });

    await settle(300);

    // K1 must end on its own latest value, not be frozen at the older one, and
    // K2/K3 must each have received their own write.
    expect(JSON.parse((await store.getItem('K1')) as string).name).toBe('K1-LATEST');
    expect(JSON.parse((await store.getItem('K2')) as string).name).toBe('FOR-K2');
    expect(JSON.parse((await store.getItem('K3')) as string).name).toBe('FOR-K3');
  });

  it('coalesces synchronous autosaves for key "__proto__" AND keeps a later key unaffected', async () => {
    // Two distinct failure modes live in the same counter, and a value-only
    // assertion cannot tell them apart:
    //  - a per-key counter that is actually global (previous test) causes a
    //    write to be WRONGLY superseded -> wrong final value.
    //  - a per-key counter stored on a plain object (this test) means
    //    `counter['__proto__']` reads/writes through Object.prototype instead
    //    of a real slot, so writeId/latest compare as NaN and NOTHING for that
    //    key is ever superseded -> the final value is still correct, but every
    //    superseded write lands on the adapter anyway. Only a write-COUNT
    //    assertion catches that, which is why one is included here.
    const store = createMockRemoteStore({ delayMs: 0, saveDelaysMs: [60] });
    const { result, rerender } = renderStorageHook(
      { storage: store, autoRestore: false },
      '__proto__'
    );

    // All three enqueued synchronously, so ONE and TWO are still queued (never
    // started) when THREE arrives and must be coalesced away.
    act(() => {
      result.current.form.setValue('name', 'ONE');
      result.current.form.setValue('name', 'TWO');
      result.current.form.setValue('name', 'THREE');
    });

    await waitFor(async () => {
      const stored = await store.getItem('__proto__');
      expect(JSON.parse(stored as string).name).toBe('THREE');
    });
    expect(store.writes).toHaveLength(1);

    // Switching keys afterwards must not resurrect the coalesced writes nor
    // interfere with a fresh write for the new key.
    await act(async () => {
      rerender({ storageKey: 'normalKey', options: { storage: store, autoRestore: false } });
    });
    act(() => {
      result.current.form.setValue('name', 'FOR-NORMAL');
    });

    await waitFor(async () => {
      const stored = await store.getItem('normalKey');
      expect(JSON.parse(stored as string).name).toBe('FOR-NORMAL');
    });

    expect(store.writes).toHaveLength(2); // still just the one '__proto__' write, plus this one
    expect(JSON.parse((await store.getItem('__proto__')) as string).name).toBe('THREE');
  });
});
