import {
  AppHeader,
  AppScreen,
  Button,
  Field,
  IconButton,
  LoadingOverlay,
  Notice,
  SectionCard,
} from "@/components/ui";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent, LocalDataResetMachine } from "@mai/machines";
import {
  Backup,
  Domain,
  FoodCatalogTransfer,
  LocalData as NutritionLocalData,
} from "@mai/nutrition";
import { BackupFileTransfer, FoodCatalogShare, Gzip } from "@mai/services";
import { useMachine } from "@xstate/react";
import {
  Array,
  Data,
  DateTime,
  Effect,
  HashSet,
  Match,
  Option,
  Schema,
} from "effect";
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
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { createAsyncLogic, setup } from "xstate";

const MobileBackupImportResult = Data.taggedEnum<
  Data.TaggedEnum<{
    Imported: { readonly message: string };
    Canceled: {};
  }>
>();

type MobileCatalogPreviewResult = {
  readonly catalogJson: string;
  readonly message: string;
  readonly candidates: readonly FoodCatalogTransfer.FoodCatalogImportCandidate[];
  readonly selectedFoodIds: readonly Domain.FoodId[];
};

type MobileCatalogFilePreviewResult =
  | ({ readonly status: "previewed" } & MobileCatalogPreviewResult)
  | { readonly message: null; readonly status: "canceled" };

const exportBackupMachine = setup({
  schemas: {
    events: {
      Export: Schema.toStandardSchemaV1(EmptyEvent),
      ChangeBackupName: Schema.toStandardSchemaV1(
        Schema.Struct({ backupName: Schema.String })
      ),
    },
    context: Schema.toStandardSchemaV1(
      Schema.Struct({ backupName: Schema.String })
    ),
  },
  delays: { ExportBackupSuccess: 3000 },
  states: {
    Idle: {},
    Exporting: {},
    Error: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({
            message: Schema.NonEmptyString,
          })
        ),
      },
    },
    Success: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({
            message: Schema.NonEmptyString,
          })
        ),
      },
    },
  },
  actorSources: {
    exportBackup: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            backupName: Schema.String,
          })
        ),
        output: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          exportMobileBackup({ backupName: input.backupName })
        ),
    }),
  },
}).createMachine({
  context: { backupName: "" },
  initial: "Idle",
  on: {
    ChangeBackupName: ({ event }) => ({
      context: { backupName: event.backupName },
    }),
  },
  states: {
    Idle: { on: { Export: { target: "Exporting" } } },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ context }) => ({ backupName: context.backupName }),
        onError: ({ event, context }) => ({
          target: "Error",
          context: {
            ...context,
            message: backupErrorMessage({ error: event.error }),
          },
        }),
        onDone: ({ event, context }) => ({
          target: "Success",
          context: { ...context, message: event.output.message },
        }),
      },
    },
    Error: { on: { Export: { target: "Exporting" } } },
    Success: { after: { ExportBackupSuccess: { target: "Idle" } } },
  },
});

const importBackupMachine = setup({
  schemas: {
    events: {
      ImportFile: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  delays: { ImportBackupSuccess: 3000 },
  states: {
    Idle: {},
    ImportingFile: {},
    Error: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
    },
    Success: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
    },
  },
  actorSources: {
    importBackupFile: createAsyncLogic({
      run: () =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;

            const pickedFile = yield* fileTransfers.pickFile({
              mimeTypes: BackupImportMimeTypes,
            });

            return yield* Match.value(pickedFile).pipe(
              Match.tagsExhaustive({
                BackupFilePickCanceled: () =>
                  Effect.succeed(MobileBackupImportResult.Canceled()),

                PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
                  const json = yield* decodeMobileJsonFile({
                    bytes: pickedFile.bytes,
                    fileName: pickedFile.fileName,
                  });

                  const importedBackup = yield* importMobileBackup({ json });

                  return MobileBackupImportResult.Imported({
                    message:
                      "Imported " +
                      pickedFile.fileName +
                      ". " +
                      importedBackup.message,
                  });
                }),
              })
            );
          })
        ),
    }),
  },
}).createMachine({
  states: {
    Idle: { on: { ImportFile: { target: "ImportingFile" } } },
    ImportingFile: {
      invoke: {
        src: "importBackupFile",
        onDone: ({ event }) => ({
          target: "Success",
          context: MobileBackupImportResult.$match({
            Canceled: () => ({ context: { message: "Import canceled" } }),
            Imported: ({ message }) => ({ context: { message } }),
          })(event.output),
        }),
        onError: ({ event }) => ({
          target: "Error",
          context: { message: backupErrorMessage({ error: event.error }) },
        }),
      },
    },
    Error: { on: { ImportFile: { target: "ImportingFile" } } },
    Success: { after: { ImportBackupSuccess: { target: "Idle" } } },
  },
});

