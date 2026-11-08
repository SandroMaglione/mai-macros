import * as Backup from "@mai/nutrition/services/backup";
import * as FoodCatalogTransfer from "@mai/nutrition/services/food-catalog-transfer";
import * as Gzip from "@mai/services/services/gzip";
import * as QrCode from "@mai/services/services/qr-code";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Layer } from "effect";
import { Atom } from "effect/reactivity";

import { AppRestartLayer } from "./app-restart-layer.ts";
import { ExpoAnalysisDatabaseLayer } from "./expo-analysis-database.ts";
import { ExpoBackupFileTransferLayer } from "./expo-backup-file-transfer.ts";
import { MobileMachineLayer } from "./machine-runtime.ts";

const BackupServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  FoodCatalogTransfer.FoodCatalogTransfers.layer,
  ExpoBackupFileTransferLayer,
  Gzip.Gzip.Default,
  QrCode.QrCode.Default,
  ExpoAnalysisDatabaseLayer,
  AppRestartLayer
);

export const BackupMachineAtoms = AtomMachine.bind(
  Atom.runtime(Layer.provideMerge(BackupServicesLayer, MobileMachineLayer))
);
