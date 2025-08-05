import { FieldValues, Path } from 'react-hook-form';
import { Serializer, UseFormStorageOptions } from './types';

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
  return Object.entries(values).reduce((acc, [field, value]) => {
    // If included is defined, only include those fields
    if (included && !included.includes(field)) return acc;
    // If excluded is defined, skip those fields
    if (excluded && excluded.includes(field)) return acc;
    return {
      ...acc,
      [field]: value,
    };
  }, {});
};

/**
 * Debounces a function call.
 * @param cb The function to debounce.
 * @param delay The delay in milliseconds.
 * @returns A debounced version of the function.
 */
export const debouncer = <T extends (...args: any[]) => any>(
  cb: T,
  delay: number
) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => cb(...args), delay);
  }) as T;
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

    if (!transformFn) return acc;

    const transformedValue = transformFn(value);
    return { ...acc, [field]: transformedValue };
  }, {});
};
