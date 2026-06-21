import {
  AppScreen,
  Button,
  Field,
  IconButton,
  LoadingOverlay,
  MaiHeader,
  Notice,
  SectionCard,
  TextArea,
} from "@/components/ui";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, type } from "@/theme/tokens";
import { Backups, type MaiBackup } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect } from "effect";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type BackupRouteEvent =
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
  const { backupName, errorMessage, exportedFileName, exportedJson } =
    snapshot.context;

  return (
    <View style={styles.screen}>
      <AppScreen
        scroll
        contentStyle={styles.content}
        scrollProps={{
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: false,
        }}
      >
        <MaiHeader
          action={
            <IconButton
              accessibilityLabel="Back"
              glyph="‹"
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

        <SectionCard style={styles.card} title="Export">
          <View style={styles.sectionBody}>
            <Field
              autoCapitalize="words"
              autoCorrect={false}
              editable={!disabled}
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
              loading={isExporting}
              onPress={() => {
                send({
                  type: "export",
                });
              }}
            >
              Export JSON
            </Button>
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

        <SectionCard style={styles.card} title="Import">
          <View style={styles.sectionBody}>
            <Text style={styles.warningText}>
              Import replaces the current data on this device.
            </Text>
            <TextArea
              editable={!disabled}
              label="Backup JSON"
              onChangeText={(json) => {
                send({
                  json,
                  type: "changeImportJson",
                });
              }}
              placeholder='{"format":"mai.backup"...}'
              value={snapshot.context.importJson}
            />
            <Button
              disabled={snapshot.context.importJson.trim() === ""}
              loading={isImporting}
              onPress={() => {
                send({
                  type: "import",
                });
              }}
              variant="danger"
            >
              Import JSON
            </Button>
          </View>
        </SectionCard>
      </AppScreen>
      <LoadingOverlay
        message={isImporting ? "Importing backup" : "Exporting backup"}
        visible={disabled}
      />
    </View>
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
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: color.surface,
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
});
