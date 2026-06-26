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
import { LocalDataResetMachine } from "@mai/machines";
import {
  Backup,
  FoodCatalogTransfer,
  LocalData as NutritionLocalData,
} from "@mai/nutrition";
import { BackupFileTransfer, FoodCatalogShare, Gzip } from "@mai/services";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, DateTime, Effect } from "effect";
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
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  assertEvent,
  assign,
  cancel,
  fromPromise,
  sendTo,
  setup,
} from "xstate";
import type { ReactNode } from "react";

type FoodCatalogImportCandidate =
  FoodCatalogTransfer.FoodCatalogImportCandidate;

type FoodCatalogFoodId = FoodCatalogImportCandidate["food"]["id"];

type MobileBackupExportResult = {
  readonly fileName: string;
  readonly message: string;
};

type MobileBackupImportResult =
  | {
      readonly message: string;
      readonly status: "imported";
    }
  | {
      readonly message: null;
      readonly status: "canceled";
    };

type MobileCatalogExportResult = {
  readonly fileName: string;
  readonly foodCount: number;
  readonly message: string;
};

type MobileCatalogPreviewResult = {
  readonly catalogJson: string;
  readonly candidates: readonly FoodCatalogImportCandidate[];
  readonly message: string;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
};

type MobileCatalogFilePreviewResult =
  | (MobileCatalogPreviewResult & {
      readonly status: "previewed";
    })
  | {
      readonly message: null;
      readonly status: "canceled";
    };

type MobileCatalogImportResult = {
  readonly message: string;
};

const SuccessNoticeDurationMs = 5000;
const ExportBackupSuccessDismissId = "backup.export.success.dismiss";
const ImportBackupSuccessDismissId = "backup.import.success.dismiss";
const CatalogExportSuccessDismissId = "catalog.export.success.dismiss";
const CatalogImportSuccessDismissId = "catalog.import.success.dismiss";

