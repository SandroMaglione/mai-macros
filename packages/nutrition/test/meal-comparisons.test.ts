import { Array, Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { Domain, MealComparisons, Reporting } from "../src/index.ts";
import type { NutritionReportDay } from "../src/services/nutrition-reports.ts";

const planInput = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Usual plan",
  createdAt: 0,
  meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 0 }],
  carbsTargetGrams: 200,
  proteinTargetGrams: 100,
  fatTargetGrams: 70,
} satisfies typeof Domain.Plan.Encoded;

function _day({
  dateKey,
  energy,
  protein,
  mode = "eating",
  mealId = "lunch",
  plan,
  foods = [],
  catalogEntries,
}: {
  readonly dateKey: string;
  readonly energy: number;
  readonly protein?: number;
  readonly mode?: Domain.DailyLogMode;
  readonly mealId?: string;
  readonly plan: Domain.Plan;
  readonly foods?: readonly Domain.Food[];
  readonly catalogEntries?: readonly Domain.CatalogMealEntry[];
}) {
  return Effect.gen(function* () {
    const unknown = { _tag: "Unknown" } as const;
    const entry = yield* Schema.decodeEffect(Domain.OneOffMealEntry)({
      id: "22222222-2222-4222-8222-222222222222",
      kind: "one-off",
      name: "Meal",
      amountDescription: "",
      note: "",
      dateKey,
      mealId,
      createdAt: 0,
      updatedAt: 0,
      nutrients: {
        energyKcal: { _tag: "Estimated", value: energy },
        proteinGrams:
          protein === undefined
            ? unknown
            : { _tag: "Recorded", value: protein },
        carbsGrams: unknown,
        fatGrams: unknown,
        fiberGrams: unknown,
        sugarGrams: unknown,
        saturatedFatGrams: unknown,
        saltGrams: { _tag: "Recorded", value: 0 },
      },
    });
    const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
      dateKey,
      planId: plan.id,
      mode,
      createdAt: 0,
      updatedAt: 0,
    });
    const mealEntries = catalogEntries ?? [entry];
    const nutrition = Reporting.calculateMealEntriesNutrientTotals({
      foods,
      mealEntries,
    });
    return {
      dateKey: dailyLog.dateKey,
      dailyLog,
      plan,
      mealEntries,
      nutrition,
      entries: !Array.isReadonlyArrayNonEmpty(foods)
        ? [{ mealEntry: entry, food: null, cost: null, nutrients: {} }]
        : mealEntries.flatMap((mealEntry) => {
            if (mealEntry.kind !== "catalog") return [];
            const food = foods.find((food) => food.id === mealEntry.foodId);
            return food === undefined
              ? []
              : [
                  {
                    mealEntry,
                    food,
                    cost: null,
                    nutrients: Reporting.emptyNutrientTotals(),
                  },
                ];
          }),
      costTotals: Reporting.calculateMealEntriesCostTotals({
        foods,
        mealEntries,
      }),
      coverage: nutrition.coverage,
      totals: nutrition.totals,
      targetStatuses: [],
      isInsideExpectedPlanRange: false,
    } satisfies NutritionReportDay;
  });
}

