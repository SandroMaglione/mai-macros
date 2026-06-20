import { BrowserCrypto } from "@effect/platform-browser";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import { Backups, BrowserDatabaseLayer } from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import { BackupExportMetadataStore } from "./services/backup-export-metadata.ts";
import { DailyLogs } from "./services/daily-logs.ts";
import { Foods } from "./services/foods.ts";
import { MealEntries } from "./services/meal-entries.ts";
import { MealPlans } from "./services/meal-plans.ts";
import { NutritionReports } from "./services/nutrition-reports.ts";

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
      BrowserDatabaseLayer,
      BrowserCrypto.layer,
      BrowserKeyValueStore.layerLocalStorage
    )
  )
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);
