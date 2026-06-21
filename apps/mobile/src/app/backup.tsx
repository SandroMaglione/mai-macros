import {
  AppScreen,
  BottomActionBar,
  Button,
  Field,
  IconButton,
  LoadingOverlay,
  MaiHeader,
  Notice,
  PagerTabs,
  SectionCard,
  TextArea,
} from "@/components/ui";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, type } from "@/theme/tokens";
import { Backups, type MaiBackup } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { router } from "expo-router";
import { ChevronLeft, Download, Upload } from "lucide-react-native";
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

type BackupTabIndex = 0 | 1;

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

export default function BackupScreen() {
  const [snapshot, send] = useMachine(backupRouteMachine);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const disabled = isExporting || isImporting;
  const isExportTab = snapshot.context.activeTab === 0;
  const {
    activeTab,
    backupName,
    errorMessage,
    exportedFileName,
    exportedJson,
    importJson,
  } = snapshot.context;

  return (
    <View style={styles.screen}>
      <AppScreen contentStyle={styles.content} safeAreaEdges={["top"]}>
        <MaiHeader
          action={
            <IconButton
              accessibilityLabel="Back"
              icon={ChevronLeft}
              onPress={() => {
                router.back();
              }}
              variant="ghost"
            />
          }
          eyebrow="Database"
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
              index: index === 0 ? 0 : 1,
              type: "selectTab",
            });
          }}
          tabs={[
            {
              accessibilityLabel: "Export backup",
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
                />
              ),
              key: "export",
              label: "Export",
            },
            {
              accessibilityLabel: "Import backup",
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
                />
              ),
              key: "import",
              label: "Import",
            },
          ]}
        />
      </AppScreen>

      <BottomActionBar>
        <Button
          disabled={disabled || (!isExportTab && importJson.trim() === "")}
          icon={isExportTab ? Download : Upload}
          loading={disabled}
          onPress={() => {
            send({
              type: isExportTab ? "export" : "import",
            });
          }}
          style={styles.footerButton}
          variant={isExportTab ? "primary" : "danger"}
        >
          {isExportTab ? "Export JSON" : "Import JSON"}
        </Button>
      </BottomActionBar>

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
}: {
  readonly backupName: string;
  readonly disabled: boolean;
  readonly exportedFileName: string | null;
  readonly exportedJson: string;
  readonly onChangeBackupName: (value: string) => void;
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
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function ImportBackupTab({
  disabled,
  importJson,
  onChangeImportJson,
}: {
  readonly disabled: boolean;
  readonly importJson: string;
  readonly onChangeImportJson: (json: string) => void;
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
        </View>
      </SectionCard>
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
  warningText: {
    color: color.dangerText,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  footerButton: {
    flex: 1,
  },
});
