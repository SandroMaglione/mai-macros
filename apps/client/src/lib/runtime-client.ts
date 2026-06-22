import { BrowserCrypto } from "@effect/platform-browser";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import {
  BrowserDatabaseLayer,
  IndexedDbLocalDataLayer,
  IndexedDbNutritionStoreLayer,
} from "@mai/indexeddb";
import { Backups } from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import {
  BackupExportMetadataStore,
  BrowserBackupDeliveryClientLayer,
} from "./services/backup-export-metadata.ts";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import { MealEntries } from "@mai/nutrition/services/meal-entries";
import { MealPlans } from "@mai/nutrition/services/meal-plans";
import { NutritionReports } from "@mai/nutrition/services/nutrition-reports";

const BrowserDataLayer = Layer.mergeAll(
  IndexedDbNutritionStoreLayer,
  IndexedDbLocalDataLayer
).pipe(Layer.provide(BrowserDatabaseLayer));

const ClientLayer = Layer.mergeAll(
  Backups.layer,
  MealPlans.layer,
  DailyLogs.layer,
  Foods.layer,
  MealEntries.layer,
  NutritionReports.layer,
  BackupExportMetadataStore.layer,
  BrowserBackupDeliveryClientLayer
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      BrowserDataLayer,
      BrowserCrypto.layer,
      BrowserKeyValueStore.layerLocalStorage
    )
  )
);

export const RuntimeClient = ManagedRuntime.make(ClientLayer);
