import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { BodyWeightReports, Domain, Store } from "../src/index.ts";

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("BodyWeightReports", () => {
  it("keeps raw outliers but excludes them from the trend", async () => {
    const entries = await Effect.runPromise(
      Effect.forEach(
        [
          {
            dateKey: "2026-06-01",
            weightKilograms: 80,
          },
          {
            dateKey: "2026-06-02",
            weightKilograms: 80.2,
          },
          {
            dateKey: "2026-06-03",
            weightKilograms: 95,
          },
          {
            dateKey: "2026-06-04",
            weightKilograms: 80.3,
          },
          {
            dateKey: "2026-06-05",
            weightKilograms: 80.4,
          },
        ],
        ({ dateKey, weightKilograms }) =>
          Schema.decodeEffect(Domain.BodyWeightEntry)({
            createdAt: 0,
            dateKey,
            updatedAt: 0,
            weightKilograms,
          })
      )
    );
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const reports = yield* BodyWeightReports.BodyWeightReports;

        return yield* reports.getRange({
          input: {
            endDateKey: "2026-06-05",
            startDateKey: "2026-06-01",
          },
        });
      }).pipe(
        Effect.provide(
          BodyWeightReportsTestLayer({
            stores: {
              ...emptyStores,
              bodyWeightEntries: entries,
            },
          })
        )
      )
    );

    assert.equal(report.entries.length, 5);
    assert.deepEqual(
      report.outliers.map((outlier) => outlier.entry.dateKey),
      ["2026-06-03"]
    );
    assert.deepEqual(
      report.trendPoints.map((point) => point.dateKey),
      ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05"]
    );
    assert.deepEqual(
      report.stableTrendPoints.map((point) => point.dateKey),
      ["2026-06-01", "2026-06-02", "2026-06-04", "2026-06-05"]
    );
  });

  it("calculates the latest stable weight from a trailing recency-weighted window", async () => {
    const entries = await Effect.runPromise(
      Effect.forEach(
        [
          {
            dateKey: "2026-06-01",
            weightKilograms: 80,
          },
          {
            dateKey: "2026-06-08",
            weightKilograms: 84,
          },
          {
            dateKey: "2026-06-16",
            weightKilograms: 88,
          },
        ],
        ({ dateKey, weightKilograms }) =>
          Schema.decodeEffect(Domain.BodyWeightEntry)({
            createdAt: 0,
            dateKey,
            updatedAt: 0,
            weightKilograms,
          })
      )
    );
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const reports = yield* BodyWeightReports.BodyWeightReports;

        return yield* reports.getRange({
          input: {
            endDateKey: "2026-06-16",
            startDateKey: "2026-06-01",
          },
        });
      }).pipe(
        Effect.provide(
          BodyWeightReportsTestLayer({
            stores: {
              ...emptyStores,
              bodyWeightEntries: entries,
            },
          })
        )
      )
    );
    const previousWeight = Math.exp((-Math.log(2) * 8) / 7);
    const expectedWeight = (84 * previousWeight + 88) / (previousWeight + 1);
    const latestStableTrendPoint = report.stableTrendPoints.at(-1);

    assert.equal(latestStableTrendPoint?.dateKey, "2026-06-16");
    assert.ok(report.weightedWeightKilograms !== null);
    assert.ok(
      Math.abs(report.weightedWeightKilograms - expectedWeight) < 1e-10
    );
    assert.ok(
      latestStableTrendPoint === undefined
        ? false
        : Math.abs(latestStableTrendPoint.weightKilograms - expectedWeight) <
            1e-10
    );
    assert.match(
      report.insights.find((insight) => insight.id === "movement")?.text ?? "",
      /from June \d{1,2}, 2026 to June \d{1,2}, 2026\./
    );
    assert.deepEqual(
      report.insights
        .find((insight) => insight.id === "movement")
        ?.parts.filter((part) => part.tone === "highlight")
        .map((part) => part.text),
      ["5.3 kg", "June 1, 2026", "June 16, 2026"]
    );

    const staleReport = await Effect.runPromise(
      Effect.gen(function* () {
        const reports = yield* BodyWeightReports.BodyWeightReports;

        return yield* reports.getRange({
          input: {
            endDateKey: "2026-07-01",
            startDateKey: "2026-06-01",
          },
        });
      }).pipe(
        Effect.provide(
          BodyWeightReportsTestLayer({
            stores: {
              ...emptyStores,
              bodyWeightEntries: entries,
            },
          })
        )
      )
    );

    assert.equal(staleReport.weightedWeightKilograms, null);
  });
});

