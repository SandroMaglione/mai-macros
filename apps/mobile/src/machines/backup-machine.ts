import { Backup, Domain, FoodCatalogTransfer } from "@mai/nutrition";
import { AnalysisExportError } from "@mai/nutrition/services/analysis-documentation";
import { BackupFileTransfer, FoodCatalogShare, Gzip } from "@mai/services";
import { exportForAnalysis } from "@mai/services/services/analysis-export";
import { Machine } from "@typeonce/effect-machine";
import {
  Array,
  DateTime,
  Effect,
  HashSet,
  Match,
  Option,
  Schema,
} from "effect";

export const BackupImportMimeTypes = [
  "application/gzip",
  "application/json",
  "application/octet-stream",
  "application/x-gzip",
  "text/plain",
] as const;

export const GzipFileMimeType = "application/gzip";
export const GzipFileUti = "org.gnu.gnu-zip-archive";

const _decodeMobileJsonFile = ({
  bytes,
  fileName,
}: {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}) =>
  Effect.gen(function* () {
    const gzip = yield* Gzip.Gzip;

    return fileName.toLowerCase().endsWith(".gz") || Gzip.isGzipBytes({ bytes })
      ? yield* gzip.gunzipText({
          bytes,
        })
      : yield* gzip.bytesToText({
          bytes,
        });
  });

const _backupErrorMessage = ({ error }: { readonly error: unknown }) => {
  if (error instanceof AnalysisExportError) return error.detail;
  if (error instanceof BackupFileTransfer.BackupFileTransferError) {
    return error.detail;
  }

  if (error instanceof Gzip.GzipError) {
    return error.detail;
  }

  if (error instanceof FoodCatalogShare.FoodCatalogShareDecodeError) {
    return error.detail;
  }

  if (error instanceof FoodCatalogTransfer.FoodCatalogImportSelectionError) {
    return error.detail;
  }

  if (error instanceof FoodCatalogTransfer.FoodCatalogIntegrityError) {
    return error.detail;
  }

  return error instanceof Error && error.message !== ""
    ? error.message
    : "The backup action could not finish.";
};

export const AnalysisExportStates = Machine.state({
  states: {
    Idle: {},
    Exporting: {},
    Success: { fields: { message: Schema.String } },
    Failed: { fields: { message: Schema.String } },
  },
});

export const AnalysisExportEvents = Machine.events({ Export: {} });

export const AnalysisExportMachine = Machine.make({
  id: "AnalysisExport",
  root: AnalysisExportStates,
  events: AnalysisExportEvents,
  effects: {
    exportForAnalysis: Effect.gen(function* () {
      const output = yield* exportForAnalysis();
      const transfer = yield* BackupFileTransfer.BackupFileTransfer;

      yield* transfer.shareFile({
        ...output,
        dialogTitle: "Export for agent analysis",
        mimeType: "application/zip",
        uti: "public.zip-archive",
      });

      return {
        message: "Opened share options for your analysis export.",
      };
    }),
  },
}).handle({
  initial: { target: "Idle" },
  states: {
    Idle: { on: { Export: { target: "Exporting" } } },
    Exporting: {
      invoke: {
        src: "exportForAnalysis",
        onDone: {
          target: "Success",
          data: ({ output }) => ({ message: output.message }),
        },
        onFailure: {
          target: "Failed",
          data: ({ error }) => ({ message: _backupErrorMessage({ error }) }),
        },
      },
    },
    Success: { on: { Export: { target: "Exporting" } } },
    Failed: { on: { Export: { target: "Exporting" } } },
  },
});

export const BackupExportStates = Machine.state({
  fields: { backupName: Schema.String },
  states: {
    Idle: {},
    Exporting: {},
    Failed: { fields: { message: Schema.NonEmptyString } },
    Success: { fields: { message: Schema.NonEmptyString } },
  },
});

export const BackupExportEvents = Machine.events({
  ChangeBackupName: { backupName: Schema.String },
  ExportBackup: {},
});

