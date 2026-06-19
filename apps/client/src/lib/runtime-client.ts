import { BrowserCrypto, BrowserHttpClient } from "@effect/platform-browser";
import { BrowserDatabaseLayer } from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import { DailyLogs } from "./services/daily-logs.ts";
import { Foods } from "./services/foods.ts";
import { MealEntries } from "./services/meal-entries.ts";
import { MealPlans } from "./services/meal-plans.ts";
import { OpenFoodFacts } from "./services/open-food-facts.ts";

const ClientLayer = Layer.mergeAll(
  MealPlans.layer,
  DailyLogs.layer,
  Foods.layer,
  MealEntries.layer,
  OpenFoodFacts.layer
).pipe(
  Layer.provide(
    Layer.mergeAll(
      BrowserDatabaseLayer,
      BrowserCrypto.layer,
      BrowserHttpClient.layerFetch
    )
  )
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);
