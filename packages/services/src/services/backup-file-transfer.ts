import { Context, Data, Effect, Schema } from "effect";

export const BackupFileTransferErrorReason = Schema.Literals([
  "file-pick-failed",
  "file-share-failed",
  "file-share-unavailable",
]);

export type BackupFileTransferErrorReason =
  typeof BackupFileTransferErrorReason.Type;

export class BackupFileTransferError extends Data.TaggedError(
  "BackupFileTransferError"
)<{
  readonly detail: string;
  readonly error?: unknown;
  readonly reason: BackupFileTransferErrorReason;
}> {}

export type ShareBackupFileInput = {
  readonly bytes: Uint8Array;
  readonly dialogTitle?: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly uti?: string;
};

export type PickBackupFileInput = {
  readonly mimeTypes?: readonly string[];
};

export class SharedBackupFile extends Data.TaggedClass("SharedBackupFile")<{
  readonly fileName: string;
}> {}

export class PickedBackupFile extends Data.TaggedClass("PickedBackupFile")<{
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly uri: string;
}> {}

export class BackupFilePickCanceled extends Data.TaggedClass(
  "BackupFilePickCanceled"
)<{}> {}

export type BackupFilePickResult = PickedBackupFile | BackupFilePickCanceled;

export class BackupFileTransfer extends Context.Service<
  BackupFileTransfer,
  {
    readonly pickFile: (
      input: PickBackupFileInput
    ) => Effect.Effect<BackupFilePickResult, BackupFileTransferError>;
    readonly shareFile: (
      input: ShareBackupFileInput
    ) => Effect.Effect<SharedBackupFile, BackupFileTransferError>;
  }
>()("BackupFileTransfer") {}
