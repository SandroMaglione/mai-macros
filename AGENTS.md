## General coding rules

- Use `pnpm run verify` to verify implementation work.
- The `verify` command runs formatting, recursive TypeScript checks, oxlint, and typed lint.
- Keep generated files out of manual edits when a generator exists.
- Prefer strict domain types over broad primitives when the domain shape is known.
- Prefer safe `effect` patterns over functions with `unsafe` in the name.
- When validation is needed, use Effect Schema decoding or encoding APIs and handle failures explicitly.

## Project structure

This repository is a pnpm monorepo.

- Apps belong in `apps/*`.
- Reusable packages belong in `packages/*`.
- Custom oxlint rules live in `packages/oxc`.
- TypeScript-aware lint rules live in `packages/typed-lint`.

## Tooling

Use `oxfmt` for formatting and `oxlint` for linting. The root oxlint config loads the local `@mai/oxc` plugin and keeps all custom rules enabled under the `mai/*` namespace.

The typed lint runner discovers workspace `tsconfig.json` files under `apps/*` and `packages/*`, skipping tooling packages so the tooling can verify itself without linting its own implementation rules.

## Reference repos

Use `.repos/effect` to inspect Effect APIs when implementation details are unclear.

Use `.repos/xstate` to inspect XState APIs when state machine implementation details are unclear.
