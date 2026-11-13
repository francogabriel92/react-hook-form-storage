/* eslint-disable @typescript-eslint/no-explicit-any -- the wrappers fake RHF contracts the installed types do not have */
import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
import { act, render, renderHook } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { UseFormStorageOptions } from '../types';
import { useFormStorage } from '../use-react-hook-form-storage';

const DEFAULT_VALUES = { name: '', email: '' };
type Values = typeof DEFAULT_VALUES;

const KEY = 'compatKey';
const DEBOUNCE = 300;

type Mode = 'v8' | 'legacy' | 'native';

// Probe once which contracts the installed RHF supports.
const probe = renderHook(() => useForm({ defaultValues: DEFAULT_VALUES }));
const probeForm = probe.result.current as any;
const HAS_SUBSCRIBE = typeof probeForm.subscribe === 'function';
const HAS_WATCH_CALLBACK = (() => {
  try {
    probeForm.watch(() => {}).unsubscribe();
    return true;
  } catch {
    return false;
  }
})();
probe.unmount();

const MODES: [Mode, boolean][] = [
  ['v8', HAS_SUBSCRIBE],
  ['legacy', HAS_WATCH_CALLBACK],
  ['native', true],
];

// Simulates the v8 and legacy contracts on top of the real form, with new
// function identities on every call, as RHF v8 has on every render.
const wrapForm = (mode: Mode, form: any): any => {
  if (mode === 'native') return form;

  const realSubscribe =
    typeof form.subscribe === 'function'
      ? (...args: any[]) => form.subscribe(...args)
      : undefined;

  return {
    ...form,
    watch: (...args: any[]) => {
      if (mode === 'v8' && typeof args[0] === 'function') {
        throw new Error('watch(callback) was removed in RHF v8');
      }
      return form.watch(...args);
    },
    subscribe: mode === 'legacy' ? undefined : realSubscribe,
  };
};

const renderMode = (
  mode: Mode,
  options: UseFormStorageOptions<Values> = {},
  formOptions: { mode?: 'onSubmit' | 'onChange' | 'onBlur' | 'all' } = {}
) =>
  renderHook(() => {
    const form = useForm({ defaultValues: DEFAULT_VALUES, ...formOptions });
    const formStorage = useFormStorage(KEY, wrapForm(mode, form), options);
    return { form, formStorage };
  });

// Lets queued storage writes and debounce timers run.
const settle = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '{}');

let setItemSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

