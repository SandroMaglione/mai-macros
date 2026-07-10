import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, FoodCatalogTransfer, Store } from "../src/index.ts";

const { FoodCatalogImportSelectionError, FoodCatalogTransfers } =
  FoodCatalogTransfer;

const defaultFoodId = "19b02c22-7151-4f6f-a0e0-6bc1f407fb50";

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("FoodCatalogTransfers", () => {
  it("exports only user foods as a schema-backed catalog JSON", async () => {
    const defaultFood = await Effect.runPromise(testDefaultFood);
    const food = await Effect.runPromise(testFood);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;
        const exported = yield* transfers.exportToJson();
        const preview = yield* transfers.previewImportFromJson({
          input: {
            json: exported.json,
          },
        });

        return {
          exported,
          preview,
        };
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [defaultFood, food],
            },
          })
        )
      )
    );

    assert.equal(result.exported.catalog.format, "mai.food-catalog");
    assert.equal(result.exported.catalog.integrity.counts.foods, 1);
    assert.equal(result.exported.catalog.stores.foods[0]?.name, "Greek yogurt");
    assert.equal(result.preview.candidates[0]?.status, "already-present");
    assert.equal(result.preview.candidates[0]?.nameStatus, "unique");
    assert.deepEqual(result.preview.candidates[0]?.sameNameLocalFoodIds, []);
    assert.deepEqual(result.preview.candidates[0]?.selection, {
      defaultSelected: false,
      reasons: ["already-present"],
      selectable: true,
    });
  });

  it("previews same-name local conflicts as selectable but not selected by default", async () => {
    const sourceFood = await Effect.runPromise(testFood);
    const sameNameLocalFood = await Effect.runPromise(testSameNameLocalFood);
    const exported = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;

        return yield* transfers.exportToJson();
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [sourceFood],
            },
          })
        )
      )
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;

        return yield* transfers.previewImportFromJson({
          input: {
            json: exported.json,
          },
        });
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [sameNameLocalFood],
            },
          })
        )
      )
    );
    const candidate = result.candidates[0];

    assert.equal(candidate?.status, "new");
    assert.equal(candidate?.nameStatus, "same-name-local");
    assert.deepEqual(candidate?.sameNameLocalFoodIds, [sameNameLocalFood.id]);
    assert.deepEqual(candidate?.selection, {
      defaultSelected: false,
      reasons: ["same-name-local"],
      selectable: true,
    });
  });

  it("imports older catalog foods without preserving revision references", async () => {
    const sourceFood = await Effect.runPromise(testFood);
    const exported = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;

        return yield* transfers.exportToJson();
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [sourceFood],
            },
          })
        )
      )
    );
    const legacyJson = exported.json.replace(
      `"id":"${sourceFood.id}"`,
      `"id":"${sourceFood.id}","basedOnFoodId":"90b81ef4-c6dd-4b43-8491-f795a8c974ff"`
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const targetStore = yield* Store.NutritionStore;
        const targetTransfers = yield* FoodCatalogTransfers;
        const preview = yield* targetTransfers.previewImportFromJson({
          input: {
            json: legacyJson,
          },
        });
        const imported = yield* targetTransfers.importSelectedFromJson({
          input: {
            json: legacyJson,
            selectedFoodIds: [sourceFood.id],
          },
        });

        return {
          imported,
          preview,
          stores: yield* targetStore.readStores,
        };
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: emptyStores,
          })
        )
      )
    );

    assert.deepEqual(result.preview.candidates[0]?.selection, {
      defaultSelected: true,
      reasons: [],
      selectable: true,
    });
    assert.equal(result.imported.importedFoods[0]?.name, "Greek yogurt");
    assert.equal(
      Object.keys(result.stores.foods[0] ?? {}).includes("basedOnFoodId"),
      false
    );
  });

  it("imports external catalog foods", async () => {
    const sourceFood = await Effect.runPromise(testFood);
    const exported = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;

        return yield* transfers.exportToJson();
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [sourceFood],
            },
          })
        )
      )
    );
    const importJson = exported.json.replace(
      '"origin":"user"',
      '"origin":"import"'
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;
        const preview = yield* transfers.previewImportFromJson({
          input: {
            json: importJson,
          },
        });
        const imported = yield* transfers.importSelectedFromJson({
          input: {
            json: importJson,
            selectedFoodIds: [sourceFood.id],
          },
        });

        return {
          imported,
          preview,
        };
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: emptyStores,
          })
        )
      )
    );

    assert.equal(result.preview.candidates[0]?.food.origin, "import");
    assert.equal(result.imported.importedFoods[0]?.origin, "import");
  });

  it("rejects selecting foods that conflict with local food ids", async () => {
    const sourceFood = await Effect.runPromise(testFood);
    const conflictingFood = await Effect.runPromise(testConflictingFood);
    const exported = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;

        return yield* transfers.exportToJson();
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [sourceFood],
            },
          })
        )
      )
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const targetTransfers = yield* FoodCatalogTransfers;
        const preview = yield* targetTransfers.previewImportFromJson({
          input: {
            json: exported.json,
          },
        });
        const error = yield* targetTransfers
          .importSelectedFromJson({
            input: {
              json: exported.json,
              selectedFoodIds: [conflictingFood.id],
            },
          })
          .pipe(Effect.flip);

        return {
          error,
          preview,
        };
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [conflictingFood],
            },
          })
        )
      )
    );

    assert.instanceOf(result.error, FoodCatalogImportSelectionError);
    assert.equal(result.error.reason, "selected-food-conflict");
    assert.deepEqual(result.preview.candidates[0]?.selection, {
      defaultSelected: false,
      reasons: ["id-conflict"],
      selectable: false,
    });
  });

  it("rejects catalogs that contain app-default foods", async () => {
    const food = await Effect.runPromise(testFood);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transfers = yield* FoodCatalogTransfers;
        const exported = yield* transfers.exportToJson();
        const invalidJson = exported.json.replace(
          '"origin":"user"',
          '"origin":"app-default"'
        );

        return yield* transfers
          .previewImportFromJson({
            input: {
              json: invalidJson,
            },
          })
          .pipe(Effect.flip);
      }).pipe(
        Effect.provide(
          _foodCatalogTestLayer({
            stores: {
              ...emptyStores,
              foods: [food],
            },
          })
        )
      )
    );

    assert.isTrue(Schema.isSchemaError(result));
  });
});

