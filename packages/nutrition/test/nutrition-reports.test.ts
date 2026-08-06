import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, NutritionReports, Store } from "../src/index.ts";

const planInput: typeof Domain.Plan.Encoded = {
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
      name: "Lunch",
      position: 1,
      createdAt: 0,
    },
  ],
  name: "Training day",
  proteinTargetGrams: 160,
};

const foodInput: typeof Domain.Food.Encoded = {
  carbsGrams: 12,
  createdAt: 0,
  energyKcal: 100,
  fatGrams: 1,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Rice",
  origin: "user",
  proteinGrams: 4,
  updatedAt: 0,
};

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("NutritionReports", () => {
  it("does not materialize uncreated days in a range", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const selection = yield* Schema.decodeEffect(
        Domain.ActiveMealPlanSelection
      )({
        id: "active-meal-plan",
        planId: plan.id,
        updatedAt: 0,
      });
      const stores: Store.NutritionStores = {
        ...emptyStores,
        activeMealPlanSelections: [selection],
        plans: [plan],
      };

      return yield* _getRange({
        stores,
        input: {
          endDateKey: "2026-06-21",
          startDateKey: "2026-06-15",
        },
      });
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.days.length, 0);
    assert.equal(result.activePlan.name, "Training day");
  });

  it("includes created daily logs even when they have no meal entries", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
        createdAt: 0,
        dateKey: "2026-06-21",
        planId: plan.id,
        updatedAt: 0,
      });
      const stores: Store.NutritionStores = {
        ...emptyStores,
        dailyLogs: [dailyLog],
        plans: [plan],
      };

      return yield* _getRange({
        stores,
        input: {
          endDateKey: "2026-06-21",
          startDateKey: "2026-06-15",
        },
      });
    });

    const result = await Effect.runPromise(program);
    const [day] = result.days;

    assert.equal(result.days.length, 1);
    assert.equal(day?.dateKey, "2026-06-21");
    assert.equal(day?.dailyLog?.dateKey, "2026-06-21");
    assert.deepEqual(day?.entries, []);
    assert.equal(day?.totals.energyKcal, 0);
  });

  it("keeps fasting logs in the range but excludes them from counted days", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const firstDailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
        createdAt: 0,
        dateKey: "2026-06-18",
        planId: plan.id,
        updatedAt: 0,
      });
      const secondDailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
        createdAt: 0,
        dateKey: "2026-06-21",
        mode: "fasting",
        planId: plan.id,
        updatedAt: 0,
      });
      const recordedMealEntry = yield* Schema.decodeEffect(Domain.MealEntry)({
        createdAt: 0,
        dateKey: firstDailyLog.dateKey,
        foodId: food.id,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c23",
        mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
        quantity: {
          _tag: "MeasuredFoodQuantity",
          amount: 100,
          unit: "g",
        },
        nutritionMultiplier: 1,
        updatedAt: 0,
      });
      const uncreatedDayMealEntry = yield* Schema.decodeEffect(
        Domain.MealEntry
      )({
        createdAt: 0,
        dateKey: "2026-06-19",
        foodId: food.id,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c22",
        mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
        quantity: {
          _tag: "MeasuredFoodQuantity",
          amount: 100,
          unit: "g",
        },
        nutritionMultiplier: 1,
        updatedAt: 0,
      });
      const stores: Store.NutritionStores = {
        ...emptyStores,
        dailyLogs: [firstDailyLog, secondDailyLog],
        foods: [food],
        mealEntries: [recordedMealEntry, uncreatedDayMealEntry],
        plans: [plan],
      };

      return yield* _getRange({
        stores,
        input: {
          endDateKey: "2026-06-21",
          startDateKey: "2026-06-15",
        },
      });
    });

    const result = await Effect.runPromise(program);
    const totalEnergyKcal = result.days.reduce(
      (total, day) => total + day.totals.energyKcal,
      0
    );
    const countedDays = NutritionReports.countedNutritionDays({
      report: result,
    });

    assert.deepEqual(
      result.days.map((day) => day.dateKey),
      ["2026-06-18", "2026-06-21"]
    );
    assert.equal(result.days.length, 2);
    assert.equal(countedDays.length, 1);
    assert.equal(totalEnergyKcal / countedDays.length, 100);
    assert.equal(result.days[0]?.entries.length, 1);
    assert.equal(result.days[1]?.entries.length, 0);
    assert.equal(result.days[1]?.dailyLog.mode, "fasting");
  });
});

