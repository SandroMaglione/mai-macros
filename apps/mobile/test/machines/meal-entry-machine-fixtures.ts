import { DailyLogs, Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";

export const breakfastMealId = Domain.MealId.make("breakfast");
export const dinnerMealId = Domain.MealId.make("dinner");
export const pastDateKey = Domain.DateKey.make("2026-01-15");

const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const makeFood = ({
  id,
  name,
  origin,
}: {
  readonly id: string;
  readonly name: string;
  readonly origin?: "user" | "app-default";
}) =>
  Schema.decodeEffect(Domain.Food)({
    id,
    name,
    origin: origin ?? "user",
    energyKcal: 100,
    proteinGrams: 10,
    carbsGrams: 10,
    fatGrams: 2,
    createdAt: 100,
    updatedAt: 100,
  });

export const makePlan = Schema.decodeEffect(Domain.Plan)({
  id: planId,
  name: "Default",
  meals: [
    { id: "breakfast", name: "Breakfast", position: 0, createdAt: 100 },
    { id: "dinner", name: "Dinner", position: 1, createdAt: 100 },
  ],
  proteinTargetGrams: 100,
  carbsTargetGrams: 200,
  fatTargetGrams: 60,
  createdAt: 100,
});

export const makeOpenedDay = (dateKey: Domain.DateKey) =>
  Effect.gen(function* () {
    const plan = yield* makePlan;
    const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
      dateKey,
      planId,
      createdAt: 100,
      updatedAt: 100,
    });

    return new DailyLogs.OpenedDay({
      dailyLog,
      plans: [plan],
      selectedPlan: plan,
    });
  });

export const makeUnrecordedDay = (dateKey: Domain.DateKey) =>
  Effect.map(
    makePlan,
    (plan) =>
      new DailyLogs.UnrecordedDay({
        dateKey,
        plans: [plan],
        selectedPlan: plan,
      })
  );

export const makeCatalogMealEntry = ({
  dateKey,
  foodId,
  id,
  mealId,
}: {
  readonly dateKey: Domain.DateKey;
  readonly foodId: Domain.FoodId;
  readonly id: string;
  readonly mealId: Domain.MealId;
}) =>
  Schema.decodeUnknownEffect(Domain.CatalogMealEntry)({
    id,
    dateKey,
    mealId,
    kind: "catalog",
    foodId,
    quantity: { _tag: "MeasuredFoodQuantity", amount: 120, unit: "g" },
    nutritionMultiplier: 1.2,
    quantityAccuracy: "measured",
    createdAt: 200,
    updatedAt: 200,
  });

export const makeOneOffMealEntry = ({
  amountDescription,
  dateKey,
  id,
  mealId,
  name,
}: {
  readonly amountDescription: string;
  readonly dateKey: Domain.DateKey;
  readonly id: string;
  readonly mealId: Domain.MealId;
  readonly name: string;
}) =>
  Schema.decodeUnknownEffect(Domain.OneOffMealEntry)({
    id,
    dateKey,
    mealId,
    kind: "one-off",
    name,
    amountDescription,
    note: "",
    nutrients: {
      energyKcal: { _tag: "Recorded", value: 650 },
      proteinGrams: { _tag: "Estimated", value: 25 },
      carbsGrams: { _tag: "Unknown" },
      fatGrams: { _tag: "Unknown" },
      fiberGrams: { _tag: "Unknown" },
      sugarGrams: { _tag: "Unknown" },
      saturatedFatGrams: { _tag: "Unknown" },
      saltGrams: { _tag: "Unknown" },
    },
    createdAt: 300,
    updatedAt: 300,
  });