export const BackupExportMachine = Machine.make({
  id: "BackupExport",
  root: BackupExportStates,
  events: BackupExportEvents,
  timers: { exportBackupSuccess: "3 seconds" },
  effects: {
    exportBackup: (backupName: string) =>
      Effect.gen(function* () {
        const backups = yield* Backup.Backups;
        const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
        const gzip = yield* Gzip.Gzip;
        const exportedBackup = yield* backups.exportToJson();
        const exportedAt = DateTime.formatIso(
          exportedBackup.backup.source.exportedAt
        );
        const baseName =
          backupName.trim() === "" ? "mai-backup" : backupName.trim();
        const sanitizedName = baseName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const fileNamePrefix =
          sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;
        const fileName = `${fileNamePrefix}-format-v${exportedBackup.backup.formatVersion}-db-v${exportedBackup.backup.source.databaseVersion}-${exportedAt.slice(0, 10)}.json.gz`;
        const bytes = yield* gzip.gzipText({
          text: exportedBackup.json,
        });

        yield* fileTransfers.shareFile({
          bytes,
          dialogTitle: "Export backup",
          fileName,
          mimeType: GzipFileMimeType,
          uti: GzipFileUti,
        });

        return {
          fileName,
          message: `Opened share options for ${fileName}.`,
        };
      }),
  },
}).handle({
  root: { backupName: "" },
  initial: { target: "Idle" },
  on: {
    ChangeBackupName: {
      update: "root",
      data: ({ event }) => ({ backupName: event.backupName }),
    },
  },
  states: {
    Idle: { on: { ExportBackup: { target: "Exporting" } } },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ root }) => root.backupName,
        onDone: {
          target: "Success",
          data: ({ output }) => ({ message: output.message }),
        },
        onFailure: {
          target: "Failed",
          data: ({ error }) => ({ message: _backupErrorMessage({ error }) }),
        },
      },
    },
    Failed: { on: { ExportBackup: { target: "Exporting" } } },
    Success: {
      invoke: { src: "exportBackupSuccess", onDone: { target: "Idle" } },
    },
  },
});

export const BackupImportStates = Machine.state({
  states: {
    Idle: {},
    ImportingFile: {},
    Failed: { fields: { message: Schema.NonEmptyString } },
    Success: { fields: { message: Schema.NonEmptyString } },
  },
});

export const BackupImportEvents = Machine.events({ ImportFile: {} });

export const BackupImportMachine = Machine.make({
  id: "BackupImport",
  root: BackupImportStates,
  events: BackupImportEvents,
  timers: { importBackupSuccess: "3 seconds" },
  effects: {
    importBackupFile: Effect.gen(function* () {
      const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
      const pickedFile = yield* fileTransfers.pickFile({
        mimeTypes: BackupImportMimeTypes,
      });

      return yield* Match.value(pickedFile).pipe(
        Match.tagsExhaustive({
          BackupFilePickCanceled: () =>
            Effect.succeed({ _tag: "Canceled" as const }),
          PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
            const json = yield* _decodeMobileJsonFile({
              bytes: pickedFile.bytes,
              fileName: pickedFile.fileName,
            });
            const backups = yield* Backup.Backups;
            const importedBackup = yield* backups.importFromJson({
              input: { json },
            });
            const counts = importedBackup.backup.integrity.counts;
            const totalRecords =
              counts.dailyLogs +
              counts.foods +
              counts.mealEntries +
              counts.plans +
              counts.recordableEvents +
              counts.recordedEvents;

            return {
              _tag: "Imported" as const,
              message:
                "Imported " +
                pickedFile.fileName +
                `. Imported backup. Format v${importedBackup.backup.formatVersion}, database v${importedBackup.backup.source.databaseVersion}, ${totalRecords} records restored.`,
            };
          }),
        })
      );
    }),
  },
}).handle({
  initial: { target: "Idle" },
  states: {
    Idle: { on: { ImportFile: { target: "ImportingFile" } } },
    ImportingFile: {
      invoke: {
        src: "importBackupFile",
        onDone: {
          target: "Success",
          data: ({ output }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                Canceled: () => ({ message: "Import canceled" }),
                Imported: ({ message }) => ({ message }),
              })
            ),
        },
        onFailure: {
          target: "Failed",
          data: ({ error }) => ({ message: _backupErrorMessage({ error }) }),
        },
      },
    },
    Failed: { on: { ImportFile: { target: "ImportingFile" } } },
    Success: {
      invoke: { src: "importBackupSuccess", onDone: { target: "Idle" } },
    },
  },
});

