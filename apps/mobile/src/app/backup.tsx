import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingOverlay } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { LocalDataResetMachine } from "@mai/machines";
import {
  Backup,
  Domain,
  FoodCatalogTransfer,
  LocalData as NutritionLocalData,
} from "@mai/nutrition";
import { BackupFileTransfer, FoodCatalogShare, Gzip } from "@mai/services";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { DateTime, Effect, HashSet, Match, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { router } from "expo-router";
import {
  ChevronLeft,
  Download,
  Square,
  SquareCheckBig,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
class ExportReady extends Schema.TaggedClass<ExportReady>("ExportReady")(
  "ExportReady",
  { backupName: Schema.String }
) {}

class ExportEditing extends Schema.TaggedClass<ExportEditing>("ExportEditing")(
  "ExportEditing",
  {}
) {}

class ExportFailure extends Schema.TaggedClass<ExportFailure>("ExportFailure")(
  "ExportFailure",
  { message: Schema.String }
) {}

class ExportSuccess extends Schema.TaggedClass<ExportSuccess>("ExportSuccess")(
  "ExportSuccess",
  { message: Schema.String }
) {}

class ExportingBackup extends Schema.TaggedClass<ExportingBackup>(
  "ExportingBackup"
)("ExportingBackup", { backupName: Schema.String }) {}

class ChangeBackupName extends Schema.TaggedClass<ChangeBackupName>(
  "ChangeBackupName"
)("ChangeBackupName", { backupName: Schema.String }) {}

class ExportBackup extends Schema.TaggedClass<ExportBackup>("ExportBackup")(
  "ExportBackup",
  {}
) {}

class ExportBackupSucceeded extends Schema.TaggedClass<ExportBackupSucceeded>(
  "ExportBackupSucceeded"
)("ExportBackupSucceeded", { message: Schema.String }) {}

class ExportBackupFailed extends Schema.TaggedClass<ExportBackupFailed>(
  "ExportBackupFailed"
)("ExportBackupFailed", { message: Schema.String }) {}

class ClearExportStatus extends Schema.TaggedClass<ClearExportStatus>(
  "ClearExportStatus"
)("ClearExportStatus", {}) {}

const ExportBackupStates = Machine.defineStates({
  Ready: {
    schema: ExportReady,
    initial: "Editing",
    states: {
      Editing: ExportEditing,
      Failure: ExportFailure,
      Success: ExportSuccess,
    },
  },
  Exporting: ExportingBackup,
});

const exportBackupMachine = Machine.make({
  states: ExportBackupStates.states,
  events: [
    ChangeBackupName,
    ExportBackup,
    ExportBackupSucceeded,
    ExportBackupFailed,
    ClearExportStatus,
  ],
  initial: () =>
    ExportBackupStates.initial.Ready(
      new ExportReady({ backupName: "" }),
      (ready) => ready.Editing(new ExportEditing())
    ),
}).handle({
  Ready: {
    on: {
      ChangeBackupName: ({ event, target }) =>
        target.full.Ready(
          new ExportReady({ backupName: event.backupName }),
          (ready) => ready.Editing(new ExportEditing())
        ),
      ExportBackup: ({ state, target }) =>
        target.full.Exporting(
          new ExportingBackup({ backupName: state.backupName })
        ),
    },
    states: {
      Success: {
        invoke: Machine.invoke({
          id: "clearExportStatus",
          src: () =>
            Machine.effect(
              Effect.sleep("3 seconds").pipe(Effect.as(new ClearExportStatus()))
            ),
        }),
        on: {
          ClearExportStatus: ({ parents, target }) =>
            target.full.Ready(
              new ExportReady({ backupName: parents.Ready.backupName }),
              (ready) => ready.Editing(new ExportEditing())
            ),
        },
      },
    },
  },
  Exporting: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "exportBackup",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const backups = yield* Backup.Backups;
              const fileTransfers =
                yield* BackupFileTransfer.BackupFileTransfer;
              const gzip = yield* Gzip.Gzip;
              const exportedBackup = yield* backups.exportToJson();
              const exportedAt = new Date(
                DateTime.toEpochMillis(exportedBackup.backup.source.exportedAt)
              );
              const baseName =
                state.backupName.trim() === ""
                  ? "mai-backup"
                  : state.backupName.trim();
              const sanitizedName = baseName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
              const fileNamePrefix =
                sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;
              const fileName = `${fileNamePrefix}-format-v${exportedBackup.backup.formatVersion}-db-v${exportedBackup.backup.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.json.gz`;
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

              return new ExportBackupSucceeded({
                message: `Opened share options for ${fileName}.`,
              });
            }).pipe(
              Effect.catch((error) =>
                Effect.succeed(
                  new ExportBackupFailed({
                    message: _backupErrorMessage({ error }),
                  })
                )
              )
            )
          ),
      }),
    on: {
      ExportBackupSucceeded: ({ event, state, target }) =>
        target.full.Ready(
          new ExportReady({ backupName: state.backupName }),
          (ready) =>
            ready.Success(new ExportSuccess({ message: event.message }))
        ),
      ExportBackupFailed: ({ event, state, target }) =>
        target.full.Ready(
          new ExportReady({ backupName: state.backupName }),
          (ready) =>
            ready.Failure(new ExportFailure({ message: event.message }))
        ),
    },
  },
});

