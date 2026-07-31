import type { EventTrackingStores } from "@mai/event-tracking/services/store";
import { Context, Data, Effect } from "effect";

import type { NutritionStores } from "./store.ts";

export type AppDataStores = NutritionStores & EventTrackingStores;

export class AppDataStoreError extends Data.TaggedError("AppDataStoreError")<{
  readonly cause: unknown;
}> {}

type AppDataStoreEffect<Value> = Effect.Effect<Value, AppDataStoreError, never>;

export class AppDataStore extends Context.Service<
  AppDataStore,
  {
    readonly readStores: AppDataStoreEffect<AppDataStores>;
    readonly replaceStores: (
      stores: AppDataStores
    ) => AppDataStoreEffect<unknown>;
  }
>()("@mai/nutrition/AppDataStore") {}
