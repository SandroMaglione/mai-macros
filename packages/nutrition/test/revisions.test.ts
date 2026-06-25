import { Crypto, Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { Domain, Foods, MealPlans, Store } from "../src/index.ts";

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

const foodInput: typeof Domain.Food.Encoded = {
  carbsGramsPer100g: 3.6,
  createdAt: 0,
  energyKcalPer100g: 59,
  fatGramsPer100g: 0.4,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  origin: "user",
  proteinGramsPer100g: 10,
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
  it("updates unused foods in place without growing the catalog", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;

          const revised = yield* foods.revise({
            input: {
              foodId: food.id,
              name: "Greek yogurt 2%",
              energyKcalPer100g: "61",
              proteinGramsPer100g: "11",
              carbsGramsPer100g: "3.8",
              fatGramsPer100g: "0.5",
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

  it("creates a new food when meal entries already reference the old food", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
        const mealEntry = yield* _mealEntry({
          foodId: food.id,
        });

        return yield* Effect.gen(function* () {
          const foods = yield* Foods.Foods;
          const store = yield* Store.NutritionStore;

          const revised = yield* foods.revise({
            input: {
              foodId: food.id,
              name: "Greek yogurt 2%",
              energyKcalPer100g: "61",
              proteinGramsPer100g: "11",
              carbsGramsPer100g: "3.8",
              fatGramsPer100g: "0.5",
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

  return Layer.mergeAll(Foods.Foods.layer, MealPlans.MealPlans.layer).pipe(
    Layer.provideMerge(storeLayer),
    Layer.provideMerge(cryptoLayer)
  );
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
    quantityGrams: 150,
    updatedAt: 0,
  });
}
