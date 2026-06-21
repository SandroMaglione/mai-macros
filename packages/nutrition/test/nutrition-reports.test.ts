import { Array as EffectArray, Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import {
  ActiveMealPlanSelection,
  type DateKey,
  type FoodId,
  type MealEntryId,
  Plan,
  type PlanId,
} from "../src/domain.ts";
import { NutritionReports } from "../src/services/nutrition-reports.ts";
import { NutritionStore, type NutritionStores } from "../src/store.ts";

const emptyStores: NutritionStores = {
  activeMealPlanSelections: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("NutritionReports", () => {
  it("loads an empty range when an active plan exists with no logs", async () => {
    const program = Effect.gen(function* () {
      const plan = yield* Schema.decodeEffect(Plan)({
        carbsTargetGrams: 220,
        createdAt: 0,
        fatTargetGrams: 70,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
        name: "Training day",
        proteinTargetGrams: 160,
      });
      const selection = yield* Schema.decodeEffect(ActiveMealPlanSelection)({
        id: "active-meal-plan",
        planId: plan.id,
        updatedAt: 0,
      });
      const stores: NutritionStores = {
        ...emptyStores,
        activeMealPlanSelections: [selection],
        plans: [plan],
      };

      return yield* Effect.gen(function* () {
        const reports = yield* NutritionReports;

        return yield* reports.getRange({
          input: {
            endDateKey: "2026-06-21",
            startDateKey: "2026-06-15",
          },
        });
      }).pipe(
        Effect.provide(
          NutritionReports.layer.pipe(
            Layer.provide(
              Layer.succeed(NutritionStore, {
                countMealEntriesByDate: (dateKey: DateKey) =>
                  Effect.succeed(
                    stores.mealEntries.filter(
                      (mealEntry) => mealEntry.dateKey === dateKey
                    ).length
                  ),
                countMealEntriesByFood: (foodId: FoodId) =>
                  Effect.succeed(
                    stores.mealEntries.filter(
                      (mealEntry) => mealEntry.foodId === foodId
                    ).length
                  ),
                deleteMealEntry: () => Effect.void,
                findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
                  Effect.succeed(
                    stores.activeMealPlanSelections.filter(
                      (selection) => selection.id === activeMealPlanSelectionId
                    )
                  ),
                findDailyLogByDateKey: (dateKey: DateKey) =>
                  Effect.succeed(
                    stores.dailyLogs.filter(
                      (dailyLog) => dailyLog.dateKey === dateKey
                    )
                  ),
                findDailyLogsByPlan: (planId: PlanId) =>
                  Effect.succeed(
                    stores.dailyLogs.filter(
                      (dailyLog) => dailyLog.planId === planId
                    )
                  ),
                findFoodById: (foodId: FoodId) =>
                  Effect.succeed(
                    stores.foods.filter((food) => food.id === foodId)
                  ),
                findFoodsByName: (name) =>
                  Effect.succeed(
                    stores.foods.filter((food) => food.name === name)
                  ),
                findMealEntryById: (mealEntryId: MealEntryId) =>
                  Effect.succeed(
                    stores.mealEntries.filter(
                      (mealEntry) => mealEntry.id === mealEntryId
                    )
                  ),
                findMealEntriesByDate: (dateKey: DateKey) =>
                  Effect.succeed(
                    stores.mealEntries.filter(
                      (mealEntry) => mealEntry.dateKey === dateKey
                    )
                  ),
                findPlanById: (planId: PlanId) =>
                  Effect.succeed(
                    stores.plans.filter((plan) => plan.id === planId)
                  ),
                findPlansByName: (name) =>
                  Effect.succeed(
                    stores.plans.filter((plan) => plan.name === name)
                  ),
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
    });

    const result = await Effect.runPromise(program);

    assert.equal(result.days.length, 7);
    assert.equal(result.activePlan.name, "Training day");
    assert.isTrue(result.days.every((day) => day.dailyLog === null));
    assert.isTrue(
      result.days.every(
        (day) => !EffectArray.isReadonlyArrayNonEmpty(day.entries)
      )
    );
  });
});
