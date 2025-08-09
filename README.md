# React Hook Form Storage

[![npm version](https://img.shields.io/npm/v/react-hook-form-storage.svg)](https://www.npmjs.com/package/react-hook-form-storage)
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/react-hook-form-storage)
![Tests](https://github.com/francogabriel92/react-hook-form-storage/actions/workflows/test.yml/badge.svg)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript library that provides persistent storage functionality for React Hook Form, allowing you to automatically save and restore form data using localStorage, sessionStorage, or custom storage implementations.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Configuration Options](#configuration-options)
- [Advanced Usage](#advanced-usage)
- [Examples](#examples)
- [TypeScript Support](#typescript-support)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install react-hook-form-storage
```

```bash
yarn add react-hook-form-storage
```

```bash
pnpm add react-hook-form-storage
```

## Peer Dependencies

This library requires the following peer dependencies:

- `react >= 16.8.0`
- `react-hook-form >= 7.0.0`

## Quick Start

Here's a basic example of how to use the library:

```typescript
import { useForm } from 'react-hook-form';
import { useFormStorage } from 'react-hook-form-storage';

interface FormData {
  username: string;
  email: string;
  age: number;
}

function MyForm() {
  const form = useForm<FormData>({
    defaultValues: {
      username: '',
      email: '',
      age: 0,
    },
  });

  const { isRestored } = useFormStorage('my-form', form, {
    // Options go here
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register('username')} placeholder="Username" />
      <input {...form.register('email')} placeholder="Email" />
      <input {...form.register('age', { valueAsNumber: true })} type="number" placeholder="Age" />
      <button type="submit">Submit</button>
      {isRestored && <p>Form data restored from storage!</p>}
    </form>
  );
}
```

## API Reference

`useFormStorage<T>(key: string, form: UseFormReturn<T>, options?: UseFormStorageOptions<T>)`

The main hook that provides storage functionality for your React Hook Form.

#### Parameters

- **`key`** (`string`): A unique identifier for storing the form data in storage
- **`form`** (`UseFormReturn<T>`): The form instance returned by `useForm()`
- **`options`** (`UseFormStorageOptions<T>`): Configuration options (optional)

#### Returns

```typescript
{
  isRestored: boolean;  // Indicates if data was restored from storage
  save: () => void;     // Manual save function
}
```

## Configuration Options

### `UseFormStorageOptions<T>`

```typescript
interface UseFormStorageOptions<T extends FieldValues> {
  storage?: Storage; // Storage implementation (default: localStorage)
  included?: Array<Path<T>>; // Fields to include in storage
  excluded?: Array<Path<T>>; // Fields to exclude from storage
  onRestore?: (data: Partial<T>) => void; // Callback when data is restored
  onSave?: (data: Partial<T>) => void; // Callback when data is saved
  debounce?: number; // Debounce delay in milliseconds
  dirty?: boolean; // Mark fields as dirty when restored
  touched?: boolean; // Mark fields as touched when restored
  validate?: boolean; // Validate fields when restored
  serializer?: Record<Path<T>, Serializer<T, Path<T>>>; // Custom serializers
  autoSave?: boolean; // Enable/disable automatic saving
  autoRestore?: boolean; // Enable/disable automatic restoration
}
```

### Option Details

#### `storage`

- **Type**: `Storage`
- **Default**: `localStorage`
- **Description**: The storage implementation to use. Can be `localStorage`, `sessionStorage`, or a custom storage object that implements the `Storage` interface.

```typescript
// Use sessionStorage instead of localStorage
useFormStorage('my-form', form, {
  storage: sessionStorage,
});

// Custom storage implementation
const customStorage = {
  getItem: (key: string) => {
    // Custom get logic
    return myCustomStore.get(key);
  },
  setItem: (key: string, value: string) => {
    // Custom set logic
    myCustomStore.set(key, value);
  },
  removeItem: (key: string) => {
    // Custom remove logic
    myCustomStore.delete(key);
  },
};

useFormStorage('my-form', form, {
  storage: customStorage,
});
```

#### `included` / `excluded`

- **Type**: `Array<Path<T>>`
- **Description**: Control which fields are stored. Use `included` to specify only certain fields, or `excluded` to omit specific fields.

```typescript
// Only store username and email
useFormStorage('my-form', form, {
  included: ['username', 'email'],
});

// Store all fields except password
useFormStorage('my-form', form, {
  excluded: ['password'],
});
```

#### `onRestore` / `onSave`

- **Type**: `(data: Partial<T>) => void`
- **Description**: Callbacks that are triggered when data is restored from storage or saved to storage.

```typescript
useFormStorage('my-form', form, {
  onRestore: (data) => {
    console.log('Data restored:', data);
    // Custom logic after restoration
  },
  onSave: (data) => {
    console.log('Data saved:', data);
    // Custom logic after saving
  },
});
```

#### `debounce`

- **Type**: `number`
- **Default**: `undefined` (no debouncing)
- **Description**: Debounce delay in milliseconds for auto-saving. Useful to prevent excessive storage writes.

```typescript
// Save data 500ms after the user stops typing
useFormStorage('my-form', form, {
  debounce: 500,
});
```

#### `dirty` / `touched` / `validate`

- **Type**: `boolean`
- **Default**: `false`
- **Description**: Control form state when restoring data from storage.

```typescript
useFormStorage('my-form', form, {
  dirty: true, // Mark restored fields as dirty
  touched: true, // Mark restored fields as touched
  validate: true, // Validate restored fields
});
```

#### `serializer`

- **Type**: `Record<Path<T>, Serializer<T, Path<T>>>`
- **Description**: Custom serialization/deserialization for specific fields.

```typescript
interface Serializer<T, K extends Path<T>> {
  serialize: (value: PathValue<T, K>) => any;
  deserialize: (value: any) => PathValue<T, K>;
}

// Example: Custom date serialization
useFormStorage('my-form', form, {
  serializer: {
    birthDate: {
      serialize: (date: Date) => date.toISOString(),
      deserialize: (dateString: string) => new Date(dateString),
    },
  },
});
```

#### `autoSave`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable or disable automatic saving. When disabled, use the returned `save` function for manual control.

```typescript
const { save } = useFormStorage('my-form', form, {
  autoSave: false,
});

// Manually save when needed
const handleSave = () => {
  save();
};
```

#### `autoRestore`

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable or disable automatic restoration of form data from storage. When disabled, you can manually restore data using the `restore` function returned by the hook.

```typescript
const { restore } = useFormStorage('my-form', form, {
  autoRestore: false, // Disable automatic restoration
});

// Manually restore data when needed
const handleRestore = () => {
  restore();
};
```

## Advanced Usage

### Manual Save Control

```typescript
function ManualSaveForm() {
  const form = useForm<FormData>();

  const { save, isRestored } = useFormStorage('manual-form', form, {
    autoSave: false, // Disable auto-save
  });

  const handleManualSave = () => {
    save(); // Manually trigger save
  };

  return (
    <form>
      {/* Form fields */}
      <button type="button" onClick={handleManualSave}>
        Save Draft
      </button>
    </form>
  );
}
```

### Complex Data Serialization

```typescript
interface ComplexFormData {
  user: {
    name: string;
    preferences: string[];
  };
  settings: Map<string, any>;
  createdAt: Date;
}

function ComplexForm() {
  const form = useForm<ComplexFormData>();

  useFormStorage('complex-form', form, {
    serializer: {
      'settings': {
        serialize: (map: Map<string, any>) => Object.fromEntries(map),
        deserialize: (obj: Record<string, any>) => new Map(Object.entries(obj)),
      },
      'createdAt': {
        serialize: (date: Date) => date.toISOString(),
        deserialize: (dateString: string) => new Date(dateString),
      },
    },
  });

  return (
    // Form JSX
  );
}
```

### Conditional Storage

```typescript
function ConditionalStorageForm() {
  const [enableStorage, setEnableStorage] = useState(true);
  const form = useForm<FormData>();

  useFormStorage('conditional-form', form, {
    autoSave: enableStorage,
    onSave: (data) => {
      if (enableStorage) {
        console.log('Data saved:', data);
      }
    },
  });

  return (
    <form>
      <label>
        <input
          type="checkbox"
          checked={enableStorage}
          onChange={(e) => setEnableStorage(e.target.checked)}
        />
        Enable auto-save
      </label>
      {/* Other form fields */}
    </form>
  );
}
```

## Examples

### Basic Contact Form

```typescript
import { useForm } from 'react-hook-form';
import { useFormStorage } from 'react-hook-form-storage';

interface ContactForm {
  name: string;
  email: string;
  message: string;
}

export function ContactForm() {
  const form = useForm<ContactForm>({
    defaultValues: {
      name: '',
      email: '',
      message: '',
    },
  });

  const { isRestored } = useFormStorage('contact-form', form);

  return (
    <form onSubmit={form.handleSubmit(console.log)}>
      <div>
        <label>Name:</label>
        <input {...form.register('name')} />
      </div>

      <div>
        <label>Email:</label>
        <input {...form.register('email')} type="email" />
      </div>

      <div>
        <label>Message:</label>
        <textarea {...form.register('message')} />
      </div>

      <button type="submit">Send</button>

      {isRestored && (
        <p style={{ color: 'green' }}>
          Your previous input has been restored!
        </p>
      )}
    </form>
  );
}
```

### E-commerce Checkout Form

```typescript
interface CheckoutForm {
  shippingAddress: {
    street: string;
    city: string;
    zipCode: string;
  };
  billingAddress: {
    street: string;
    city: string;
    zipCode: string;
  };
  paymentMethod: 'credit' | 'debit' | 'paypal';
  cardNumber: string;
  expiryDate: string;
}

export function CheckoutForm() {
  const form = useForm<CheckoutForm>();

  useFormStorage('checkout-form', form, {
    excluded: ['cardNumber', 'expiryDate'], // Exclude sensitive payment info
    debounce: 1000,
    onSave: (data) => {
      console.log('Checkout progress saved');
    },
  });

  return (
    <form>
      {/* Shipping address fields */}
      <fieldset>
        <legend>Shipping Address</legend>
        <input {...form.register('shippingAddress.street')} placeholder="Street" />
        <input {...form.register('shippingAddress.city')} placeholder="City" />
        <input {...form.register('shippingAddress.zipCode')} placeholder="ZIP Code" />
      </fieldset>

      {/* Billing address fields */}
      <fieldset>
        <legend>Billing Address</legend>
        <input {...form.register('billingAddress.street')} placeholder="Street" />
        <input {...form.register('billingAddress.city')} placeholder="City" />
        <input {...form.register('billingAddress.zipCode')} placeholder="ZIP Code" />
      </fieldset>

      {/* Payment fields (not persisted) */}
      <fieldset>
        <legend>Payment Information</legend>
        <select {...form.register('paymentMethod')}>
          <option value="credit">Credit Card</option>
          <option value="debit">Debit Card</option>
          <option value="paypal">PayPal</option>
        </select>
        <input {...form.register('cardNumber')} placeholder="Card Number" />
        <input {...form.register('expiryDate')} placeholder="MM/YY" />
      </fieldset>

      <button type="submit">Complete Order</button>
    </form>
  );
}
```

## TypeScript Support

This library is written in TypeScript and provides full type safety:

```typescript
// Types are automatically inferred from your form schema
interface UserForm {
  name: string;
  age: number;
  preferences: string[];
}

const form = useForm<UserForm>();

// TypeScript will ensure field names are valid
useFormStorage('user-form', form, {
  included: ['name', 'age'], // ✅ Valid field names
  excluded: ['invalid'], // ❌ TypeScript error - 'invalid' doesn't exist
});
```

## Browser Compatibility

- Modern browsers with ES2017+ support
- localStorage/sessionStorage API support
- React 16.8+ (hooks support)

## Performance Considerations

- Use `debounce` option to limit storage writes
- Consider `included`/`excluded` options for large forms
- The library uses React's built-in optimization (useCallback, useMemo)
- Storage operations are performed asynchronously when possible

```typescript
useFormStorage('my-form', form, {
  onSave: (data) => {
    // This callback only fires on successful saves
    console.log('Data saved successfully');
  },
  onRestore: (data) => {
    // This callback only fires on successful restoration
    console.log('Data restored successfully');
  },
});
```

## Contributing

Contributions are welcome!

## License

MIT License.

---

For more examples and advanced usage patterns, please visit our [GitHub repository](https://github.com/francogabriel92/react-hook-form-storage).
