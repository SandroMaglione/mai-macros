import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  HashMap,
  Layer,
  Option,
  Schema,
} from "effect";

import { BodyWeightEntry, DateKey } from "../domain.ts";
import { NutritionStore } from "./store.ts";

const _FormBodyWeightKilograms = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0)
);

const _SaveBodyWeightInput = Schema.Struct({
  dateKey: DateKey,
  weightKilograms: _FormBodyWeightKilograms,
});

const _ImportBodyWeightsInput = Schema.Struct({
  text: Schema.String,
});

const _DateKeyInput = Schema.Struct({
  dateKey: DateKey,
});

const _BodyWeightRangeInput = Schema.Struct({
  endDateKey: DateKey,
  startDateKey: DateKey,
});

export type SaveBodyWeightInput = typeof _SaveBodyWeightInput.Encoded;

export type ImportBodyWeightsInput = typeof _ImportBodyWeightsInput.Encoded;

export type BodyWeightDateKeyInput = typeof _DateKeyInput.Encoded;

export type BodyWeightRangeInput = typeof _BodyWeightRangeInput.Encoded;

export class SavedBodyWeightEntry extends Data.TaggedClass(
  "SavedBodyWeightEntry"
)<{
  readonly bodyWeightEntry: BodyWeightEntry;
  readonly previousBodyWeightEntry: BodyWeightEntry | null;
}> {}

export class DeletedBodyWeightEntry extends Data.TaggedClass(
  "DeletedBodyWeightEntry"
)<{
  readonly bodyWeightEntry: BodyWeightEntry;
}> {}

export class ImportedBodyWeightEntries extends Data.TaggedClass(
  "ImportedBodyWeightEntries"
)<{
  readonly savedBodyWeightEntries: readonly SavedBodyWeightEntry[];
}> {}

export class BodyWeightEntryNotFound extends Data.TaggedError(
  "BodyWeightEntryNotFound"
)<{
  readonly dateKey: DateKey;
}> {}

export class InvalidBodyWeightBatchImport extends Data.TaggedError(
  "InvalidBodyWeightBatchImport"
)<{
  readonly line: string | null;
  readonly lineNumber: number | null;
  readonly reason:
    | "empty-input"
    | "invalid-date"
    | "invalid-line"
    | "invalid-weight";
}> {}

