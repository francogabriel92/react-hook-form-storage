import type { FieldPathValue, FieldValues, Path } from 'react-hook-form';

// Keyed by Path<T>, not keyof T, so 'card.cvv' resolves to the type of the
// nested value rather than falling back to any.
export type Serializer<T extends FieldValues, K extends Path<T>> = {
  serialize?: (value: FieldPathValue<T, K>) => any;
  deserialize?: (value: any) => FieldPathValue<T, K>;
};

export type SerializerMap<T extends FieldValues> = {
  [P in Path<T>]?: Serializer<T, P>;
};

export type UseFormStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type UseFormStorageBaseOptions<T extends FieldValues> = {
  storage?: Storage | UseFormStorageAdapter;
  onRestore?: (values: Record<string, any>) => void;
  onSave?: (values: Record<string, any>) => void;
  debounce?: number;
  validate?: boolean;
  dirty?: boolean;
  touched?: boolean;
  serializer?: SerializerMap<T>;
  autoSave?: boolean;
  autoRestore?: boolean;
};

type IncludedOptions<T extends FieldValues, K extends Path<T>[]> = {
  included: K;
  excluded?: any;
};

type ExcludedOptions<T extends FieldValues, K extends Path<T>[]> = {
  excluded: K;
  included?: any;
};

type NoInclusionExclusionOptions = {
  included?: undefined;
  excluded?: undefined;
};

export type UseFormStorageOptions<T extends FieldValues> =
  UseFormStorageBaseOptions<T> &
    (
      | IncludedOptions<T, Path<T>[]>
      | ExcludedOptions<T, Path<T>[]>
      | NoInclusionExclusionOptions
    );
