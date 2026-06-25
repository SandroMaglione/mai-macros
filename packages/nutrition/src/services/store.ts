import { Context, Data, Effect } from "effect";

import type {
  ActiveMealPlanSelection,
  ActiveMealPlanSelectionId,
  DailyLog,
  DateKey,
  Food,
  FoodId,
  MealEntry,
  MealEntryId,
  MealId,
  Plan,
  PlanId,
} from "../domain.ts";

export class NutritionStoreError extends Data.TaggedError(
  "NutritionStoreError"
)<{
  readonly cause: unknown;
}> {}

type StoreEffect<Value> = Effect.Effect<Value, NutritionStoreError, never>;
type StoreMutation = StoreEffect<unknown>;

export type NutritionStores = {
  readonly activeMealPlanSelections: readonly ActiveMealPlanSelection[];
  readonly dailyLogs: readonly DailyLog[];
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
  readonly plans: readonly Plan[];
};

export class NutritionStore extends Context.Service<
  NutritionStore,
  {
    readonly countMealEntriesByDate: (dateKey: DateKey) => StoreEffect<number>;

    readonly countMealEntriesByFood: (foodId: FoodId) => StoreEffect<number>;

    readonly countMealEntriesByMealIds: (
      mealIds: readonly MealId[]
    ) => StoreEffect<number>;

    readonly deleteMealEntry: (mealEntryId: MealEntryId) => StoreMutation;

    readonly deleteDailyLog: (dateKey: DateKey) => StoreMutation;

    readonly findActiveMealPlanSelectionById: (
      activeMealPlanSelectionId: ActiveMealPlanSelectionId
    ) => StoreEffect<readonly ActiveMealPlanSelection[]>;

    readonly findDailyLogByDateKey: (
      dateKey: DateKey
    ) => StoreEffect<readonly DailyLog[]>;

    readonly findDailyLogsByPlan: (
      planId: PlanId
    ) => StoreEffect<readonly DailyLog[]>;

    readonly findFoodById: (foodId: FoodId) => StoreEffect<readonly Food[]>;

    readonly findFoodsByName: (
      name: Food["name"]
    ) => StoreEffect<readonly Food[]>;

    readonly findMealEntryById: (
      mealEntryId: MealEntryId
    ) => StoreEffect<readonly MealEntry[]>;

    readonly findMealEntriesByDate: (
      dateKey: DateKey
    ) => StoreEffect<readonly MealEntry[]>;

    readonly findPlanById: (planId: PlanId) => StoreEffect<readonly Plan[]>;

    readonly findPlansByName: (
      name: Plan["name"]
    ) => StoreEffect<readonly Plan[]>;

    readonly insertFood: (food: Food) => StoreMutation;

    readonly insertMealEntry: (mealEntry: MealEntry) => StoreMutation;

    readonly insertPlan: (plan: Plan) => StoreMutation;

    readonly listDailyLogs: StoreEffect<readonly DailyLog[]>;

    readonly listFoods: StoreEffect<readonly Food[]>;

    readonly listMealEntries: StoreEffect<readonly MealEntry[]>;

    readonly listPlans: StoreEffect<readonly Plan[]>;

    readonly readStores: StoreEffect<NutritionStores>;

    readonly replaceStores: (stores: NutritionStores) => StoreMutation;

    readonly upsertActiveMealPlanSelection: (
      selection: ActiveMealPlanSelection
    ) => StoreMutation;

    readonly upsertDailyLog: (dailyLog: DailyLog) => StoreMutation;

    readonly upsertFood: (food: Food) => StoreMutation;

    readonly upsertFoods: (foods: readonly Food[]) => StoreMutation;

    readonly upsertMealEntry: (mealEntry: MealEntry) => StoreMutation;

    readonly upsertMealEntries: (
      mealEntries: readonly MealEntry[]
    ) => StoreMutation;

    readonly upsertPlans: (plans: readonly Plan[]) => StoreMutation;
  }
>()("@mai/nutrition/NutritionStore") {}
