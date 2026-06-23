import { BrowserCrypto } from "@effect/platform-browser";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import {
  BrowserDatabaseLayer,
  IndexedDbLocalDataLayer,
  IndexedDbNutritionStoreLayer,
} from "@mai/indexeddb";
import { BackupTransferMachine } from "@mai/machines";
import {
  Backup,
  DailyLogs,
  Foods,
  MealEntries,
  MealPlans,
  NutritionReports,
} from "@mai/nutrition";
import { Layer, ManagedRuntime } from "effect";

import { BrowserBackupDeliveryClientLayer } from "./services/backup-export-metadata.ts";

const BrowserDataLayer = Layer.mergeAll(
  IndexedDbNutritionStoreLayer,
  IndexedDbLocalDataLayer
).pipe(Layer.provide(BrowserDatabaseLayer));

const ClientLayer = Layer.mergeAll(
  Backup.Backups.layer,
  MealPlans.MealPlans.layer,
  DailyLogs.DailyLogs.layer,
  Foods.Foods.layer,
  MealEntries.MealEntries.layer,
  NutritionReports.NutritionReports.layer,
  BackupTransferMachine.BackupExportMetadataStore.layer,
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
