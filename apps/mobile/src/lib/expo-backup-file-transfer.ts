import { BackupFileTransfer } from "@mai/services";
import { Array as EffectArray, Effect, Layer } from "effect";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export const ExpoBackupFileTransferLayer = Layer.succeed(
  BackupFileTransfer.BackupFileTransfer,
  {
    pickFile: Effect.fn("ExpoBackupFileTransfer.pickFile")(function* ({
      mimeTypes,
    }: BackupFileTransfer.PickBackupFileInput) {
      const result = yield* Effect.tryPromise({
        try: () =>
          File.pickFileAsync({
            mimeTypes:
              mimeTypes !== undefined &&
              EffectArray.isReadonlyArrayNonEmpty(mimeTypes)
                ? [...mimeTypes]
                : "*/*",
          }),
        catch: (error) =>
          new BackupFileTransfer.BackupFileTransferError({
            detail: "The backup file picker could not be opened.",
            error,
            reason: "file-pick-failed",
          }),
      });

      if (result.canceled) {
        return new BackupFileTransfer.BackupFilePickCanceled();
      }

      const bytes = yield* Effect.tryPromise({
        try: () => result.result.bytes(),
        catch: (error) =>
          new BackupFileTransfer.BackupFileTransferError({
            detail: "The selected backup file could not be read.",
            error,
            reason: "file-pick-failed",
          }),
      });

      return new BackupFileTransfer.PickedBackupFile({
        bytes,
        fileName: result.result.name,
        uri: result.result.uri,
      });
    }),

    shareFile: Effect.fn("ExpoBackupFileTransfer.shareFile")(function* ({
      bytes,
      dialogTitle,
      fileName,
      mimeType,
      uti,
    }: BackupFileTransfer.ShareBackupFileInput) {
      const available = yield* Effect.tryPromise({
        try: () => Sharing.isAvailableAsync(),
        catch: (error) =>
          new BackupFileTransfer.BackupFileTransferError({
            detail: "The system share sheet could not be checked.",
            error,
            reason: "file-share-failed",
          }),
      });

      if (!available) {
        return yield* new BackupFileTransfer.BackupFileTransferError({
          detail: "The system share sheet is not available on this device.",
          reason: "file-share-unavailable",
        });
      }

      const file = yield* Effect.try({
        try: () => {
          const cacheFile = new File(Paths.cache, fileName);

          cacheFile.create({ overwrite: true });
          cacheFile.write(bytes);

          return cacheFile;
        },
        catch: (error) =>
          new BackupFileTransfer.BackupFileTransferError({
            detail: "The backup file could not be prepared for sharing.",
            error,
            reason: "file-share-failed",
          }),
      });

      yield* Effect.tryPromise({
        try: () =>
          Sharing.shareAsync(file.uri, {
            UTI: uti,
            dialogTitle,
            mimeType,
          }),
        catch: (error) =>
          new BackupFileTransfer.BackupFileTransferError({
            detail: "The backup file could not be shared.",
            error,
            reason: "file-share-failed",
          }),
      });

      return new BackupFileTransfer.SharedBackupFile({
        fileName,
      });
    }),
  }
);
