import { BrowserCrypto } from "@effect/platform-browser";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import { BrowserNutritionStoreLayer } from "@mai/indexeddb";
import { Backups } from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import { BackupExportMetadataStore } from "./services/backup-export-metadata.ts";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import { MealEntries } from "@mai/nutrition/services/meal-entries";
import { MealPlans } from "@mai/nutrition/services/meal-plans";
import { NutritionReports } from "@mai/nutrition/services/nutrition-reports";

const ClientLayer = Layer.mergeAll(
  Backups.layer,
  MealPlans.layer,
  DailyLogs.layer,
  Foods.layer,
  MealEntries.layer,
  NutritionReports.layer,
  BackupExportMetadataStore.layer
).pipe(
  Layer.provide(
    Layer.mergeAll(
      BrowserNutritionStoreLayer,
      BrowserCrypto.layer,
      BrowserKeyValueStore.layerLocalStorage
    )
  )
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);
