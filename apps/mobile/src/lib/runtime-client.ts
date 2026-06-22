import { ReactNativeSqliteLayer } from "@mai/sqlite";
import { Backups } from "@mai/nutrition";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import { MealEntries } from "@mai/nutrition/services/meal-entries";
import { MealPlans } from "@mai/nutrition/services/meal-plans";
import { NutritionReports } from "@mai/nutrition/services/nutrition-reports";
import { Layer, ManagedRuntime } from "effect";

import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  Backups.layer,
  MealPlans.layer,
  DailyLogs.layer,
  Foods.layer,
  MealEntries.layer,
  NutritionReports.layer
);

const MobileLayer = MobileServicesLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(MobileStoreLayer, ReactNativeCryptoLayer))
);

export const RuntimeClient = ManagedRuntime.make(MobileLayer);

export type RuntimeClient = typeof RuntimeClient;
