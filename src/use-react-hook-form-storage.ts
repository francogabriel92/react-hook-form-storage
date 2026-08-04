import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    storage,
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

  // These options are almost always passed as inline literals, so they get a
  // fresh identity on every render. Reading them through a ref keeps the
  // save/restore callbacks below referentially stable while still always
  // seeing the latest values.
  const optionsRef = useRef({
    included,
    excluded,
    onRestore,
    onSave,
    dirty,
    touched,
    validate,
    serializer,
  });
  optionsRef.current = {
    included,
    excluded,
    onRestore,
    onSave,
    dirty,
    touched,
    validate,
    serializer,
  };

  const storageAdapter = useMemo(() => {
    // Resolve the default storage lazily. Evaluating `localStorage` as a
    // default parameter would throw during render in any environment without
    // it (SSR, Node), so fall back to null there and no-op instead.
    const resolvedStorage =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : null);

    const setItem = async (key: string, value: string) => {
      if (!resolvedStorage) return;
      try {
        return await resolvedStorage.setItem(key, value);
      } catch (error) {
        console.error(
          `[FORM-STORAGE] Failed to save data to storage: ${error}`
        );
      }
    };

    const getItem = async (key: string) => {
      if (!resolvedStorage) return null;
      try {
        return await resolvedStorage.getItem(key);
      } catch (error) {
        console.error(
          `[FORM-STORAGE] Failed to restore data from storage: ${error}`
        );
        return null;
      }
    };

    const removeItem = async (key: string) => {
      if (!resolvedStorage) return;
      try {
        return await resolvedStorage.removeItem(key);
      } catch (error) {
        console.error(`[FORM-STORAGE] Failed to clear storage: ${error}`);
      }
    };

    return { setItem, getItem, removeItem };
  }, [storage]);

  // Writes are chained so they reach an async adapter in the order they were
  // issued. Without this, a slow write issued first could resolve after a
  // faster later one and overwrite storage with stale values.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const latestWriteRef = useRef(0);

  // Save form values to storage
  const saveToStorage = useCallback(
    async (values: Record<string, any>) => {
      const { included, excluded, serializer, onSave } = optionsRef.current;
      const writeId = ++latestWriteRef.current;

      const write = async () => {
        // A newer save was issued while this one waited its turn, so this write
        // would only overwrite fresher data. Drop it.
        if (writeId < latestWriteRef.current) return;

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
      };

      // Chain on both settle paths so one rejection cannot stall every
      // subsequent write.
      const next = writeChainRef.current.then(write, write);
      writeChainRef.current = next;
      return next;
    },
    [key, storageAdapter]
  );

  // Restore initial values from storage if available
  const restoreDataFromStorage = useCallback(async () => {
    const {
      included,
      excluded,
      serializer,
      onRestore,
      dirty,
      touched,
      validate,
    } = optionsRef.current;
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
      } else {
        // Nothing stored under this key: an earlier key may have set the flag.
        setIsRestored(false);
      }
    } catch (error) {
      setIsRestored(false);
      console.error(
        `[FORM-STORAGE] Failed to restore data from storage: ${error}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [key, storageAdapter, setValue]);

  useEffect(() => {
    if (autoRestore) {
      restoreDataFromStorage();
    } else {
      // Nothing will be restored for this key until restore() is called.
      setIsRestored(false);
    }
    // restoreDataFromStorage is intentionally omitted: it changes with
    // storageAdapter, which callers may pass as an inline object, and
    // re-running the restore on every render would loop. A restore is
    // re-triggered only when the key or autoRestore changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRestore, key]);

  // The watch subscription outlives the render that created it, so it must not
  // close over saveToStorage directly — otherwise a later rerender that changes
  // the key or onSave would keep autosaving through the old one.
  const saveToStorageRef = useRef(saveToStorage);
  useEffect(() => {
    saveToStorageRef.current = saveToStorage;
  }, [saveToStorage]);

  // Watch for changes in form values and update storage
  useEffect(() => {
    // Cancel if autoSave is disabled
    if (!autoSave) return;

    const handleChange = (values: Record<string, any>) =>
      saveToStorageRef.current(values);

    const debouncedHandleChange = debounce
      ? debouncer(handleChange, debounce)
      : null;

    const subscription = watch(debouncedHandleChange ?? handleChange);

    return () => {
      subscription.unsubscribe();
      // Drop any pending debounced save so it cannot fire after unmount
      debouncedHandleChange?.cancel();
    };
  }, [watch, debounce, autoSave]);

  return {
    isRestored,
    isLoading,
    save: async () => saveToStorage(form.getValues()),
    clear: async () => {
      await storageAdapter.removeItem(key);
      // Nothing is stored anymore, so nothing is restored either.
      setIsRestored(false);
    },
    restore: async () => restoreDataFromStorage(),
  };
};
