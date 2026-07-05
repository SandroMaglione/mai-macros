import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
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

const _DateKeyInput = Schema.Struct({
  dateKey: DateKey,
});

const _BodyWeightRangeInput = Schema.Struct({
  endDateKey: DateKey,
  startDateKey: DateKey,
});

export type SaveBodyWeightInput = typeof _SaveBodyWeightInput.Encoded;

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

export class BodyWeightEntryNotFound extends Data.TaggedError(
  "BodyWeightEntryNotFound"
)<{
  readonly dateKey: DateKey;
}> {}

export class BodyWeights extends Context.Service<BodyWeights>()("BodyWeights", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;

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
