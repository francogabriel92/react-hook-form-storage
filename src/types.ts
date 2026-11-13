import type { FieldValues, Path } from 'react-hook-form';

export type Serializer<T, K extends keyof T> = {
  serialize?: (value: T[K]) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public API: callers type the stored value themselves
  deserialize?: (value: any) => T[K];
};

export type UseFormStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type UseFormStorageBaseOptions<T extends FieldValues> = {
  storage?: Storage | UseFormStorageAdapter;
  onRestore?: (values: FieldValues) => void;
  onSave?: (values: FieldValues) => void;
  debounce?: number;
  validate?: boolean;
  dirty?: boolean;
  touched?: boolean;
  serializer?: {
    [P in Path<T>]?: Serializer<T, P>;
  };
  autoSave?: boolean;
  autoRestore?: boolean;
};

type IncludedOptions<T extends FieldValues, K extends Path<T>[]> = {
  included: K;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public API: narrowing it would reject options accepted today
  excluded?: any;
};

type ExcludedOptions<T extends FieldValues, K extends Path<T>[]> = {
  excluded: K;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public API: narrowing it would reject options accepted today
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
