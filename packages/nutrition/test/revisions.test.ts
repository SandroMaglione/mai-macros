import { Crypto, Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Foods, MealEntries, MealPlans, Store } from "../src/index.ts";

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

const foodInput: typeof Domain.Food.Encoded = {
  carbsGrams: 3.6,
  createdAt: 0,
  energyKcal: 59,
  fatGrams: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  origin: "user",
  proteinGrams: 10,
  updatedAt: 0,
};

const planInput: typeof Domain.Plan.Encoded = {
  carbsTargetGrams: 220,
  createdAt: 0,
  fatTargetGrams: 70,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  meals: [
    {
      createdAt: 0,
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Breakfast",
      position: 0,
    },
    {
      createdAt: 0,
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
      name: "Lunch",
      position: 1,
    },
  ],
  name: "Training day",
  proteinTargetGrams: 160,
};

describe("nutrition revisions", () => {
  it("logs fractional named portions with their physical-size snapshot", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)({
          ...foodInput,
          nutritionReference: { amount: 100, unit: "ml" },
          portions: [
            {
              id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
              name: "X",
              position: 0,
              size: { amount: 250, unit: "ml" },
            },
          ],
        });
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          createdAt: 0,
          dateKey: "2026-06-20",
          planId: plan.id,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const mealEntries = yield* MealEntries.MealEntries;
          const store = yield* Store.NutritionStore;
          const created = yield* mealEntries.create({
            input: {
              dateKey: dailyLog.dateKey,
              foodId: food.id,
              mealId: plan.meals[0]?.id ?? "",
              quantity: {
                _tag: "PortionFoodQuantity",
                count: "2.5",
                portionId: food.portions[0]?.id ?? "",
              },
            },
          });

          return {
            created,
            stores: yield* store.readStores,
          };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                dailyLogs: [dailyLog],
                foods: [food],
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.created.mealEntry.nutritionMultiplier, 6.25);
    assert.equal(result.created.mealEntry.quantity._tag, "PortionFoodQuantity");
    if (result.created.mealEntry.quantity._tag === "PortionFoodQuantity") {
      assert.equal(result.created.mealEntry.quantity.count, 2.5);
      assert.equal(result.created.mealEntry.quantity.portionName, "X");
      assert.equal(result.created.mealEntry.quantity.portionSize.amount, 250);
      assert.equal(result.created.mealEntry.quantity.portionSize.unit, "ml");
    }
    assert.equal(result.stores.mealEntries.length, 1);
  });

  it("updates unused foods in place without growing the catalog", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;

          const revised = yield* foods.editFoodDetails({
            input: {
              foodId: food.id,
              name: "Greek yogurt 2%",
              energyKcal: "61",
              proteinGrams: "11",
              carbsGrams: "3.8",
              fatGrams: "0.5",
            },
          });
          const stores = yield* store.readStores;

          return { revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                foods: [food],
              },
            })
          )
        );
      })
    );

    const encodedFood = await Effect.runPromise(
      Schema.encodeEffect(Domain.Food)(result.revised.food)
    );

    assert.equal(result.revised.food.id, foodInput.id);
    assert.equal(result.stores.foods.length, 1);
    assert.equal(result.stores.foods[0]?.name, "Greek yogurt 2%");
    assert.equal(Object.keys(encodedFood).includes("basedOnFoodId"), false);
  });

  it("copies a food without changing meal entries that reference the source", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
        const mealEntry = yield* _mealEntry({
          foodId: food.id,
        });

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;

          const revised = yield* foods.copy({
            input: {
              sourceFoodId: food.id,
              name: "Greek yogurt 2%",
              energyKcal: "61",
              proteinGrams: "11",
              carbsGrams: "3.8",
              fatGrams: "0.5",
            },
          });
          const stores = yield* store.readStores;

          return { revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                foods: [food],
                mealEntries: [mealEntry],
              },
            })
          )
        );
      })
    );
    const encodedFood = await Effect.runPromise(
      Schema.encodeEffect(Domain.Food)(result.revised.food)
    );

    assert.notEqual(result.revised.food.id, foodInput.id);
    assert.equal(result.stores.foods.length, 2);
    assert.equal(result.stores.mealEntries[0]?.foodId, foodInput.id);
    assert.equal(Object.keys(encodedFood).includes("basedOnFoodId"), false);
  });

  it("edits a used food in place and recalculates its previous entries", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
        const mealEntry = yield* _mealEntry({ foodId: food.id });

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;
          const edited = yield* foods.editFoodDetails({
            input: {
              foodId: food.id,
              name: "Greek yogurt corrected",
              nutritionReference: { amount: "50", unit: "g" },
              energyKcal: "40",
              proteinGrams: "8",
              carbsGrams: "2",
              fatGrams: "0",
            },
          });

          return { edited, stores: yield* store.readStores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                foods: [food],
                mealEntries: [mealEntry],
              },
            })
          )
        );
      })
    );

    assert.equal(result.edited.food.id, foodInput.id);
    assert.equal(result.edited.revisedMealEntryCount, 1);
    assert.equal(result.stores.foods.length, 1);
    assert.equal(result.stores.mealEntries[0]?.foodId, foodInput.id);
    assert.equal(result.stores.mealEntries[0]?.nutritionMultiplier, 3);
  });

  it("changes a used portion everywhere but still rejects removing it", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)({
          ...foodInput,
          portions: [
            {
              id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
              name: "Scoop",
              position: 0,
              size: { amount: 30, unit: "g" },
            },
          ],
        });
        const mealEntry = yield* Schema.decodeEffect(Domain.MealEntry)({
          createdAt: 0,
          dateKey: "2026-06-20",
          foodId: food.id,
          id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
          mealId: planInput.meals[0]?.id ?? "",
          quantity: {
            _tag: "PortionFoodQuantity",
            count: 2,
            portionId: food.portions[0]?.id ?? "",
            portionName: "Scoop",
            portionSize: { amount: 30, unit: "g" },
          },
          nutritionMultiplier: 0.6,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const preview = yield* foods.previewFoodPortionEdit({
            input: {
              foodId: food.id,
              portionId: food.portions[0]?.id ?? "",
              name: "Small scoop",
              size: { amount: "25", unit: "g" },
            },
          });
          const edited = yield* foods.editFoodPortionEverywhere({
            input: {
              foodId: food.id,
              portionId: food.portions[0]?.id ?? "",
              name: "Small scoop",
              size: { amount: "25", unit: "g" },
            },
          });
          const removedFailure = yield* Effect.flip(
            foods.removeUnusedFoodPortion({
              input: {
                foodId: food.id,
                portionId: food.portions[0]?.id ?? "",
              },
            })
          );
          const store = yield* Store.NutritionStore;

          return {
            edited,
            preview,
            removedFailure,
            stores: yield* store.readStores,
          };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                foods: [food],
                mealEntries: [mealEntry],
              },
            })
          )
        );
      })
    );

    assert.equal(result.preview.usage.mealEntryCount, 1);
    assert.equal(result.preview.usage.firstDateKey, "2026-06-20");
    assert.equal(result.edited.revisedMealEntryCount, 1);
    assert.equal(result.stores.foods[0]?.portions[0]?.name, "Small scoop");
    const revisedEntry = result.stores.mealEntries[0];
    assert.equal(revisedEntry?.nutritionMultiplier, 0.5);
    assert.equal(revisedEntry?.quantity._tag, "PortionFoodQuantity");
    if (revisedEntry?.quantity._tag === "PortionFoodQuantity") {
      assert.equal(revisedEntry.quantity.portionName, "Small scoop");
      assert.equal(revisedEntry.quantity.portionSize.amount, 25);
    }
    assert(result.removedFailure._tag === "UsedFoodPortionMutationNotAllowed");
    assert.equal(result.removedFailure.operation, "remove");
  });

  it("copies portions with new identities that are independent from the source", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)({
          ...foodInput,
          portions: [
            {
              id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
              name: "Scoop",
              position: 0,
              size: { amount: 30, unit: "g" },
            },
          ],
        });

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          return yield* foods.copy({
            input: {
              sourceFoodId: food.id,
              name: food.name,
              energyKcal: `${food.energyKcal}`,
              proteinGrams: `${food.proteinGrams}`,
              carbsGrams: `${food.carbsGrams}`,
              fatGrams: `${food.fatGrams}`,
            },
          });
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: { ...emptyStores, foods: [food] },
            })
          )
        );
      })
    );

    assert.notEqual(
      result.food.portions[0]?.id,
      result.sourceFood.portions[0]?.id
    );
    assert.equal(result.food.portions[0]?.name, "Scoop");
    assert.equal(result.sourceFood.portions[0]?.name, "Scoop");
  });

  it("adds, edits, and removes a portion that has never been used", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;
          const added = yield* foods.addFoodPortion({
            input: {
              foodId: food.id,
              name: "Cup",
              size: { amount: "240", unit: "ml" },
            },
          });
          const edited = yield* foods.editFoodPortionEverywhere({
            input: {
              foodId: food.id,
              portionId: added.portion.id,
              name: "Small cup",
              size: { amount: "200", unit: "ml" },
            },
          });
          const removed = yield* foods.removeUnusedFoodPortion({
            input: { foodId: food.id, portionId: added.portion.id },
          });

          return { added, edited, removed, stores: yield* store.readStores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({ stores: { ...emptyStores, foods: [food] } })
          )
        );
      })
    );

    assert.equal(result.added.portion.name, "Cup");
    assert.equal(result.edited.portion.id, result.added.portion.id);
    assert.equal(result.edited.revisedMealEntryCount, 0);
    assert.equal(result.removed.portion.id, result.added.portion.id);
    assert.equal(result.stores.foods[0]?.portions.length, 0);
    assert.equal(result.stores.mealEntries.length, 0);
  });

  it("updates unused plans in place without creating a daily log", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

        return yield* Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
          const store = yield* Store.NutritionStore;

          const revised = yield* mealPlans.revise({
            input: {
              planId: plan.id,
              dateKey: "2026-06-20",
              name: "Training day",
              meals: [
                {
                  id: plan.meals[0]?.id,
                  name: "Early breakfast",
                },
              ],
              proteinTargetGrams: "170",
              carbsTargetGrams: "230",
              fatTargetGrams: "65",
            },
          });
          const stores = yield* store.readStores;

          return { revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.revised.plan.id, planInput.id);
    assert.equal(result.stores.plans.length, 1);
    assert.deepEqual(
      result.stores.plans[0]?.meals.map((meal) => ({
        id: meal.id,
        name: meal.name,
        position: meal.position,
      })),
      [
        {
          id: planInput.meals[0]?.id,
          name: "Early breakfast",
          position: 0,
        },
      ]
    );
    assert.equal(result.revised.dailyLog, null);
    assert.equal(result.stores.dailyLogs.length, 0);
  });

  it("creates a new active plan when a daily log references the old plan", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const mealEntry = yield* _mealEntry({
          foodId: foodInput.id,
          mealId: plan.meals[0]?.id,
        });
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          createdAt: 0,
          dateKey: mealEntry.dateKey,
          planId: plan.id,
          updatedAt: 0,
        });
        const activeSelection = yield* Schema.decodeEffect(
          Domain.ActiveMealPlanSelection
        )({
          id: "active-meal-plan",
          planId: plan.id,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
          const store = yield* Store.NutritionStore;

          const revised = yield* mealPlans.revise({
            input: {
              planId: plan.id,
              dateKey: dailyLog.dateKey,
              name: "Training day revised",
              meals: [
                {
                  id: plan.meals[0]?.id,
                  name: "Breakfast",
                },
              ],
              proteinTargetGrams: "170",
              carbsTargetGrams: "230",
              fatTargetGrams: "65",
            },
          });
          const stores = yield* store.readStores;

          return { dailyLog, revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                activeMealPlanSelections: [activeSelection],
                dailyLogs: [dailyLog],
                mealEntries: [mealEntry],
                plans: [plan],
              },
            })
          )
        );
      })
    );
    const encodedPlan = await Effect.runPromise(
      Schema.encodeEffect(Domain.Plan)(result.revised.plan)
    );

    assert.notEqual(result.revised.plan.id, planInput.id);
    assert.equal(result.stores.plans.length, 2);
    assert.equal(result.stores.dailyLogs[0]?.planId, planInput.id);
    assert.equal(
      result.stores.activeMealPlanSelections[0]?.planId,
      result.revised.plan.id
    );
    assert.notEqual(result.revised.plan.meals[0]?.id, planInput.meals[0]?.id);
    assert.equal(Object.keys(encodedPlan).includes("basedOnPlanId"), false);
    assert.equal(
      Object.keys(encodedPlan.meals[0] ?? {}).includes("basedOnMealId"),
      false
    );
  });

  it("creates a new plan when old meal ids are referenced without a matching daily log", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const mealEntry = yield* _mealEntry({
          foodId: foodInput.id,
          mealId: plan.meals[0]?.id,
        });

        return yield* Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
          const store = yield* Store.NutritionStore;

          const revised = yield* mealPlans.revise({
            input: {
              planId: plan.id,
              dateKey: "2026-06-20",
              name: "Training day revised",
              meals: [{ name: "Breakfast" }],
              proteinTargetGrams: "170",
              carbsTargetGrams: "230",
              fatTargetGrams: "65",
            },
          });
          const stores = yield* store.readStores;

          return { revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                mealEntries: [mealEntry],
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.notEqual(result.revised.plan.id, planInput.id);
    assert.equal(result.stores.dailyLogs.length, 0);
    assert.equal(
      result.stores.activeMealPlanSelections[0]?.planId,
      result.revised.plan.id
    );
  });

  it("does not create a current-date daily log for a revised used plan", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          createdAt: 0,
          dateKey: "2026-06-20",
          planId: plan.id,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
          const store = yield* Store.NutritionStore;

          const revised = yield* mealPlans.revise({
            input: {
              planId: plan.id,
              dateKey: "2026-06-21",
              name: "Training day revised",
              meals: [{ name: "Breakfast" }],
              proteinTargetGrams: "170",
              carbsTargetGrams: "230",
              fatTargetGrams: "65",
            },
          });
          const stores = yield* store.readStores;

          return { revised, stores };
        }).pipe(
          Effect.provide(
            _revisionTestLayer({
              stores: {
                ...emptyStores,
                dailyLogs: [dailyLog],
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.revised.dailyLog, null);
    assert.equal(result.stores.dailyLogs.length, 1);
    assert.equal(
      result.stores.dailyLogs.find(
        (dailyLog) => dailyLog.dateKey === "2026-06-20"
      )?.planId,
      planInput.id
    );
    assert.equal(
      result.stores.dailyLogs.find(
        (dailyLog) => dailyLog.dateKey === "2026-06-21"
      ),
      undefined
    );
  });
});