class BackupImportIdle extends Schema.TaggedClass<BackupImportIdle>(
  "BackupImportIdle"
)("BackupImportIdle", {}) {}

class ImportingBackup extends Schema.TaggedClass<ImportingBackup>(
  "ImportingBackup"
)("ImportingBackup", {}) {}

class BackupImportFailure extends Schema.TaggedClass<BackupImportFailure>(
  "BackupImportFailure"
)("BackupImportFailure", { message: Schema.String }) {}

class BackupImportSuccess extends Schema.TaggedClass<BackupImportSuccess>(
  "BackupImportSuccess"
)("BackupImportSuccess", { message: Schema.String }) {}

class ImportBackupFile extends Schema.TaggedClass<ImportBackupFile>(
  "ImportBackupFile"
)("ImportBackupFile", {}) {}

class BackupImported extends Schema.TaggedClass<BackupImported>(
  "BackupImported"
)("BackupImported", { message: Schema.String }) {}

class BackupImportCanceled extends Schema.TaggedClass<BackupImportCanceled>(
  "BackupImportCanceled"
)("BackupImportCanceled", {}) {}

class BackupImportFailed extends Schema.TaggedClass<BackupImportFailed>(
  "BackupImportFailed"
)("BackupImportFailed", { message: Schema.String }) {}

class ClearBackupImportStatus extends Schema.TaggedClass<ClearBackupImportStatus>(
  "ClearBackupImportStatus"
)("ClearBackupImportStatus", {}) {}

const ImportBackupStates = Machine.defineStates({
  Idle: BackupImportIdle,
  Importing: ImportingBackup,
  Failure: BackupImportFailure,
  Success: BackupImportSuccess,
});

const importBackupMachine = Machine.make({
  states: ImportBackupStates.states,
  events: [
    ImportBackupFile,
    BackupImported,
    BackupImportCanceled,
    BackupImportFailed,
    ClearBackupImportStatus,
  ],
  initial: () => ImportBackupStates.initial.Idle(new BackupImportIdle()),
}).handle({
  Idle: {
    on: {
      ImportBackupFile: ({ target }) =>
        target.full.Importing(new ImportingBackup()),
    },
  },
  Importing: {
    invoke: Machine.invoke({
      id: "importBackup",
      src: () =>
        Machine.effect(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
            const pickedFile = yield* fileTransfers.pickFile({
              mimeTypes: BackupImportMimeTypes,
            });

            return yield* Match.value(pickedFile).pipe(
              Match.tagsExhaustive({
                BackupFilePickCanceled: () =>
                  Effect.succeed(new BackupImportCanceled()),
                PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
                  const json = yield* _decodeMobileJsonFile({
                    bytes: pickedFile.bytes,
                    fileName: pickedFile.fileName,
                  });
                  const backups = yield* Backup.Backups;
                  const importedBackup = yield* backups.importFromJson({
                    input: { json },
                  });
                  const totalRecords =
                    importedBackup.backup.integrity.counts.dailyLogs +
                    importedBackup.backup.integrity.counts.foods +
                    importedBackup.backup.integrity.counts.mealEntries +
                    importedBackup.backup.integrity.counts.plans;

                  return new BackupImported({
                    message:
                      "Imported " +
                      pickedFile.fileName +
                      `. Imported backup. Format v${importedBackup.backup.formatVersion}, database v${importedBackup.backup.source.databaseVersion}, ${totalRecords} records restored.`,
                  });
                }),
              })
            );
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed(
                new BackupImportFailed({
                  message: _backupErrorMessage({ error }),
                })
              )
            )
          )
        ),
    }),
    on: {
      BackupImported: ({ event, target }) =>
        target.full.Success(
          new BackupImportSuccess({ message: event.message })
        ),
      BackupImportCanceled: ({ target }) =>
        target.full.Success(
          new BackupImportSuccess({ message: "Import canceled" })
        ),
      BackupImportFailed: ({ event, target }) =>
        target.full.Failure(
          new BackupImportFailure({ message: event.message })
        ),
    },
  },
  Failure: {
    on: {
      ImportBackupFile: ({ target }) =>
        target.full.Importing(new ImportingBackup()),
    },
  },
  Success: {
    invoke: Machine.invoke({
      id: "clearBackupImportStatus",
      src: () =>
        Machine.effect(
          Effect.sleep("3 seconds").pipe(
            Effect.as(new ClearBackupImportStatus())
          )
        ),
    }),
    on: {
      ClearBackupImportStatus: ({ target }) =>
        target.full.Idle(new BackupImportIdle()),
    },
  },
});

class CatalogExportIdle extends Schema.TaggedClass<CatalogExportIdle>(
  "CatalogExportIdle"
)("CatalogExportIdle", {}) {}

