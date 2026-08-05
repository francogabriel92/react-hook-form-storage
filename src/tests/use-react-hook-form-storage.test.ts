import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { UseFormStorageOptions } from '../types';
import { useFormStorage } from '../use-react-hook-form-storage';
import { createMockRemoteStore } from './test-utils';

const FORM_DEFAULT_VALUES = {
  name: '',
  email: '',
  number: 0,
  list: ['item1', 'item2'],
  nested: {
    field1: 'value1',
    field2: 'value2',
  },
};

const STORAGE_DEFAULT_VALUES = {
  name: 'John Doe',
  email: 'john@example.com',
  number: 2,
};

const STORAGE_TEST_KEY = 'testKey';
const TEST_NAME = 'testName';
const TEST_EMAIL = 'test@example.com';

const renderFormHook = async (
  options: Partial<UseFormStorageOptions<typeof FORM_DEFAULT_VALUES>> = {}
) => {
  const result = await act(async () => {
    const { result } = renderHook(() => {
      const form = useForm({
        defaultValues: FORM_DEFAULT_VALUES,
      });

      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        ...options,
      } as UseFormStorageOptions<typeof FORM_DEFAULT_VALUES>);

      return { form, formStorage };
    });

    return result;
  });

  if (!result) throw new Error('Hook did not render');

  const { form, formStorage } = result.current;

  return {
    form,
    getValues: form.getValues,
    setValue: form.setValue,
    formStorage,
  };
};

beforeEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe('useFormStorage', () => {
  it('Should have isLoading false after autoRestore with data', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { formStorage } = await renderFormHook();

    expect(formStorage.isLoading).toBe(false);
    expect(formStorage.isRestored).toBe(true);
  });

  it('Should have isLoading false after autoRestore with empty storage', async () => {
    const { formStorage } = await renderFormHook();

    expect(formStorage.isLoading).toBe(false);
    expect(formStorage.isRestored).toBe(false);
  });

  it('Should have isLoading false when autoRestore is disabled', async () => {
    const { formStorage } = await renderFormHook({
      autoRestore: false,
    });

    expect(formStorage.isLoading).toBe(false);
    expect(formStorage.isRestored).toBe(false);
  });

  it('Should report isLoading true from the very first render until restored', async () => {
    const mockStorage = createMockRemoteStore({ delayMs: 60 });
    await mockStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    // Captured per render: the README's documented spinner renders BEFORE any
    // effect runs, so asserting after the fact would miss a wrong initial value.
    const loadingByRender: boolean[] = [];

    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        storage: mockStorage,
      });
      loadingByRender.push(formStorage.isLoading);
      return { form, formStorage };
    });

    expect(loadingByRender[0]).toBe(true);

    await waitFor(() => {
      expect(result.current.formStorage.isLoading).toBe(false);
    });
    expect(result.current.formStorage.isRestored).toBe(true);
    expect(loadingByRender.at(-1)).toBe(false);
  });

  it('Should have isLoading property available', async () => {
    const { formStorage } = await renderFormHook();

    // isLoading should be a boolean
    expect(typeof formStorage.isLoading).toBe('boolean');
  });

  it('Should have isLoading false after restore error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    localStorage.setItem(STORAGE_TEST_KEY, 'malformatted data');

    const { formStorage } = await renderFormHook();

    expect(formStorage.isLoading).toBe(false);
    expect(formStorage.isRestored).toBe(false);
  });

  it('Should initialize form values from localStorage', async () => {
    // Setup localStorage with test data
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues, formStorage } = await renderFormHook();

    // Assert that form was initialized with localStorage values
    expect(getValues('name')).toBe(STORAGE_DEFAULT_VALUES.name);
    expect(getValues('email')).toBe(STORAGE_DEFAULT_VALUES.email);
    expect(getValues('number')).toBe(STORAGE_DEFAULT_VALUES.number);

    // Assert that isRestored is true
    expect(formStorage.isRestored).toBe(true);
  });

  it('Should initialize form with default values if localStorage is empty', async () => {
    const { getValues } = await renderFormHook();
    // Assert that form was initialized with default values
    expect(getValues('name')).toBe('');
    expect(getValues('email')).toBe('');
  });

  it('Should update localStorage value if form value changes', async () => {
    const { setValue } = await renderFormHook();

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Assert that localStorage was updated
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_TEST_KEY)).toBe(
        JSON.stringify({ ...FORM_DEFAULT_VALUES, name: TEST_NAME })
      );
    });
  });

  it('Should not save excluded fields to localStorage', async () => {
    const { setValue } = await renderFormHook({
      excluded: ['name'],
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    const { name: _name, ...valuesWithoutName } = FORM_DEFAULT_VALUES;
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_TEST_KEY)).toBe(
        JSON.stringify(valuesWithoutName)
      );
    });
  });

  it('Should save only included fields to localStorage', async () => {
    const { setValue } = await renderFormHook({
      included: ['name'],
    });

    act(() => {
      setValue('name', TEST_NAME);
      setValue('email', TEST_EMAIL);
    });

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_TEST_KEY)).toBe(
        JSON.stringify({ name: TEST_NAME })
      );
    });
  });

  it('Should only loads values from localStorage that are not excluded', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues } = await renderFormHook({
      excluded: ['email'],
    });

    // Assert that only the non-excluded field is loaded
    expect(getValues('name')).toBe('John Doe');
    expect(getValues('email')).toBe('');
  });

  it('Should only loads values from localStorage that are included', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues } = await renderFormHook({
      included: ['email'],
    });

    // Assert that only the included field is loaded
    expect(getValues('name')).toBe('');
    expect(getValues('email')).toBe(STORAGE_DEFAULT_VALUES.email);
  });

  it('Should call onRestore when values are loaded from localStorage', async () => {
    const onRestoreMock = jest.fn();

    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    await renderFormHook({
      onRestore: onRestoreMock,
    });

    expect(onRestoreMock).toHaveBeenCalledWith(STORAGE_DEFAULT_VALUES);
  });

  it('Should clear storage', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    await renderFormHook();

    const { formStorage } = await renderFormHook();

    await act(async () => {
      await formStorage.clear();
    });

    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
  });

  it('Should call onSave when values are saved to localStorage', async () => {
    const onSaveMock = jest.fn();

    const { setValue } = await renderFormHook({
      onSave: onSaveMock,
    });

    act(() => {
      setValue('name', TEST_NAME);
    });
    await waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledWith({
        ...FORM_DEFAULT_VALUES,
        name: TEST_NAME,
      });
    });
  });

  it('Should use sessionStorage when provided', async () => {
    sessionStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues, setValue } = await renderFormHook({
      storage: sessionStorage,
    });

    // Assert that the values are loaded from sessionStorage
    expect(getValues('name')).toBe(STORAGE_DEFAULT_VALUES.name);
    expect(getValues('email')).toBe(STORAGE_DEFAULT_VALUES.email);

    // Update a value and check if sessionStorage is updated
    act(() => {
      setValue('name', TEST_NAME);
    });

    await waitFor(() => {
      expect(sessionStorage.getItem(STORAGE_TEST_KEY)).toBe(
        JSON.stringify({
          ...FORM_DEFAULT_VALUES,
          ...STORAGE_DEFAULT_VALUES,
          name: TEST_NAME,
        })
      );
    });

    // Assert that localStorage was not used
    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
  });

  it('Should debounce updates to localStorage when debouncing is enabled', async () => {
    jest.useFakeTimers();
    const DEBOUNCE_TIME = 300;
    const onSaveMock = jest.fn();

    const { setValue } = await renderFormHook({
      debounce: DEBOUNCE_TIME,
      onSave: onSaveMock,
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Assert that localStorage was not updated immediately
    // and onSave was not called
    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
    expect(onSaveMock).not.toHaveBeenCalled();

    // Fast-forward timers
    jest.advanceTimersByTime(DEBOUNCE_TIME);

    // Assert that localStorage was updated and onSave was called
    await waitFor(() => {
      const storedValue = localStorage.getItem(STORAGE_TEST_KEY);

      const expectedValue = {
        ...FORM_DEFAULT_VALUES,
        name: TEST_NAME,
      };

      expect(storedValue).toBe(JSON.stringify(expectedValue));
      expect(onSaveMock).toHaveBeenCalledWith(expectedValue);
    });
  });

  it('Should cancel a pending debounced save on unmount', async () => {
    jest.useFakeTimers();
    const DEBOUNCE_TIME = 300;
    const onSaveMock = jest.fn();

    const { result, unmount } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        debounce: DEBOUNCE_TIME,
        onSave: onSaveMock,
      });
      return { form, formStorage };
    });

    act(() => {
      result.current.form.setValue('name', TEST_NAME);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_TIME * 2);
    });

    expect(onSaveMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();

    jest.useRealTimers();
  });

  it('Should apply serialization when saving values', async () => {
    const { setValue } = await renderFormHook({
      included: ['name', 'number'],
      serializer: {
        name: {
          serialize: (value) => value.toUpperCase(),
          deserialize: (value) => value.toLowerCase(),
        },
        number: {
          serialize: (value) => value + 1,
          deserialize: (value) => value - 1,
        },
      },
    });

    // Set values in the form
    act(() => {
      setValue('name', TEST_EMAIL);
      setValue('number', 5);
    });

    await waitFor(() => {
      const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
      expect(storedValue).toBe(
        JSON.stringify({ name: TEST_EMAIL.toUpperCase(), number: 6 })
      );
    });
  });

  it('Should apply deserialization when loading values', async () => {
    // Setup localStorage with serialized test data
    const serializedData = {
      name: TEST_EMAIL.toUpperCase(),
      number: 10,
    };

    localStorage.setItem(STORAGE_TEST_KEY, JSON.stringify(serializedData));

    const { getValues } = await renderFormHook({
      included: ['name', 'number'],
      serializer: {
        name: {
          serialize: (value) => value.toUpperCase(),
          deserialize: (value) => value.toLowerCase(),
        },
        number: {
          serialize: (value) => value + 1,
          deserialize: (value) => value - 1,
        },
      },
    });

    // Assert that form was initialized with deserialized values
    expect(getValues('name')).toBe(TEST_EMAIL.toLowerCase());
    expect(getValues('number')).toBe(9);
  });

  it('Should keep the field value when the serializer defines only one direction', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues, setValue } = await renderFormHook({
      serializer: {
        name: {
          serialize: (value) => value.toUpperCase(),
          // no deserialize: restoring must keep the stored value as-is
        },
      },
    });

    expect(getValues('name')).toBe(STORAGE_DEFAULT_VALUES.name);

    act(() => {
      setValue('name', TEST_NAME);
    });

    await waitFor(() => {
      const storedValue = JSON.parse(
        localStorage.getItem(STORAGE_TEST_KEY) as string
      );
      expect(storedValue.name).toBe(TEST_NAME.toUpperCase());
    });
  });

  it('Should keep other fields when one serializer throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { setValue } = await renderFormHook({
      included: ['name', 'email'],
      serializer: {
        name: {
          serialize: () => {
            throw new Error('Simulated serialize failure');
          },
        },
      },
    });

    act(() => {
      setValue('name', TEST_NAME);
      setValue('email', TEST_EMAIL);
    });

    await waitFor(() => {
      const storedValue = JSON.parse(
        localStorage.getItem(STORAGE_TEST_KEY) as string
      );
      expect(storedValue.email).toBe(TEST_EMAIL);
      expect(storedValue.name).toBe(TEST_NAME);
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to serialize field "name"')
    );
  });

  it('Should not persist a nested excluded path, and should warn', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { setValue } = await renderFormHook({
      excluded: ['nested.field2'],
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Fails closed: the parent is dropped rather than leaking the excluded field
    await waitFor(() => {
      const storedValue = JSON.parse(
        localStorage.getItem(STORAGE_TEST_KEY) as string
      );
      expect(storedValue.nested).toBeUndefined();
      expect(storedValue.name).toBe(TEST_NAME);
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('nested.field2')
    );
  });

  it('Should warn about nested included and serializer paths', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await renderFormHook({
      included: ['nested.field1'],
      serializer: {
        'nested.field1': { serialize: (value: unknown) => value },
      },
    } as unknown as Partial<UseFormStorageOptions<typeof FORM_DEFAULT_VALUES>>);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Nested paths are not supported yet')
    );
  });

  it('Should not save values if autoSave is false', async () => {
    const { setValue } = await renderFormHook({
      autoSave: false,
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Assert that localStorage was not updated
    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
  });

  it('Should save values if save function is called', async () => {
    const { formStorage, setValue } = await renderFormHook();

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Call save function
    await act(async () => {
      await formStorage.save();
    });

    // Assert that localStorage was updated
    const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
    expect(storedValue).toBe(
      JSON.stringify({
        ...FORM_DEFAULT_VALUES,
        name: TEST_NAME,
      })
    );
  });

  it('Should work with arrays', async () => {
    const TEST_LIST = ['item3', 'item4'];
    const { setValue } = await renderFormHook({
      serializer: {
        list: {
          serialize: (value) => value.join(','),
          deserialize: (value) => value.split(','),
        },
      },
    });

    act(() => {
      setValue('list', TEST_LIST);
    });

    // Assert that localStorage was updated with serialized array
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_TEST_KEY)).toBe(
        JSON.stringify({ ...FORM_DEFAULT_VALUES, list: TEST_LIST.join(',') })
      );
    });
  });

  it('Should work with custom async storage', async () => {
    const mockStorage = createMockRemoteStore({
      delayMs: 50,
    });

    // Awaited: the adapter is async, and the restore effect runs once, so a read
    // that lands before this write is a permanent failure that waitFor cannot
    // recover from.
    await mockStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues, setValue, formStorage } = await renderFormHook({
      storage: mockStorage,
    });

    // Assert that the values are loaded from mockStorage
    await waitFor(() => {
      expect(getValues('name')).toBe(STORAGE_DEFAULT_VALUES.name);
      expect(getValues('email')).toBe(STORAGE_DEFAULT_VALUES.email);
    });

    // Update a value and check if mockStorage is updated
    act(() => {
      setValue('name', TEST_NAME);
    });

    await waitFor(async () => {
      const storedValue = await mockStorage.getItem(STORAGE_TEST_KEY);
      expect(storedValue).toBe(
        JSON.stringify({
          ...FORM_DEFAULT_VALUES,
          ...STORAGE_DEFAULT_VALUES,
          name: TEST_NAME,
        })
      );
    });

    // Assert that localStorage was not used
    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();

    // Clear the value and check if mockStorage is cleared
    act(() => {
      formStorage.clear();
    });

    await waitFor(async () => {
      const storedValue = await mockStorage.getItem(STORAGE_TEST_KEY);
      expect(storedValue).toBeNull();
    });
  });

  it('Should not let a slow earlier write overwrite a faster later one', async () => {
    // The first write is slow and must already be IN FLIGHT before the second is
    // issued, otherwise it is merely superseded and never reaches the adapter —
    // which is what made the earlier version of this test vacuous.
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      saveDelaysMs: [80, 0],
    });

    const { setValue } = await renderFormHook({ storage: mockStorage });

    act(() => {
      setValue('name', 'FIRST');
    });

    await act(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });

    act(() => {
      setValue('name', 'SECOND');
    });

    await waitFor(() => {
      expect(mockStorage.writes).toHaveLength(2);
    });

    // Both writes really happened, and the slower earlier one landed first
    expect(JSON.parse(mockStorage.writes[0]).name).toBe('FIRST');
    expect(JSON.parse(mockStorage.writes[1]).name).toBe('SECOND');

    const finalValue = await mockStorage.getItem(STORAGE_TEST_KEY);
    expect(JSON.parse(finalValue as string).name).toBe('SECOND');
  });

  it('Should skip writes that are superseded before they start', async () => {
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      saveDelaysMs: [60, 0, 0],
    });

    const { setValue } = await renderFormHook({ storage: mockStorage });

    // All three are issued synchronously, so the first two are superseded while
    // still queued and must never reach the adapter.
    act(() => {
      setValue('name', 'ONE');
      setValue('name', 'TWO');
      setValue('name', 'THREE');
    });

    await waitFor(async () => {
      const storedValue = await mockStorage.getItem(STORAGE_TEST_KEY);
      expect(JSON.parse(storedValue as string).name).toBe('THREE');
    });

    expect(mockStorage.writes).toHaveLength(1);
  });

  it('Should not let a pending save resurrect data after clear', async () => {
    // The save is still in flight when clear() runs, so if clear bypasses the
    // write ordering the save lands afterwards and the cleared draft comes back.
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      saveDelaysMs: [120],
    });

    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        storage: mockStorage,
      });
      return { form, formStorage };
    });

    act(() => {
      result.current.form.setValue('name', TEST_NAME);
    });

    await act(async () => {
      await result.current.formStorage.clear();
    });

    expect(await mockStorage.getItem(STORAGE_TEST_KEY)).toBeNull();

    // Give the slow save every chance to land after clear() resolved
    await act(async () => {
      await new Promise((res) => setTimeout(res, 300));
    });

    expect(await mockStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
    expect(result.current.formStorage.isRestored).toBe(false);
  });

  it('Should still clear when a save is issued before clear gets its turn', async () => {
    // A save queued after clear() must not make clear skippable: coalescing away
    // a stale VALUE is fine, silently dropping a delete is not.
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      saveDelaysMs: [100, 0, 0],
    });

    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        storage: mockStorage,
      });
      return { form, formStorage };
    });

    act(() => {
      result.current.form.setValue('name', 'FIRST');
    });

    const clearPromise = result.current.formStorage.clear();

    act(() => {
      result.current.form.setValue('name', 'THIRD');
    });

    await act(async () => {
      await clearPromise;
    });
    await act(async () => {
      await new Promise((res) => setTimeout(res, 400));
    });

    // The delete must have actually reached the adapter
    expect(mockStorage.removes).toEqual([STORAGE_TEST_KEY]);

    // Re-persisting after the clear is correct: clear() does not reset the form,
    // so a later edit is expected to be saved again.
    const finalValue = await mockStorage.getItem(STORAGE_TEST_KEY);
    expect(JSON.parse(finalValue as string).name).toBe('THIRD');
  });

  it('Should not let a write for a new key supersede one for the old key', async () => {
    // Supersede is per key: a save for keyB says nothing about whether keyA's
    // pending save is still wanted, and dropping it loses the old key's data.
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      saveDelaysMs: [100, 0, 0],
    });

    const { result, rerender } = renderHook(
      ({ storageKey }: { storageKey: string }) => {
        const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
        const formStorage = useFormStorage(storageKey, form, {
          storage: mockStorage,
        });
        return { form, formStorage };
      },
      { initialProps: { storageKey: 'keyA' } }
    );

    // The first save must get IN FLIGHT (a sleep, not just another act) so the
    // second one is still QUEUED — the only state a later write can supersede.
    act(() => {
      result.current.form.setValue('name', 'A-OLD');
    });
    await act(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });
    act(() => {
      result.current.form.setValue('name', 'A-LATEST');
    });

    await act(async () => {
      rerender({ storageKey: 'keyB' });
    });

    act(() => {
      result.current.form.setValue('name', 'FOR-B');
    });

    await act(async () => {
      await new Promise((res) => setTimeout(res, 400));
    });

    const forA = await mockStorage.getItem('keyA');
    const forB = await mockStorage.getItem('keyB');
    // keyA must end on its own latest value, not be frozen at the older one
    // because a keyB write happened to be enqueued later.
    expect(JSON.parse(forA as string).name).toBe('A-LATEST');
    expect(JSON.parse(forB as string).name).toBe('FOR-B');
  });

  it('Should handle errors when restored malformatted storage', async () => {
    // Mock console.error to suppress error logs in test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Setup localStorage with malformatted data
    localStorage.setItem(STORAGE_TEST_KEY, 'malformatted data');

    const { formStorage } = await renderFormHook();

    // Assert that isRestored is false due to error
    expect(formStorage.isRestored).toBe(false);

    // Assert that the error is logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to restore data from storage')
    );
  });

  it('Should handle errors when saving to storage', async () => {
    // Mock console.error to suppress error logs in test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Create a faulty storage that throws an error on setItem
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      shouldFailSave: true,
    });

    const { setValue } = await renderFormHook({
      storage: mockStorage,
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    // Assert that the error is logged
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save data to storage')
      );
    });
  });

  it('Should handle errors when clearing storage', async () => {
    // Mock console.error to suppress error logs in test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Create a faulty storage that throws an error on removeItem
    const mockStorage = createMockRemoteStore({
      delayMs: 0,
      shouldFailClear: true,
    });

    const { formStorage } = await renderFormHook({
      storage: mockStorage,
    });

    act(() => {
      formStorage.clear();
    });

    // Assert that the error is logged
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear storage')
      );
    });
  });

  it('Should reset isRestored when switching to a key with no stored data', async () => {
    localStorage.setItem('keyWithData', JSON.stringify(STORAGE_DEFAULT_VALUES));

    const { result, rerender } = renderHook(
      ({ storageKey }: { storageKey: string }) => {
        const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
        const formStorage = useFormStorage(storageKey, form);
        return { form, formStorage };
      },
      { initialProps: { storageKey: 'keyWithData' } }
    );

    await waitFor(() => {
      expect(result.current.formStorage.isRestored).toBe(true);
    });

    await act(async () => {
      rerender({ storageKey: 'keyWithoutData' });
    });

    // The flag must not carry over from the previous key
    await waitFor(() => {
      expect(result.current.formStorage.isRestored).toBe(false);
    });
  });

  it('Should reset isRestored after clear', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    // Read through result.current: the flag changes after the initial render,
    // so a destructured snapshot would go stale.
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form);
      return { form, formStorage };
    });

    await waitFor(() => {
      expect(result.current.formStorage.isRestored).toBe(true);
    });

    await act(async () => {
      await result.current.formStorage.clear();
    });

    expect(localStorage.getItem(STORAGE_TEST_KEY)).toBeNull();
    expect(result.current.formStorage.isRestored).toBe(false);
  });

  it('Should autosave with the latest key and onSave after a rerender', async () => {
    const onSaveA = jest.fn();
    const onSaveB = jest.fn();

    const { result, rerender } = renderHook(
      ({ storageKey, onSave }: { storageKey: string; onSave: jest.Mock }) => {
        const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
        const formStorage = useFormStorage(storageKey, form, {
          onSave: onSave as (values: Record<string, any>) => void,
        });
        return { form, formStorage };
      },
      { initialProps: { storageKey: 'keyA', onSave: onSaveA } }
    );

    await act(async () => {
      rerender({ storageKey: 'keyB', onSave: onSaveB });
    });

    act(() => {
      result.current.form.setValue('name', TEST_NAME);
    });

    await waitFor(() => {
      expect(localStorage.getItem('keyB')).toBe(
        JSON.stringify({ ...FORM_DEFAULT_VALUES, name: TEST_NAME })
      );
    });

    // A stale subscription would have written to the old key and callback
    expect(localStorage.getItem('keyA')).toBeNull();
    expect(onSaveA).not.toHaveBeenCalled();
    expect(onSaveB).toHaveBeenCalledWith({
      ...FORM_DEFAULT_VALUES,
      name: TEST_NAME,
    });
  });

  it('Should honor inline options updated on rerender', async () => {
    const { result, rerender } = renderHook(
      ({ excludedField }: { excludedField: 'name' | 'email' }) => {
        const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
        // Inline array: a fresh reference on every render
        const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
          excluded: [excludedField],
        });
        return { form, formStorage };
      },
      { initialProps: { excludedField: 'email' as const } }
    );

    await act(async () => {
      rerender({ excludedField: 'name' });
    });

    act(() => {
      result.current.form.setValue('name', TEST_NAME);
    });

    await waitFor(() => {
      const storedValue = JSON.parse(
        localStorage.getItem(STORAGE_TEST_KEY) as string
      );
      // The latest excluded list applies: name omitted, email kept
      expect(storedValue.name).toBeUndefined();
      expect(storedValue.email).toBe(FORM_DEFAULT_VALUES.email);
    });
  });

  it('Should report isLoading true during a manual restore', async () => {
    // The second load is where restoreDataFromStorage's own setIsLoading(true)
    // is load-bearing: the initial useState(autoRestore) cannot cover it,
    // because isLoading has already settled to false by then.
    const mockStorage = createMockRemoteStore({ delayMs: 60 });
    await mockStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: FORM_DEFAULT_VALUES });
      const formStorage = useFormStorage(STORAGE_TEST_KEY, form, {
        storage: mockStorage,
        autoRestore: false,
      });
      return { form, formStorage };
    });

    expect(result.current.formStorage.isLoading).toBe(false);

    // Fired without awaiting: awaiting inside a single act() lets React collapse
    // the true and the false into one render, hiding the loading state entirely.
    let restorePromise: Promise<void>;
    act(() => {
      restorePromise = result.current.formStorage.restore();
    });

    expect(result.current.formStorage.isLoading).toBe(true);

    await act(async () => {
      await restorePromise;
    });

    expect(result.current.formStorage.isLoading).toBe(false);
    expect(result.current.formStorage.isRestored).toBe(true);
  });

  it('Should handle non autoRestore scenarios', async () => {
    localStorage.setItem(
      STORAGE_TEST_KEY,
      JSON.stringify(STORAGE_DEFAULT_VALUES)
    );

    const { getValues, formStorage } = await renderFormHook({
      autoRestore: false,
    });

    // Assert that form was not initialized with localStorage values
    expect(getValues('name')).toBe('');
    expect(getValues('email')).toBe('');

    // Restore values manually
    await act(async () => {
      await formStorage.restore();
    });

    // Assert that form was restored with localStorage values
    await waitFor(() => {
      expect(getValues('name')).toBe(STORAGE_DEFAULT_VALUES.name);
      expect(getValues('email')).toBe(STORAGE_DEFAULT_VALUES.email);
    });
  });
});
