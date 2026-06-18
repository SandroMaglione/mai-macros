## General coding rules

- Use `pnpm run verify` to verify implementation work.
- Prefer strict domain types over broad primitives when the domain shape is known.
- Prefer safe `effect` patterns over functions with `unsafe` in the name.
- When validation is needed, use Effect Schema decoding or encoding APIs and handle failures explicitly.

## Project structure

This repository is a pnpm monorepo.

- Apps belong in `apps/*`.
- Reusable packages belong in `packages/*`.
- Custom oxlint rules live in `packages/oxc`.
- TypeScript-aware lint rules live in `packages/typed-lint`.

## Reference repos

Use `.repos/effect` to inspect Effect APIs.

Use `.repos/xstate` to inspect XState APIs when state machine implementation details are unclear.