class ExportingCatalog extends Schema.TaggedClass<ExportingCatalog>(
  "ExportingCatalog"
)("ExportingCatalog", {}) {}

class CatalogExportFailure extends Schema.TaggedClass<CatalogExportFailure>(
  "CatalogExportFailure"
)("CatalogExportFailure", { message: Schema.String }) {}

class CatalogExportSuccess extends Schema.TaggedClass<CatalogExportSuccess>(
  "CatalogExportSuccess"
)("CatalogExportSuccess", { message: Schema.String }) {}

class ExportCatalog extends Schema.TaggedClass<ExportCatalog>("ExportCatalog")(
  "ExportCatalog",
  {}
) {}

class CatalogExported extends Schema.TaggedClass<CatalogExported>(
  "CatalogExported"
)("CatalogExported", { message: Schema.String }) {}

class CatalogExportFailed extends Schema.TaggedClass<CatalogExportFailed>(
  "CatalogExportFailed"
)("CatalogExportFailed", { message: Schema.String }) {}

class ClearCatalogExportStatus extends Schema.TaggedClass<ClearCatalogExportStatus>(
  "ClearCatalogExportStatus"
)("ClearCatalogExportStatus", {}) {}

const CatalogExportStates = Machine.defineStates({
  Idle: CatalogExportIdle,
  Exporting: ExportingCatalog,
  Failure: CatalogExportFailure,
  Success: CatalogExportSuccess,
});

const catalogExportMachine = Machine.make({
  states: CatalogExportStates.states,
  events: [
    ExportCatalog,
    CatalogExported,
    CatalogExportFailed,
    ClearCatalogExportStatus,
  ],
  initial: () => CatalogExportStates.initial.Idle(new CatalogExportIdle()),
}).handle({
  Idle: {
    on: {
      ExportCatalog: ({ target }) =>
        target.full.Exporting(new ExportingCatalog()),
    },
  },
  Exporting: {
    invoke: Machine.invoke({
      id: "exportCatalog",
      src: () =>
        Machine.effect(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const gzip = yield* Gzip.Gzip;
            const exportedCatalog = yield* transfers.exportToJson();
            const exportedAt = new Date(
              DateTime.toEpochMillis(exportedCatalog.catalog.source.exportedAt)
            );
            const fileName = `mai-food-catalog-format-v${exportedCatalog.catalog.formatVersion}-db-v${exportedCatalog.catalog.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.json.gz`;
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

            return new CatalogExported({
              message: `Opened share options for ${fileName}.`,
            });
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed(
                new CatalogExportFailed({
                  message: _backupErrorMessage({ error }),
                })
              )
            )
          )
        ),
    }),
    on: {
      CatalogExported: ({ event, target }) =>
        target.full.Success(
          new CatalogExportSuccess({ message: event.message })
        ),
      CatalogExportFailed: ({ event, target }) =>
        target.full.Failure(
          new CatalogExportFailure({ message: event.message })
        ),
    },
  },
  Failure: {
    on: {
      ExportCatalog: ({ target }) =>
        target.full.Exporting(new ExportingCatalog()),
    },
  },
  Success: {
    invoke: Machine.invoke({
      id: "clearCatalogExportStatus",
      src: () =>
        Machine.effect(
          Effect.sleep("3 seconds").pipe(
            Effect.as(new ClearCatalogExportStatus())
          )
        ),
    }),
    on: {
      ClearCatalogExportStatus: ({ target }) =>
        target.full.Idle(new CatalogExportIdle()),
    },
  },
});

class CatalogImportIdle extends Schema.TaggedClass<CatalogImportIdle>(
  "CatalogImportIdle"
)("CatalogImportIdle", {}) {}

class CatalogPreviewing extends Schema.TaggedClass<CatalogPreviewing>(
  "CatalogPreviewing"
)("CatalogPreviewing", {}) {}

class CatalogPreviewFailure extends Schema.TaggedClass<CatalogPreviewFailure>(
  "CatalogPreviewFailure"
)("CatalogPreviewFailure", { message: Schema.String }) {}

class CatalogPreview extends Schema.TaggedClass<CatalogPreview>(
  "CatalogPreview"
)("CatalogPreview", {
  catalogJson: Schema.String,
  selectedFoodIds: Schema.HashSet(Domain.FoodId),
  previewCandidates: Schema.Array(
    FoodCatalogTransfer.FoodCatalogImportCandidate
  ),
}) {}

class SelectingCatalogFoods extends Schema.TaggedClass<SelectingCatalogFoods>(
  "SelectingCatalogFoods"
)("SelectingCatalogFoods", {}) {}

class ImportingCatalogFoods extends Schema.TaggedClass<ImportingCatalogFoods>(
  "ImportingCatalogFoods"
)("ImportingCatalogFoods", {}) {}

class CatalogImportFailure extends Schema.TaggedClass<CatalogImportFailure>(
  "CatalogImportFailure"
)("CatalogImportFailure", { message: Schema.String }) {}

class CatalogImportSuccess extends Schema.TaggedClass<CatalogImportSuccess>(
  "CatalogImportSuccess"
)("CatalogImportSuccess", { message: Schema.String }) {}