export const CatalogExportStates = Machine.state({
  states: {
    Idle: {},
    ExportingCatalog: {},
    Failed: { fields: { message: Schema.NonEmptyString } },
    Success: { fields: { message: Schema.NonEmptyString } },
  },
});

export const CatalogExportEvents = Machine.events({ ExportCatalog: {} });

export const CatalogExportMachine = Machine.make({
  id: "CatalogExport",
  root: CatalogExportStates,
  events: CatalogExportEvents,
  timers: { exportCatalogSuccess: "3 seconds" },
  effects: {
    exportCatalog: Effect.gen(function* () {
      const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
      const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
      const gzip = yield* Gzip.Gzip;
      const exportedCatalog = yield* transfers.exportToJson();
      const exportedAt = DateTime.formatIso(
        exportedCatalog.catalog.source.exportedAt
      );
      const fileName = `mai-food-catalog-format-v${exportedCatalog.catalog.formatVersion}-db-v${exportedCatalog.catalog.source.databaseVersion}-${exportedAt.slice(0, 10)}.json.gz`;
      const bytes = yield* gzip.gzipText({
        text: exportedCatalog.json,
      });

      yield* fileTransfers.shareFile({
        bytes,
        dialogTitle: "Export food catalog",
        fileName,
        mimeType: GzipFileMimeType,
        uti: GzipFileUti,
      });

      return {
        message: `Opened share options for ${fileName}.`,
      };
    }),
  },
}).handle({
  initial: { target: "Idle" },
  states: {
    Idle: { on: { ExportCatalog: { target: "ExportingCatalog" } } },
    ExportingCatalog: {
      invoke: {
        src: "exportCatalog",
        onDone: {
          target: "Success",
          data: ({ output }) => ({ message: output.message }),
        },
        onFailure: {
          target: "Failed",
          data: ({ error }) => ({ message: _backupErrorMessage({ error }) }),
        },
      },
    },
    Failed: { on: { ExportCatalog: { target: "ExportingCatalog" } } },
    Success: {
      invoke: { src: "exportCatalogSuccess", onDone: { target: "Idle" } },
    },
  },
});

export const CatalogImportStates = Machine.state({
  states: {
    Idle: {},
    ImportingPreview: {},
    PreviewFailed: { fields: { message: Schema.NonEmptyString } },
    CatalogPreview: {
      fields: {
        catalogJson: Schema.String,
        previewCandidates: Schema.Array(
          FoodCatalogTransfer.FoodCatalogImportCandidate
        ),
        selectedFoodIds: Schema.HashSet(Domain.FoodId),
      },
      states: {
        SelectFoods: {},
        ImportingCatalog: {},
        Failed: { fields: { message: Schema.NonEmptyString } },
        Success: { fields: { message: Schema.NonEmptyString } },
      },
    },
  },
});

export const CatalogImportEvents = Machine.events({
  ImportSelectedCatalogFoods: {},
  OpenPreviewCatalogImportFile: {},
  ToggleCatalogFood: { foodId: Domain.FoodId },
});

