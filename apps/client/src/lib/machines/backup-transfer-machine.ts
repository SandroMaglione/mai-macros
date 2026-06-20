import { Backups, type MaiBackup } from "@mai/nutrition";
import { Data, DateTime, Effect, Option, Schema } from "effect";
import {
  assertEvent,
  assign,
  fromPromise,
  sendParent,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";

import { RuntimeClient } from "../runtime-client.ts";
import {
  BackupExportMetadataStore,
  type BackupExportMetadata,
  type BackupTransferCounts,
} from "../services/backup-export-metadata.ts";

type BackupTransferAction = "export" | "import";
type BackupExportDelivery = "downloaded" | "shared";

export type BackupTransferResult = {
  readonly action: BackupTransferAction;
  readonly backupName: string;
  readonly counts: BackupTransferCounts;
  readonly databaseVersion: number;
  readonly delivery?: BackupExportDelivery;
  readonly earliestDateKey?: string;
  readonly exportedAt: string;
  readonly exportedAtIso: string;
  readonly fileName: string;
  readonly formatVersion: number;
  readonly latestDateKey?: string;
};

export type BackupTransferImportedEvent = {
  readonly type: "backupImported";
  readonly result: BackupTransferResult;
};

type BackupExportOutput = {
  readonly metadata: BackupExportMetadata;
  readonly result: BackupTransferResult;
};

type BackupTransferEvent =
  | {
      readonly type: "changeBackupName";
      readonly backupName: string;
    }
  | {
      readonly type: "export";
    }
  | {
      readonly type: "importFile";
      readonly file: File;
    };

class BackupShareAborted extends Data.TaggedError("BackupShareAborted")<{}> {}

class BackupShareFailed extends Data.TaggedError("BackupShareFailed")<{
  readonly message: string;
}> {}

class BackupFileReadFailed extends Data.TaggedError("BackupFileReadFailed")<{
  readonly message: string;
}> {}

const BackupTransferErrorSchema = Schema.Struct({
  _tag: Schema.String,
  detail: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});

const BackupIsoDate = ({ exportedAt }: { readonly exportedAt: Date }) =>
  exportedAt.toISOString().slice(0, 10);

const BackupFileName = ({
  backupName,
  databaseVersion,
  exportedAt,
  formatVersion,
}: {
  readonly backupName: string;
  readonly databaseVersion: number;
  readonly exportedAt: Date;
  readonly formatVersion: number;
}) => {
  const baseName = backupName.trim() === "" ? "mai-backup" : backupName.trim();
  const sanitizedName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fileNamePrefix =
    sanitizedName.trim() === "" ? "mai-backup" : sanitizedName;

  return `${fileNamePrefix}-format-v${formatVersion}-db-v${databaseVersion}-${BackupIsoDate({ exportedAt })}.json`;
};

const BackupTransferResultFromBackup = ({
  action,
  backup,
  backupName,
  delivery,
  fileName,
}: {
  readonly action: BackupTransferAction;
  readonly backup: MaiBackup;
  readonly backupName: string;
  readonly delivery?: BackupExportDelivery;
  readonly fileName: string;
}) => {
  const exportedAt = new Date(DateTime.toEpochMillis(backup.source.exportedAt));
  const sortedDailyLogDateKeys = backup.stores.dailyLogs
    .map((dailyLog) => dailyLog.dateKey)
    .sort();
  const earliestDateKey = sortedDailyLogDateKeys[0];
  const latestDateKey = sortedDailyLogDateKeys.at(-1);

  return {
    action,
    backupName,
    counts: backup.integrity.counts,
    databaseVersion: backup.source.databaseVersion,
    ...(delivery === undefined ? {} : { delivery }),
    ...(earliestDateKey === undefined ? {} : { earliestDateKey }),
    exportedAt: exportedAt.toLocaleString(),
    exportedAtIso: exportedAt.toISOString(),
    fileName,
    formatVersion: backup.formatVersion,
    ...(latestDateKey === undefined ? {} : { latestDateKey }),
  } satisfies BackupTransferResult;
};

const BackupExportMetadataFromResult = ({
  result,
}: {
  readonly result: BackupTransferResult;
}) => {
  return {
    counts: result.counts,
    ...(result.earliestDateKey === undefined
      ? {}
      : { earliestDateKey: result.earliestDateKey }),
    exportedAtIso: result.exportedAtIso,
    fileName: result.fileName,
    ...(result.latestDateKey === undefined
      ? {}
      : { latestDateKey: result.latestDateKey }),
  } satisfies BackupExportMetadata;
};

const BackupResultMessage = ({
  result,
}: {
  readonly result: BackupTransferResult;
}) => {
  const totalRecords =
    result.counts.dailyLogs +
    result.counts.foods +
    result.counts.mealEntries +
    result.counts.plans;

  if (result.action === "export") {
    const verb = result.delivery === "shared" ? "Shared" : "Downloaded";

    return `${verb} ${result.backupName} as ${result.fileName}. Format v${result.formatVersion}, database v${result.databaseVersion}, ${totalRecords} records, ${result.exportedAt}.`;
  }

  return `Imported ${result.fileName}. Format v${result.formatVersion}, database v${result.databaseVersion}, ${totalRecords} records restored from ${result.exportedAt}.`;
};

const BackupTransferErrorMessage = ({
  action,
  error,
}: {
  readonly action: BackupTransferAction;
  readonly error: unknown;
}) => {
  const decodedError = Schema.decodeUnknownOption(BackupTransferErrorSchema)(
    error
  ).pipe(Option.getOrNull);
  const actionLabel = action === "export" ? "export" : "import";

  if (decodedError?._tag === "BackupShareAborted") {
    return "Backup export was cancelled.";
  }

  if (decodedError?._tag === "BackupIntegrityError") {
    return `Could not ${actionLabel} the backup. ${decodedError.detail ?? "The backup data failed validation."}`;
  }

  if (decodedError?._tag === "SchemaError") {
    return action === "import"
      ? "Could not import the backup. Choose a valid Mai backup JSON file."
      : "Could not export the backup. The current data could not be encoded as a valid Mai backup.";
  }

  if (decodedError?._tag === "BackupFileReadFailed") {
    return `Could not ${actionLabel} the backup. ${decodedError.message ?? "The browser could not finish the file operation."}`;
  }

  return action === "import"
    ? "Could not import the backup. The current data was not replaced."
    : "Could not export the backup. Try again after refreshing the app.";
};

const ErrorMessageFromUnknown = ({ error }: { readonly error: unknown }) =>
  error instanceof Error ? error.message : "Unexpected browser error.";

const BrowserCanShareBackupFile = ({
  file,
}: {
  readonly file: File;
}): boolean =>
  typeof navigator.share === "function" &&
  typeof navigator.canShare === "function" &&
  navigator.canShare({ files: [file] });

const DownloadBackup = ({
  blob,
  fileName,
}: {
  readonly blob: Blob;
  readonly fileName: string;
}) =>
  Effect.sync(() => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  });