const catalogExportMachine = setup({
  schemas: {
    events: {
      ExportCatalog: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  delays: { ExportCatalogSuccess: 3000 },
  states: {
    Idle: {},
    ExportingCatalog: {},
    Error: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
    },
    Success: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
    },
  },
  actorSources: {
    exportCatalog: createAsyncLogic({
      run: () =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const gzip = yield* Gzip.Gzip;

            const exportedCatalog = yield* transfers.exportToJson();
            const fileName = foodCatalogFileName({
              catalog: exportedCatalog.catalog,
              extension: "json.gz",
            });
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
              fileName,
              foodCount: exportedCatalog.catalog.integrity.counts.foods,
              message: `Opened share options for ${fileName}.`,
            };
          })
        ),
    }),
  },
}).createMachine({
  states: {
    Idle: { on: { ExportCatalog: { target: "ExportingCatalog" } } },
    ExportingCatalog: {
      invoke: {
        src: "exportCatalog",
        onDone: ({ event }) => ({
          target: "Success",
          context: { message: event.output.message },
        }),
        onError: ({ event }) => ({
          target: "Error",
          context: { message: backupErrorMessage({ error: event.error }) },
        }),
      },
    },
    Error: { on: { ExportCatalog: { target: "ExportingCatalog" } } },
    Success: { after: { ExportCatalogSuccess: { target: "Idle" } } },
  },
});

