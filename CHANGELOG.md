# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2]

A stabilization release. Two of the fixes below are for bugs introduced by
1.3.1's own write-ordering work; the rest close gaps that let those bugs ship
green in the first place. No API changes.

### Fixed

- **A debounced save could resurrect data after `clear()`.** With `debounce`
  set, typing started a timer; calling `clear()` before it fired emptied storage
  and resolved, and then the timer wrote the draft back — with no user action
  after the clear. `clear()` now cancels any pending debounced save.
- **`clear()` could silently do nothing.** Routing `clear()` through 1.3.1's
  write chain made it share the "only the newest queued write runs" rule, so a
  save issued after `clear()` but before its turn caused the delete to be skipped
  — while `await clear()` still resolved successfully. Coalescing away a stale
  value is safe; dropping a delete is not, and `clear()` is no longer skippable.
- **`clear()` could hang forever behind a broken adapter.** Routing it through
  the write chain — which is what stops a queued save landing after the delete —
  also queued it behind writes already in flight, so an adapter whose `setItem`
  never settles left `clear()` never running and never resolving. It now waits
  at most 10 seconds for the queue before deleting anyway. Ordering is unchanged
  for every adapter that resolves or rejects; only a broken one is cut off.
- **An explicit `save()` could be dropped.** Two concurrent `save()` calls
  coalesced into one: the first never wrote and its `onSave` never fired, yet it
  resolved without error. Autosave still coalesces — that is the point of it —
  but the public `save()` no longer does.
- **A write for one storage key could discard a pending write for another.** The
  supersede counter was global to the hook, so changing `key` while a save was
  queued for the previous key silently dropped it, leaving that key frozen on an
  older value. Counting is now per key, and prototype-less so that a key named
  `__proto__` cannot defeat it.

### Internal

These do not change behavior, but the release exists because they were missing.

- The test suite was order-dependent: `jest --randomize` failed 6 to 9 of 38
  tests on every run, and it passed only because jest's default order is fixed.
  Caused by an unawaited `act(async ...)` and by fake timers never being
  restored. `randomize` is now set in `jest.config.js`, so a local `npm test`
  catches this too rather than only CI.
- The write-ordering test asserted its own name rather than its behavior — both
  values were written in one synchronous block, so only ONE write ever reached
  the adapter and the test passed with the supersede guard deleted. Rewritten,
  plus a test that actually covers the guard.
- `isLoading` was never asserted to be `true`, so making it a constant `false`
  passed every gate with identical coverage while breaking the documented
  loading-state guard. Covered now on both the mount and manual-restore paths.
- Test files had no type checking at all: `tsconfig.json` excluded them, so
  `npm run typecheck` never saw them. Including them surfaced three real errors,
  including a missing `@types/react-dom`. The published build is unaffected —
  `tsconfig.build.json` still excludes `src/tests`.

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