function _foodCatalogTestLayer({
  stores,
}: {
  readonly stores: Store.NutritionStores;
}) {
  let currentStores = stores;
  const upsertFoods = (foods: readonly Domain.Food[]) =>
    Effect.sync(() => {
      currentStores = {
        ...currentStores,
        foods: [
          ...currentStores.foods.filter(
            (localFood) => !foods.some((food) => food.id === localFood.id)
          ),
          ...foods,
        ],
      };
    });

  const storeLayer = Layer.succeed(Store.NutritionStore, {
    countMealEntriesByDate: (dateKey) =>
      Effect.sync(
        () =>
          currentStores.mealEntries.filter(
            (mealEntry) => mealEntry.dateKey === dateKey
          ).length
      ),
    countMealEntriesByFood: (foodId) =>
      Effect.sync(
        () =>
          currentStores.mealEntries.filter(
            (mealEntry) => mealEntry.foodId === foodId
          ).length
      ),
    countMealEntriesByMealIds: (mealIds) =>
      Effect.sync(
        () =>
          currentStores.mealEntries.filter((mealEntry) =>
            mealIds.includes(mealEntry.mealId)
          ).length
      ),
    deleteMealEntry: (mealEntryId) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: currentStores.mealEntries.filter(
            (mealEntry) => mealEntry.id !== mealEntryId
          ),
        };
      }),
    deleteDailyLog: (dateKey) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          dailyLogs: currentStores.dailyLogs.filter(
            (dailyLog) => dailyLog.dateKey !== dateKey
          ),
        };
      }),
    deleteBodyWeightEntry: (dateKey) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          bodyWeightEntries: currentStores.bodyWeightEntries.filter(
            (bodyWeightEntry) => bodyWeightEntry.dateKey !== dateKey
          ),
        };
      }),
    findBodyWeightEntryByDateKey: (dateKey) =>
      Effect.sync(() =>
        currentStores.bodyWeightEntries.filter(
          (bodyWeightEntry) => bodyWeightEntry.dateKey === dateKey
        )
      ),
    findBodyWeightEntriesByRange: ({ endDateKey, startDateKey }) =>
      Effect.sync(() =>
        currentStores.bodyWeightEntries.filter(
          (bodyWeightEntry) =>
            bodyWeightEntry.dateKey >= startDateKey &&
            bodyWeightEntry.dateKey <= endDateKey
        )
      ),
    findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
      Effect.sync(() =>
        currentStores.activeMealPlanSelections.filter(
          (selection) => selection.id === activeMealPlanSelectionId
        )
      ),
    findDailyLogByDateKey: (dateKey) =>
      Effect.sync(() =>
        currentStores.dailyLogs.filter(
          (dailyLog) => dailyLog.dateKey === dateKey
        )
      ),
    findDailyLogsByPlan: (planId) =>
      Effect.sync(() =>
        currentStores.dailyLogs.filter((dailyLog) => dailyLog.planId === planId)
      ),
    findFoodById: (foodId) =>
      Effect.sync(() =>
        currentStores.foods.filter((food) => food.id === foodId)
      ),
    findFoodsByName: (name) =>
      Effect.sync(() =>
        currentStores.foods.filter((food) => food.name === name)
      ),
    findMealEntryById: (mealEntryId) =>
      Effect.sync(() =>
        currentStores.mealEntries.filter(
          (mealEntry) => mealEntry.id === mealEntryId
        )
      ),
    findMealEntriesByDate: (dateKey) =>
      Effect.sync(() =>
        currentStores.mealEntries.filter(
          (mealEntry) => mealEntry.dateKey === dateKey
        )
      ),
    findPlanById: (planId) =>
      Effect.sync(() =>
        currentStores.plans.filter((plan) => plan.id === planId)
      ),
    findPlansByName: (name) =>
      Effect.sync(() =>
        currentStores.plans.filter((plan) => plan.name === name)
      ),
    insertFood: (food) => upsertFoods([food]),
    insertMealEntry: (mealEntry) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: [
            ...currentStores.mealEntries.filter(
              (entry) => entry.id !== mealEntry.id
            ),
            mealEntry,
          ],
        };
      }),
    insertPlan: (plan) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          plans: [
            ...currentStores.plans.filter(
              (existingPlan) => existingPlan.id !== plan.id
            ),
            plan,
          ],
        };
      }),
    listDailyLogs: Effect.sync(() => currentStores.dailyLogs),
    listBodyWeightEntries: Effect.sync(() => currentStores.bodyWeightEntries),
    listFoods: Effect.sync(() => currentStores.foods),
    listMealEntries: Effect.sync(() => currentStores.mealEntries),
    listPlans: Effect.sync(() => currentStores.plans),
    readStores: Effect.sync(() => currentStores),
    replaceStores: (nextStores) =>
      Effect.sync(() => {
        currentStores = nextStores;
      }),
    upsertActiveMealPlanSelection: (selection) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          activeMealPlanSelections: [
            ...currentStores.activeMealPlanSelections.filter(
              (currentSelection) => currentSelection.id !== selection.id
            ),
            selection,
          ],
        };
      }),
    upsertDailyLog: (dailyLog) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          dailyLogs: [
            ...currentStores.dailyLogs.filter(
              (currentDailyLog) => currentDailyLog.dateKey !== dailyLog.dateKey
            ),
            dailyLog,
          ],
        };
      }),
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
    upsertFood: (food) => upsertFoods([food]),
    upsertFoods,
    upsertMealEntry: (mealEntry) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: [
            ...currentStores.mealEntries.filter(
              (entry) => entry.id !== mealEntry.id
            ),
            mealEntry,
          ],
        };
      }),
    upsertMealEntries: (mealEntries) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: [
            ...currentStores.mealEntries.filter(
              (entry) =>
                !mealEntries.some((mealEntry) => mealEntry.id === entry.id)
            ),
            ...mealEntries,
          ],
        };
      }),
    upsertPlans: (plans) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          plans: [
            ...currentStores.plans.filter(
              (plan) => !plans.some((nextPlan) => nextPlan.id === plan.id)
            ),
            ...plans,
          ],
        };
      }),
  });

  return Layer.mergeAll(
    storeLayer,
    FoodCatalogTransfers.layer.pipe(Layer.provide(storeLayer))
  );
}