for (const [mode, enabled] of MODES) {
  (enabled ? describe : describe.skip)(`RHF compat (${mode})`, () => {
    it('autosaves on setValue', async () => {
      const { result } = renderMode(mode);
      await settle();

      act(() => result.current.form.setValue('name', 'x'));
      await settle();

      expect(stored().name).toBe('x');
    });

    it('debounces several changes into one save with the last value', async () => {
      const { result } = renderMode(mode, { debounce: DEBOUNCE });
      await settle();

      act(() => {
        result.current.form.setValue('name', 'a');
        result.current.form.setValue('name', 'b');
        result.current.form.setValue('name', 'c');
      });
      await settle(DEBOUNCE);

      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(stored().name).toBe('c');
    });

    it('keeps the pending debounce across rerenders with unstable references', async () => {
      const { result, rerender } = renderMode(mode, { debounce: DEBOUNCE });
      await settle();

      act(() => result.current.form.setValue('name', 'x'));
      rerender();
      rerender();
      rerender();
      await settle();
      expect(setItemSpy).not.toHaveBeenCalled();

      await settle(DEBOUNCE);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(stored().name).toBe('x');
    });

    it('flushes a pending debounced save on unmount', async () => {
      const { result, unmount } = renderMode(mode, { debounce: DEBOUNCE });
      await settle();

      act(() => result.current.form.setValue('name', 'x'));
      unmount();
      await settle();

      expect(stored().name).toBe('x');
    });

    it('autosaves on a change event from a registered input', async () => {
      const { result } = renderMode(mode);
      await settle();

      await act(() =>
        result.current.form.register('name').onChange({
          target: { name: 'name', value: 'typed' },
          type: 'change',
        })
      );
      await settle();

      expect(stored().name).toBe('typed');
    });

    it.each(['onSubmit', 'onChange', 'onBlur', 'all'] as const)(
      'saves once per change event and never on blur (validation mode %s)',
      async (validationMode) => {
        const { result } = renderMode(mode, {}, { mode: validationMode });
        await settle();

        const field = result.current.form.register('name');
        const fire = (type: 'change' | 'blur', value: string) =>
          act(() =>
            field[type === 'change' ? 'onChange' : 'onBlur']({
              target: { name: 'name', value },
              type,
            })
          );

        await fire('change', 'a');
        await settle();
        await fire('change', 'ab');
        await settle();
        expect(setItemSpy).toHaveBeenCalledTimes(2);

        await fire('blur', 'ab');
        await settle();
        await fire('blur', 'ab');
        await settle();
        expect(setItemSpy).toHaveBeenCalledTimes(2);
        expect(stored().name).toBe('ab');
      }
    );

    it('restores the same values when the hook lives in a child component', async () => {
      localStorage.setItem(KEY, JSON.stringify({ name: 'saved' }));
      setItemSpy.mockClear();

      const seen = {} as { form: UseFormReturn<Values>; isRestored: boolean };
      // Lint forbids writing to outer variables directly during render.
      const report = (patch: Partial<typeof seen>) =>
        Object.assign(seen, patch);
      // The child effect runs before the parent useForm effect.
      const Child = (props: { form: UseFormReturn<Values> }) => {
        const { isRestored } = useFormStorage(KEY, wrapForm(mode, props.form));
        report({ isRestored });
        return null;
      };
      const Parent = () => {
        const form = useForm({ defaultValues: DEFAULT_VALUES });
        report({ form });
        return createElement(Child, { form });
      };
      render(createElement(Parent));
      await settle(DEBOUNCE);

      expect(seen.isRestored).toBe(true);
      expect(seen.form.getValues()).toEqual({ name: 'saved', email: '' });
      expect(stored()).toEqual({ name: 'saved', email: '' });
      expect(setItemSpy).toHaveBeenCalledTimes(1);
    });

    it('follows a swapped form instance', async () => {
      const { result, rerender } = renderHook(
        ({ useB }: { useB: boolean }) => {
          const a = useForm({ defaultValues: DEFAULT_VALUES });
          const b = useForm({ defaultValues: DEFAULT_VALUES });
          useFormStorage(KEY, wrapForm(mode, useB ? b : a));
          return { a, b };
        },
        { initialProps: { useB: false } }
      );
      await settle();
      rerender({ useB: true });
      await settle();

      act(() => result.current.b.setValue('name', 'from-b'));
      await settle();
      expect(stored().name).toBe('from-b');

      act(() => result.current.a.setValue('name', 'from-a'));
      await settle();
      expect(stored().name).toBe('from-b');
    });

    // RHF 8.0.0-beta.0 shares one formState filter between subscribe() callers:
    // a subscriber registered first makes ours fire on non-value updates.
    (HAS_SUBSCRIBE ? it : it.skip)(
      'ignores state that an earlier subscriber on the form listens to',
      async () => {
        const { result } = renderHook(() => {
          const form = useForm({ defaultValues: DEFAULT_VALUES });
          useEffect(
            () =>
              form.subscribe({
                formState: {
                  errors: true,
                  touchedFields: true,
                  isDirty: true,
                  isSubmitting: true,
                  isSubmitted: true,
                } as any,
                callback: () => {},
              }),
            // eslint-disable-next-line react-hooks/exhaustive-deps
            []
          );
          const formStorage = useFormStorage(KEY, wrapForm(mode, form));
          return { form, formStorage };
        });
        await settle();
        const { form, formStorage } = result.current;

        act(() => form.setValue('name', 'x'));
        await settle();
        expect(setItemSpy).toHaveBeenCalledTimes(1);

        act(() => {
          form.setError('name', { message: 'e' });
          form.clearErrors();
        });
        await settle();
        expect(setItemSpy).toHaveBeenCalledTimes(1);

        await act(() =>
          form.handleSubmit(async () => {
            form.reset();
            await formStorage.clear();
          })()
        );
        await settle(DEBOUNCE);
        expect(localStorage.getItem(KEY)).toBeNull();
      }
    );

    it('does not save when autoSave is false', async () => {
      const { result } = renderMode(mode, { autoSave: false });
      await settle();

      act(() => result.current.form.setValue('name', 'x'));
      await settle(DEBOUNCE);

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('does not save on mount', async () => {
      renderMode(mode);
      await settle(DEBOUNCE);

      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('saves the values set by reset()', async () => {
      const { result } = renderMode(mode);
      await settle();

      act(() =>
        result.current.form.reset({ ...DEFAULT_VALUES, name: 'after-reset' })
      );
      await settle(DEBOUNCE);

      expect(stored().name).toBe('after-reset');
    });

    it.each([undefined, DEBOUNCE])(
      'leaves nothing stored after clear() inside submit (debounce %s)',
      async (debounce) => {
        const { result } = renderMode(mode, { debounce });
        await settle();

        act(() => result.current.form.setValue('name', 'x'));
        await settle(DEBOUNCE);
        expect(stored().name).toBe('x');

        await act(() =>
          result.current.form.handleSubmit(async () => {
            await result.current.formStorage.clear();
          })()
        );
        await settle(DEBOUNCE);

        expect(localStorage.getItem(KEY)).toBeNull();
      }
    );

    it('does not save on state updates that leave values unchanged', async () => {
      const { result } = renderMode(mode);
      await settle();

      act(() => result.current.form.setValue('name', 'x'));
      await settle();
      const callsBefore = setItemSpy.mock.calls.length;

      act(() => {
        result.current.form.setError('name', { message: 'e' });
        result.current.form.clearErrors();
      });
      await settle(DEBOUNCE);

      expect(setItemSpy).toHaveBeenCalledTimes(callsBefore);
    });
  });
}
