import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  debouncer,
  filterIncludedOrExcludedFields,
  findNestedPaths,
  transformValues,
} from './utils';
import { UseFormStorageOptions } from './types';

// Longest wait for one storage call before the queue moves on.
const WRITE_TIMEOUT_MS = 10_000;

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

  const { setValue } = form;

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

    // Resolves to whether the call succeeded. onSave and clear() check it.
    const attempt = async (call: () => unknown, failure: string) => {
      if (!resolvedStorage) return false;
      try {
        await call();
        return true;
      } catch (error) {
        console.error(`[FORM-STORAGE] Failed to ${failure}: ${error}`);
        return false;
      }
    };

    const setItem = (key: string, value: string) =>
      attempt(
        () => resolvedStorage?.setItem(key, value),
        'save data to storage'
      );

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

    const removeItem = (key: string) =>
      attempt(() => resolvedStorage?.removeItem(key), 'clear storage');

    return { setItem, getItem, removeItem };
  }, [storage]);

  // Chained so saves and clears reach an async adapter in issue order:
  // otherwise a slow earlier one can resolve last and undo a newer one.
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

  // Both branches: a rejection must not stall every later write.
  // The timeout keeps one write that never settles from blocking the rest.
  // ponytail: a timed-out write can still land later and undo a newer one.
  const enqueue = useCallback((mutate: () => Promise<void>) => {
    const run = () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          console.error(
            `[FORM-STORAGE] A storage call took over ${WRITE_TIMEOUT_MS} ms. ` +
              `Running the next one.`
          );
          resolve();
        }, WRITE_TIMEOUT_MS);
      });
      return Promise.race([mutate(), timeout]).finally(() =>
        clearTimeout(timer)
      );
    };
    const next = writeChainRef.current.then(run, run);
    writeChainRef.current = next;
    return next;
  }, []);

  // Per key, autosave only: a newer keystroke makes a queued older one
  // pointless, but an explicit save() is awaited and must always run.
  const latestAutosaveRef = useRef(new Map<string, number>());

  const saveToStorage = useCallback(
    async (values: Record<string, any>, autosave = false) => {
      const { included, excluded, serializer, onSave } = optionsRef.current;
      const latest = latestAutosaveRef.current;
      const writeId = (latest.get(key) ?? 0) + 1;
      if (autosave) latest.set(key, writeId);

      return enqueue(async () => {
        if (autosave && writeId < (latest.get(key) ?? 0)) return;

        try {
          const valuesToStore = filterIncludedOrExcludedFields(
            values,
            included,
            excluded
          );
          const serialized = transformValues(valuesToStore, serializer as any);
          const stored = await storageAdapter.setItem(
            key,
            JSON.stringify(serialized)
          );
          if (stored) onSave?.(valuesToStore);
        } catch (error) {
          console.error(`[FORM-STORAGE] Failed to save data: ${error}`);
        }
      });
    },
    [key, storageAdapter, enqueue]
  );

  // Bumped by every restore and by clear(): a restore whose read resolves
  // after a newer restore or a clear must not apply stale values.
  const restoreIdRef = useRef(0);

  const restoreDataFromStorage = useCallback(async () => {
    const restoreId = ++restoreIdRef.current;
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
      if (restoreId !== restoreIdRef.current) return;
      if (storedValue) {
        const parsedValue = JSON.parse(storedValue);
        // Anything else would spread into junk fields such as "0" and "1".
        if (parsedValue?.constructor !== Object) {
          throw new Error('the stored value is not an object');
        }

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
      if (restoreId === restoreIdRef.current) setIsLoading(false);
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

  // Lets clear() cancel a pending debounced save, which would otherwise fire
  // after the clear and write the data back.
  const cancelPendingSaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!autoSave) return;

    const handleChange = (values: Record<string, any>) =>
      saveToStorageRef.current(values, true);

    const debouncedHandleChange = debounce
      ? debouncer(handleChange, debounce)
      : null;
    cancelPendingSaveRef.current = debouncedHandleChange?.cancel ?? null;

    const listener = debouncedHandleChange ?? handleChange;
    // RHF v8 removed watch(callback). RHF < 7.55 has no subscribe.
    const unsubscribe = form.subscribe
      ? form.subscribe({
          formState: { values: true },
          callback: ({ values }) => listener(values),
        })
      : (
          form.watch as unknown as (cb: typeof listener) => {
            unsubscribe: () => void;
          }
        )(listener).unsubscribe;

    return () => {
      unsubscribe();
      // Saves the last edit now, so an unmount inside the debounce keeps it.
      debouncedHandleChange?.flush();
      cancelPendingSaveRef.current = null;
    };
    // Keyed on form.control, not watch: RHF v8 no longer keeps watch stable,
    // so depending on it would resubscribe and flush the debounce every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.control, debounce, autoSave]);

  return {
    isRestored,
    isLoading,
    save: async () => saveToStorage(form.getValues()),
    clear: async () => {
      cancelPendingSaveRef.current?.();
      restoreIdRef.current += 1;
      setIsLoading(false);
      // Queued, so a save issued before the clear cannot land after it.
      await enqueue(async () => {
        if (await storageAdapter.removeItem(key)) setIsRestored(false);
      });
    },
    restore: async () => restoreDataFromStorage(),
  };
};
