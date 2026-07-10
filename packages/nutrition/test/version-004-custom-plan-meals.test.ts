import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Migrations } from "../src/index.ts";

const CustomPlanMealsMigration = Migrations.Version004CustomPlanMeals;

const planBeforeCustomPlanMealsInput: typeof CustomPlanMealsMigration.PlanBeforeCustomPlanMeals.Encoded =
  {
    id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
    name: "Training day",
    proteinTargetGrams: 160,
    carbsTargetGrams: 220,
    fatTargetGrams: 70,
    fiberTargetGrams: 30,
    sugarTargetGrams: 50,
    saltTargetGrams: 6,
    saturatedFatTargetGrams: 20,
    createdAt: 100,
  };

const mealEntryBeforeCustomPlanMealsInput: typeof CustomPlanMealsMigration.MealEntryBeforeCustomPlanMeals.Encoded =
  {
    id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
    dateKey: "2026-06-20",
    meal: "dinner",
    foodId: "9535a059-a61f-42e1-a2e0-35ec87203c24",
    quantityGrams: 150,
    createdAt: 200,
    updatedAt: 300,
  };

describe("version 004 custom plan meals migration", () => {
  it("adds deterministic breakfast, lunch, and dinner meals to earlier plans", async () => {
    const plan = await Effect.runPromise(
      Effect.gen(function* () {
        const planBeforeCustomPlanMeals = yield* Schema.decodeEffect(
          CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
        )(planBeforeCustomPlanMealsInput);

        return yield* CustomPlanMealsMigration.migratePlanToCustomPlanMeals({
          plan: planBeforeCustomPlanMeals,
        });
      })
    );

    assert.deepStrictEqual(
      plan.meals.map((meal) => ({
        id: meal.id,
        name: meal.name,
        position: meal.position,
      })),
      [
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "breakfast",
            planId: planBeforeCustomPlanMealsInput.id,
          }),
          name: "Breakfast",
          position: 0,
        },
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "lunch",
            planId: planBeforeCustomPlanMealsInput.id,
          }),
          name: "Lunch",
          position: 1,
        },
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "dinner",
            planId: planBeforeCustomPlanMealsInput.id,
          }),
          name: "Dinner",
          position: 2,
        },
      ]
    );
  });

  it("maps earlier meal entries to plan meals and materializes missing daily logs", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const planBeforeCustomPlanMeals = yield* Schema.decodeEffect(
          CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
        )(planBeforeCustomPlanMealsInput);
        const plan =
          yield* CustomPlanMealsMigration.migratePlanToCustomPlanMeals({
            plan: planBeforeCustomPlanMeals,
          });
        const activeSelection = yield* Schema.decodeEffect(
          Domain.ActiveMealPlanSelection
        )({
          id: "active-meal-plan",
          planId: plan.id,
          updatedAt: 150,
        });
        const mealEntryBeforeCustomPlanMeals = yield* Schema.decodeEffect(
          CustomPlanMealsMigration.MealEntryBeforeCustomPlanMeals
        )(mealEntryBeforeCustomPlanMealsInput);

        return yield* CustomPlanMealsMigration.migrateMealEntriesToCustomPlanMeals(
          {
            activeMealPlanSelections: [activeSelection],
            dailyLogs: [],
            mealEntries: [mealEntryBeforeCustomPlanMeals],
            plans: [plan],
          }
        );
      })
    );

    assert.equal(result.dailyLogs.length, 1);
    assert.equal(
      result.dailyLogs[0]?.dateKey,
      mealEntryBeforeCustomPlanMealsInput.dateKey
    );
    assert.equal(
      result.dailyLogs[0]?.planId,
      planBeforeCustomPlanMealsInput.id
    );
    assert.equal(result.mealEntries.length, 1);
    assert.equal(
      result.mealEntries[0]?.id,
      mealEntryBeforeCustomPlanMealsInput.id
    );
    assert.equal(
      result.mealEntries[0]?.foodId,
      mealEntryBeforeCustomPlanMealsInput.foodId
    );
    assert.equal(result.mealEntries[0]?.quantity._tag, "MeasuredFoodQuantity");
    assert.equal(
      result.mealEntries[0]?.quantity._tag === "MeasuredFoodQuantity"
        ? result.mealEntries[0].quantity.amount
        : undefined,
      150
    );
    assert.equal(
      result.mealEntries[0]?.mealId,
      CustomPlanMealsMigration.makeMigratedMealId({
        meal: mealEntryBeforeCustomPlanMealsInput.meal,
        planId: planBeforeCustomPlanMealsInput.id,
      })
    );
  });
});
