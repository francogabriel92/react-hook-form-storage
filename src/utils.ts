import { FieldValues, Path } from 'react-hook-form';
import { Serializer } from './types';

/**
 * Filters the fields of an object based on included and excluded field lists.
 * @param values The object to filter.
 * @param included An optional list of fields to include.
 * @param excluded An optional list of fields to exclude.
 * @returns A new object with only the included or non-excluded fields.
 */
export const filterIncludedOrExcludedFields = (
  values: FieldValues,
  included?: string[],
  excluded?: string[]
): Partial<FieldValues> => {
  // Nested paths are unsupported, so `excluded` fails closed: excluding
  // 'card.cvv' drops all of `card` rather than persisting the secret. Do NOT
  // mirror this for `included` — widening to the parent would persist more than
  // was asked for.
  const excludedRoots = excluded?.map((field) => field.split('.')[0]);

  return Object.entries(values).reduce((acc, [field, value]) => {
    if (included && !included.includes(field)) return acc;
    if (excludedRoots && excludedRoots.includes(field)) return acc;
    return {
      ...acc,
      [field]: value,
    };
  }, {});
};

/**
 * Finds entries that reference a nested (dotted) path, which the filters above
 * cannot match. Callers use this to warn instead of failing silently.
 * @param paths The option entries to inspect.
 * @returns The subset of entries containing a '.'.
 */
export const findNestedPaths = (paths?: string[]): string[] =>
  (paths ?? []).filter((field) => field.includes('.'));

/**
 * Debounces a function call.
 * @param cb The function to debounce.
 * @param delay The delay in milliseconds.
 * @returns A debounced version of the function, with a `cancel` method that
 * discards any pending call.
 */
export const debouncer = <T extends (...args: any[]) => any>(
  cb: T,
  delay: number
): T & { cancel: () => void } => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => cb(...args), delay);
  };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };

  return debounced as unknown as T & { cancel: () => void };
};

/**
 * Transforms the field values of an object using the provided serializer.
 * @param values The object containing field values to transform.
 * @param serializer An optional serializer object mapping field paths to serialization functions.
 * @param deserialize If true, applies deserialization instead of serialization.
 * @returns A new object with transformed field values.
 */
export const transformValues = <T extends FieldValues>(
  values: T,
  serializer: Record<string, Serializer<any, any>> = {},
  deserialize = false
): Partial<T> => {
  const entries = Object.entries(values) as [Path<T>, any][];
  const serializerRecord = serializer as
    | Record<string, Serializer<T, any>>
    | undefined;

  return entries.reduce((acc, [field, value]) => {
    const fieldSerializer = serializerRecord?.[field];

    if (!fieldSerializer) return { ...acc, [field]: value };

    const transformFn = deserialize
      ? fieldSerializer.deserialize
      : fieldSerializer.serialize;

    // Both directions are optional: fall back to identity, never drop the field.
    if (!transformFn) return { ...acc, [field]: value };

    // Contain a throwing transform to its own field.
    try {
      return { ...acc, [field]: transformFn(value) };
    } catch (error) {
      console.error(
        `[FORM-STORAGE] Failed to ${
          deserialize ? 'deserialize' : 'serialize'
        } field "${field}", keeping the raw value: ${error}`
      );
      return { ...acc, [field]: value };
    }
  }, {});
};
