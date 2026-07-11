import { Effect, Layer, Schema } from "effect";
import { assert, describe, it } from "vitest";

import { DailyLogs, Domain, Store } from "../src/index.ts";

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
  ],
  name: "Training day",
  proteinTargetGrams: 160,
};

const secondaryPlanInput: typeof Domain.Plan.Encoded = {
  carbsTargetGrams: 160,
  createdAt: 0,
  fatTargetGrams: 90,
  id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
  meals: [
    {
      createdAt: 0,
      id: "9535a059-a61f-42e1-a2e0-35ec87203c35:breakfast",
      name: "Breakfast",
      position: 0,
    },
  ],
  name: "Rest day",
  proteinTargetGrams: 140,
};

const emptyStores: Store.NutritionStores = {
  activeMealPlanSelections: [],
  bodyWeightEntries: [],
  dailyLogs: [],
  foods: [],
  mealEntries: [],
  plans: [],
};

describe("DailyLogs", () => {
  it("opens a missing day as unrecorded without creating it", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const selection = yield* Schema.decodeEffect(
          Domain.ActiveMealPlanSelection
        )({
          id: "active-meal-plan",
          planId: plan.id,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const day = yield* dailyLogs.open({
            input: {
              dateKey: "2026-06-20",
            },
          });
          const stores = yield* store.readStores;

          return {
            day,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
              stores: {
                ...emptyStores,
                activeMealPlanSelections: [selection],
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.day._tag, "UnrecordedDay");
    assert.equal(result.day.selectedPlan.id, planInput.id);
    assert.equal(result.stores.dailyLogs.length, 0);
  });

  it("creates a missing day only through the explicit create operation", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const day = yield* dailyLogs.create({
            input: {
              dateKey: "2026-06-20",
              planId: plan.id,
            },
          });
          const stores = yield* store.readStores;

          return {
            day,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
              stores: {
                ...emptyStores,
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.day._tag, "OpenedDay");
    assert.equal(result.stores.dailyLogs.length, 1);
    assert.equal(result.stores.dailyLogs[0]?.dateKey, "2026-06-20");
    assert.equal(result.stores.dailyLogs[0]?.planId, planInput.id);
  });

  it("openOrCreate materializes a missing day with the selected plan", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const day = yield* dailyLogs.openOrCreate({
            input: {
              dateKey: "2026-06-20",
            },
          });
          const stores = yield* store.readStores;

          return {
            day,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
              stores: {
                ...emptyStores,
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.day._tag, "OpenedDay");
    assert.equal(result.stores.dailyLogs.length, 1);
    assert.equal(result.stores.dailyLogs[0]?.planId, planInput.id);
  });

  it("does not change the plan for an unrecorded day", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const secondaryPlan = yield* Schema.decodeEffect(Domain.Plan)(
          secondaryPlanInput
        );

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const outcome = yield* dailyLogs
            .changePlan({
              input: {
                dateKey: "2026-06-20",
                planId: secondaryPlan.id,
              },
            })
            .pipe(
              Effect.catchTag("DailyLogNotFound", () =>
                Effect.succeed("DailyLogNotFound" as const)
              )
            );
          const stores = yield* store.readStores;

          return {
            outcome,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
              stores: {
                ...emptyStores,
                plans: [plan, secondaryPlan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.outcome, "DailyLogNotFound");
    assert.equal(result.stores.dailyLogs.length, 0);
  });

  it("removes a recorded day when it has no meal entries", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          dateKey: "2026-06-20",
          planId: plan.id,
          createdAt: 0,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const removed = yield* dailyLogs.remove({
            input: {
              dateKey: dailyLog.dateKey,
            },
          });
          const stores = yield* store.readStores;

          return {
            removed,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
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

    assert.equal(result.removed._tag, "RemovedDay");
    assert.equal(result.removed.day._tag, "UnrecordedDay");
    assert.equal(result.removed.day.dateKey, "2026-06-20");
    assert.equal(result.stores.dailyLogs.length, 0);
  });

  it("does not remove a recorded day with meal entries", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
        const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
          dateKey: "2026-06-20",
          planId: plan.id,
          createdAt: 0,
          updatedAt: 0,
        });
        const mealEntry = yield* Schema.decodeEffect(Domain.MealEntry)({
          id: "9535a059-a61f-42e1-a2e0-35ec87203c45",
          dateKey: dailyLog.dateKey,
          mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
          foodId: "9535a059-a61f-42e1-a2e0-35ec87203c55",
          quantity: {
            _tag: "MeasuredFoodQuantity",
            amount: 100,
            unit: "g",
          },
          nutritionMultiplier: 1,
          createdAt: 0,
          updatedAt: 0,
        });

        return yield* Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const store = yield* Store.NutritionStore;
          const outcome = yield* dailyLogs
            .remove({
              input: {
                dateKey: dailyLog.dateKey,
              },
            })
            .pipe(
              Effect.catchTag("CannotRemoveLoggedDay", () =>
                Effect.succeed("CannotRemoveLoggedDay" as const)
              )
            );
          const stores = yield* store.readStores;

          return {
            outcome,
            stores,
          };
        }).pipe(
          Effect.provide(
            _dailyLogsTestLayer({
              stores: {
                ...emptyStores,
                dailyLogs: [dailyLog],
                mealEntries: [mealEntry],
                plans: [plan],
              },
            })
          )
        );
      })
    );

    assert.equal(result.outcome, "CannotRemoveLoggedDay");
    assert.equal(result.stores.dailyLogs.length, 1);
    assert.equal(result.stores.dailyLogs[0]?.dateKey, "2026-06-20");
    assert.equal(result.stores.mealEntries.length, 1);
  });
});

function _dailyLogsTestLayer({
  stores,
}: {
  readonly stores: Store.NutritionStores;
}) {
  let currentStores = stores;
  const storeLayer = Layer.succeed(Store.NutritionStore, {
    applyFoodEdit: () => Effect.void,
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

  return DailyLogs.DailyLogs.layer.pipe(Layer.provideMerge(storeLayer));
}
