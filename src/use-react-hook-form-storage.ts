import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  debouncer,
  filterIncludedOrExcludedFields,
  findNestedPaths,
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

  // Read through a ref, not deps: these are passed as inline literals, so
  // depending on them would recreate the callbacks and subscription every render.
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

  const nestedPaths = [
    ...findNestedPaths(included),
    ...findNestedPaths(excluded),
    ...findNestedPaths(Object.keys(serializer)),
  ].join(', ');

  useEffect(() => {
    if (!nestedPaths) return;
    console.warn(
      `[FORM-STORAGE] Nested paths are not supported yet and will not be ` +
        `matched field by field: ${nestedPaths}. An excluded nested path drops ` +
        `its whole parent object so the value is never persisted; an included ` +
        `or serialized nested path is ignored. Use top-level fields for now.`
    );
  }, [nestedPaths]);

  const storageAdapter = useMemo(() => {
    // Resolved here, not as a default parameter: that would evaluate
    // `localStorage` during render and throw under SSR.
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

  // Chained so mutations reach an async adapter in issue order: otherwise a slow
  // earlier one can resolve last and undo a newer one. Clearing has to go
  // through here too, or a pending save lands afterwards and resurrects the
  // data that was just cleared.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const latestWriteRef = useRef(0);

  const enqueueWrite = useCallback(
    (mutate: () => Promise<void>, { supersedable } = { supersedable: true }) => {
      const writeId = ++latestWriteRef.current;

      const run = async () => {
        // Only a save may be dropped when a newer one is already queued:
        // coalescing away a stale value is safe, silently dropping a delete is
        // not — the caller asked for it and would get a successful resolve.
        if (supersedable && writeId < latestWriteRef.current) return;
        await mutate();
      };

      // Both branches: a rejection must not stall every later write.
      const next = writeChainRef.current.then(run, run);
      writeChainRef.current = next;
      return next;
    },
    []
  );

  const saveToStorage = useCallback(
    async (values: Record<string, any>) => {
      const { included, excluded, serializer, onSave } = optionsRef.current;

      return enqueueWrite(async () => {
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
      });
    },
    [key, storageAdapter, enqueueWrite]
  );

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
      setIsRestored(false);
    }
    // restoreDataFromStorage omitted: it changes with storageAdapter, which
    // callers may pass inline, so including it would restore on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRestore, key]);

  // The subscription below outlives this render, so it must not close over
  // saveToStorage directly or it would keep using a stale key and onSave.
  const saveToStorageRef = useRef(saveToStorage);
  useEffect(() => {
    saveToStorageRef.current = saveToStorage;
  }, [saveToStorage]);

  useEffect(() => {
    if (!autoSave) return;

    const handleChange = (values: Record<string, any>) =>
      saveToStorageRef.current(values);

    const debouncedHandleChange = debounce
      ? debouncer(handleChange, debounce)
      : null;

    const subscription = watch(debouncedHandleChange ?? handleChange);

    return () => {
      subscription.unsubscribe();
      debouncedHandleChange?.cancel();
    };
  }, [watch, debounce, autoSave]);

  return {
    isRestored,
    isLoading,
    save: async () => saveToStorage(form.getValues()),
    clear: async () =>
      enqueueWrite(
        async () => {
          await storageAdapter.removeItem(key);
          setIsRestored(false);
        },
        { supersedable: false }
      ),
    restore: async () => restoreDataFromStorage(),
  };
};