export const CatalogImportMachine = Machine.make({
  id: "CatalogImport",
  root: CatalogImportStates,
  events: CatalogImportEvents,
  timers: { importCatalogSuccess: "3 seconds" },
  effects: {
    previewCatalogImportFile: Effect.gen(function* () {
      const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
      const pickedFile = yield* fileTransfers.pickFile({
        mimeTypes: BackupImportMimeTypes,
      });

      return yield* Match.value(pickedFile).pipe(
        Match.tagsExhaustive({
          BackupFilePickCanceled: () =>
            Effect.succeed({ _tag: "Canceled" as const }),
          PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
            const json = yield* _decodeMobileJsonFile({
              bytes: pickedFile.bytes,
              fileName: pickedFile.fileName,
            });
            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const decodedCatalog = yield* FoodCatalogShare.decodeShareText({
              text: json,
            });
            const preview = yield* transfers.previewImportFromJson({
              input: { json: decodedCatalog.catalogJson },
            });
            const selectedFoodIds = preview.candidates
              .filter(
                (candidate) =>
                  candidate.selection.selectable &&
                  candidate.selection.defaultSelected &&
                  candidate.status !== "already-present" &&
                  candidate.nameStatus !== "same-name-local"
              )
              .map((candidate) => candidate.food.id);

            return {
              _tag: "Previewed" as const,
              catalogJson: decodedCatalog.catalogJson,
              candidates: preview.candidates,
              message: `Previewed ${pickedFile.fileName}. Previewed ${preview.candidates.length} foods. ${selectedFoodIds.length} selected by default.`,
              selectedFoodIds,
            };
          }),
        })
      );
    }),
    importSelectedCatalogFoods: ({
      catalogJson,
      selectedFoodIds,
    }: {
      readonly catalogJson: string;
      readonly selectedFoodIds: readonly Domain.FoodId[];
    }) =>
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
        const importedCatalog = yield* transfers.importSelectedFromJson({
          input: { json: catalogJson, selectedFoodIds },
        });

        return {
          message: `Imported ${importedCatalog.importedFoods.length} foods.`,
        };
      }),
  },
  branches: {
    previewed: {
      canceled: { target: "Idle" },
      preview: { target: "CatalogPreview" },
    },
  },
}).handle({
  initial: { target: "Idle" },
  states: {
    Idle: {
      on: { OpenPreviewCatalogImportFile: { target: "ImportingPreview" } },
    },
    ImportingPreview: {
      invoke: {
        src: "previewCatalogImportFile",
        onDone: {
          branches: "previewed",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                Canceled: () => select.canceled(),
                Previewed: ({ candidates, catalogJson, selectedFoodIds }) =>
                  select.preview({
                    data: {
                      catalogJson,
                      previewCandidates: candidates,
                      selectedFoodIds: HashSet.fromIterable(selectedFoodIds),
                    },
                  }),
              })
            ),
        },
        onFailure: {
          target: "PreviewFailed",
          data: ({ error }) => ({ message: _backupErrorMessage({ error }) }),
        },
      },
    },
    PreviewFailed: {
      on: { OpenPreviewCatalogImportFile: { target: "ImportingPreview" } },
    },
    CatalogPreview: {
      initial: { target: "CatalogPreview.SelectFoods" },
      on: {
        ToggleCatalogFood: {
          update: "CatalogPreview",
          data: ({ state, event }) => ({
            ...state,
            selectedFoodIds: Option.match(
              Array.findFirst(
                state.previewCandidates,
                (candidate) =>
                  candidate.food.id === event.foodId &&
                  candidate.selection.selectable
              ),
              {
                onNone: () => state.selectedFoodIds,
                onSome: () =>
                  HashSet.has(state.selectedFoodIds, event.foodId)
                    ? HashSet.remove(state.selectedFoodIds, event.foodId)
                    : HashSet.add(state.selectedFoodIds, event.foodId),
              }
            ),
          }),
        },
      },
      states: {
        SelectFoods: {
          on: {
            ImportSelectedCatalogFoods: {
              target: "CatalogPreview.ImportingCatalog",
            },
          },
        },
        ImportingCatalog: {
          invoke: {
            src: "importSelectedCatalogFoods",
            input: ({ ancestors }) => ({
              catalogJson: ancestors.CatalogPreview.catalogJson,
              selectedFoodIds: Array.fromIterable(
                ancestors.CatalogPreview.selectedFoodIds
              ),
            }),
            onDone: {
              target: "CatalogPreview.Success",
              data: ({ output }) => ({ message: output.message }),
            },
            onFailure: {
              target: "CatalogPreview.Failed",
              data: ({ error }) => ({
                message: _backupErrorMessage({ error }),
              }),
            },
          },
        },
        Failed: {
          on: {
            ImportSelectedCatalogFoods: {
              target: "CatalogPreview.ImportingCatalog",
            },
          },
        },
        Success: {
          invoke: { src: "importCatalogSuccess", onDone: { target: "Idle" } },
        },
      },
    },
  },
});
