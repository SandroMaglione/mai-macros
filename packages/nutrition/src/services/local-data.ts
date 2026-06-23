import { Context, Data, Effect } from "effect";

export const LocalDataResetConfirmationText = "Delete all my data.";

export class LocalDataResetError extends Data.TaggedError(
  "LocalDataResetError"
)<{
  readonly cause: unknown;
}> {}

export class LocalData extends Context.Service<
  LocalData,
  {
    readonly reset: Effect.Effect<void, LocalDataResetError>;
  }
>()("@mai/nutrition/LocalData") {}
