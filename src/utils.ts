import { FieldValues } from 'react-hook-form';
import { Serializer } from './types';

// Walking a caller-supplied path into these would read or write the prototype
// chain instead of the value, so no path containing one is ever honoured.
const UNSAFE_SEGMENTS = ['__proto__', 'prototype', 'constructor'];

const isContainer = (value: unknown): value is FieldValues =>
  typeof value === 'object' && value !== null;

const cloneContainer = (value: FieldValues): FieldValues =>
  Array.isArray(value) ? [...value] : { ...value };

// A numeric segment addresses an array index, so a container created for it has
// to be an array — otherwise `items.0` would rebuild `items` as `{ '0': ... }`.
const containerFor = (segment: string): FieldValues =>
  /^\d+$/.test(segment) ? [] : {};

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
    if (!isContainer(current) || !(segment in current)) return false;
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
 * @returns A new object with the value set.
 */
export const setAtPath = (
  target: unknown,
  segments: string[],
  value: unknown
): any => {
  if (segments.length === 0) return value;

  const [segment, ...rest] = segments;
  const container = isContainer(target)
    ? cloneContainer(target)
    : containerFor(segment);

  container[segment] = setAtPath(container[segment], rest, value);

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
  if (!isContainer(target) || !(segment in target)) return target;

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
 * Flattens an object into [path, value] entries, descending only through
 * non-empty plain objects. Restoring has to write the deepest paths rather than
 * the top-level ones: react-hook-form's setValue replaces an object outright, so
 * writing a partially persisted parent would wipe the fields that were filtered
 * out — including their default values. Arrays and class instances stay whole,
 * where replacing is what the caller wants.
 * @param values The object to flatten.
 * @param prefix The path prefix, used by the recursion.
 * @returns The [path, value] pairs to write.
 */
export const toLeafEntries = (
  values: FieldValues,
  prefix = ''
): [string, any][] =>
  Object.entries(values).flatMap(([key, value]): [string, any][] => {
    // JSON.parse keeps a '__proto__' key as an own property, and writing it
    // would reassign the prototype of the object being restored into.
    if (isUnsafeKey(key)) return [];

    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value) && Object.keys(value).length > 0) {
      return toLeafEntries(value, path);
    }

    return [[path, value]];
  });

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
      return setAtPath(acc, segments, getAtPath(values, segments));
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
