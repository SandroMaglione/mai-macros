import {
  AppHeader,
  AppScreen,
  Button,
  Field,
  IconButton,
  LoadingOverlay,
  Notice,
  PagerTabs,
  SectionCard,
  TextArea,
} from "@/components/ui";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, type } from "@/theme/tokens";
import {
  LocalDataResetConfirmationText,
  makeLocalDataResetMachine,
} from "@mai/machines/local-data";
import { Backups, type MaiBackup } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { router } from "expo-router";
import { ChevronLeft, Download, Trash2, Upload, X } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type BackupRouteEvent =
  | {
      readonly index: BackupTabIndex;
      readonly type: "selectTab";
    }
  | {
      readonly backupName: string;
      readonly type: "changeBackupName";
    }
  | {
      readonly json: string;
      readonly type: "changeImportJson";
    }
  | {
      readonly type: "export";
    }
  | {
      readonly type: "import";
    };

type BackupTabIndex = 0 | 1 | 2;

type MobileBackupExportResult = {
  readonly fileName: string;
  readonly json: string;
  readonly message: string;
};

type MobileBackupImportResult = {
  readonly message: string;
};

const backupRouteMachine = setup({
  types: {
    context: {} as {
      readonly activeTab: BackupTabIndex;
      readonly backupName: string;
      readonly errorMessage: string | null;
      readonly exportedFileName: string | null;
      readonly exportedJson: string;
      readonly importJson: string;
      readonly successMessage: string | null;
    },
    events: {} as BackupRouteEvent,
  },
  actors: {
    exportBackup: fromPromise<MobileBackupExportResult, string>(({ input }) =>
      RuntimeClient.runPromise(exportMobileBackup({ backupName: input }))
    ),
    importBackup: fromPromise<MobileBackupImportResult, string>(({ input }) =>
      RuntimeClient.runPromise(importMobileBackup({ json: input }))
    ),
  },
}).createMachine({
  context: () => ({
    activeTab: 0,
    backupName: "Mai backup",
    errorMessage: null,
    exportedFileName: null,
    exportedJson: "",
    importJson: "",
    successMessage: null,
  }),
  initial: "Idle",
  on: {
    changeBackupName: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeBackupName");

        return {
          backupName: event.backupName,
        };
      }),
    },
    changeImportJson: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeImportJson");

        return {
          importJson: event.json,
        };
      }),
    },
    selectTab: {
      actions: assign(({ event }) => {
        assertEvent(event, "selectTab");

        return {
          activeTab: event.index,
        };
      }),
    },
  },
  states: {
    Idle: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Exported: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ context }) => context.backupName,
        onDone: {
          target: "Exported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            exportedFileName: event.output.fileName,
            exportedJson: event.output.json,
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
    Failure: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Imported: {
      on: {
        export: {
          target: "Exporting",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
        import: {
          guard: ({ context }) => context.importJson.trim() !== "",
          target: "Importing",
          actions: assign({
            errorMessage: null,
            successMessage: null,
          }),
        },
      },
    },
    Importing: {
      invoke: {
        src: "importBackup",
        input: ({ context }) => context.importJson,
        onDone: {
          target: "Imported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            importJson: "",
            successMessage: event.output.message,
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: backupErrorMessage({ error: event.error }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

const localDataResetMachine = makeLocalDataResetMachine({
  restartApp: () => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.replace("/");
  },
  runtime: RuntimeClient,
});

export default function BackupScreen() {
  const [snapshot, send] = useMachine(backupRouteMachine);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const disabled = isExporting || isImporting;
  const {
    activeTab,
    backupName,
    errorMessage,
    exportedFileName,
    exportedJson,
    importJson,
  } = snapshot.context;
  const tabs = [
    {
      accessibilityLabel: "Export backup",
      key: "export",
      label: "Export",
    },
    {
      accessibilityLabel: "Import backup",
      key: "import",
      label: "Import",
    },
    {
      accessibilityLabel: "Reset local data",
      key: "reset",
      label: "Reset",
    },
  ] as const;

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

        {snapshot.context.successMessage === null ? null : (
          <Notice message={snapshot.context.successMessage} tone="success" />
        )}
        {errorMessage === null ? null : (
          <Notice
            message={errorMessage}
            title="Backup action failed"
            tone="danger"
          />
        )}

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={(index) => {
            send({
              index: index === 0 ? 0 : index === 1 ? 1 : 2,
              type: "selectTab",
            });
          }}
          tabBarPosition="bottom"
          tabs={[
            {
              ...tabs[0],
              content: (
                <ExportBackupTab
                  backupName={backupName}
                  disabled={disabled}
                  exportedFileName={exportedFileName}
                  exportedJson={exportedJson}
                  onChangeBackupName={(value) => {
                    send({
                      backupName: value,
                      type: "changeBackupName",
                    });
                  }}
                  onExport={() => {
                    send({
                      type: "export",
                    });
                  }}
                />
              ),
            },
            {
              ...tabs[1],
              content: (
                <ImportBackupTab
                  disabled={disabled}
                  importJson={importJson}
                  onChangeImportJson={(json) => {
                    send({
                      json,
                      type: "changeImportJson",
                    });
                  }}
                  onImport={() => {
                    send({
                      type: "import",
                    });
                  }}
                />
              ),
            },
            {
              ...tabs[2],
              content: <ResetDataTab disabled={disabled} />,
            },
          ]}
        />
      </AppScreen>

      <LoadingOverlay
        message={isImporting ? "Importing backup" : "Exporting backup"}
        visible={disabled}
      />
    </View>
  );
}

function ExportBackupTab({
  backupName,
  disabled,
  exportedFileName,
  exportedJson,
  onChangeBackupName,
  onExport,
}: {
  readonly backupName: string;
  readonly disabled: boolean;
  readonly exportedFileName: string | null;
  readonly exportedJson: string;
  readonly onChangeBackupName: (value: string) => void;
  readonly onExport: () => void;
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Export">
        <View style={styles.sectionBody}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Name"
            onChangeText={onChangeBackupName}
            placeholder="Mai backup"
            value={backupName}
          />
          {exportedJson === "" ? null : (
            <TextArea
              editable={false}
              label={exportedFileName ?? "Exported JSON"}
              selectTextOnFocus
              value={exportedJson}
            />
          )}
          <Button
            disabled={disabled}
            icon={Download}
            loading={disabled}
            onPress={onExport}
          >
            Export JSON
          </Button>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function ImportBackupTab({
  disabled,
  importJson,
  onChangeImportJson,
  onImport,
}: {
  readonly disabled: boolean;
  readonly importJson: string;
  readonly onChangeImportJson: (json: string) => void;
  readonly onImport: () => void;
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Import">
        <View style={styles.sectionBody}>
          <Text style={styles.warningText}>
            Import replaces the current data on this device.
          </Text>
          <TextArea
            editable={!disabled}
            label="Backup JSON"
            onChangeText={onChangeImportJson}
            placeholder='{"format":"mai.backup"...}'
            value={importJson}
          />
          <Button
            disabled={disabled || importJson.trim() === ""}
            icon={Upload}
            loading={disabled}
            onPress={onImport}
            variant="danger"
          >
            Import JSON
          </Button>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function ResetDataTab({ disabled }: { readonly disabled: boolean }) {
  const [snapshot, send] = useMachine(localDataResetMachine);
  const isIdle = snapshot.matches("Idle");
  const isConfirming =
    snapshot.matches("Confirming") || snapshot.matches("Failure");
  const isResetting = snapshot.matches("Resetting");
  const resetDisabled = disabled || isResetting;
  const canReset =
    snapshot.context.confirmationText === LocalDataResetConfirmationText;

  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} title="Reset">
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
                  {LocalDataResetConfirmationText}
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
                placeholder={LocalDataResetConfirmationText}
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
      </SectionCard>

      <LoadingOverlay message="Deleting local data" visible={isResetting} />
    </ScrollView>
  );
}

export function exportMobileBackup({
  backupName,
}: {
  readonly backupName: string;
}) {
  return Effect.gen(function* () {
    const backups = yield* Backups;
    const exportedBackup = yield* backups.exportToJson();
    const fileName = backupFileName({
      backup: exportedBackup.backup,
      backupName,
    });

    return {
      fileName,
      json: exportedBackup.json,
      message: `Exported ${fileName}. Select the JSON field to copy it.`,
    } satisfies MobileBackupExportResult;
  });
}

export function importMobileBackup({ json }: { readonly json: string }) {
  return Effect.gen(function* () {
    const backups = yield* Backups;
    const importedBackup = yield* backups.importFromJson({
      input: {
        json,
      },
    });

    return {
      message: backupImportMessage({ backup: importedBackup.backup }),
    } satisfies MobileBackupImportResult;
  });
}

export function backupFileName({
  backup,
  backupName,
}: {
  readonly backup: MaiBackup;
  readonly backupName: string;
}) {
  const exportedAt = new Date(DateTime.toEpochMillis(backup.source.exportedAt));
  const baseName = backupName.trim() === "" ? "mai-backup" : backupName.trim();
  const sanitizedName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fileNamePrefix =
    sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;

  return `${fileNamePrefix}-format-v${backup.formatVersion}-db-v${backup.source.databaseVersion}-${exportedAt.toISOString().slice(0, 10)}.json`;
}

export function backupImportMessage({
  backup,
}: {
  readonly backup: MaiBackup;
}) {
  const totalRecords =
    backup.integrity.counts.dailyLogs +
    backup.integrity.counts.foods +
    backup.integrity.counts.mealEntries +
    backup.integrity.counts.plans;

  return `Imported backup. Format v${backup.formatVersion}, database v${backup.source.databaseVersion}, ${totalRecords} records restored.`;
}

export function backupErrorMessage({ error }: { readonly error: unknown }) {
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
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionBody: {
    gap: spacing.md,
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
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  confirmationPhrase: {
    color: color.dangerText,
    fontWeight: type.weight.black,
  },
  resetErrorText: {
    color: color.dangerText,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  warningText: {
    color: color.dangerText,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
});