const testDefaultFood = Schema.decodeEffect(Domain.Food)({
  carbsGrams: 13.81,
  category: "fruit",
  createdAt: 1781873744758,
  energyKcal: 52,
  fatGrams: 0.17,
  fiberGrams: 2.4,
  id: defaultFoodId,
  name: "apple",
  origin: "app-default",
  proteinGrams: 0.26,
  saltGrams: 0,
  saturatedFatGrams: 0.03,
  sugarGrams: 10.39,
  updatedAt: 1781873744758,
});

const testFood = Schema.decodeEffect(Domain.Food)({
  carbsGrams: 3.6,
  createdAt: 0,
  energyKcal: 59,
  fatGrams: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  origin: "user",
  proteinGrams: 10,
  updatedAt: 0,
});

const testConflictingFood = Schema.decodeEffect(Domain.Food)({
  carbsGrams: 10,
  createdAt: 0,
  energyKcal: 100,
  fatGrams: 1,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Different yogurt",
  origin: "user",
  proteinGrams: 1,
  updatedAt: 0,
});

const testSameNameLocalFood = Schema.decodeEffect(Domain.Food)({
  carbsGrams: 4,
  createdAt: 0,
  energyKcal: 61,
  fatGrams: 0.4,
  id: "f72a6e68-67ac-4caa-8dc3-f644751103ce",
  name: "Greek yogurt",
  origin: "user",
  proteinGrams: 10,
  updatedAt: 0,
});
