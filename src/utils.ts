import { FieldValues } from 'react-hook-form';
import { Serializer } from './types';

// Walking a caller-supplied path into these would read or write the prototype
// chain instead of the value, so no path containing one is ever honoured.
const UNSAFE_SEGMENTS = ['__proto__', 'prototype', 'constructor'];

const isContainer = (value: unknown): value is FieldValues =>
  typeof value === 'object' && value !== null;

// Not `in`, which walks the prototype chain: 'toString' is not a field, and
// treating it as one would copy or transform an inherited member. The fields of
// an array are its indices — 'length' is an own property, but excluding it would
// mean `delete arr.length`, which throws.
const hasField = (container: FieldValues, segment: string): boolean => {
  if (Array.isArray(container) && !/^\d+$/.test(segment)) return false;
  return Object.prototype.hasOwnProperty.call(container, segment);
};

const cloneContainer = (value: FieldValues): FieldValues =>
  Array.isArray(value) ? [...value] : { ...value };

// Mirror the container the value actually came from. Guessing from the segment
// alone rebuilds a record keyed by digits — `{ '0': x }`, or worse `{ '01': x }`,
// whose value an array drops entirely — as an array. The guess is only a last
// resort, for a path with no counterpart in the source.
const containerFor = (segment: string, shape?: unknown): FieldValues => {
  if (Array.isArray(shape)) return [];
  if (isContainer(shape)) return {};
  return /^\d+$/.test(segment) ? [] : {};
};

/**
 * Splits a field path into segments. Both react-hook-form notations are
 * accepted, so 'items[0].email' and 'items.0.email' behave identically.
 * @param path The field path to split.
 * @returns The path segments, without empty ones.
 */
export const toPathSegments = (path: string): string[] =>
  path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment !== '');

/**
 * Finds paths that cannot be walked safely because a segment would reach into
 * an object's prototype. Callers use this to warn instead of failing silently.
 * @param paths The option entries to inspect.
 * @returns The subset of entries with an unsafe segment.
 */
export const findUnsafePaths = (paths?: string[]): string[] =>
  (paths ?? []).filter((path) =>
    toPathSegments(path).some((segment) => UNSAFE_SEGMENTS.includes(segment))
  );

/**
 * Reports whether a key would reach into an object's prototype. Stored data is
 * parsed from JSON the app does not control, so its keys get the same guard the
 * option paths do.
 * @param key The key to check.
 * @returns True when the key is unsafe to write.
 */
export const isUnsafeKey = (key: string): boolean =>
  UNSAFE_SEGMENTS.includes(key);

const isUsablePath = (segments: string[]): boolean =>
  segments.length > 0 &&
  !segments.some((segment) => UNSAFE_SEGMENTS.includes(segment));

/**
 * Reports whether a path is actually present, so that a missing field is not
 * confused with one explicitly holding `undefined`.
 * @param source The object to walk.
 * @param segments The path segments to follow.
 * @returns True when every segment exists.
 */
export const hasAtPath = (source: unknown, segments: string[]): boolean => {
  let current = source;

  for (const segment of segments) {
    if (!isContainer(current) || !hasField(current, segment)) return false;
    current = current[segment];
  }

  return true;
};

/**
 * Reads the value at a path.
 * @param source The object to walk.
 * @param segments The path segments to follow.
 * @returns The value, or undefined if the path does not resolve.
 */
export const getAtPath = (source: unknown, segments: string[]): unknown =>
  segments.reduce<unknown>(
    (current, segment) => (isContainer(current) ? current[segment] : undefined),
    source
  );

/**
 * Writes a value at a path, copying every container it descends through.
 * The copy matters: these objects are shared with the live form values, and
 * writing in place would edit the user's form as a side effect of persisting it.
 * @param target The object to write into.
 * @param segments The path segments to follow.
 * @param value The value to write.
 * @param shape The source the value came from, so containers created along the
 * way keep its object-or-array shape.
 * @returns A new object with the value set.
 */
export const setAtPath = (
  target: unknown,
  segments: string[],
  value: unknown,
  shape?: unknown
): any => {
  if (segments.length === 0) return value;

  const [segment, ...rest] = segments;
  const container = isContainer(target)
    ? cloneContainer(target)
    : containerFor(segment, shape);

  container[segment] = setAtPath(
    container[segment],
    rest,
    value,
    isContainer(shape) ? shape[segment] : undefined
  );

  return container;
};

/**
 * Removes the value at a path, copying every container it descends through.
 * @param target The object to delete from.
 * @param segments The path segments to follow.
 * @returns A new object without that path, or the original when nothing matched.
 */
