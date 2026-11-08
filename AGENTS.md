## General coding rules

- Use `pnpm run verify` to verify implementation work.
- Prefer strict domain types over broad primitives when the domain shape is known.
- Prefer safe `effect` patterns over functions with `unsafe` in the name.
- When validation is needed, use Effect Schema decoding or encoding APIs and handle failures explicitly.
- Treat released local-first migrations as immutable distributed history. Put schema changes in a new/current migration instead of editing old migrations, unless the migration has not shipped yet.

## Project structure

This repository is a pnpm monorepo.

- Apps belong in `apps/*`.
- Reusable packages belong in `packages/*`.
- Custom oxlint rules live in `packages/oxc`.
- TypeScript-aware lint rules live in `packages/typed-lint`.

## State machines

State machines use `@typeonce/effect-machine`.

- Shared machines live in `packages/machines/src`. Mobile machines live in `apps/mobile/src/machines`, one module per screen or component, without React or React Native imports.
- Machines reach the app through Effect services: domain services, plus `Navigation`, `Dialogs` and `AppActivity` in `apps/mobile/src/machines/services`. Their mobile layers are combined in `MobileMachineLayer`.
- Components own a machine with `useMachine` from `apps/mobile/src/hooks/use-machine.ts`, read child machines with `useChildMachine`, and read projections such as `AtomMachine.can` with `useMachineValue`.
- Test machines with `MachineTest` from `@typeonce/effect-machine/testing` in `packages/machines/test` and `apps/mobile/test/machines`. `pnpm run machines:check` builds the devtools machine documents and fails on an invalid machine.

## Reference repos

Use `.repos/effect` to inspect Effect APIs.

Use `node_modules/@typeonce/effect-machine` (`README.md`, `docs/`, `src/`) to inspect the installed effect-machine APIs when state machine implementation details are unclear. The JSDoc examples in its `.d.ts` files may be stale; prefer the README and `docs/`.