const catalogImportMachine = setup({
  schemas: {
    events: {
      OpenPreviewCatalogImportFile: Schema.toStandardSchemaV1(EmptyEvent),
      ImportSelectedCatalogFoods: Schema.toStandardSchemaV1(EmptyEvent),
      ToggleCatalogFood: Schema.toStandardSchemaV1(
        Schema.Struct({ foodId: Domain.FoodId })
      ),
    },
  },
  delays: { ImportCatalogSuccess: 3000 },
  states: {
    Idle: {},
    ImportingPreview: {},
    ImportingPreviewError: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
    },
    CatalogPreview: {
      schemas: {
        context: Schema.toStandardSchemaV1(
          Schema.Struct({
            selectedFoodIds: Schema.HashSet(Domain.FoodId),
            previewCandidates: Schema.Array(
              FoodCatalogTransfer.FoodCatalogImportCandidate
            ),
          })
        ),
      },
      states: {
        SelectFoods: {},
        ImportingCatalog: {},
        ImportCompleted: {},
        Error: {
          schemas: {
            context: Schema.toStandardSchemaV1(
              Schema.Struct({ message: Schema.NonEmptyString })
            ),
          },
        },
        Success: {
          schemas: {
            context: Schema.toStandardSchemaV1(
              Schema.Struct({ message: Schema.NonEmptyString })
            ),
          },
        },
      },
    },
  },
  actorSources: {
    previewCatalogImportFile: createAsyncLogic({
      run: () =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
            const pickedFile = yield* fileTransfers.pickFile({
              mimeTypes: BackupImportMimeTypes,
            });

            return yield* Match.value(pickedFile).pipe(
              Match.tagsExhaustive({
                BackupFilePickCanceled: () =>
                  Effect.succeed<MobileCatalogFilePreviewResult>({
                    message: null,
                    status: "canceled",
                  }),
                PickedBackupFile: Effect.fnUntraced(function* (pickedFile) {
                  const json = yield* decodeMobileJsonFile({
                    bytes: pickedFile.bytes,
                    fileName: pickedFile.fileName,
                  });

                  const preview = yield* previewMobileFoodCatalogImport({
                    json,
                  });

                  return {
                    ...preview,
                    message: `Previewed ${pickedFile.fileName}. ${preview.message}`,
                    status: "previewed",
                  } satisfies MobileCatalogFilePreviewResult;
                }),
              })
            );
          })
        ),
    }),

    importSelectedCatalogFoods: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            catalogJson: Schema.String,
            selectedFoodIds: Schema.Array(Domain.FoodId),
          })
        ),
        output: Schema.toStandardSchemaV1(
          Schema.Struct({ message: Schema.NonEmptyString })
        ),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
            const importedCatalog = yield* transfers.importSelectedFromJson({
              input: {
                json: input.catalogJson,
                selectedFoodIds: input.selectedFoodIds,
              },
            });

            return {
              message: `Imported ${importedCatalog.importedFoods.length} foods.`,
            };
          })
        ),
    }),
  },
}).createMachine({
  initial: "Idle",
  states: {
    Idle: {
      on: {
        OpenPreviewCatalogImportFile: { target: "ImportingPreview" },
      },
    },
    ImportingPreview: {
      invoke: {
        src: "previewCatalogImportFile",
        onDone: ({ event }) =>
          event.output.status === "previewed"
            ? {
                target: "CatalogPreview",
                context: {
                  previewCandidates: event.output.candidates,
                  selectedFoodIds: event.output.selectedFoodIds,
                },
              }
            : {
                target: "ImportingPreviewError",
                context: { message: event.output.message },
              },
      },
    },
    ImportingPreviewError: {
      on: {
        OpenPreviewCatalogImportFile: { target: "ImportingPreview" },
      },
    },
    CatalogPreview: {
      initial: "SelectFoods",
      onDone: { target: "Idle" },
      on: {
        ToggleCatalogFood: ({ context, event }) =>
          Option.gen(function* () {
            const { selection } = yield* Array.findFirst(
              context.previewCandidates,
              (previewCandidate) => previewCandidate.food.id === event.foodId
            );

            if (!selection.selectable) return yield* Option.none();

            return {
              context: {
                ...context,
                selectedFoodIds: HashSet.has(
                  context.selectedFoodIds,
                  event.foodId
                )
                  ? HashSet.remove(context.selectedFoodIds, event.foodId)
                  : HashSet.add(context.selectedFoodIds, event.foodId),
              },
            };
          }).pipe(Option.getOrElse(() => ({ context }))),
      },
      states: {
        SelectFoods: {
          on: {
            ImportSelectedCatalogFoods: { target: "ImportingCatalog" },
          },
        },
        ImportingCatalog: {
          invoke: {
            src: "importSelectedCatalogFoods",
            input: ({ context }) => ({
              catalogJson: context.catalogJson,
              selectedFoodIds: context.selectedFoodIds,
            }),
            onError: ({ event }) => ({
              target: "Error",
              context: { message: backupErrorMessage({ error: event.error }) },
            }),
            onDone: ({ event }) => ({
              target: "Success",
              context: { message: event.output.message },
            }),
          },
        },
        Error: {
          on: {
            ImportSelectedCatalogFoods: { target: "ImportingCatalog" },
          },
        },
        Success: {
          after: { ImportCatalogSuccess: { target: "ImportCompleted" } },
        },
        ImportCompleted: { type: "final" },
      },
    },
  },
});

