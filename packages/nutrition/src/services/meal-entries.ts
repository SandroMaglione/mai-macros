import { DateKey, FoodId, MealEntry, MealEntryId, MealId } from "../domain.ts";
import {
  Array,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Order,
  Schema,
} from "effect";

import { NutritionStore } from "./store.ts";

const _FormPositiveNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0)
);

const _CreateMealEntryInputSchema = Schema.Struct({
  dateKey: DateKey,
  mealId: MealId,
  foodId: FoodId,
  quantityGrams: _FormPositiveNumber,
});

const _ListMealEntriesForDayInput = Schema.Struct({
  dateKey: DateKey,
});

const _ReviseMealEntryInput = Schema.Struct({
  mealEntryId: MealEntryId,
  quantityGrams: _FormPositiveNumber,
});

const _DeleteMealEntryInput = Schema.Struct({
  mealEntryId: MealEntryId,
});

const _mealEntryCreatedAtOrder = Order.mapInput(
  Order.Number,
  (mealEntry: MealEntry) => mealEntry.createdAt.epochMilliseconds
);

export type CreateMealEntryInput = {
  readonly dateKey: string;
  readonly mealId: string;
  readonly foodId: string;
  readonly quantityGrams: string;
};

export type DeleteMealEntryInput = typeof _DeleteMealEntryInput.Encoded;

export type ListMealEntriesForDayInput =
  typeof _ListMealEntriesForDayInput.Encoded;

export type ReviseMealEntryInput = typeof _ReviseMealEntryInput.Encoded;

export type MealFoodUsage = {
  readonly foodId: FoodId;
  readonly latestQuantityGrams: MealEntry["quantityGrams"];
  readonly latestUsedAt: MealEntry["createdAt"];
  readonly meals: readonly {
    readonly latestUsedAt: MealEntry["createdAt"];
    readonly mealId: MealEntry["mealId"];
  }[];
};

export class CreatedMealEntry extends Data.TaggedClass("CreatedMealEntry")<{
  readonly mealEntry: MealEntry;
}> {}

export class DeletedMealEntry extends Data.TaggedClass("DeletedMealEntry")<{
  readonly mealEntry: MealEntry;
}> {}

export class FoodNotFound extends Data.TaggedError("FoodNotFound")<{
  readonly foodId: FoodId;
}> {}

export class MealEntryNotFound extends Data.TaggedError("MealEntryNotFound")<{
  readonly mealEntryId: MealEntryId;
}> {}

export class MealNotFound extends Data.TaggedError("MealNotFound")<{
  readonly mealId: MealId;
}> {}

export class RevisedMealEntry extends Data.TaggedClass("RevisedMealEntry")<{
  readonly mealEntry: MealEntry;
  readonly previousMealEntry: MealEntry;
}> {}

