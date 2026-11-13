# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **React Hook Form v8 support.** RHF v8 removes the `watch` callback. Autosave
  now uses `form.subscribe` when the form has it (RHF 7.55 or later). RHF 7.0 to
  7.54 keeps the `watch` callback.
- The peer range accepts v8 prereleases: `>=7.0.0 || >=8.0.0-0`.

### Changed

- **Autosave skips a write identical to the last write for the key.**
  `form.subscribe` can fire with unchanged values: on RHF 7.55, and on RHF 8
  beta when the form has another subscriber. Such an update wrote the draft back
  after `clear()`. An explicit `save()` always writes.
  After `clear()`, an edit that ends on the last saved values is not saved.
  The next different edit is saved.
- **`serialize` returns `unknown` instead of `any`** in the serializer types.
  A serializer written for 1.3.2 still compiles.

### Fixed

- **Autosave resubscribed on every render with RHF v8.** RHF v8 no longer keeps
  `watch` stable between renders. Each render flushed the pending debounced
  save. The subscription now follows the form instance.

## [1.3.2]

A stabilization release. No breaking changes.

`clear()` now deletes after the writes queued before it. Await `clear()` before
you read storage.

### Fixed

- **A debounced save could restore data after `clear()`.** The pending timer
  fired after the clear and wrote the draft back. `clear()` now cancels it.
- **A queued save could land after `clear()`.** With an async adapter, a save
  issued before `clear()` could finish after the delete. `clear()` now waits in
  the same write queue as saves.
- **Concurrent `save()` calls could be dropped.** Only the newest queued write
  ran, but every `save()` promise resolved. Only autosave coalesces now. An
  explicit `save()` always runs.
- **A write for one key could drop a queued write for another key.** Autosave
  coalescing is now counted per key.
- **`onSave` fired after a failed write.** It now fires only when the adapter
  stored the value.
- **`clear()` during a restore brought the data back.** A restore still reading
  from a slow adapter applied the old values after the clear, and autosave
  wrote them back. `clear()` now discards that restore.
- **A stored value that is not an object added junk fields.** A stored `5`,
  `"text"` or `[1,2]` set fields named `"0"`, `"1"` and marked the form as
  restored. It now counts as no stored data.
- **An unmount inside the debounce lost the last edit.** 1.3.1 cancelled the
  pending save on unmount. The hook now saves it at unmount. `onSave` still
  fires for that save.
- **One storage call that never settled blocked every later write.** The queue
  now moves on after 10 seconds and logs an error. The stalled call can still
  land later.
- **`clear()` reset `isRestored` when the delete failed.** The data stayed in
  storage. `isRestored` now changes only when the delete succeeds.

### Added

- The package exports the `UseFormStorageAdapter` type. Use it to type a custom
  `storage` adapter.

### Internal

- The test suite depended on test order. Fake timers leaked between tests and
  one `act()` was not awaited. Jest now runs the suite in random order.
- `npm run typecheck` now checks the test files. Adds `@types/react-dom`.

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