function _revisionTestLayer({
  stores,
}: {
  readonly stores: Store.NutritionStores;
}) {
  let currentStores = stores;
  const storeLayer = Layer.succeed(Store.NutritionStore, {
    applyFoodEdit: ({ food, mealEntries }) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          foods: [
            ...currentStores.foods.filter(
              (currentFood) => currentFood.id !== food.id
            ),
            food,
          ],
          mealEntries: [
            ...currentStores.mealEntries.filter(
              (currentMealEntry) =>
                !mealEntries.some(
                  (mealEntry) => mealEntry.id === currentMealEntry.id
                )
            ),
            ...mealEntries,
          ],
        };
      }),
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
    insertFood: (food) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          foods: [...currentStores.foods, food],
        };
      }),
    insertMealEntry: (mealEntry) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: [...currentStores.mealEntries, mealEntry],
        };
      }),
    insertPlan: (plan) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          plans: [...currentStores.plans, plan],
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
    upsertFood: (food) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          foods: [
            ...currentStores.foods.filter(
              (currentFood) => currentFood.id !== food.id
            ),
            food,
          ],
        };
      }),
    upsertFoods: (foods) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          foods: [
            ...currentStores.foods.filter(
              (currentFood) => !foods.some((food) => food.id === currentFood.id)
            ),
            ...foods,
          ],
        };
      }),
    upsertMealEntry: (mealEntry) =>
      Effect.sync(() => {
        currentStores = {
          ...currentStores,
          mealEntries: [
            ...currentStores.mealEntries.filter(
              (currentMealEntry) => currentMealEntry.id !== mealEntry.id
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
              (currentMealEntry) =>
                !mealEntries.some(
                  (mealEntry) => mealEntry.id === currentMealEntry.id
                )
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
              (currentPlan) => !plans.some((plan) => plan.id === currentPlan.id)
            ),
            ...plans,
          ],
        };
      }),
  } satisfies Store.NutritionStore["Service"]);
  let nextByte = 1;
  const cryptoLayer = Layer.succeed(
    Crypto.Crypto,
    Crypto.make({
      digest: (algorithm, data) =>
        Effect.succeed(algorithm).pipe(Effect.as(data)),
      randomBytes: (size) => {
        const bytes = new Uint8Array(size);

        bytes.fill(nextByte);
        nextByte += 1;

        return bytes;
      },
    })
  );

  return Layer.mergeAll(
    Foods.Foods.layer,
    MealEntries.MealEntries.layer,
    MealPlans.MealPlans.layer
  ).pipe(Layer.provideMerge(storeLayer), Layer.provideMerge(cryptoLayer));
}

function _mealEntry({
  foodId,
  mealId = "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
}: {
  readonly foodId: Domain.FoodId | string;
  readonly mealId?: Domain.MealId | string | undefined;
}) {
  return Schema.decodeEffect(Domain.MealEntry)({
    createdAt: 0,
    dateKey: "2026-06-20",
    foodId,
    id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
    mealId,
    quantity: {
      _tag: "MeasuredFoodQuantity",
      amount: 150,
      unit: "g",
    },
    nutritionMultiplier: 1.5,
    updatedAt: 0,
  });
}