class OpenCatalogPreview extends Schema.TaggedClass<OpenCatalogPreview>(
  "OpenCatalogPreview"
)("OpenCatalogPreview", {}) {}

class ToggleCatalogFood extends Schema.TaggedClass<ToggleCatalogFood>(
  "ToggleCatalogFood"
)("ToggleCatalogFood", { foodId: Domain.FoodId }) {}

class ImportSelectedCatalogFoods extends Schema.TaggedClass<ImportSelectedCatalogFoods>(
  "ImportSelectedCatalogFoods"
)("ImportSelectedCatalogFoods", {}) {}

class CatalogPreviewCanceled extends Schema.TaggedClass<CatalogPreviewCanceled>(
  "CatalogPreviewCanceled"
)("CatalogPreviewCanceled", {}) {}

class CatalogPreviewed extends Schema.TaggedClass<CatalogPreviewed>(
  "CatalogPreviewed"
)("CatalogPreviewed", {
  catalogJson: Schema.String,
  candidates: Schema.Array(FoodCatalogTransfer.FoodCatalogImportCandidate),
  selectedFoodIds: Schema.Array(Domain.FoodId),
}) {}

class CatalogPreviewFailed extends Schema.TaggedClass<CatalogPreviewFailed>(
  "CatalogPreviewFailed"
)("CatalogPreviewFailed", { message: Schema.String }) {}

class CatalogFoodsImported extends Schema.TaggedClass<CatalogFoodsImported>(
  "CatalogFoodsImported"
)("CatalogFoodsImported", { message: Schema.String }) {}

class CatalogFoodsImportFailed extends Schema.TaggedClass<CatalogFoodsImportFailed>(
  "CatalogFoodsImportFailed"
)("CatalogFoodsImportFailed", { message: Schema.String }) {}

class FinishCatalogImport extends Schema.TaggedClass<FinishCatalogImport>(
  "FinishCatalogImport"
)("FinishCatalogImport", {}) {}

const CatalogImportStates = Machine.defineStates({
  Idle: CatalogImportIdle,
  Previewing: CatalogPreviewing,
  PreviewFailure: CatalogPreviewFailure,
  Preview: {
    schema: CatalogPreview,
    initial: "Selecting",
    states: {
      Selecting: SelectingCatalogFoods,
      Importing: ImportingCatalogFoods,
      Failure: CatalogImportFailure,
      Success: CatalogImportSuccess,
    },
  },
});