function _getRange({
  input,
  stores,
}: {
  readonly input: NutritionReports.GetNutritionReportRangeInput;
  readonly stores: Store.NutritionStores;
}) {
  return Effect.gen(function* () {
    const reports = yield* NutritionReports.NutritionReports;

    return yield* reports.getRange({
      input,
    });
  }).pipe(
    Effect.provide(
      NutritionReports.NutritionReports.layer.pipe(
        Layer.provide(
          Layer.succeed(Store.NutritionStore, {
            applyFoodEdit: () => Effect.void,
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
            deleteMealEntry: () => Effect.void,
            deleteDailyLog: () => Effect.void,
            deleteBodyWeightEntry: () => Effect.void,
            findBodyWeightEntryByDateKey: (dateKey: Domain.DateKey) =>
              Effect.succeed(
                stores.bodyWeightEntries.filter(
                  (bodyWeightEntry) => bodyWeightEntry.dateKey === dateKey
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
            findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
              Effect.succeed(
                stores.activeMealPlanSelections.filter(
                  (selection) => selection.id === activeMealPlanSelectionId
                )
              ),
            findDailyLogByDateKey: (dateKey: Domain.DateKey) =>
              Effect.succeed(
                stores.dailyLogs.filter(
                  (dailyLog) => dailyLog.dateKey === dateKey
                )
              ),
            findDailyLogsByRange: ({ endDateKey, startDateKey }) =>
              Effect.succeed(
                stores.dailyLogs.filter(
                  (dailyLog) =>
                    dailyLog.dateKey >= startDateKey &&
                    dailyLog.dateKey <= endDateKey
                )
              ),
            findDailyLogsByPlan: (planId: Domain.PlanId) =>
              Effect.succeed(
                stores.dailyLogs.filter(
                  (dailyLog) => dailyLog.planId === planId
                )
              ),
            findFoodById: (foodId: Domain.FoodId) =>
              Effect.succeed(stores.foods.filter((food) => food.id === foodId)),
            findFoodsByIds: (foodIds) =>
              Effect.succeed(
                stores.foods.filter((food) => foodIds.includes(food.id))
              ),
            findFoodsByName: (name) =>
              Effect.succeed(stores.foods.filter((food) => food.name === name)),
            findMealEntryById: (mealEntryId: Domain.MealEntryId) =>
              Effect.succeed(
                stores.mealEntries.filter(
                  (mealEntry) => mealEntry.id === mealEntryId
                )
              ),
            findMealEntriesByDate: (dateKey: Domain.DateKey) =>
              Effect.succeed(
                stores.mealEntries.filter(
                  (mealEntry) => mealEntry.dateKey === dateKey
                )
              ),
            findMealEntriesByFood: (foodId) =>
              Effect.succeed(
                stores.mealEntries.filter(
                  (mealEntry) => mealEntry.foodId === foodId
                )
              ),
            findMealEntriesByRange: ({ endDateKey, startDateKey }) =>
              Effect.succeed(
                stores.mealEntries.filter(
                  (mealEntry) =>
                    mealEntry.dateKey >= startDateKey &&
                    mealEntry.dateKey <= endDateKey
                )
              ),
            findMealEntriesForFoodUsage: Effect.succeed(stores.mealEntries),
            findLatestPlan: stores.activeMealPlanSelections.some((selection) =>
              stores.plans.some((plan) => plan.id === selection.planId)
            )
              ? Effect.die(
                  "NutritionReports must not load a fallback when the selected plan exists."
                )
              : Effect.succeed(
                  stores.plans
                    .filter((candidate) =>
                      stores.plans.every(
                        (plan) => candidate.createdAt >= plan.createdAt
                      )
                    )
                    .slice(-1)
                ),
            findPlanById: (planId: Domain.PlanId) =>
              Effect.succeed(stores.plans.filter((plan) => plan.id === planId)),
            findPlansByIds: (planIds) =>
              Effect.succeed(
                stores.plans.filter((plan) => planIds.includes(plan.id))
              ),
            findPlansByName: (name) =>
              Effect.succeed(stores.plans.filter((plan) => plan.name === name)),
            insertFood: () => Effect.void,
            insertMealEntry: () => Effect.void,
            insertPlan: () => Effect.void,
            listDailyLogs: Effect.die(
              "NutritionReports must use a bounded daily-log query."
            ),
            listBodyWeightEntries: Effect.succeed(stores.bodyWeightEntries),
            listFoods: Effect.die(
              "NutritionReports must load only referenced foods."
            ),
            listMealEntries: Effect.die(
              "NutritionReports must use a bounded meal-entry query."
            ),
            listPlans: Effect.die(
              "NutritionReports must load only referenced plans."
            ),
            readStores: Effect.succeed(stores),
            replaceStores: () => Effect.void,
            upsertActiveMealPlanSelection: () => Effect.void,
            upsertDailyLog: () => Effect.void,
            upsertBodyWeightEntry: () => Effect.void,
            upsertFood: () => Effect.void,
            upsertFoods: () => Effect.void,
            upsertMealEntry: () => Effect.void,
            upsertMealEntries: () => Effect.void,
            upsertPlans: () => Effect.void,
          })
        )
      )
    )
  );
}
