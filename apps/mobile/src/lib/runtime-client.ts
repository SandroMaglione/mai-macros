import {
  Backup,
  DailyLogs,
  FoodCatalogTransfer,
  Foods,
  MealEntries,
  MealPlans,
  NutritionReports,
} from "@mai/nutrition";
import { Gzip, QrCode } from "@mai/services";
import { ReactNativeSqlite } from "@mai/sqlite";
import { Layer, ManagedRuntime } from "effect";

import { ExpoBackupFileTransferLayer } from "./expo-backup-file-transfer.ts";
import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqlite.ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  MealPlans.MealPlans.layer,
  DailyLogs.DailyLogs.layer,
  Foods.Foods.layer,
  FoodCatalogTransfer.FoodCatalogTransfers.layer,
  MealEntries.MealEntries.layer,
  NutritionReports.NutritionReports.layer,
  ExpoBackupFileTransferLayer,
  Gzip.Gzip.Default,
  QrCode.QrCode.Default
);

const MobileLayer = MobileServicesLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(MobileStoreLayer, ReactNativeCryptoLayer))
);

export const RuntimeClient = ManagedRuntime.make(MobileLayer);

export type RuntimeClient = typeof RuntimeClient;