const catalogImportMachine = Machine.make({
  states: CatalogImportStates.states,
  events: [
    OpenCatalogPreview,
    ToggleCatalogFood,
    ImportSelectedCatalogFoods,
    CatalogPreviewCanceled,
    CatalogPreviewed,
    CatalogPreviewFailed,
    CatalogFoodsImported,
    CatalogFoodsImportFailed,
    FinishCatalogImport,
  ],
  initial: () => CatalogImportStates.initial.Idle(new CatalogImportIdle()),
}).handle({
  Idle: {
    on: {
      OpenCatalogPreview: ({ target }) =>
        target.full.Previewing(new CatalogPreviewing()),
    },
  },
  Previewing: {
    invoke: Machine.invoke({
      id: "previewCatalogImport",
      src: () =>
        Machine.effect(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
            const pickedFile = yield* fileTransfers.pickFile({
              mimeTypes: BackupImportMimeTypes,
            });

            return yield* Match.value(pickedFile).pipe(
              Match.tagsExhaustive({
                BackupFilePickCanceled: () =>
                  Effect.succeed(new CatalogPreviewCanceled()),
                PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
                  const json = yield* _decodeMobileJsonFile({
                    bytes: pickedFile.bytes,
                    fileName: pickedFile.fileName,
                  });
                  const transfers =
                    yield* FoodCatalogTransfer.FoodCatalogTransfers;
                  const decodedCatalog =
                    yield* FoodCatalogShare.decodeShareText({ text: json });
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

                  return new CatalogPreviewed({
                    catalogJson: decodedCatalog.catalogJson,
                    candidates: preview.candidates,
                    selectedFoodIds,
                  });
                }),
              })
            );
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed(
                new CatalogPreviewFailed({
                  message: _backupErrorMessage({ error }),
                })
              )
            )
          )
        ),
    }),
    on: {
      CatalogPreviewCanceled: ({ target }) =>
        target.full.Idle(new CatalogImportIdle()),
      CatalogPreviewed: ({ event, target }) =>
        target.full.Preview(
          new CatalogPreview({
            catalogJson: event.catalogJson,
            previewCandidates: event.candidates,
            selectedFoodIds: HashSet.fromIterable(event.selectedFoodIds),
          }),
          (preview) => preview.Selecting(new SelectingCatalogFoods())
        ),
      CatalogPreviewFailed: ({ event, target }) =>
        target.full.PreviewFailure(
          new CatalogPreviewFailure({ message: event.message })
        ),
    },
  },
  PreviewFailure: {
    on: {
      OpenCatalogPreview: ({ target }) =>
        target.full.Previewing(new CatalogPreviewing()),
    },
  },
  Preview: {
    states: {
      Selecting: {
        on: {
          ToggleCatalogFood: ({ event, parents, target }) => {
            const preview = parents.Preview;
            const candidate = preview.previewCandidates.find(
              ({ food }) => food.id === event.foodId
            );

            if (candidate === undefined || !candidate.selection.selectable) {
              return undefined;
            }

            return target.full.Preview(
              new CatalogPreview({
                catalogJson: preview.catalogJson,
                previewCandidates: preview.previewCandidates,
                selectedFoodIds: HashSet.has(
                  preview.selectedFoodIds,
                  event.foodId
                )
                  ? HashSet.remove(preview.selectedFoodIds, event.foodId)
                  : HashSet.add(preview.selectedFoodIds, event.foodId),
              }),
              (nextPreview) =>
                nextPreview.Selecting(new SelectingCatalogFoods())
            );
          },
          ImportSelectedCatalogFoods: ({ parents, target }) =>
            HashSet.isEmpty(parents.Preview.selectedFoodIds)
              ? undefined
              : target.local.Importing(new ImportingCatalogFoods()),
        },
      },
      Importing: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "importSelectedCatalogFoods",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const transfers =
                    yield* FoodCatalogTransfer.FoodCatalogTransfers;
                  const importedCatalog =
                    yield* transfers.importSelectedFromJson({
                      input: {
                        json: parents.Preview.catalogJson,
                        selectedFoodIds: globalThis.Array.from(
                          parents.Preview.selectedFoodIds
                        ),
                      },
                    });

                  return new CatalogFoodsImported({
                    message: `Imported ${importedCatalog.importedFoods.length} foods.`,
                  });
                }).pipe(
                  Effect.catch((error) =>
                    Effect.succeed(
                      new CatalogFoodsImportFailed({
                        message: _backupErrorMessage({ error }),
                      })
                    )
                  )
                )
              ),
          }),
        on: {
          CatalogFoodsImported: ({ event, target }) =>
            target.local.Success(
              new CatalogImportSuccess({ message: event.message })
            ),
          CatalogFoodsImportFailed: ({ event, target }) =>
            target.local.Failure(
              new CatalogImportFailure({ message: event.message })
            ),
        },
      },
      Failure: {
        on: {
          ImportSelectedCatalogFoods: ({ target }) =>
            target.local.Importing(new ImportingCatalogFoods()),
        },
      },
      Success: {
        invoke: Machine.invoke({
          id: "finishCatalogImport",
          src: () =>
            Machine.effect(
              Effect.sleep("3 seconds").pipe(
                Effect.as(new FinishCatalogImport())
              )
            ),
        }),
        on: {
          FinishCatalogImport: ({ target }) =>
            target.full.Idle(new CatalogImportIdle()),
        },
      },
    },
  },
});

const localDataResetMachine = LocalDataResetMachine.makeLocalDataResetMachine({
  restartApp: Effect.sync(() => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.replace("/");
  }),
});

export default function BackupScreen() {
  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
      >
        <AppHeader
          embedded
          eyebrow="Database"
          leading={
            <IconButton
              accessibilityLabel="Back"
              icon={ChevronLeft}
              onPress={() => {
                router.back();
              }}
              variant="ghost"
            />
          }
          shadow
          title="Backup"
        />

        <KeyboardAwareScrollView
          alwaysBounceVertical={false}
          bottomOffset={spacing.lg}
          contentContainerStyle={styles.settingsScrollContent}
          keyboardShouldPersistTaps="handled"
          style={styles.settingsScroll}
        >
          <ExportBackupSection />
          <ImportBackupSection />
          <CatalogExportSection />
          <CatalogImportSection />
          <ResetDataSection />
        </KeyboardAwareScrollView>
      </AppScreen>
    </View>
  );
}

function ExportBackupSection() {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, exportBackupMachine),
    []
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);
  const state = AsyncResult.isSuccess(stateResult) ? stateResult.value : null;
  const ready =
    state === null
      ? null
      : ExportBackupStates.get(state, "Ready").pipe(Option.getOrNull);
  const failure =
    state === null
      ? null
      : ExportBackupStates.get(state, "Ready.Failure").pipe(Option.getOrNull);
  const success =
    state === null
      ? null
      : ExportBackupStates.get(state, "Ready.Success").pipe(Option.getOrNull);
  const exporting =
    state !== null && ExportBackupStates.matches(state, "Exporting");

  return (
    <>
      <BackupSettingsSection divider={false} title="Export">
        <View style={styles.sectionBody}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!exporting}
            label="Name"
            placeholder="Mai backup"
            value={ready?.backupName ?? ""}
            onChangeText={(backupName) => {
              send(new ChangeBackupName({ backupName }));
            }}
          />
          <Button
            disabled={exporting || state === null}
            icon={Download}
            loading={exporting}
            onPress={() => {
              send(new ExportBackup());
            }}
          >
            Export backup
          </Button>

          {success === null ? null : (
            <Notice message={success.message} tone="success" />
          )}

          {failure === null ? null : (
            <Notice
              message={failure.message}
              title="Export failed"
              tone="danger"
            />
          )}

          {AsyncResult.isFailure(stateResult) ? (
            <Notice
              message="Could not start the backup export."
              title="Export unavailable"
              tone="danger"
            />
          ) : null}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting backup" visible={exporting} />
    </>
  );
}

