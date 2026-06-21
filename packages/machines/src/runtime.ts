import type { Effect } from "effect";

export type MachineRuntime<Services> = {
  readonly runPromise: <A, E, R extends Services>(
    effect: Effect.Effect<A, E, R>,
    options?: { readonly signal?: AbortSignal }
  ) => Promise<A>;
  readonly runCallback?: <A, E, R extends Services>(
    effect: Effect.Effect<A, E, R>
  ) => () => void;
};