export const deleteAtPath = (
  target: FieldValues,
  segments: string[]
): FieldValues => {
  if (segments.length === 0) return target;

  const [segment, ...rest] = segments;
  if (!isContainer(target) || !hasField(target, segment)) return target;

  const container = cloneContainer(target);

  // On an array this leaves a hole, which serializes to null. That keeps the
  // surrounding indices addressable, which splicing would not.
  if (rest.length === 0) {
    delete container[segment];
    return container;
  }

  // Fail closed: the remaining path cannot be resolved against a non-container,
  // so there is no way to prove the excluded field is gone. Drop the parent
  // rather than persist a value the caller asked to keep out.
  if (!isContainer(container[segment])) {
    delete container[segment];
    return container;
  }

  container[segment] = deleteAtPath(container[segment], rest);

  return container;
};

const isPlainObject = (value: unknown): value is FieldValues => {
  if (!isContainer(value) || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Merges stored values over the current ones, descending only through plain
 * objects. Restoring needs this because `setValue` replaces an object outright:
 * writing back a parent that was filtered down to one field would wipe its
 * siblings, default values included.
 *
 * Merging rather than writing each leaf under its own path is deliberate. A
 * deep path reaches react-hook-form as a string, which it re-parses — turning a
 * record key of '1' into an array index and one of 'a.b' into nesting — and it
 * moves validation and dirty tracking down to the leaves. Arrays and class
 * instances replace rather than merge, so a list can still shrink.
 * @param current The value currently held by the form.
 * @param stored The value read back from storage.
 * @returns The value to write, with anything absent from storage preserved.
 */
export const mergeRestoredValues = (current: unknown, stored: unknown): any => {
  if (!isPlainObject(stored)) return stored;

  const merged: FieldValues = isPlainObject(current) ? { ...current } : {};

  Object.entries(stored).forEach(([key, value]) => {
    // JSON.parse keeps a '__proto__' key as an own property, and writing it
    // would reassign the prototype of the object being restored into.
    if (isUnsafeKey(key)) return;
    merged[key] = mergeRestoredValues(merged[key], value);
  });

  return merged;
};

/**
 * Filters the fields of an object based on included and excluded field lists.
 * Both accept nested paths and array indices ('card.cvv', 'items.0.email').
 * @param values The object to filter.
 * @param included An optional list of paths to include.
 * @param excluded An optional list of paths to exclude.
 * @returns A new object with only the included or non-excluded paths.
 */
export const filterIncludedOrExcludedFields = (
  values: FieldValues,
  included?: string[],
  excluded?: string[]
): Partial<FieldValues> => {
  let result: Partial<FieldValues> = { ...values };

  if (included) {
    result = included.reduce<Partial<FieldValues>>((acc, path) => {
      const segments = toPathSegments(path);
      // Unusable or absent paths add nothing. Do NOT widen to the parent as
      // `excluded` does below — that would persist more than was asked for.
      if (!isUsablePath(segments) || !hasAtPath(values, segments)) return acc;
      return setAtPath(acc, segments, getAtPath(values, segments), values);
    }, {});
  }

  if (excluded) {
    result = excluded.reduce<Partial<FieldValues>>((acc, path) => {
      const segments = toPathSegments(path);
      if (segments.length === 0) return acc;
      // An unusable path still expressed an intent to keep something out, so it
      // fails closed on the root field instead of being ignored.
      if (!isUsablePath(segments)) return deleteAtPath(acc, segments.slice(0, 1));
      return deleteAtPath(acc, segments);
    }, result);
  }

  return result;
};

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
 * Serializer keys accept nested paths and array indices.
 * @param values The object containing field values to transform.
 * @param serializer An optional serializer object mapping field paths to serialization functions.
 * @param deserialize If true, applies deserialization instead of serialization.
 * @returns A new object with transformed field values.
 */
export const transformValues = <T extends FieldValues>(
  values: T | Partial<T>,
  serializer: Record<string, Serializer<any, any> | undefined> = {},
  deserialize = false
): Partial<T> => {
  // Driven by the serializer's paths rather than the value's own keys, because a
  // nested path does not appear as a key at any single level.
  return Object.entries(serializer).reduce<Partial<T>>(
    (acc, [path, fieldSerializer]) => {
      if (!fieldSerializer) return acc;

      const transformFn = deserialize
        ? fieldSerializer.deserialize
        : fieldSerializer.serialize;

      // Both directions are optional: fall back to identity, never drop the field.
      if (!transformFn) return acc;

      const segments = toPathSegments(path);
      // A serializer for a filtered-out field must not reintroduce it.
      if (!isUsablePath(segments) || !hasAtPath(acc, segments)) return acc;

      // Contain a throwing transform to its own field.
      try {
        return setAtPath(acc, segments, transformFn(getAtPath(acc, segments)));
      } catch (error) {
        console.error(
          `[FORM-STORAGE] Failed to ${
            deserialize ? 'deserialize' : 'serialize'
          } field "${path}", keeping the raw value: ${error}`
        );
        return acc;
      }
    },
    { ...values }
  );
};