function ImportBackupSection() {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, importBackupMachine),
    []
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);
  const state = AsyncResult.isSuccess(stateResult) ? stateResult.value : null;
  const failure =
    state === null
      ? null
      : ImportBackupStates.get(state, "Failure").pipe(Option.getOrNull);
  const success =
    state === null
      ? null
      : ImportBackupStates.get(state, "Success").pipe(Option.getOrNull);
  const isImporting =
    state !== null && ImportBackupStates.matches(state, "Importing");

  return (
    <>
      <BackupSettingsSection divider title="Import">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Import replaces the current data on this device.
          </Text>
          <Button
            disabled={isImporting || state === null}
            icon={Upload}
            loading={isImporting}
            onPress={() => {
              send(new ImportBackupFile());
            }}
            variant="danger"
          >
            Choose backup file
          </Button>

          {success === null ? null : (
            <Notice message={success.message} tone="success" />
          )}

          {failure === null ? null : (
            <Notice
              message={failure.message}
              title="Import failed"
              tone="danger"
            />
          )}

          {AsyncResult.isFailure(stateResult) ? (
            <Notice
              message="Could not start the backup import."
              title="Import unavailable"
              tone="danger"
            />
          ) : null}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Opening backup file" visible={isImporting} />
    </>
  );
}

function CatalogExportSection() {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, catalogExportMachine),
    []
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);
  const state = AsyncResult.isSuccess(stateResult) ? stateResult.value : null;
  const failure =
    state === null
      ? null
      : CatalogExportStates.get(state, "Failure").pipe(Option.getOrNull);
  const success =
    state === null
      ? null
      : CatalogExportStates.get(state, "Success").pipe(Option.getOrNull);
  const isExporting =
    state !== null && CatalogExportStates.matches(state, "Exporting");

  return (
    <>
      <BackupSettingsSection divider title="Export catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isExporting || state === null}
            icon={Download}
            loading={isExporting}
            onPress={() => {
              send(new ExportCatalog());
            }}
          >
            Export catalog file
          </Button>

          {success === null ? null : (
            <Notice message={success.message} tone="success" />
          )}

          {failure === null ? null : (
            <Notice
              message={failure.message}
              title="Export catalog failed"
              tone="danger"
            />
          )}

          {AsyncResult.isFailure(stateResult) ? (
            <Notice
              message="Could not start the catalog export."
              title="Export unavailable"
              tone="danger"
            />
          ) : null}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting catalog" visible={isExporting} />
    </>
  );
}

function CatalogImportSection() {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, catalogImportMachine),
    []
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);
  const state = AsyncResult.isSuccess(stateResult) ? stateResult.value : null;
  const preview =
    state === null
      ? null
      : CatalogImportStates.get(state, "Preview").pipe(Option.getOrNull);
  const previewFailure =
    state === null
      ? null
      : CatalogImportStates.get(state, "PreviewFailure").pipe(Option.getOrNull);
  const importFailure =
    state === null
      ? null
      : CatalogImportStates.get(state, "Preview.Failure").pipe(
          Option.getOrNull
        );
  const importSuccess =
    state === null
      ? null
      : CatalogImportStates.get(state, "Preview.Success").pipe(
          Option.getOrNull
        );
  const isImporting =
    state !== null && CatalogImportStates.matches(state, "Preview.Importing");
  const isPreviewing =
    state !== null && CatalogImportStates.matches(state, "Previewing");
  const isPreviewReady =
    state !== null &&
    (CatalogImportStates.matches(state, "Preview.Selecting") ||
      CatalogImportStates.matches(state, "Preview.Importing"));
  const isBusy = isImporting || isPreviewing;

  return (
    <>
      <BackupSettingsSection divider title="Import catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isBusy || state === null}
            icon={Upload}
            loading={isPreviewing}
            onPress={() => {
              send(new OpenCatalogPreview());
            }}
          >
            Choose catalog file
          </Button>

          {importSuccess === null ? null : (
            <Notice message={importSuccess.message} tone="success" />
          )}

          {importFailure === null ? null : (
            <Notice
              message={importFailure.message}
              title="Import catalog failed"
              tone="danger"
            />
          )}

          {previewFailure === null ? null : (
            <Notice
              message={previewFailure.message}
              title="Preview catalog failed"
              tone="danger"
            />
          )}

          {AsyncResult.isFailure(stateResult) ? (
            <Notice
              message="Could not start the catalog import."
              title="Import unavailable"
              tone="danger"
            />
          ) : null}
        </View>
      </BackupSettingsSection>

      {isPreviewReady && preview !== null && (
        <BackupSettingsSection divider title="Preview">
          <View style={styles.sectionBody}>
            <View style={styles.catalogMetricRow}>
              <Text style={styles.catalogMetricText}>
                {preview.previewCandidates.length} candidates
              </Text>
              <Text style={styles.catalogMetricText}>
                {HashSet.size(preview.selectedFoodIds)} selected
              </Text>
            </View>

            <View style={styles.catalogCandidateList}>
              {preview.previewCandidates.map(
                (candidate: FoodCatalogTransfer.FoodCatalogImportCandidate) => (
                  <CatalogCandidateRow
                    key={candidate.food.id}
                    candidate={candidate}
                    disabled={isBusy}
                    selected={HashSet.has(
                      preview.selectedFoodIds,
                      candidate.food.id
                    )}
                    onToggle={() => {
                      send(
                        new ToggleCatalogFood({ foodId: candidate.food.id })
                      );
                    }}
                  />
                )
              )}
            </View>

            <Button
              icon={Upload}
              loading={isImporting}
              onPress={() => {
                send(new ImportSelectedCatalogFoods());
              }}
              disabled={HashSet.isEmpty(preview.selectedFoodIds) || isBusy}
            >
              Import selected
            </Button>
          </View>
        </BackupSettingsSection>
      )}

      <LoadingOverlay
        message={isImporting ? "Importing catalog" : "Opening catalog file"}
        visible={isBusy}
      />
    </>
  );
}

