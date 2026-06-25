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
  carbsGramsPer100g: 12,
  createdAt: 0,
  energyKcalPer100g: 100,
  fatGramsPer100g: 1,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Rice",
  origin: "user",
  proteinGramsPer100g: 4,
  updatedAt: 0,
};

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
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

  it("uses created daily logs as the report day count when dates are missing", async () => {
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
        planId: plan.id,
        updatedAt: 0,
      });
      const recordedMealEntry = yield* Schema.decodeEffect(Domain.MealEntry)({
        createdAt: 0,
        dateKey: firstDailyLog.dateKey,
        foodId: food.id,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c23",
        mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
        quantityGrams: 100,
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
        quantityGrams: 100,
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

    assert.deepEqual(
      result.days.map((day) => day.dateKey),
      ["2026-06-18", "2026-06-21"]
    );
    assert.equal(result.days.length, 2);
    assert.equal(totalEnergyKcal / result.days.length, 50);
    assert.equal(result.days[0]?.entries.length, 1);
    assert.equal(result.days[1]?.entries.length, 0);
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
            findDailyLogsByPlan: (planId: Domain.PlanId) =>
              Effect.succeed(
                stores.dailyLogs.filter(
                  (dailyLog) => dailyLog.planId === planId
                )
              ),
            findFoodById: (foodId: Domain.FoodId) =>
              Effect.succeed(stores.foods.filter((food) => food.id === foodId)),
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
            findPlanById: (planId: Domain.PlanId) =>
              Effect.succeed(stores.plans.filter((plan) => plan.id === planId)),
            findPlansByName: (name) =>
              Effect.succeed(stores.plans.filter((plan) => plan.name === name)),
            insertFood: () => Effect.void,
            insertMealEntry: () => Effect.void,
            insertPlan: () => Effect.void,
            listDailyLogs: Effect.succeed(stores.dailyLogs),
            listFoods: Effect.succeed(stores.foods),
            listMealEntries: Effect.succeed(stores.mealEntries),
            listPlans: Effect.succeed(stores.plans),
            readStores: Effect.succeed(stores),
            replaceStores: () => Effect.void,
            upsertActiveMealPlanSelection: () => Effect.void,
            upsertDailyLog: () => Effect.void,
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