const exportBackupMachine = setup({
  types: {
    context: {} as {
      readonly backupName: string;
      readonly errorMessage: string | null;
      readonly successMessage: string | null;
    },
    events: {} as
      | {
          readonly backupName: string;
          readonly type: "changeBackupName";
        }
      | {
          readonly type: "dismissExportBackupSuccess";
        }
      | {
          readonly type: "export";
        },
  },
  actors: {
    exportBackup: fromPromise<MobileBackupExportResult, string>(({ input }) =>
      RuntimeClient.runPromise(exportMobileBackup({ backupName: input }))
    ),
  },
}).createMachine({
  context: () => ({
    backupName: "Mai backup",
    errorMessage: null,
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    changeBackupName: {
      actions: [
        cancel(ExportBackupSuccessDismissId),
        assign(({ event }) => {
          assertEvent(event, "changeBackupName");

          return {
            backupName: event.backupName,
            errorMessage: null,
            successMessage: null,
          };
        }),
      ],
    },
    dismissExportBackupSuccess: {
      actions: assign({
        successMessage: null,
      }),
    },
  },
  states: {
    Idle: {
      on: {
        export: {
          target: "Exporting",
          actions: [
            cancel(ExportBackupSuccessDismissId),
            assign({
              errorMessage: null,
              successMessage: null,
            }),
          ],
        },
      },
    },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ context }) => context.backupName,
        onDone: {
          target: "Idle",
          actions: [
            assign(({ event }) => ({
              errorMessage: null,
              successMessage: event.output.message,
            })),
            sendTo(
              ({ self }) => self,
              () =>
                ({
                  type: "dismissExportBackupSuccess",
                }) satisfies {
                  readonly type: "dismissExportBackupSuccess";
                },
              {
                delay: SuccessNoticeDurationMs,
                id: ExportBackupSuccessDismissId,
              }
            ),
          ],
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const importBackupMachine = setup({
  types: {
    context: {} as {
      readonly errorMessage: string | null;
      readonly successMessage: string | null;
    },
    events: {} as
      | {
          readonly type: "dismissImportBackupSuccess";
        }
      | {
          readonly type: "importFile";
        },
  },
  actors: {
    importBackupFile: fromPromise<MobileBackupImportResult>(() =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
          const pickedFile = yield* fileTransfers.pickFile({
            mimeTypes: BackupImportMimeTypes,
          });

          if (pickedFile._tag === "BackupFilePickCanceled") {
            return {
              message: null,
              status: "canceled",
            } satisfies MobileBackupImportResult;
          }

          const json = yield* decodeMobileJsonFile({
            bytes: pickedFile.bytes,
            fileName: pickedFile.fileName,
          });
          const importedBackup = yield* importMobileBackup({ json });

          return {
            message:
              "Imported " + pickedFile.fileName + ". " + importedBackup.message,
            status: "imported",
          } satisfies MobileBackupImportResult;
        })
      )
    ),
  },
}).createMachine({
  context: () => ({
    errorMessage: null,
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    dismissImportBackupSuccess: {
      actions: assign({
        successMessage: null,
      }),
    },
  },
  states: {
    Idle: {
      on: {
        importFile: {
          target: "ImportingFile",
          actions: [
            cancel(ImportBackupSuccessDismissId),
            assign({
              errorMessage: null,
              successMessage: null,
            }),
          ],
        },
      },
    },
    ImportingFile: {
      invoke: {
        src: "importBackupFile",
        onDone: [
          {
            guard: ({ event }) => event.output.status === "canceled",
            target: "Idle",
            actions: assign({
              errorMessage: null,
              successMessage: null,
            }),
          },
          {
            target: "Idle",
            actions: [
              assign(({ event }) => ({
                errorMessage: null,
                successMessage: event.output.message,
              })),
              sendTo(
                ({ self }) => self,
                () =>
                  ({
                    type: "dismissImportBackupSuccess",
                  }) satisfies {
                    readonly type: "dismissImportBackupSuccess";
                  },
                {
                  delay: SuccessNoticeDurationMs,
                  id: ImportBackupSuccessDismissId,
                }
              ),
            ],
          },
        ],
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const catalogExportMachine = setup({
  types: {
    context: {} as {
      readonly errorMessage: string | null;
      readonly successMessage: string | null;
    },
    events: {} as
      | {
          readonly type: "dismissCatalogExportSuccess";
        }
      | {
          readonly type: "exportCatalog";
        },
  },
  actors: {
    exportCatalog: fromPromise<MobileCatalogExportResult>(() =>
      RuntimeClient.runPromise(exportMobileFoodCatalogFile())
    ),
  },
}).createMachine({
  context: () => ({
    errorMessage: null,
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    dismissCatalogExportSuccess: {
      actions: assign({
        successMessage: null,
      }),
    },
  },
  states: {
    Idle: {
      on: {
        exportCatalog: {
          target: "Exporting",
          actions: [
            cancel(CatalogExportSuccessDismissId),
            assign({
              errorMessage: null,
              successMessage: null,
            }),
          ],
        },
      },
    },
    Exporting: {
      invoke: {
        src: "exportCatalog",
        onDone: {
          target: "Idle",
          actions: [
            assign(({ event }) => ({
              errorMessage: null,
              successMessage: event.output.message,
            })),
            sendTo(
              ({ self }) => self,
              () =>
                ({
                  type: "dismissCatalogExportSuccess",
                }) satisfies {
                  readonly type: "dismissCatalogExportSuccess";
                },
              {
                delay: SuccessNoticeDurationMs,
                id: CatalogExportSuccessDismissId,
              }
            ),
          ],
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({
              error: event.error,
            }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const catalogImportMachine = setup({
  types: {
    context: {} as {
      readonly catalogJson: string | null;
      readonly errorMessage: string | null;
      readonly previewCandidates: readonly FoodCatalogImportCandidate[];
      readonly selectedFoodIds: readonly FoodCatalogFoodId[];
      readonly successMessage: string | null;
    },
    events: {} as
      | {
          readonly type: "dismissCatalogImportSuccess";
        }
      | {
          readonly type: "previewCatalogImportFile";
        }
      | {
          readonly foodId: FoodCatalogFoodId;
          readonly type: "toggleCatalogFood";
        }
      | {
          readonly type: "importSelectedCatalogFoods";
        },
  },
  actors: {
    importSelectedCatalogFoods: fromPromise<
      MobileCatalogImportResult,
      {
        readonly catalogJson: string;
        readonly selectedFoodIds: readonly FoodCatalogFoodId[];
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        importSelectedMobileFoodCatalog({
          catalogJson: input.catalogJson,
          selectedFoodIds: input.selectedFoodIds,
        })
      )
    ),
    previewCatalogImportFile: fromPromise<MobileCatalogFilePreviewResult>(() =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const fileTransfers = yield* BackupFileTransfer.BackupFileTransfer;
          const pickedFile = yield* fileTransfers.pickFile({
            mimeTypes: BackupImportMimeTypes,
          });

          if (pickedFile._tag === "BackupFilePickCanceled") {
            return {
              message: null,
              status: "canceled",
            } satisfies MobileCatalogFilePreviewResult;
          }

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
        })
      )
    ),
  },
}).createMachine({
  context: () => ({
    catalogJson: null,
    errorMessage: null,
    previewCandidates: [],
    selectedFoodIds: [],
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    dismissCatalogImportSuccess: {
      actions: assign({
        successMessage: null,
      }),
    },
    toggleCatalogFood: {
      actions: assign(({ context, event }) => {
        assertEvent(event, "toggleCatalogFood");

        const candidate = context.previewCandidates.find(
          (previewCandidate) => previewCandidate.food.id === event.foodId
        );

        if (candidate?.selection.selectable !== true) {
          return {};
        }

        const isSelected = context.selectedFoodIds.includes(event.foodId);

        return {
          selectedFoodIds: isSelected
            ? context.selectedFoodIds.filter(
                (selectedFoodId) => selectedFoodId !== event.foodId
              )
            : [...context.selectedFoodIds, event.foodId],
        };
      }),
    },
  },
  states: {
    Idle: {
      on: {
        importSelectedCatalogFoods: {
          guard: ({ context }) =>
            context.catalogJson !== null &&
            EffectArray.isReadonlyArrayNonEmpty(context.selectedFoodIds),
          target: "Importing",
          actions: [
            cancel(CatalogImportSuccessDismissId),
            assign({
              errorMessage: null,
              successMessage: null,
            }),
          ],
        },
        previewCatalogImportFile: {
          target: "PreviewingFile",
          actions: [
            cancel(CatalogImportSuccessDismissId),
            assign({
              errorMessage: null,
              successMessage: null,
            }),
          ],
        },
      },
    },
    Importing: {
      invoke: {
        src: "importSelectedCatalogFoods",
        input: ({ context }) => ({
          catalogJson: context.catalogJson ?? "",
          selectedFoodIds: context.selectedFoodIds,
        }),
        onDone: {
          target: "Idle",
          actions: [
            assign(({ event }) => ({
              catalogJson: null,
              errorMessage: null,
              previewCandidates: [],
              selectedFoodIds: [],
              successMessage: event.output.message,
            })),
            sendTo(
              ({ self }) => self,
              () =>
                ({
                  type: "dismissCatalogImportSuccess",
                }) satisfies {
                  readonly type: "dismissCatalogImportSuccess";
                },
              {
                delay: SuccessNoticeDurationMs,
                id: CatalogImportSuccessDismissId,
              }
            ),
          ],
        },
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({
              error: event.error,
            }),
            successMessage: null,
          })),
        },
      },
    },
    PreviewingFile: {
      invoke: {
        src: "previewCatalogImportFile",
        onDone: [
          {
            guard: ({ event }) => event.output.status === "canceled",
            target: "Idle",
            actions: assign({
              errorMessage: null,
              successMessage: null,
            }),
          },
          {
            target: "Idle",
            actions: [
              assign(({ event }) => {
                if (event.output.status === "canceled") {
                  return {};
                }

                return {
                  catalogJson: event.output.catalogJson,
                  errorMessage: null,
                  previewCandidates: event.output.candidates,
                  selectedFoodIds: event.output.selectedFoodIds,
                  successMessage: event.output.message,
                };
              }),
              sendTo(
                ({ self }) => self,
                () =>
                  ({
                    type: "dismissCatalogImportSuccess",
                  }) satisfies {
                    readonly type: "dismissCatalogImportSuccess";
                  },
                {
                  delay: SuccessNoticeDurationMs,
                  id: CatalogImportSuccessDismissId,
                }
              ),
            ],
          },
        ],
        onError: {
          target: "Idle",
          actions: assign(({ event }) => ({
            catalogJson: null,
            errorMessage: backupErrorMessage({
              error: event.error,
            }),
            previewCandidates: [],
            selectedFoodIds: [],
            successMessage: null,
          })),
        },
      },
    },
  },
});

const localDataResetMachine = LocalDataResetMachine.makeLocalDataResetMachine({
  restartApp: () => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.replace("/");
  },
  runtime: RuntimeClient,
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
  const [snapshot, send] = useMachine(exportBackupMachine);
  const exporting = snapshot.matches("Exporting");
  const { backupName, errorMessage, successMessage } = snapshot.context;

  return (
    <>
      <BackupSettingsSection divider={false} title="Export">
        <View style={styles.sectionBody}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!exporting}
            label="Name"
            onChangeText={(value) => {
              send({
                backupName: value,
                type: "changeBackupName",
              });
            }}
            placeholder="Mai backup"
            value={backupName}
          />
          <Button
            disabled={exporting}
            icon={Download}
            loading={exporting}
            onPress={() => {
              send({
                type: "export",
              });
            }}
          >
            Export backup
          </Button>
          {successMessage === null ? null : (
            <Notice message={successMessage} tone="success" />
          )}
          {errorMessage === null ? null : (
            <Notice
              message={errorMessage}
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
  const [snapshot, send] = useMachine(importBackupMachine);
  const isImporting = snapshot.matches("ImportingFile");
  const { errorMessage, successMessage } = snapshot.context;

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
            onPress={() => {
              send({
                type: "importFile",
              });
            }}
            variant="danger"
          >
            Choose backup file
          </Button>
          {successMessage === null ? null : (
            <Notice message={successMessage} tone="success" />
          )}
          {errorMessage === null ? null : (
            <Notice
              message={errorMessage}
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
  const [snapshot, send] = useMachine(catalogExportMachine);
  const isExporting = snapshot.matches("Exporting");
  const { errorMessage, successMessage } = snapshot.context;

  return (
    <>
      <BackupSettingsSection divider title="Export catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isExporting}
            icon={Download}
            loading={isExporting}
            onPress={() => {
              send({
                type: "exportCatalog",
              });
            }}
          >
            Export catalog file
          </Button>

          {successMessage === null ? null : (
            <Notice message={successMessage} tone="success" />
          )}
          {errorMessage === null ? null : (
            <Notice
              message={errorMessage}
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
  const [snapshot, send] = useMachine(catalogImportMachine);
  const isImporting = snapshot.matches("Importing");
  const isPreviewing = snapshot.matches("PreviewingFile");
  const isBusy = isImporting || isPreviewing;
  const { errorMessage, previewCandidates, selectedFoodIds, successMessage } =
    snapshot.context;

  return (
    <>
      <BackupSettingsSection divider title="Import catalog">
        <View style={styles.sectionBody}>
          <Button
            disabled={isBusy}
            icon={Upload}
            loading={isPreviewing}
            onPress={() => {
              send({
                type: "previewCatalogImportFile",
              });
            }}
          >
            Choose catalog file
          </Button>
          {successMessage === null ? null : (
            <Notice message={successMessage} tone="success" />
          )}
          {errorMessage === null ? null : (
            <Notice
              message={errorMessage}
              title="Import catalog failed"
              tone="danger"
            />
          )}
        </View>
      </BackupSettingsSection>

      {!EffectArray.isReadonlyArrayNonEmpty(previewCandidates) ? null : (
        <CatalogPreviewSection
          candidates={previewCandidates}
          disabled={isBusy}
          importing={isImporting}
          onImport={() => {
            send({
              type: "importSelectedCatalogFoods",
            });
          }}
          onToggleFood={(foodId) => {
            send({
              foodId,
              type: "toggleCatalogFood",
            });
          }}
          selectedFoodIds={selectedFoodIds}
        />
      )}

      <LoadingOverlay
        message={isImporting ? "Importing catalog" : "Opening catalog file"}
        visible={isBusy}
      />
    </>
  );
}

function CatalogPreviewSection({
  candidates,
  disabled,
  importing,
  onImport,
  onToggleFood,
  selectedFoodIds,
}: {
  readonly candidates: readonly FoodCatalogImportCandidate[];
  readonly disabled: boolean;
  readonly importing: boolean;
  readonly onImport: () => void;
  readonly onToggleFood: (foodId: FoodCatalogFoodId) => void;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
}) {
  return (
    <BackupSettingsSection divider title="Preview">
      <View style={styles.sectionBody}>
        <View style={styles.catalogMetricRow}>
          <Text style={styles.catalogMetricText}>
            {candidates.length} candidates
          </Text>
          <Text style={styles.catalogMetricText}>
            {selectedFoodIds.length} selected
          </Text>
        </View>

        <View style={styles.catalogCandidateList}>
          {candidates.map((candidate) => (
            <CatalogCandidateRow
              candidate={candidate}
              disabled={disabled}
              key={candidate.food.id}
              onToggle={() => {
                onToggleFood(candidate.food.id);
              }}
              selected={selectedFoodIds.includes(candidate.food.id)}
            />
          ))}
        </View>

        <Button
          disabled={
            disabled || !EffectArray.isReadonlyArrayNonEmpty(selectedFoodIds)
          }
          icon={Upload}
          loading={importing}
          onPress={onImport}
        >
          Import selected
        </Button>
      </View>
    </BackupSettingsSection>
  );
}

function CatalogCandidateRow({
  candidate,
  disabled,
  onToggle,
  selected,
}: {
  readonly candidate: FoodCatalogImportCandidate;
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
  const [snapshot, send] = useMachine(localDataResetMachine);
  const isIdle = snapshot.matches("Idle");
  const isConfirming =
    snapshot.matches("Confirming") || snapshot.matches("Failure");
  const isResetting = snapshot.matches("Resetting");
  const resetDisabled = isResetting;
  const canReset =
    snapshot.context.confirmationText ===
    NutritionLocalData.LocalDataResetConfirmationText;

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
                send({ type: "begin" });
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
                onChangeText={(confirmationText) => {
                  send({
                    confirmationText,
                    type: "changeConfirmationText",
                  });
                }}
                placeholder={NutritionLocalData.LocalDataResetConfirmationText}
                value={snapshot.context.confirmationText}
              />
              <View style={styles.inlineActions}>
                <Button
                  disabled={resetDisabled}
                  icon={X}
                  onPress={() => {
                    send({ type: "cancel" });
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
                    send({ type: "reset" });
                  }}
                  style={styles.inlineAction}
                  variant="danger"
                >
                  Delete data
                </Button>
              </View>
              {snapshot.context.errorMessage === null ? null : (
                <Text style={styles.resetErrorText}>
                  {snapshot.context.errorMessage}
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
    } satisfies MobileBackupExportResult;
  });
}

export function exportMobileFoodCatalogFile() {
  return Effect.gen(function* () {
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
    } satisfies MobileCatalogExportResult;
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

    return {
      message: backupImportMessage({ backup: importedBackup.backup }),
      status: "imported",
    } satisfies MobileBackupImportResult;
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

export function importSelectedMobileFoodCatalog({
  catalogJson,
  selectedFoodIds,
}: {
  readonly catalogJson: string;
  readonly selectedFoodIds: readonly FoodCatalogFoodId[];
}) {
  return Effect.gen(function* () {
    const transfers = yield* FoodCatalogTransfer.FoodCatalogTransfers;
    const importedCatalog = yield* transfers.importSelectedFromJson({
      input: {
        json: catalogJson,
        selectedFoodIds,
      },
    });

    return {
      message: `Imported ${importedCatalog.importedFoods.length} foods.`,
    } satisfies MobileCatalogImportResult;
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