function CatalogCandidateRow({
  candidate,
  disabled,
  onToggle,
  selected,
}: {
  readonly candidate: FoodCatalogTransfer.FoodCatalogImportCandidate;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly selected: boolean;
}) {
  const selectable = candidate.selection.selectable;
  const isDisabled = disabled || !selectable;
  const CheckboxIcon = selected ? SquareCheckBig : Square;

  return (
    <Pressable
      accessibilityLabel={candidate.food.name}
      accessibilityRole="checkbox"
      accessibilityState={{
        checked: selected,
        disabled: isDisabled,
      }}
      disabled={isDisabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.catalogCandidate,
        selected ? styles.catalogCandidateSelected : null,
        isDisabled ? styles.catalogCandidateDisabled : null,
        pressed && !isDisabled ? styles.pressed : null,
      ]}
    >
      <CheckboxIcon
        color={selected ? color.primary : color.textSubtle}
        size={22}
        strokeWidth={2.8}
      />
      <View style={styles.catalogCandidateContent}>
        <Text numberOfLines={1} style={styles.catalogCandidateName}>
          {candidate.food.name}
        </Text>
        {candidate.food.brand === undefined ? null : (
          <Text numberOfLines={1} style={styles.catalogCandidateBrand}>
            {candidate.food.brand}
          </Text>
        )}
        <View style={styles.catalogBadgeRow}>
          <CatalogBadge
            label={CatalogCandidateStatusLabel[candidate.status]}
            tone={CatalogCandidateStatusTone[candidate.status]}
          />
          {candidate.nameStatus === "same-name-local" ? (
            <CatalogBadge
              label={
                candidate.sameNameLocalFoodIds.length === 1
                  ? "Name conflict"
                  : `${candidate.sameNameLocalFoodIds.length} name conflicts`
              }
              tone="warning"
            />
          ) : (
            <CatalogBadge label="Unique name" tone="neutral" />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function CatalogBadge({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: "danger" | "neutral" | "success" | "warning";
}) {
  return (
    <View style={[styles.catalogBadge, catalogBadgeToneStyles[tone]]}>
      <Text style={[styles.catalogBadgeText, catalogBadgeTextStyles[tone]]}>
        {label}
      </Text>
    </View>
  );
}

function ResetDataSection() {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, localDataResetMachine),
    []
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);
  const state = AsyncResult.isSuccess(stateResult) ? stateResult.value : null;
  const confirmation =
    state === null
      ? null
      : LocalDataResetMachine.LocalDataResetStates.get(
          state,
          "Confirmation"
        ).pipe(Option.getOrNull);
  const failure =
    state === null
      ? null
      : LocalDataResetMachine.LocalDataResetStates.get(
          state,
          "Confirmation.Failure"
        ).pipe(Option.getOrNull);
  const canReset =
    confirmation?.confirmationText ===
    NutritionLocalData.LocalDataResetConfirmationText;
  const isIdle =
    state !== null &&
    LocalDataResetMachine.LocalDataResetStates.matches(state, "Idle");
  const isConfirming =
    state !== null &&
    LocalDataResetMachine.LocalDataResetStates.matches(state, "Confirmation");
  const isResetting =
    state !== null &&
    LocalDataResetMachine.LocalDataResetStates.matches(state, "Resetting");
  const resetDisabled = isResetting;

  return (
    <>
      <BackupSettingsSection divider title="Reset">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Delete every plan, food, daily log, and meal entry on this device.
          </Text>

          {isIdle ? (
            <Button
              disabled={resetDisabled}
              icon={Trash2}
              onPress={() => {
                send(new LocalDataResetMachine.BeginReset());
              }}
              variant="danger"
            >
              Delete everything
            </Button>
          ) : null}

          {isConfirming ? (
            <View style={styles.sectionBody}>
              <Text style={styles.confirmationText}>
                Type{" "}
                <Text style={styles.confirmationPhrase}>
                  {NutritionLocalData.LocalDataResetConfirmationText}
                </Text>{" "}
                to confirm.
              </Text>
              <Field
                autoCapitalize="none"
                autoCorrect={false}
                editable={!resetDisabled}
                label="Confirmation"
                placeholder={NutritionLocalData.LocalDataResetConfirmationText}
                value={confirmation?.confirmationText ?? ""}
                onChangeText={(confirmationText) => {
                  send(
                    new LocalDataResetMachine.ChangeResetConfirmationText({
                      confirmationText,
                    })
                  );
                }}
              />
              <View style={styles.inlineActions}>
                <Button
                  disabled={resetDisabled}
                  icon={X}
                  onPress={() => {
                    send(new LocalDataResetMachine.CancelReset());
                  }}
                  style={styles.inlineAction}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  disabled={resetDisabled || !canReset}
                  icon={Trash2}
                  onPress={() => {
                    send(new LocalDataResetMachine.ConfirmLocalDataReset());
                  }}
                  style={styles.inlineAction}
                  variant="danger"
                >
                  Delete data
                </Button>
              </View>

              {failure === null ? null : (
                <Text style={styles.resetErrorText}>{failure.message}</Text>
              )}
            </View>
          ) : null}

          {AsyncResult.isFailure(stateResult) ? (
            <Notice
              message="Could not start the local-data reset."
              title="Reset unavailable"
              tone="danger"
            />
          ) : null}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Deleting local data" visible={isResetting} />
    </>
  );
}

function BackupSettingsSection({
  children,
  divider,
  title,
}: {
  readonly children: ReactNode;
  readonly divider: boolean;
  readonly title: string;
}) {
  return (
    <View
      style={[
        styles.settingsSection,
        divider ? null : styles.settingsSectionWithoutDivider,
      ]}
    >
      <Text style={styles.settingsSectionTitle}>{title}</Text>
      <SectionCard style={styles.card}>{children}</SectionCard>
    </View>
  );
}

const BackupImportMimeTypes = [
  "application/gzip",
  "application/json",
  "application/octet-stream",
  "application/x-gzip",
  "text/plain",
] as const;

const GzipFileMimeType = "application/gzip";
const GzipFileUti = "org.gnu.gnu-zip-archive";

function _decodeMobileJsonFile({
  bytes,
  fileName,
}: {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}) {
  return Effect.gen(function* () {
    const gzip = yield* Gzip.Gzip;

    return fileName.toLowerCase().endsWith(".gz") || Gzip.isGzipBytes({ bytes })
      ? yield* gzip.gunzipText({
          bytes,
        })
      : yield* gzip.bytesToText({
          bytes,
        });
  });
}

const CatalogCandidateStatusLabel: Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  string
> = {
  "already-present": "Already present",
  "id-conflict": "ID conflict",
  new: "New",
};

const CatalogCandidateStatusTone: Record<
  FoodCatalogTransfer.FoodCatalogImportCandidateStatus,
  "danger" | "neutral" | "success" | "warning"
> = {
  "already-present": "neutral",
  "id-conflict": "danger",
  new: "success",
};

function _backupErrorMessage({ error }: { readonly error: unknown }) {
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

  return error instanceof Error
    ? error.message
    : "The backup action could not finish.";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingBottom: 0,
  },
  card: {
    backgroundColor: color.surface,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsScrollContent: {
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  settingsSection: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.xl,
  },
  settingsSectionWithoutDivider: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  settingsSectionTitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  sectionBody: {
    gap: spacing.md,
  },
  catalogMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  catalogMetricText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  catalogCandidateList: {
    gap: spacing.sm,
  },
  catalogCandidate: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 6,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  catalogCandidateSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  catalogCandidateDisabled: {
    opacity: 0.62,
  },
  catalogCandidateContent: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  catalogCandidateName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  catalogCandidateBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  catalogBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  catalogBadge: {
    minHeight: 24,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  catalogBadgeText: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inlineAction: {
    flex: 1,
  },
  confirmationText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  confirmationPhrase: {
    color: color.dangerText,
    fontWeight: tokens.type.weight.black,
  },
  resetErrorText: {
    color: color.dangerText,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  warningText: {
    color: color.dangerText,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  pressed: {
    opacity: 0.86,
  },
});

const catalogBadgeToneStyles = StyleSheet.create({
  danger: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  neutral: {
    borderColor: color.divider,
    backgroundColor: color.statusNeutralSoft,
  },
  success: {
    borderColor: color.successBorder,
    backgroundColor: color.successBg,
  },
  warning: {
    borderColor: color.warningBorder,
    backgroundColor: color.warningBg,
  },
});

const catalogBadgeTextStyles = StyleSheet.create({
  danger: {
    color: color.dangerText,
  },
  neutral: {
    color: color.textMuted,
  },
  success: {
    color: color.successText,
  },
  warning: {
    color: color.warningText,
  },
});
