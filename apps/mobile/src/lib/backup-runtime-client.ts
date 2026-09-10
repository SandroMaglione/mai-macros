import * as Backup from "@mai/nutrition/services/backup";
import * as FoodCatalogTransfer from "@mai/nutrition/services/food-catalog-transfer";
import * as BackupFileTransfer from "@mai/services/services/backup-file-transfer";
import * as Gzip from "@mai/services/services/gzip";
import * as QrCode from "@mai/services/services/qr-code";
import { Effect, Layer } from "effect";
import type { ManagedRuntime as ManagedRuntimeType } from "effect/ManagedRuntime";

import { ExpoBackupFileTransferLayer } from "./expo-backup-file-transfer.ts";
import { RuntimeClient } from "./runtime-client.ts";
import { ExpoAnalysisDatabaseLayer } from "./expo-analysis-database.ts";
import { AnalysisDatabase } from "@mai/nutrition/services/analysis-database";

export const BackupServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  FoodCatalogTransfer.FoodCatalogTransfers.layer,
  ExpoBackupFileTransferLayer,
  Gzip.Gzip.Default,
  QrCode.QrCode.Default,
  ExpoAnalysisDatabaseLayer
);

export const BackupRuntimeClient = {
  runPromise: <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | Backup.Backups
      | BackupFileTransfer.BackupFileTransfer
      | FoodCatalogTransfer.FoodCatalogTransfers
      | Gzip.Gzip
      | QrCode.QrCode
      | AnalysisDatabase
      | ManagedRuntimeType.Services<typeof RuntimeClient>
    >
  ) =>
    RuntimeClient.runPromise(effect.pipe(Effect.provide(BackupServicesLayer))),
};
