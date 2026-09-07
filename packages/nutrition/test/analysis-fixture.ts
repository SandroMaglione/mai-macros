import { Effect, Schema } from "effect";
import { MaiBackupV1, type MaiBackupEncoded } from "../src/services/backup.ts";

export const analysisFixture = () => {
  const planId = "11111111-1111-4111-8111-111111111111";
  const foodId = "22222222-2222-4222-8222-222222222222";
  const eventId = "66666666-6666-4666-8666-666666666666";
  const unknown = { _tag: "Unknown" } as const;
  const stores = {
    activeMealPlanSelections: [
      { id: "active-meal-plan", planId, updatedAt: 100 },
    ],
    foods: [
      {
        id: foodId,
        name: "Milk · 牛乳",
        brand: "Farm",
        origin: "user",
        nutritionReference: { amount: 250, unit: "ml" },
        nutritionCorrections: { proteinGrams: 10 },
        energyKcal: 120,
        proteinGrams: 8,
        carbsGrams: 16,
        fatGrams: 5,
        portions: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            name: "Cup",
            size: { amount: 250, unit: "ml" },
            position: 0,
          },
        ],
        prices: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            currency: "EUR",
            priceMinor: 150,
            referenceQuantity: { amount: 1, unit: "l" },
            isCurrent: true,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    plans: [
      {
        id: planId,
        name: "Everyday",
        proteinTargetGrams: 100,
        carbsTargetGrams: 200,
        fatTargetGrams: 60,
        meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 1 }],
        createdAt: 1,
      },
    ],
    dailyLogs: [
      {
        dateKey: "2026-01-01",
        planId,
        mode: "eating",
        waterServings: 0,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        dateKey: "2026-01-03",
        planId,
        mode: "fasting",
        waterServings: null,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        dateKey: "2026-01-04",
        planId,
        mode: "not-recorded",
        waterServings: 2,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        dateKey: "2026-01-05",
        planId,
        mode: "eating",
        waterServings: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    mealEntries: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "catalog",
        dateKey: "2026-01-01",
        mealId: "lunch",
        foodId,
        quantity: {
          _tag: "PortionFoodQuantity",
          count: 2,
          portionId: "88888888-8888-4888-8888-888888888888",
          portionName: "Original cup",
          portionSize: { amount: 250, unit: "ml" },
        },
        nutritionMultiplier: 2,
        quantityAccuracy: "estimated",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        kind: "one-off",
        dateKey: "2026-01-01",
        mealId: "lunch",
        name: "Restaurant bowl",
        amountDescription: "One bowl",
        note: "Menu says 700 kcal.\nProtein unavailable.",
        nutrients: {
          energyKcal: { _tag: "Recorded", value: 700 },
          proteinGrams: unknown,
          carbsGrams: unknown,
          fatGrams: unknown,
          fiberGrams: unknown,
          sugarGrams: unknown,
          saturatedFatGrams: unknown,
          saltGrams: { _tag: "Recorded", value: 0 },
        },
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    bodyWeightEntries: [
      {
        dateKey: "2026-01-06",
        weightKilograms: 70.5,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    recordableEvents: [
      {
        id: eventId,
        name: "Training",
        emoji: "🏃",
        position: 0,
        archivedAt: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    recordedEvents: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        recordableEventId: eventId,
        dateKey: "2026-01-01",
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  } satisfies MaiBackupEncoded["stores"];
  return {
    format: "mai.backup",
    formatVersion: 1,
    source: {
      databaseName: "mai",
      databaseVersion: 13,
      exportedAt: 1788770000000,
    },
    integrity: {
      counts: {
        activeMealPlanSelections: 1,
        bodyWeightEntries: 1,
        dailyLogs: 4,
        foods: 1,
        mealEntries: 2,
        plans: 1,
        recordableEvents: 1,
        recordedEvents: 1,
      },
    },
    stores,
  } satisfies MaiBackupEncoded;
};

export const loadAnalysisFixture = () =>
  Effect.runPromise(Schema.decodeEffect(MaiBackupV1)(analysisFixture()));

export const multiYearAnalysisFixture = () => {
  const base = analysisFixture();
  const dates = Array.from({ length: 1827 }, (_, index) =>
    new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10)
  );
  const catalog = base.stores.mealEntries[0];
  const oneOff = base.stores.mealEntries[1];
  const day = base.stores.dailyLogs[0];
  if (catalog === undefined || oneOff === undefined || day === undefined)
    throw new Error("Incomplete fixture");
  const mealEntries = dates.flatMap((dateKey, dayIndex) =>
    Array.from({ length: 5 }, (_, entryIndex) => ({
      ...(entryIndex === 4 ? oneOff : catalog),
      dateKey,
      id: `${(dayIndex * 5 + entryIndex).toString(16).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    }))
  );
  return {
    ...base,
    stores: {
      ...base.stores,
      dailyLogs: dates.map((dateKey) => ({ ...day, dateKey })),
      mealEntries,
      bodyWeightEntries: [],
      recordedEvents: [],
    },
    integrity: {
      counts: {
        ...base.integrity.counts,
        dailyLogs: dates.length,
        mealEntries: mealEntries.length,
        bodyWeightEntries: 0,
        recordedEvents: 0,
      },
    },
  } satisfies MaiBackupEncoded;
};
