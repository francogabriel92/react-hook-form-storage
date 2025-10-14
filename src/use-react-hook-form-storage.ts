import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  debouncer,
  filterIncludedOrExcludedFields,
  transformValues,
} from './utils';
import { UseFormStorageOptions } from './types';

/**
 * A React hook that provides automatic storage synchronization for react-hook-form.
 * Saves form data to storage (localStorage by default) and restores it on component mount.
 *
 * @template T - The form values type extending FieldValues
 * @param {string} key - Unique storage key for the form data
 * @param {UseFormReturn<T>} form - The react-hook-form instance
 * @param {UseFormStorageOptions<T>} options - Configuration options for storage behavior
 * @param {Storage} [options.storage=localStorage] - Storage implementation to use
 * @param {Path<T>[]} [options.included] - Fields to include in storage (whitelist)
 * @param {Path<T>[]} [options.excluded] - Fields to exclude from storage (blacklist)
 * @param {(values: Partial<T>) => void} [options.onRestore] - Callback when data is restored from storage
 * @param {(values: Partial<T>) => void} [options.onSave] - Callback when data is saved to storage
 * @param {number} [options.debounce] - Debounce delay in milliseconds for auto-save
 * @param {boolean} [options.dirty] - Whether to mark fields as dirty when restoring
 * @param {boolean} [options.touched] - Whether to mark fields as touched when restoring
 * @param {boolean} [options.validate] - Whether to validate fields when restoring
 * @param {Record<string, any>} [options.serializer] - Custom serialization functions for specific fields
 * @param {boolean} [options.autoSave=true] - Whether to automatically save changes
 * @param {boolean} [options.autoRestore=true] - Whether to automatically restore values
 *
 * @returns {Object} Hook return object
 * @returns {boolean} returns.isRestored - Whether data has been restored from storage
 * @returns {boolean} returns.isLoading - Whether restoration is in progress
 * @returns {() => Promise<void>} returns.save - Manual save function to store current form values
 * @returns {() => Promise<void>} returns.clear - Function to clear stored data
 *
 * @example
 * ```tsx
 * const form = useForm<FormData>();
 * const { isRestored, save, clear } = useFormStorage('my-form', form, {
 *   debounce: 500,
 *   excluded: ['password'],
 *   onRestore: (data) => console.log('Data restored:', data)
 * });
 *
 * // Manual operations
 * await save(); // Save current form state
 * await clear(); // Clear stored data
 * ```
 */
export const useFormStorage = <T extends FieldValues>(
  key: string,
  form: UseFormReturn<T>,
  {
    storage = localStorage,
    included,
    excluded,
    onRestore,
    onSave,
    debounce,
    dirty,
    touched,
    validate,
    serializer = {},
    autoSave = true,
    autoRestore = true,
  }: UseFormStorageOptions<T> = {}
) => {
  const [isRestored, setIsRestored] = useState(false);
  const [isLoading, setIsLoading] = useState(autoRestore);

  const { setValue, watch } = form;

  const storageAdapter = useMemo(() => {
    const setItem = async (key: string, value: string) => {
      try {
        return await storage.setItem(key, value);
      } catch (error) {
        console.error(
          `[FORM-STORAGE] Failed to save data to storage: ${error}`
        );
      }
    };

    const getItem = async (key: string) => {
      try {
        return await storage.getItem(key);
      } catch (error) {
        console.error(
          `[FORM-STORAGE] Failed to restore data from storage: ${error}`
        );
        return null;
      }
    };

    const removeItem = async (key: string) => {
      try {
        return await storage.removeItem(key);
      } catch (error) {
        console.error(`[FORM-STORAGE] Failed to clear storage: ${error}`);
      }
    };

    return { setItem, getItem, removeItem };
  }, [storage]);

  // Save form values to storage
  const saveToStorage = useCallback(
    async (values: Record<string, any>) => {
      try {
        const valuesToStore = filterIncludedOrExcludedFields(
          values,
          included,
          excluded
        );
        const serialized = transformValues(valuesToStore, serializer as any);
        await storageAdapter.setItem(key, JSON.stringify(serialized));
        onSave?.(valuesToStore);
      } catch (error) {
        console.error(`[FORM-STORAGE] Failed to save data: ${error}`);
      }
    },
    [key, included, excluded, serializer, storageAdapter, onSave]
  );

  // Restore initial values from storage if available
  const restoreDataFromStorage = useCallback(async () => {
    setIsLoading(true);
    try {
      const storedValue = await storageAdapter.getItem(key);
      if (storedValue) {
        const parsedValue = JSON.parse(storedValue) as FieldValues;

        const valuesToRestore = filterIncludedOrExcludedFields(
          parsedValue,
          included,
          excluded
        );

        const deserializedValues = transformValues(
          valuesToRestore,
          // TODO: Fix type casting here
          serializer as any,
          true
        );

        Object.entries(deserializedValues).forEach(([field, value]) => {
          setValue(field as Path<T>, value, {
            shouldDirty: dirty,
            shouldTouch: touched,
            shouldValidate: validate,
          });
        });
        setIsRestored(true);
        onRestore?.(valuesToRestore);
      }
    } catch (error) {
      console.error(
        `[FORM-STORAGE] Failed to restore data from storage: ${error}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [included, excluded, serializer, setValue]);

  useEffect(() => {
    if (autoRestore) restoreDataFromStorage();
  }, []);

  // Watch for changes in form values and update storage
  useEffect(() => {
    // Cancel if autoSave is disabled
    if (!autoSave) return;

    const subscription = debounce
      ? watch(debouncer(saveToStorage, debounce))
      : watch(saveToStorage);

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, debounce]);

  return {
    isRestored,
    isLoading,
    save: async () => saveToStorage(form.getValues()),
    clear: async () => storageAdapter.removeItem(key),
    restore: async () => restoreDataFromStorage(),
  };
};
