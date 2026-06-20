import { Context, Effect, Layer, Option, Schema } from "effect";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";

const backupExportMetadataStorageKey = "latestSuccessfulExport";

const BackupTransferCounts = Schema.Struct({
  activeMealPlanSelections: Schema.Number,
  dailyLogs: Schema.Number,
  foods: Schema.Number,
  mealEntries: Schema.Number,
  plans: Schema.Number,
});

export type BackupTransferCounts = typeof BackupTransferCounts.Type;

export const BackupExportMetadata = Schema.Struct({
  counts: BackupTransferCounts,
  earliestDateKey: Schema.optional(Schema.String),
  exportedAtIso: Schema.String,
  fileName: Schema.String,
  latestDateKey: Schema.optional(Schema.String),
});

export type BackupExportMetadata = typeof BackupExportMetadata.Type;

export class BackupExportMetadataStore extends Context.Service<BackupExportMetadataStore>()(
  "BackupExportMetadataStore",
  {
    make: Effect.gen(function* () {
      const keyValueStore = yield* KeyValueStore.KeyValueStore;
      const schemaStore = KeyValueStore.toSchemaStore(
        KeyValueStore.prefix(keyValueStore, "mai.backup."),
        BackupExportMetadata
      );

      return {
        getLatest: Effect.fn("BackupExportMetadataStore.getLatest")(
          function* () {
            return yield* schemaStore.get(backupExportMetadataStorageKey).pipe(
              Effect.catchTags({
                KeyValueStoreError: () => Effect.succeed(Option.none()),
                SchemaError: () => Effect.succeed(Option.none()),
              })
            );
          }
        ),
        setLatest: Effect.fn("BackupExportMetadataStore.setLatest")(function* ({
          metadata,
        }: {
          readonly metadata: BackupExportMetadata;
        }) {
          return yield* schemaStore.set(
            backupExportMetadataStorageKey,
            metadata
          );
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}
