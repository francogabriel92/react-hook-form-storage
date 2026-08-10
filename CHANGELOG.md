# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0]

Nested paths in `included`, `excluded` and `serializer` now do what their type
always allowed. Until now they type-checked, warned, and were either ignored or
widened to the whole parent object.

### Added

- **Per-path `included` and `excluded`.** `excluded: ['card.cvv']` now drops the
  CVV and keeps `card.number`, instead of dropping all of `card`.
  `included: ['card.number']` persists that field alone. Array indices are
  matched too, in the dotted form `Path<T>` types (`'contacts.0.email'`);
  bracket notation resolves identically at runtime but does not type-check.
- **Per-path `serializer`.** A serializer keyed `'card.expiry'` transforms that
  value in both directions and leaves its siblings alone. Its argument type is
  now inferred from the path via `FieldPathValue` rather than falling back to
  `any`.
- `Serializer`, `SerializerMap` and `UseFormStorageAdapter` are exported from the
  package root, for declaring serializers and custom adapters outside the hook
  call.

### Fixed

- **Restoring a partially persisted object wiped the rest of it.** `setValue`
  replaces an object outright, so restoring a parent that was filtered down to
  one field cleared the others — including their default values. Restoring now
  merges the stored values over the ones the form holds. Arrays and class
  instances replace rather than merge, so a list can still shrink.
- **A stored `__proto__` key reached `setValue`.** `JSON.parse` keeps
  `__proto__` as an own property, so restoring data from storage could reassign
  the prototype of the form values object. Those keys are now dropped on
  restore, and no option path containing `__proto__`, `prototype` or
  `constructor` is ever walked — an excluded one fails closed on its root field.

### Changed

- An unresolvable `excluded` path fails closed on its parent (`'card.cvv'` where
  `card` holds a string drops `card`), which is the previous behavior narrowed to
  the cases where the leaf genuinely cannot be reached.
- The nested-path warning is gone; the only remaining warning covers paths that
  would reach into an object's prototype.
- A container created while filtering mirrors the shape of the value it came
  from instead of guessing from the path segment. A `Record<string, T>` keyed by
  digits stays an object: as an array, a key of `'01'` became a named property
  that `JSON.stringify` never emits, and an id-like key such as `'10023'` cost
  50 KB of `null` padding.
- Only own properties count as fields, and an array's fields are its indices.
  `'card.toString'` resolves to nothing instead of persisting an inherited
  member, and `'contacts.length'` to nothing instead of `delete arr.length`,
  which throws and would have failed the whole save.

### Internal

- Filtering and serializing copy every container they descend through, so
  persisting no longer risks editing the live form values in place.
- Unit tests for the path helpers, whose edge cases (fail-closed deletes, array
  holes, copy-on-write, prototype guards) the hook-level suite could not reach.
  Coverage floors raised to 96 / 93 / 95 / 97.

## [1.3.1]

A robustness release. No API changes — every entry below is a bug fix for
behavior that was already documented but did not work.

### Fixed

- **SSR**: the default `storage` was evaluated as a default parameter, so simply
  rendering the hook threw `ReferenceError: localStorage is not defined` on the
  server. It is now resolved lazily and no-ops when there is no storage.
- **Autosave used stale options**: the `watch` subscription captured the values
  from the render that created it, so after a rerender that changed `key`,
  `onSave`, `included`/`excluded` or `serializer`, it kept writing with the old
  ones — wrong key, wrong callback, wrong filter.
- **Nested paths failed silently**: `included`, `excluded` and `serializer` are
  typed `Path<T>`, which permits `'card.cvv'`, but only top-level keys were ever
  matched. Most seriously, an excluded nested path was ignored and the value was
  persisted anyway. `excluded` now fails closed — a nested path drops its whole
  parent key — and all three warn when given a nested path. Real per-path
  support is coming in 1.4.
- **One-directional serializers dropped fields**: `serialize` and `deserialize`
  are both optional, but a serializer defining only one of them lost the field
  on the other direction. It now falls back to identity.
- **A throwing serializer discarded everything**: one field's failing
  `serialize`/`deserialize` aborted the whole payload. Failures are now contained
  to that field, which keeps its raw value.
- **Debounced saves fired after unmount**: a save scheduled just before unmount
  still ran, writing to storage and calling `onSave` for a dead component.
- **Out-of-order writes with async storage**: writes were issued with no ordering
  guarantee, so with a slow custom adapter an earlier write could land after a
  newer one and persist stale values. Writes are now chained in issue order and
  superseded writes are dropped.
- **`isRestored` never reset**: it latched to `true` forever, so it stayed `true`
  after `clear()` and when switching to a key holding nothing.

### Added

- `LICENSE` — the package declared MIT but shipped no license text.

### Changed

- Documentation: rewritten introduction, SSR notes, a migration guide from
  `react-hook-form-persist`, and corrected return-type and serializer docs.

### Internal

- Repaired the eslint setup, which failed outright (`globals` was deep-imported
  but never declared as a dependency).
- CI now gates on lint, typecheck and build in addition to tests, uses `npm ci`,
  and enforces coverage floors.
- Fixed a fatal YAML parse error in the publish workflow and restricted
  publishing to `main`.

## [1.3.0]

### Fixed

- Effect dependencies in `useFormStorage` so autosave and autorestore react to
  `autoSave` and `autoRestore` changes.

## [1.2.0]

### Added

- `isLoading` state, for showing a loading indicator while data is being
  restored.

## [1.1.0]

### Added

- `autoRestore` option to enable or disable automatic restoration of form data
  from storage.
- Documentation updates for the `autoRestore` parameter in the README.

### Improved

- Minor performance optimizations for storage operations.
- Enhanced error handling for storage adapter methods.

## [1.0.0]

### Added

- Initial release
- Basic storage functionality
- TypeScript support
- Debouncing
- Field inclusion/exclusion
- Custom serializers
