import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { UseFormStorageAdapter, UseFormStorageOptions } from '../types';
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
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe('useFormStorage', () => {
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
    const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
    expect(storedValue).toBe(
      JSON.stringify({ ...FORM_DEFAULT_VALUES, name: TEST_NAME })
    );
  });

  it('Should not save excluded fields to localStorage', async () => {
    const { setValue } = await renderFormHook({
      excluded: ['name'],
    });

    act(() => {
      setValue('name', TEST_NAME);
    });

    const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
    const { name: _name, ...valuesWithoutName } = FORM_DEFAULT_VALUES;
    expect(storedValue).toBe(JSON.stringify(valuesWithoutName));
  });

  it('Should save only included fields to localStorage', async () => {
    const { setValue } = await renderFormHook({
      included: ['name'],
    });

    act(() => {
      setValue('name', TEST_NAME);
      setValue('email', TEST_EMAIL);
    });

    const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
    expect(storedValue).toBe(JSON.stringify({ name: TEST_NAME }));
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

    act(() => {
      formStorage.clear();
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

    const storedValue = sessionStorage.getItem(STORAGE_TEST_KEY);

    expect(storedValue).toBe(
      JSON.stringify({
        ...FORM_DEFAULT_VALUES,
        ...STORAGE_DEFAULT_VALUES,
        name: TEST_NAME,
      })
    );

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
    act(() => {
      formStorage.save();
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
    const storedValue = localStorage.getItem(STORAGE_TEST_KEY);
    expect(storedValue).toBe(
      JSON.stringify({ ...FORM_DEFAULT_VALUES, list: TEST_LIST.join(',') })
    );
  });

  it('Should work with custom async storage', async () => {
    const mockStorage = createMockRemoteStore({
      delayMs: 50,
    });

    // Pre-populate mock storage with test data
    mockStorage.setItem(
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
});