const localDataResetMachine = LocalDataResetMachine.makeLocalDataResetMachine({
  runtime: RuntimeClient,
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
  const [snapshot, , actor] = useMachine(exportBackupMachine);
  const exporting = snapshot.matches("Exporting");
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
            value={snapshot.context.backupName}
            onChangeText={(value) =>
              actor.trigger.ChangeBackupName({ backupName: value })
            }
          />
          <Button
            disabled={exporting}
            icon={Download}
            loading={exporting}
            onPress={actor.trigger.Export}
          >
            Export backup
          </Button>

          {snapshot.matches("Success") && (
            <Notice message={snapshot.context.message} tone="success" />
          )}

          {snapshot.matches("Error") && (
            <Notice
              message={snapshot.context.message}
              title="Export failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting backup" visible={exporting} />
    </>
  );
}

function ImportBackupSection() {
  const [snapshot, , actor] = useMachine(importBackupMachine);
  const isImporting = snapshot.matches("ImportingFile");
  return (
    <>
      <BackupSettingsSection divider title="Import">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Import replaces the current data on this device.
          </Text>
          <Button
            disabled={isImporting}
            icon={Upload}
            loading={isImporting}
            onPress={actor.trigger.ImportFile}
            variant="danger"
          >
            Choose backup file
          </Button>

          {snapshot.matches("Success") && (
            <Notice message={snapshot.context.message} tone="success" />
          )}

          {snapshot.matches("Error") && (
            <Notice
              message={snapshot.context.message}
              title="Import failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Opening backup file" visible={isImporting} />
    </>
  );
}

function CatalogExportSection() {
  const [snapshot, , actor] = useMachine(catalogExportMachine);
  const isExporting = snapshot.matches("Exporting");
  return (
    <>
      <BackupSettingsSection divider title="Export catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isExporting}
            icon={Download}
            loading={isExporting}
            onPress={actor.trigger.ExportCatalog}
          >
            Export catalog file
          </Button>

          {snapshot.matches("Success") && (
            <Notice message={snapshot.context.message} tone="success" />
          )}

          {snapshot.matches("Error") && (
            <Notice
              message={snapshot.context.message}
              title="Export catalog failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      <LoadingOverlay message="Exporting catalog" visible={isExporting} />
    </>
  );
}

function CatalogImportSection() {
  const [snapshot, , actor] = useMachine(catalogImportMachine);
  const isImporting = snapshot.matches("Importing");
  const isPreviewing = snapshot.matches("PreviewingFile");
  const isBusy = isImporting || isPreviewing;
  return (
    <>
      <BackupSettingsSection divider title="Import catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isBusy}
            icon={Upload}
            loading={isPreviewing}
            onPress={actor.trigger.OpenPreviewCatalogImportFile}
          >
            Choose catalog file
          </Button>

          {snapshot.matches({ CatalogPreview: "Success" }) && (
            <Notice message={snapshot.context.message} tone="success" />
          )}

          {snapshot.matches({ CatalogPreview: "Error" }) && (
            <Notice
              message={snapshot.context.message}
              title="Import catalog failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      {snapshot.matches("CatalogPreview") && (
        <BackupSettingsSection divider title="Preview">
          <View style={styles.sectionBody}>
            <View style={styles.catalogMetricRow}>
              <Text style={styles.catalogMetricText}>
                {snapshot.context.previewCandidates.length} candidates
              </Text>
              <Text style={styles.catalogMetricText}>
                {HashSet.size(snapshot.context.selectedFoodIds)} selected
              </Text>
            </View>

            <View style={styles.catalogCandidateList}>
              {snapshot.context.previewCandidates.map((candidate) => (
                <CatalogCandidateRow
                  key={candidate.food.id}
                  candidate={candidate}
                  disabled={isBusy}
                  selected={HashSet.has(
                    snapshot.context.selectedFoodIds,
                    candidate.food.id
                  )}
                  onToggle={() =>
                    actor.trigger.ToggleCatalogFood({
                      foodId: candidate.food.id,
                    })
                  }
                />
              ))}
            </View>

            <Button
              icon={Upload}
              loading={isImporting}
              onPress={actor.trigger.ImportSelectedCatalogFoods}
              disabled={
                HashSet.isEmpty(snapshot.context.selectedFoodIds) || isBusy
              }
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
  const [snapshot, , actor] = useMachine(localDataResetMachine);
  const canReset = snapshot.can({ type: "Reset" });
  const isIdle = snapshot.matches("Idle");
  const isConfirming =
    snapshot.matches("Failure") || snapshot.matches("ConfirmReset");
  const isResetting = snapshot.matches("Resetting");
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
              onPress={actor.trigger.Begin}
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
                value={snapshot.context.confirmationText}
                onChangeText={(confirmationText) =>
                  actor.trigger.ChangeConfirmationText({
                    confirmationText,
                  })
                }
              />
              <View style={styles.inlineActions}>
                <Button
                  disabled={resetDisabled}
                  icon={X}
                  onPress={actor.trigger.Cancel}
                  style={styles.inlineAction}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  disabled={resetDisabled || !canReset}
                  icon={Trash2}
                  onPress={actor.trigger.Reset}
                  style={styles.inlineAction}
                  variant="danger"
                >
                  Delete data
                </Button>
              </View>

              {snapshot.matches("Failure") && (
                <Text style={styles.resetErrorText}>
                  {snapshot.context.message}
                </Text>
              )}
            </View>
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

export function decodeMobileJsonFile({
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

export function exportMobileBackup({
  backupName,
}: {
  readonly backupName: string;
}) {
  return Effect.gen(function* () {
    const backups = yield* Backup.Backups;
    const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
    const gzip = yield* Gzip.Gzip;
    const exportedBackup = yield* backups.exportToJson();
    const fileName = backupFileName({
      backup: exportedBackup.backup,
      backupName,
      extension: "json.gz",
    });
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
  });
}

export function importMobileBackup({ json }: { readonly json: string }) {
  return Effect.gen(function* () {
    const backups = yield* Backup.Backups;
    const importedBackup = yield* backups.importFromJson({
      input: {
        json,
      },
    });

    return MobileBackupImportResult.Imported({
      message: backupImportMessage({ backup: importedBackup.backup }),
    });
  });
}

export function previewMobileFoodCatalogImport({
  json,
}: {
  readonly json: string;
}) {
  return Effect.gen(function* () {
    const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
    const decodedCatalog = yield* FoodCatalogShare.decodeShareText({
      text: json,
    });
    const preview = yield* transfers.previewImportFromJson({
      input: {
        json: decodedCatalog.catalogJson,
      },
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
      catalogJson: decodedCatalog.catalogJson,
      candidates: preview.candidates,
      message: `Previewed ${preview.candidates.length} foods. ${selectedFoodIds.length} selected by default.`,
      selectedFoodIds,
    } satisfies MobileCatalogPreviewResult;
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

export function backupFileName({
  backup,
  backupName,
  extension = "json",
}: {
  readonly backup: Backup.MaiBackup;
  readonly backupName: string;
  readonly extension?: "json" | "json.gz";
}) {
  const exportedAt = new Date(DateTime.toEpochMillis(backup.source.exportedAt));
  const baseName = backupName.trim() === "" ? "mai-backup" : backupName.trim();
  const sanitizedName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fileNamePrefix =
    sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;

  return `${fileNamePrefix}-format-v${backup.formatVersion}-db-v${backup.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.${extension}`;
}

export function foodCatalogFileName({
  catalog,
  extension = "json",
}: {
  readonly catalog: FoodCatalogTransfer.MaiFoodCatalog;
  readonly extension?: "json" | "json.gz";
}) {
  const exportedAt = new Date(
    DateTime.toEpochMillis(catalog.source.exportedAt)
  );

  return `mai-food-catalog-format-v${catalog.formatVersion}-db-v${catalog.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.${extension}`;
}

export function backupImportMessage({
  backup,
}: {
  readonly backup: Backup.MaiBackup;
}) {
  const totalRecords =
    backup.integrity.counts.dailyLogs +
    backup.integrity.counts.foods +
    backup.integrity.counts.mealEntries +
    backup.integrity.counts.plans;

  return `Imported backup. Format v${backup.formatVersion}, database v${backup.source.databaseVersion}, ${totalRecords} records restored.`;
}

export function backupErrorMessage({ error }: { readonly error: unknown }) {
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