export class BodyWeights extends Context.Service<BodyWeights>()("BodyWeights", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const saveDecodedInput = Effect.fn("BodyWeights.saveDecodedInput")(
      function* (decodedInput: typeof _SaveBodyWeightInput.Type) {
        const existingEntries = yield* store.findBodyWeightEntryByDateKey(
          decodedInput.dateKey
        );
        const previousBodyWeightEntry = Array.head(existingEntries).pipe(
          Option.getOrNull
        );
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const bodyWeightEntry = yield* Schema.decodeEffect(BodyWeightEntry)({
          dateKey: decodedInput.dateKey,
          weightKilograms: decodedInput.weightKilograms,
          createdAt:
            previousBodyWeightEntry === null
              ? now
              : DateTime.toEpochMillis(previousBodyWeightEntry.createdAt),
          updatedAt: now,
        });

        yield* store.upsertBodyWeightEntry(bodyWeightEntry);

        return new SavedBodyWeightEntry({
          bodyWeightEntry,
          previousBodyWeightEntry,
        });
      }
    );

    return {
      findByDate: Effect.fn("BodyWeights.findByDate")(function* ({
        input,
      }: {
        readonly input: BodyWeightDateKeyInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_DateKeyInput)(input);
        const entries = yield* store.findBodyWeightEntryByDateKey(
          decodedInput.dateKey
        );

        return Array.head(entries).pipe(Option.getOrNull);
      }),

      list: Effect.fn("BodyWeights.list")(function* () {
        return yield* store.listBodyWeightEntries;
      }),

      listRange: Effect.fn("BodyWeights.listRange")(function* ({
        input,
      }: {
        readonly input: BodyWeightRangeInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_BodyWeightRangeInput)(
          input
        );

        return yield* store.findBodyWeightEntriesByRange(decodedInput);
      }),

      save: Effect.fn("BodyWeights.save")(function* ({
        input,
      }: {
        readonly input: SaveBodyWeightInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_SaveBodyWeightInput)(input);

        return yield* saveDecodedInput(decodedInput);
      }),

      importBatch: Effect.fn("BodyWeights.importBatch")(function* ({
        input,
      }: {
        readonly input: ImportBodyWeightsInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          _ImportBodyWeightsInput
        )(input);
        const lines = decodedInput.text
          .split(/\r?\n/)
          .map((line, index) => ({
            line: line.trim(),
            lineNumber: index + 1,
          }))
          .filter(({ line }) => line.length > 0);

        if (!Array.isReadonlyArrayNonEmpty(lines)) {
          return yield* new InvalidBodyWeightBatchImport({
            line: null,
            lineNumber: null,
            reason: "empty-input",
          });
        }

        const entries = yield* Effect.forEach(lines, ({ line, lineNumber }) =>
          Effect.gen(function* () {
            const match = line.match(
              /^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})[\s,;]+([+-]?\d+(?:[.,]\d+)?)$/
            );

            if (match === null) {
              return yield* new InvalidBodyWeightBatchImport({
                line,
                lineNumber,
                reason: "invalid-line",
              });
            }

            const yearToken = match[1] ?? "";
            const monthToken = match[2] ?? "";
            const dayToken = match[3] ?? "";
            const weightToken = match[4] ?? "";
            const year =
              yearToken.length === 2
                ? 2000 + Number(yearToken)
                : Number(yearToken);
            const month = Number(monthToken);
            const day = Number(dayToken);
            const date = new Date(Date.UTC(year, month - 1, day));
            const isValidDate =
              date.getUTCFullYear() === year &&
              date.getUTCMonth() === month - 1 &&
              date.getUTCDate() === day;

            if (!isValidDate) {
              return yield* new InvalidBodyWeightBatchImport({
                line,
                lineNumber,
                reason: "invalid-date",
              });
            }

            const dateKey = yield* Schema.decodeEffect(DateKey)(
              `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
                2,
                "0"
              )}`
            ).pipe(
              Effect.mapError(
                () =>
                  new InvalidBodyWeightBatchImport({
                    line,
                    lineNumber,
                    reason: "invalid-date",
                  })
              )
            );

            return yield* Schema.decodeEffect(_SaveBodyWeightInput)({
              dateKey,
              weightKilograms: weightToken.replace(",", "."),
            }).pipe(
              Effect.mapError(
                () =>
                  new InvalidBodyWeightBatchImport({
                    line,
                    lineNumber,
                    reason: "invalid-weight",
                  })
              )
            );
          })
        );
        const entriesByDateKey = entries.reduce(
          (currentEntriesByDateKey, entry) =>
            HashMap.set(currentEntriesByDateKey, entry.dateKey, entry),
          HashMap.empty<DateKey, typeof _SaveBodyWeightInput.Type>()
        );
        const savedBodyWeightEntries = yield* Effect.forEach(
          HashMap.toValues(entriesByDateKey),
          saveDecodedInput
        );

        return new ImportedBodyWeightEntries({
          savedBodyWeightEntries,
        });
      }),

      delete: Effect.fn("BodyWeights.delete")(function* ({
        input,
      }: {
        readonly input: BodyWeightDateKeyInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_DateKeyInput)(input);
        const entries = yield* store.findBodyWeightEntryByDateKey(
          decodedInput.dateKey
        );
        const bodyWeightEntry = yield* Array.head(entries).pipe(
          Option.match({
            onNone: () =>
              new BodyWeightEntryNotFound({
                dateKey: decodedInput.dateKey,
              }),
            onSome: Effect.succeed,
          })
        );

        yield* store.deleteBodyWeightEntry(decodedInput.dateKey);

        return new DeletedBodyWeightEntry({
          bodyWeightEntry,
        });
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}
