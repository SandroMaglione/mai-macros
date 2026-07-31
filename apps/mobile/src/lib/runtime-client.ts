import {
  Backup,
  BodyWeightReports,
  BodyWeights,
  DailyLogs,
  FoodCatalogTransfer,
  Foods,
  MealEntries,
  MealPlans,
  NutritionReports,
} from "@mai/nutrition";
import { Gzip, QrCode } from "@mai/services";
import { ReactNativeSqlite } from "@mai/sqlite";
import { Layer } from "effect";
import { Atom } from "effect/unstable/reactivity";

import { ExpoBackupFileTransferLayer } from "./expo-backup-file-transfer.ts";
import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqlite.ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  BodyWeights.BodyWeights.layer,
  BodyWeightReports.BodyWeightReports.layer,
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

export const MobileAtomRuntime = Atom.runtime(MobileLayer);
