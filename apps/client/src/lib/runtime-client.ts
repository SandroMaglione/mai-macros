import { BrowserCrypto } from "@effect/platform-browser";
import { BrowserDatabaseLayer } from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import { DailyLogs } from "./services/daily-logs.ts";
import { Foods } from "./services/foods.ts";
import { MealPlans } from "./services/meal-plans.ts";

const ClientLayer = Layer.mergeAll(
  MealPlans.layer,
  DailyLogs.layer,
  Foods.layer
).pipe(
  Layer.provide(Layer.mergeAll(BrowserDatabaseLayer, BrowserCrypto.layer))
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);