const ShareBackupFile = ({ file }: { readonly file: File }) =>
  Effect.tryPromise({
    try: () =>
      navigator.share({
        files: [file],
        title: file.name,
      }),
    catch: (error) =>
      error instanceof DOMException && error.name === "AbortError"
        ? new BackupShareAborted()
        : new BackupShareFailed({
            message: ErrorMessageFromUnknown({ error }),
          }),
  });

const DeliverBackup = ({
  fileName,
  json,
}: {
  readonly fileName: string;
  readonly json: string;
}) =>
  Effect.gen(function* () {
    const blob = new Blob([json], {
      type: "application/json",
    });
    const file =
      typeof File === "function"
        ? new File([blob], fileName, {
            type: "application/json",
          })
        : null;

    if (file !== null && BrowserCanShareBackupFile({ file })) {
      return yield* ShareBackupFile({ file }).pipe(
        Effect.as("shared" as const),
        Effect.catchTag("BackupShareFailed", () =>
          DownloadBackup({ blob, fileName }).pipe(
            Effect.as("downloaded" as const)
          )
        )
      );
    }

    return yield* DownloadBackup({ blob, fileName }).pipe(
      Effect.as("downloaded" as const)
    );
  });

const ExportBackup = ({ backupName }: { readonly backupName: string }) =>
  Effect.gen(function* () {
    const backups = yield* Backups;
    const metadataStore = yield* BackupExportMetadataStore;
    const exportedBackup = yield* backups.exportToJson();
    const exportedAt = new Date(
      DateTime.toEpochMillis(exportedBackup.backup.source.exportedAt)
    );
    const fileName = BackupFileName({
      backupName,
      databaseVersion: exportedBackup.backup.source.databaseVersion,
      exportedAt,
      formatVersion: exportedBackup.backup.formatVersion,
    });
    const delivery = yield* DeliverBackup({
      fileName,
      json: exportedBackup.json,
    });
    const result = BackupTransferResultFromBackup({
      action: "export",
      backup: exportedBackup.backup,
      backupName: backupName.trim() === "" ? "Mai backup" : backupName,
      delivery,
      fileName,
    });
    const metadata = BackupExportMetadataFromResult({ result });

    yield* metadataStore.setLatest({ metadata });

    return {
      metadata,
      result,
    } satisfies BackupExportOutput;
  });