describe("meal comparisons", () => {
  it("averages each meal's weight, density, and euro cost and rejects mixed currency costs", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const foodInput = {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Food",
          origin: "user" as const,
          energyKcal: 500,
          carbsGrams: 20,
          proteinGrams: 10,
          fatGrams: 5,
          createdAt: 0,
          updatedAt: 0,
          prices: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              priceMinor: 100,
              currency: "EUR" as const,
              referenceQuantity: { amount: 100, unit: "g" as const },
              isCurrent: true,
              createdAt: 0,
              updatedAt: 0,
            },
          ],
        };
        const firstFood = yield* Schema.decodeEffect(Domain.Food)(foodInput);
        const secondFood = yield* Schema.decodeEffect(Domain.Food)({
          ...foodInput,
          energyKcal: 250,
          prices: foodInput.prices.map((price) => ({
            ...price,
            priceMinor: 300,
          })),
        });
        const first = yield* Schema.decodeEffect(Domain.CatalogMealEntry)({
          id: "66666666-6666-4666-8666-666666666666",
          dateKey: "2026-09-05",
          mealId: "lunch",
          foodId: firstFood.id,
          quantity: { _tag: "MeasuredFoodQuantity", amount: 100, unit: "g" },
          nutritionMultiplier: 1,
          createdAt: 0,
          updatedAt: 0,
        });
        const second = yield* Schema.decodeEffect(Domain.CatalogMealEntry)({
          id: "77777777-7777-4777-8777-777777777777",
          dateKey: "2026-09-04",
          mealId: "lunch",
          foodId: secondFood.id,
          quantity: { _tag: "MeasuredFoodQuantity", amount: 100, unit: "g" },
          nutritionMultiplier: 1,
          createdAt: 0,
          updatedAt: 0,
        });
        const days = yield* Effect.all([
          _day({
            dateKey: "2026-09-05",
            energy: 0,
            plan,
            foods: [firstFood],
            catalogEntries: [first],
          }),
          _day({
            dateKey: "2026-09-04",
            energy: 0,
            plan,
            foods: [secondFood],
            catalogEntries: [second],
          }),
        ]);
        const dateKey = yield* Schema.decodeEffect(Domain.DateKey)(
          "2026-09-06"
        );
        const foreignFood = yield* Schema.decodeEffect(Domain.Food)({
          ...foodInput,
          prices: foodInput.prices.map((price) => ({
            ...price,
            currency: "USD",
          })),
        });
        return {
          baselines: MealComparisons.buildBaselines({
            report: {
              days,
              activePlan: plan,
              startDateKey: dateKey,
              endDateKey: dateKey,
            },
            dateKey,
            planId: plan.id,
          }),
          foreignValues: MealComparisons.mealValues({
            foods: [foreignFood],
            mealEntries: [first],
          }),
        };
      })
    );
    const metrics = result.baselines[0]?.metrics;
    assert.equal(
      metrics?.find((value) => value.metric === "weightGrams")?.average,
      100
    );
    assert.closeTo(
      metrics?.find((value) => value.metric === "gramsPerCalorie")?.average ??
        0,
      0.3,
      0.00001
    );
    assert.equal(
      metrics?.find((value) => value.metric === "costEur")?.average,
      2
    );
    assert.equal(
      result.foreignValues.find((value) => value.metric === "costEur")?.value,
      null
    );
  });
  it("compares only the same meal and plan in the preceding seven counted days", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const otherPlan = yield* Schema.decodeEffect(Domain.Plan)({
          ...planInput,
          id: "33333333-3333-4333-8333-333333333333",
        });
        const days = yield* Effect.all([
          _day({ dateKey: "2026-09-05", energy: 500, protein: 20, plan }),
          _day({ dateKey: "2026-08-30", energy: 700, plan }),
          _day({ dateKey: "2026-09-04", energy: 9000, plan, mode: "fasting" }),
          _day({
            dateKey: "2026-09-03",
            energy: 9000,
            plan,
            mode: "not-recorded",
          }),
          _day({ dateKey: "2026-09-02", energy: 9000, plan: otherPlan }),
          _day({ dateKey: "2026-08-29", energy: 9000, plan }),
          _day({ dateKey: "2026-09-06", energy: 9000, plan }),
          _day({ dateKey: "2026-09-07", energy: 9000, plan }),
          _day({ dateKey: "2026-09-01", energy: 9000, plan, mealId: "dinner" }),
        ]);
        const dateKey = yield* Schema.decodeEffect(Domain.DateKey)(
          "2026-09-06"
        );
        return MealComparisons.buildBaselines({
          report: {
            days,
            activePlan: plan,
            startDateKey: dateKey,
            endDateKey: dateKey,
          },
          dateKey,
          planId: plan.id,
        });
      })
    );
    const lunch = result.find((baseline) => baseline.mealId === "lunch");
    assert.equal(lunch?.mealCount, 2);
    assert.deepEqual(
      lunch?.metrics.find((value) => value.metric === "energyKcal"),
      { metric: "energyKcal", average: 600, meals: 2, estimated: true }
    );
    assert.deepEqual(
      lunch?.metrics.find((value) => value.metric === "proteinGrams"),
      { metric: "proteinGrams", average: 20, meals: 1, estimated: false }
    );
    assert.equal(
      lunch?.metrics.find((value) => value.metric === "carbsGrams")?.average,
      null
    );
    assert.equal(
      lunch?.metrics.find((value) => value.metric === "saltGrams")?.average,
      0
    );
    assert.equal(
      lunch?.metrics.find((value) => value.metric === "weightGrams")?.average,
      null
    );
    assert.equal(
      result.find((baseline) => baseline.mealId === "dinner")?.mealCount,
      1
    );
  });

  it("keeps incomplete current totals and unavailable weight/cost out of comparisons", async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const known = yield* _day({
          dateKey: "2026-09-05",
          energy: 400,
          protein: 20,
          plan,
        });
        const partial = yield* _day({
          dateKey: "2026-09-05",
          energy: 100,
          plan,
        });
        return MealComparisons.mealValues({
          foods: [],
          mealEntries: [...known.mealEntries, ...partial.mealEntries],
        });
      })
    );
    assert.equal(
      values.find((value) => value.metric === "energyKcal")?.value,
      500
    );
    assert.equal(
      values.find((value) => value.metric === "proteinGrams")?.value,
      null
    );
    assert.equal(
      values.find((value) => value.metric === "gramsPerCalorie")?.value,
      null
    );
    assert.equal(
      values.find((value) => value.metric === "costEur")?.value,
      null
    );
  });

  it("handles missing and zero averages without infinite percentages", () => {
    assert.equal(
      MealComparisons.percentageDifference({ value: 660, average: 600 }),
      10
    );
    assert.equal(
      MealComparisons.percentageDifference({ value: 450, average: 600 }),
      -25
    );
    assert.equal(
      MealComparisons.percentageDifference({ value: 0, average: 0 }),
      0
    );
    assert.equal(
      MealComparisons.percentageDifference({ value: 1, average: 0 }),
      null
    );
    assert.equal(
      MealComparisons.percentageDifference({ value: null, average: 600 }),
      null
    );
  });
});
