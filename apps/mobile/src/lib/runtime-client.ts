import {
  Backup,
  DailyLogs,
  Foods,
  MealEntries,
  MealPlans,
  NutritionReports,
} from "@mai/nutrition";
import { ReactNativeSqlite } from "@mai/sqlite";
import { Layer, ManagedRuntime } from "effect";

import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqlite.ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  MealPlans.MealPlans.layer,
  DailyLogs.DailyLogs.layer,
  Foods.Foods.layer,
  MealEntries.MealEntries.layer,
  NutritionReports.NutritionReports.layer
);

const MobileLayer = MobileServicesLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(MobileStoreLayer, ReactNativeCryptoLayer))
);

export const RuntimeClient = ManagedRuntime.make(MobileLayer);

export type RuntimeClient = typeof RuntimeClient;