export class MealEntries extends Context.Service<MealEntries>()("MealEntries", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const crypto = yield* Crypto.Crypto;

    return {
      listForDay: Effect.fn("MealEntries.listForDay")(function* ({
        input,
      }: {
        readonly input: ListMealEntriesForDayInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          _ListMealEntriesForDayInput
        )(input);
        const mealEntries = yield* store.findMealEntriesByDate(
          decodedInput.dateKey
        );

        return Array.sortBy(_mealEntryCreatedAtOrder)(mealEntries);
      }),

      listFoodUsage: Effect.fn("MealEntries.listFoodUsage")(function* () {
        const mealEntries = yield* store.listMealEntries;

        return mealEntries.reduce<readonly MealFoodUsage[]>(
          (foodUsage, mealEntry) => {
            const existingFoodUsage = foodUsage.find(
              (usage) => usage.foodId === mealEntry.foodId
            );

            if (existingFoodUsage === undefined) {
              return [
                ...foodUsage,
                {
                  foodId: mealEntry.foodId,
                  latestQuantityGrams: mealEntry.quantityGrams,
                  latestUsedAt: mealEntry.createdAt,
                  meals: [
                    {
                      latestUsedAt: mealEntry.createdAt,
                      mealId: mealEntry.mealId,
                    },
                  ],
                },
              ];
            }

            const latestFoodUsage =
              mealEntry.createdAt.epochMilliseconds >=
              existingFoodUsage.latestUsedAt.epochMilliseconds
                ? {
                    latestQuantityGrams: mealEntry.quantityGrams,
                    latestUsedAt: mealEntry.createdAt,
                  }
                : {};
            const existingMealUsage = existingFoodUsage.meals.find(
              (usage) => usage.mealId === mealEntry.mealId
            );
            const meals =
              existingMealUsage === undefined
                ? [
                    ...existingFoodUsage.meals,
                    {
                      latestUsedAt: mealEntry.createdAt,
                      mealId: mealEntry.mealId,
                    },
                  ]
                : existingFoodUsage.meals.map((usage) =>
                    usage.mealId === mealEntry.mealId &&
                    mealEntry.createdAt.epochMilliseconds >=
                      usage.latestUsedAt.epochMilliseconds
                      ? {
                          latestUsedAt: mealEntry.createdAt,
                          mealId: mealEntry.mealId,
                        }
                      : usage
                  );

            return foodUsage.map((usage) =>
              usage.foodId === mealEntry.foodId
                ? {
                    ...usage,
                    ...latestFoodUsage,
                    meals,
                  }
                : usage
            );
          },
          []
        );
      }),

      create: Effect.fn("MealEntries.create")(function* ({
        input,
      }: {
        readonly input: CreateMealEntryInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          _CreateMealEntryInputSchema
        )(input);

        const foods = yield* store.findFoodById(decodedInput.foodId);

        return yield* Array.head(foods).pipe(
          Option.match({
            onNone: () =>
              new FoodNotFound({
                foodId: decodedInput.foodId,
              }),
            onSome: () =>
              Effect.gen(function* () {
                const dailyLogs = yield* store.findDailyLogByDateKey(
                  decodedInput.dateKey
                );
                const dailyLog = yield* Array.head(dailyLogs).pipe(
                  Option.match({
                    onNone: () =>
                      new MealNotFound({
                        mealId: decodedInput.mealId,
                      }),
                    onSome: Effect.succeed,
                  })
                );
                const plans = yield* store.findPlanById(dailyLog.planId);
                const plan = yield* Array.head(plans).pipe(
                  Option.match({
                    onNone: () =>
                      new MealNotFound({
                        mealId: decodedInput.mealId,
                      }),
                    onSome: Effect.succeed,
                  })
                );

                if (
                  !plan.meals.some((meal) => meal.id === decodedInput.mealId)
                ) {
                  return yield* new MealNotFound({
                    mealId: decodedInput.mealId,
                  });
                }

                const now = DateTime.toEpochMillis(yield* DateTime.now);
                const mealEntry = yield* Schema.decodeEffect(MealEntry)({
                  id: yield* crypto.randomUUIDv4,
                  dateKey: decodedInput.dateKey,
                  mealId: decodedInput.mealId,
                  foodId: decodedInput.foodId,
                  quantityGrams: decodedInput.quantityGrams,
                  createdAt: now,
                  updatedAt: now,
                });

                yield* store.insertMealEntry(mealEntry);

                return new CreatedMealEntry({
                  mealEntry,
                });
              }),
          })
        );
      }),

      revise: Effect.fn("MealEntries.revise")(function* ({
        input,
      }: {
        readonly input: ReviseMealEntryInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_ReviseMealEntryInput)(
          input
        );
        const mealEntries = yield* store.findMealEntryById(
          decodedInput.mealEntryId
        );

        return yield* Array.head(mealEntries).pipe(
          Option.match({
            onNone: () =>
              new MealEntryNotFound({
                mealEntryId: decodedInput.mealEntryId,
              }),
            onSome: (previousMealEntry) =>
              Effect.gen(function* () {
                const encodedPreviousMealEntry =
                  yield* Schema.encodeEffect(MealEntry)(previousMealEntry);
                const mealEntry = yield* Schema.decodeEffect(MealEntry)({
                  ...encodedPreviousMealEntry,
                  quantityGrams: decodedInput.quantityGrams,
                  updatedAt: DateTime.toEpochMillis(yield* DateTime.now),
                });

                yield* store.upsertMealEntry(mealEntry);

                return new RevisedMealEntry({
                  mealEntry,
                  previousMealEntry,
                });
              }),
          })
        );
      }),

      delete: Effect.fn("MealEntries.delete")(function* ({
        input,
      }: {
        readonly input: DeleteMealEntryInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_DeleteMealEntryInput)(
          input
        );
        const mealEntries = yield* store.findMealEntryById(
          decodedInput.mealEntryId
        );

        return yield* Array.head(mealEntries).pipe(
          Option.match({
            onNone: () =>
              new MealEntryNotFound({
                mealEntryId: decodedInput.mealEntryId,
              }),
            onSome: (mealEntry) =>
              Effect.gen(function* () {
                yield* store.deleteMealEntry(decodedInput.mealEntryId);

                return new DeletedMealEntry({
                  mealEntry,
                });
              }),
          })
        );
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}