const ImportBackup = ({ file }: { readonly file: File }) =>
  Effect.gen(function* () {
    const json = yield* Effect.tryPromise({
      try: () => file.text(),
      catch: (error) =>
        new BackupFileReadFailed({
          message: ErrorMessageFromUnknown({ error }),
        }),
    });
    const backups = yield* Backups;
    const importedBackup = yield* backups.importFromJson({
      input: { json },
    });

    return BackupTransferResultFromBackup({
      action: "import",
      backup: importedBackup.backup,
      backupName: file.name,
      fileName: file.name,
    });
  });

export const backupTransferMachine = setup({
  types: {
    context: {} as {
      readonly backupName: string;
      readonly errorMessage: string | null;
      readonly lastExport: BackupExportMetadata | null;
      readonly successMessage: string | null;
    },
    events: {} as BackupTransferEvent,
  },
  actors: {
    exportBackup: fromPromise<
      BackupExportOutput,
      { readonly backupName: string }
    >(({ input }) => RuntimeClient.runPromise(ExportBackup(input))),
    importBackup: fromPromise<
      BackupTransferResult,
      {
        readonly file: File;
      }
    >(({ input }) => RuntimeClient.runPromise(ImportBackup(input))),
    loadLastExport: fromPromise<BackupExportMetadata | null>(async () => {
      const metadata = await RuntimeClient.runPromise(
        Effect.gen(function* () {
          const metadataStore = yield* BackupExportMetadataStore;

          return yield* metadataStore.getLatest();
        })
      );

      return metadata.pipe(Option.getOrNull);
    }),
  },
}).createMachine({
  context: () => ({
    backupName: "Mai backup",
    errorMessage: null,
    lastExport: null,
    successMessage: null,
  }),
  initial: "Loading",
  on: {
    changeBackupName: {
      actions: assign(({ event }) => {
        assertEvent(event, "changeBackupName");

        return {
          backupName: event.backupName,
        };
      }),
    },
  },
  states: {
    Loading: {
      invoke: {
        src: "loadLastExport",
        onDone: {
          target: "Idle",
          actions: assign(({ event }) => ({
            lastExport: event.output,
          })),
        },
        onError: {
          target: "Idle",
        },
      },
    },
    Idle: {
      on: {
        export: {
          target: "Exporting",
        },
        importFile: {
          target: "Importing",
        },
      },
    },
    Exported: {
      on: {
        export: {
          target: "Exporting",
        },
        importFile: {
          target: "Importing",
        },
      },
    },
    Imported: {
      on: {
        export: {
          target: "Exporting",
        },
        importFile: {
          target: "Importing",
        },
      },
    },
    Failure: {
      on: {
        export: {
          target: "Exporting",
        },
        importFile: {
          target: "Importing",
        },
      },
    },
    Exporting: {
      invoke: {
        src: "exportBackup",
        input: ({ context }) => ({
          backupName: context.backupName,
        }),
        onDone: {
          target: "Exported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            lastExport: event.output.metadata,
            successMessage: BackupResultMessage({
              result: event.output.result,
            }),
          })),
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: BackupTransferErrorMessage({
              action: "export",
              error: event.error,
            }),
            successMessage: null,
          })),
        },
      },
    },
    Importing: {
      invoke: {
        src: "importBackup",
        input: ({ event }) => {
          assertEvent(event, "importFile");

          return {
            file: event.file,
          };
        },
        onDone: {
          target: "Imported",
          actions: [
            assign(({ event }) => ({
              errorMessage: null,
              successMessage: BackupResultMessage({ result: event.output }),
            })),
            sendParent(
              ({ event }) =>
                ({
                  type: "backupImported",
                  result: event.output,
                }) satisfies BackupTransferImportedEvent
            ),
          ],
        },
        onError: {
          target: "Failure",
          actions: assign(({ event }) => ({
            errorMessage: BackupTransferErrorMessage({
              action: "import",
              error: event.error,
            }),
            successMessage: null,
          })),
        },
      },
    },
  },
});

export type BackupTransferActorRef = ActorRefFrom<typeof backupTransferMachine>;
export type BackupTransferSnapshot = SnapshotFrom<typeof backupTransferMachine>;
