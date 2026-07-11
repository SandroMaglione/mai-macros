import { DateTime, Effect, HashMap, Layer, Option, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { BodyWeights, Domain, Store } from "../src/index.ts";

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("BodyWeights", () => {
  it("imports unordered weight rows and upserts by normalized date", async () => {
    const existingEntry = await Effect.runPromise(
      Schema.decodeEffect(Domain.BodyWeightEntry)({
        createdAt: 123,
        dateKey: "2026-06-23",
        updatedAt: 123,
        weightKilograms: 76,
      })
    );
    const testContext = BodyWeightsTestContext({
      stores: {
        ...emptyStores,
        bodyWeightEntries: [existingEntry],
      },
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        return yield* bodyWeights.importBatch({
          input: {
            text: `
              26-06-26 77.40
              26-06-23 77.40
              26-06-22 77.05
              26-06-25 77.10
              26-06-27 77.30
              26-06-24 77.50
              26-06-24 78.00
            `,
          },
        });
      }).pipe(Effect.provide(testContext.layer))
    );
    const bodyWeightEntries = [...testContext.readStores().bodyWeightEntries];
    const byDateKey = HashMap.fromIterable(
      bodyWeightEntries.map(
        (entry): readonly [string, Domain.BodyWeightEntry] => [
          entry.dateKey,
          entry,
        ]
      )
    );
    const entry20260623 = HashMap.get(byDateKey, "2026-06-23").pipe(
      Option.getOrNull
    );
    const entry20260624 = HashMap.get(byDateKey, "2026-06-24").pipe(
      Option.getOrNull
    );

    bodyWeightEntries.sort((left, right) =>
      left.dateKey.localeCompare(right.dateKey)
    );

    assert.equal(result.savedBodyWeightEntries.length, 6);
    assert.deepEqual(
      bodyWeightEntries.map((entry) => entry.dateKey),
      [
        "2026-06-22",
        "2026-06-23",
        "2026-06-24",
        "2026-06-25",
        "2026-06-26",
        "2026-06-27",
      ]
    );
    assert.equal(entry20260624?.weightKilograms, 78);
    assert.equal(entry20260623?.weightKilograms, 77.4);
    assert.equal(
      entry20260623 === null
        ? null
        : DateTime.toEpochMillis(entry20260623.createdAt),
      123
    );
  });

  it("rejects invalid batch rows before writing entries", async () => {
    const testContext = BodyWeightsTestContext({
      stores: emptyStores,
    });

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        return yield* bodyWeights.importBatch({
          input: {
            text: "26-06-26 77.40\nnot-a-date 80",
          },
        });
      }).pipe(Effect.provide(testContext.layer), Effect.flip)
    );

    assert.instanceOf(failure, BodyWeights.InvalidBodyWeightBatchImport);
    assert.deepEqual(testContext.readStores().bodyWeightEntries, []);
  });
});

function BodyWeightsTestContext({
  stores,
}: {
  readonly stores: Store.NutritionStores;
}) {
  let currentStores = stores;
  const layer = BodyWeights.BodyWeights.layer.pipe(
    Layer.provide(
      Layer.succeed(Store.NutritionStore, {
        applyFoodEdit: () => Effect.void,
        countMealEntriesByDate: () => Effect.succeed(0),
        countMealEntriesByFood: () => Effect.succeed(0),
        countMealEntriesByMealIds: () => Effect.succeed(0),
        deleteBodyWeightEntry: (dateKey) =>
          Effect.sync(() => {
            currentStores = {
              ...currentStores,
              bodyWeightEntries: currentStores.bodyWeightEntries.filter(
                (bodyWeightEntry) => bodyWeightEntry.dateKey !== dateKey
              ),
            };
          }),
        deleteDailyLog: () => Effect.void,
        deleteMealEntry: () => Effect.void,
        findActiveMealPlanSelectionById: () => Effect.succeed([]),
        findBodyWeightEntriesByRange: ({ endDateKey, startDateKey }) =>
          Effect.sync(() =>
            currentStores.bodyWeightEntries.filter(
              (bodyWeightEntry) =>
                bodyWeightEntry.dateKey >= startDateKey &&
                bodyWeightEntry.dateKey <= endDateKey
            )
          ),
        findBodyWeightEntryByDateKey: (dateKey) =>
          Effect.sync(() =>
            currentStores.bodyWeightEntries.filter(
              (bodyWeightEntry) => bodyWeightEntry.dateKey === dateKey
            )
          ),
        findDailyLogByDateKey: () => Effect.succeed([]),
        findDailyLogsByPlan: () => Effect.succeed([]),
        findFoodById: () => Effect.succeed([]),
        findFoodsByName: () => Effect.succeed([]),
        findMealEntriesByDate: () => Effect.succeed([]),
        findMealEntryById: () => Effect.succeed([]),
        findPlanById: () => Effect.succeed([]),
        findPlansByName: () => Effect.succeed([]),
        insertFood: () => Effect.void,
        insertMealEntry: () => Effect.void,
        insertPlan: () => Effect.void,
        listBodyWeightEntries: Effect.sync(
          () => currentStores.bodyWeightEntries
        ),
        listDailyLogs: Effect.sync(() => currentStores.dailyLogs),
        listFoods: Effect.sync(() => currentStores.foods),
        listMealEntries: Effect.sync(() => currentStores.mealEntries),
        listPlans: Effect.sync(() => currentStores.plans),
        readStores: Effect.sync(() => currentStores),
        replaceStores: (nextStores) =>
          Effect.sync(() => {
            currentStores = nextStores;
          }),
        upsertActiveMealPlanSelection: () => Effect.void,
        upsertBodyWeightEntry: (bodyWeightEntry) =>
          Effect.sync(() => {
            currentStores = {
              ...currentStores,
              bodyWeightEntries: [
                ...currentStores.bodyWeightEntries.filter(
                  (currentBodyWeightEntry) =>
                    currentBodyWeightEntry.dateKey !== bodyWeightEntry.dateKey
                ),
                bodyWeightEntry,
              ],
            };
          }),
        upsertDailyLog: () => Effect.void,
        upsertFood: () => Effect.void,
        upsertFoods: () => Effect.void,
        upsertMealEntries: () => Effect.void,
        upsertMealEntry: () => Effect.void,
        upsertPlans: () => Effect.void,
      } satisfies Store.NutritionStore["Service"])
    )
  );

  return {
    layer,
    readStores: () => currentStores,
  };
}
