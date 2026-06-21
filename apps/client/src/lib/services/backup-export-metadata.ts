import {
  BackupDeliveryClient,
  BackupShareAborted,
  BackupShareFailed,
} from "@mai/machines/backups";
import { Effect, Layer } from "effect";

export { BackupExportMetadataStore } from "@mai/machines/backups";

export type {
  BackupExportMetadata,
  BackupTransferCounts,
} from "@mai/machines/backups";

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

export const BrowserBackupDeliveryClientLayer = Layer.succeed(
  BackupDeliveryClient,
  BackupDeliveryClient.of({
    deliver: DeliverBackup,
  })
);
