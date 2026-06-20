import { Backups, type MaiBackup } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Data, DateTime, Effect, Option, Schema } from "effect";
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react";
import { useRef } from "react";
import { assertEvent, assign, fromPromise, setup } from "xstate";

import { RuntimeClient } from "../runtime-client.ts";
import {
  BackupExportMetadataStore,
  type BackupExportMetadata,
  type BackupTransferCounts,
} from "../services/backup-export-metadata.ts";

type BackupTransferMode = "full" | "importOnly";
type BackupTransferAction = "export" | "import";
type BackupExportDelivery = "downloaded" | "shared";

type BackupTransferResult = {
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
      readonly afterImport: () => Promise<void>;
      readonly file: File;
    };

class BackupShareAborted extends Data.TaggedError("BackupShareAborted")<{}> {}

class BackupShareFailed extends Data.TaggedError("BackupShareFailed")<{
  readonly message: string;
}> {}

class BackupFileReadFailed extends Data.TaggedError("BackupFileReadFailed")<{
  readonly message: string;
}> {}

class BackupAfterImportFailed extends Data.TaggedError(
  "BackupAfterImportFailed"
)<{
  readonly message: string;
}> {}

const backupPanelClassName =
  "grid gap-3 rounded-lg border border-[#29292d] bg-[#161618] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]";
const backupFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const backupPrimaryButtonClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-3 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60";
const backupSecondaryButtonClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-3 text-sm font-black text-[#ff5a51] transition-colors hover:bg-[#2a1c1a] disabled:cursor-not-allowed disabled:opacity-60";

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

  if (
    decodedError?._tag === "BackupFileReadFailed" ||
    decodedError?._tag === "BackupAfterImportFailed"
  ) {
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

const ImportBackup = ({
  afterImport,
  file,
}: {
  readonly afterImport: () => Promise<void>;
  readonly file: File;
}) =>
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

    yield* Effect.tryPromise({
      try: () => afterImport(),
      catch: (error) =>
        new BackupAfterImportFailed({
          message: ErrorMessageFromUnknown({ error }),
        }),
    });

    return BackupTransferResultFromBackup({
      action: "import",
      backup: importedBackup.backup,
      backupName: file.name,
      fileName: file.name,
    });
  });

const backupTransferMachine = setup({
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
        readonly afterImport: () => Promise<void>;
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
            afterImport: event.afterImport,
            file: event.file,
          };
        },
        onDone: {
          target: "Imported",
          actions: assign(({ event }) => ({
            errorMessage: null,
            successMessage: BackupResultMessage({ result: event.output }),
          })),
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

export function BackupTransferControls({
  afterImport,
  mode,
}: {
  readonly afterImport: () => Promise<void>;
  readonly mode: BackupTransferMode;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [snapshot, send] = useMachine(backupTransferMachine);
  const isExporting = snapshot.matches("Exporting");
  const isImporting = snapshot.matches("Importing");
  const isLoading = snapshot.matches("Loading");
  const disabled = isLoading || isExporting || isImporting;
  const showExport = mode === "full";
  const { backupName, errorMessage, lastExport, successMessage } =
    snapshot.context;

  return (
    <section className={backupPanelClassName} aria-label="Backups">
      <div className="grid gap-1">
        <h2 className="text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Backup
        </h2>
        {showExport ? (
          <p className="text-xs font-bold leading-tight text-[#77777e]">
            Format v1 / database v3 / dated JSON
          </p>
        ) : null}
      </div>

      {showExport ? (
        <BackupExportRecency isLoading={isLoading} metadata={lastExport} />
      ) : null}

      {showExport ? (
        <label className="grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]">
          Name
          <input
            autoComplete="off"
            className={backupFieldClassName}
            disabled={disabled}
            onChange={(event) => {
              send({
                type: "changeBackupName",
                backupName: event.currentTarget.value,
              });
            }}
            placeholder="Mai backup"
            value={backupName}
          />
        </label>
      ) : null}

      <input
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0) ?? null;

          event.currentTarget.value = "";

          if (file === null) {
            return;
          }

          send({
            type: "importFile",
            afterImport,
            file,
          });
        }}
        ref={inputRef}
        type="file"
      />

      <div className={showExport ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        {showExport ? (
          <button
            className={backupPrimaryButtonClassName}
            disabled={disabled}
            onClick={() => {
              send({ type: "export" });
            }}
            type="button"
          >
            {isExporting ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin"
                size={17}
                strokeWidth={3}
              />
            ) : (
              <Download aria-hidden="true" size={17} strokeWidth={3} />
            )}
            Export
          </button>
        ) : null}
        <button
          className={
            showExport
              ? backupSecondaryButtonClassName
              : backupPrimaryButtonClassName
          }
          disabled={disabled}
          onClick={() => {
            inputRef.current?.click();
          }}
          type="button"
        >
          <Upload aria-hidden="true" size={17} strokeWidth={3} />
          Import
        </button>
      </div>

      {errorMessage === null ? null : (
        <div
          className="flex min-w-0 items-start gap-2 rounded-md border border-[#74322f] bg-[#201717] p-3 text-sm font-bold leading-snug text-[#ff8f88]"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={17}
            strokeWidth={3}
          />
          <p className="min-w-0">{errorMessage}</p>
        </div>
      )}

      {successMessage === null ? null : (
        <p className="rounded-md border border-[#26492f] bg-[#132017] p-3 text-sm font-bold leading-snug text-[#8be09a]">
          {successMessage}
        </p>
      )}

      {isImporting ? (
        <div
          className="fixed inset-0 z-70 grid place-items-center bg-black/85 px-5 text-center backdrop-blur-sm"
          role="alert"
        >
          <div className="grid max-w-[320px] justify-items-center gap-3">
            <Loader2
              aria-hidden="true"
              className="animate-spin text-[#ff5a51]"
              size={34}
              strokeWidth={3}
            />
            <div className="grid gap-1">
              <p className="text-lg font-black leading-tight text-[#f0f0f2]">
                Importing backup
              </p>
              <p className="text-sm font-bold leading-snug text-[#aaaab1]">
                Replacing this device's current Mai data.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BackupExportRecency({
  isLoading,
  metadata,
}: {
  readonly isLoading: boolean;
  readonly metadata: BackupExportMetadata | null;
}) {
  if (isLoading) {
    return (
      <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
        Checking latest export on this device.
      </p>
    );
  }

  if (metadata === null) {
    return (
      <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
        No successful export on this device yet.
      </p>
    );
  }

  const exportedAt = new Date(metadata.exportedAtIso);
  const totalRecords =
    metadata.counts.dailyLogs +
    metadata.counts.foods +
    metadata.counts.mealEntries +
    metadata.counts.plans;
  const loggedDaysText =
    metadata.latestDateKey === undefined
      ? "No logged days included."
      : metadata.earliestDateKey === metadata.latestDateKey ||
          metadata.earliestDateKey === undefined
        ? `Included logged day ${metadata.latestDateKey}.`
        : `Included logged days ${metadata.earliestDateKey} through ${metadata.latestDateKey}.`;

  return (
    <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-xs font-bold leading-snug text-[#aaaab1]">
      Last export {exportedAt.toLocaleString()}. {loggedDaysText} {totalRecords}{" "}
      records saved.
    </p>
  );
}
