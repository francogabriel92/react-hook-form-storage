import { FieldValues, Path } from 'react-hook-form';

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
 * @returns A debounced version of the function. `cancel` discards the pending
 * call. `flush` runs the pending call now.
 */
export const debouncer = <A extends unknown[]>(
  cb: (...args: A) => void,
  delay: number
) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: A | null = null;

  const cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    pendingArgs = null;
  };

  const flush = () => {
    const args = pendingArgs;
    cancel();
    if (args) cb(...args);
  };

  const debounced = (...args: A) => {
    if (timeout) clearTimeout(timeout);
    pendingArgs = args;
    timeout = setTimeout(flush, delay);
  };

  return Object.assign(debounced, { cancel, flush });
};

// A Serializer for any field: `never` parameters accept every field type.
type FieldTransforms = {
  serialize?: (value: never) => unknown;
  deserialize?: (value: never) => unknown;
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
  serializer: Partial<Record<string, FieldTransforms>> = {},
  deserialize = false
): Partial<T> => {
  const entries = Object.entries(values) as [Path<T>, unknown][];

  return entries.reduce((acc, [field, value]) => {
    const fieldSerializer = serializer[field];

    if (!fieldSerializer) return { ...acc, [field]: value };

    const transformFn = deserialize
      ? fieldSerializer.deserialize
      : fieldSerializer.serialize;

    // Both directions are optional: fall back to identity, never drop the field.
    if (!transformFn) return { ...acc, [field]: value };

    // Contain a throwing transform to its own field.
    try {
      return { ...acc, [field]: transformFn(value as never) };
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