function BodyWeightReportsTestLayer({
  stores,
}: {
  readonly stores: Store.NutritionStores;
}) {
  return BodyWeightReports.BodyWeightReports.layer.pipe(
    Layer.provide(
      Layer.succeed(Store.NutritionStore, {
        countMealEntriesByDate: (dateKey: Domain.DateKey) =>
          Effect.succeed(
            stores.mealEntries.filter(
              (mealEntry) => mealEntry.dateKey === dateKey
            ).length
          ),
        countMealEntriesByFood: (foodId: Domain.FoodId) =>
          Effect.succeed(
            stores.mealEntries.filter(
              (mealEntry) => mealEntry.foodId === foodId
            ).length
          ),
        countMealEntriesByMealIds: (mealIds: readonly Domain.MealId[]) =>
          Effect.succeed(
            stores.mealEntries.filter((mealEntry) =>
              mealIds.includes(mealEntry.mealId)
            ).length
          ),
        deleteBodyWeightEntry: () => Effect.void,
        deleteDailyLog: () => Effect.void,
        deleteMealEntry: () => Effect.void,
        findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
          Effect.succeed(
            stores.activeMealPlanSelections.filter(
              (selection) => selection.id === activeMealPlanSelectionId
            )
          ),
        findBodyWeightEntriesByRange: ({ endDateKey, startDateKey }) =>
          Effect.succeed(
            stores.bodyWeightEntries.filter(
              (bodyWeightEntry) =>
                bodyWeightEntry.dateKey >= startDateKey &&
                bodyWeightEntry.dateKey <= endDateKey
            )
          ),
        findBodyWeightEntryByDateKey: (dateKey: Domain.DateKey) =>
          Effect.succeed(
            stores.bodyWeightEntries.filter(
              (bodyWeightEntry) => bodyWeightEntry.dateKey === dateKey
            )
          ),
        findDailyLogByDateKey: (dateKey: Domain.DateKey) =>
          Effect.succeed(
            stores.dailyLogs.filter((dailyLog) => dailyLog.dateKey === dateKey)
          ),
        findDailyLogsByPlan: (planId: Domain.PlanId) =>
          Effect.succeed(
            stores.dailyLogs.filter((dailyLog) => dailyLog.planId === planId)
          ),
        findFoodById: (foodId: Domain.FoodId) =>
          Effect.succeed(stores.foods.filter((food) => food.id === foodId)),
        findFoodsByName: (name) =>
          Effect.succeed(stores.foods.filter((food) => food.name === name)),
        findMealEntriesByDate: (dateKey: Domain.DateKey) =>
          Effect.succeed(
            stores.mealEntries.filter(
              (mealEntry) => mealEntry.dateKey === dateKey
            )
          ),
        findMealEntryById: (mealEntryId: Domain.MealEntryId) =>
          Effect.succeed(
            stores.mealEntries.filter(
              (mealEntry) => mealEntry.id === mealEntryId
            )
          ),
        findPlanById: (planId: Domain.PlanId) =>
          Effect.succeed(stores.plans.filter((plan) => plan.id === planId)),
        findPlansByName: (name) =>
          Effect.succeed(stores.plans.filter((plan) => plan.name === name)),
        insertFood: () => Effect.void,
        insertMealEntry: () => Effect.void,
        insertPlan: () => Effect.void,
        listBodyWeightEntries: Effect.succeed(stores.bodyWeightEntries),
        listDailyLogs: Effect.succeed(stores.dailyLogs),
        listFoods: Effect.succeed(stores.foods),
        listMealEntries: Effect.succeed(stores.mealEntries),
        listPlans: Effect.succeed(stores.plans),
        readStores: Effect.succeed(stores),
        replaceStores: () => Effect.void,
        upsertActiveMealPlanSelection: () => Effect.void,
        upsertBodyWeightEntry: () => Effect.void,
        upsertDailyLog: () => Effect.void,
        upsertFood: () => Effect.void,
        upsertFoods: () => Effect.void,
        upsertMealEntries: () => Effect.void,
        upsertMealEntry: () => Effect.void,
        upsertPlans: () => Effect.void,
      } satisfies Store.NutritionStore["Service"])
    )
  );
}
