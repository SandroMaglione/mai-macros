import {
  IndexedDb,
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer, References, Schema } from "effect";

import {
  DefaultFoods,
  Domain,
  LocalData as NutritionLocalData,
  Metadata,
  Migrations,
  Store,
} from "@mai/nutrition";

const CustomPlanMealsMigration = Migrations.Version004CustomPlanMeals;

class LegacyFood extends Schema.Class<LegacyFood>("LegacyFood")({
  id: Domain.FoodId,
  basedOnFoodId: Schema.optional(Domain.FoodId),
  name: Domain.NonEmptyString,
  brand: Schema.optional(Domain.NonEmptyString),
  category: Schema.optional(Domain.FoodCategory),
  origin: Schema.optional(Domain.FoodOrigin),
  energyKcalPer100g: Domain.NonNegativeNumber,
  proteinGramsPer100g: Domain.NonNegativeNumber,
  carbsGramsPer100g: Domain.NonNegativeNumber,
  fatGramsPer100g: Domain.NonNegativeNumber,
  fiberGramsPer100g: Schema.optional(Domain.NonNegativeNumber),
  sugarGramsPer100g: Schema.optional(Domain.NonNegativeNumber),
  saturatedFatGramsPer100g: Schema.optional(Domain.NonNegativeNumber),
  saltGramsPer100g: Schema.optional(Domain.NonNegativeNumber),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyFoodsTable extends IndexedDbTable.make({
  name: "foods",
  schema: LegacyFood,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

export class FoodsTable extends IndexedDbTable.make({
  name: "foods",
  schema: Domain.Food,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

export class PlansTable extends IndexedDbTable.make({
  name: "plans",
  schema: Domain.Plan,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

class LegacyPlansTable extends IndexedDbTable.make({
  name: "plans",
  schema: CustomPlanMealsMigration.PlanBeforeCustomPlanMeals,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

export class DailyLogsTable extends IndexedDbTable.make({
  name: "dailyLogs",
  schema: Domain.DailyLog,
  keyPath: "dateKey",
  indexes: {
    byPlan: "planId",
  },
}) {}

export class ActiveMealPlanSelectionsTable extends IndexedDbTable.make({
  name: "activeMealPlanSelections",
  schema: Domain.ActiveMealPlanSelection,
  keyPath: "id",
}) {}

export class MealEntriesTable extends IndexedDbTable.make({
  name: "mealEntries",
  schema: Domain.MealEntry,
  keyPath: "id",
  indexes: {
    byDate: "dateKey",
    byDateMealId: ["dateKey", "mealId"],
    byFood: "foodId",
    byMeal: "mealId",
  },
}) {}

class LegacyMealEntriesTable extends IndexedDbTable.make({
  name: "mealEntries",
  schema: CustomPlanMealsMigration.MealEntryBeforeCustomPlanMeals,
  keyPath: "id",
  indexes: {
    byDate: "dateKey",
    byDateMeal: ["dateKey", "meal"],
    byFood: "foodId",
  },
}) {}

export class MaiVersion1 extends IndexedDbVersion.make(
  LegacyFoodsTable,
  LegacyPlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  LegacyMealEntriesTable
) {}

export class MaiVersion2 extends IndexedDbVersion.make(
  LegacyFoodsTable,
  LegacyPlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  LegacyMealEntriesTable
) {}

export class MaiVersion3 extends IndexedDbVersion.make(
  FoodsTable,
  LegacyPlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  LegacyMealEntriesTable
) {}

export class MaiVersion4 extends IndexedDbVersion.make(
  FoodsTable,
  PlansTable,
  DailyLogsTable,
  ActiveMealPlanSelectionsTable,
  MealEntriesTable
) {}

export class MaiDatabase extends IndexedDbDatabase.make(
  MaiVersion1,
  Effect.fn(function* (api) {
    yield* api.createObjectStore("foods");
    yield* api.createIndex("foods", "byName");
    yield* api.createObjectStore("plans");
    yield* api.createIndex("plans", "byName");
    yield* api.createObjectStore("dailyLogs");
    yield* api.createIndex("dailyLogs", "byPlan");
    yield* api.createObjectStore("activeMealPlanSelections");
    yield* api.createObjectStore("mealEntries");
    yield* api.createIndex("mealEntries", "byDate");
    yield* api.createIndex("mealEntries", "byDateMeal");
    yield* api.createIndex("mealEntries", "byFood");
  })
)
  .add(
    MaiVersion2,
    Effect.fn(function* (from, to) {
      const plans = yield* from.from("plans").select();
      const usedNames: string[] = [];
      const renamedPlans = yield* Effect.forEach(plans, (plan) =>
        Effect.gen(function* () {
          const baseName = plan.name.trim() === "" ? "Plan" : plan.name.trim();
          let index = 0;
          let name = baseName;

          while (usedNames.includes(name)) {
            index += 1;
            name = `${baseName} (${index})`;
          }

          usedNames.push(name);

          const encodedPlan = yield* Schema.encodeEffect(
            CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
          )(plan);

          return yield* Schema.decodeEffect(
            CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
          )({
            ...encodedPlan,
            name,
          });
        })
      );

      yield* from.deleteIndex("plans", "byName");
      yield* to.from("plans").upsertAll(renamedPlans);
      yield* to.createIndex("plans", "byName", { unique: true });
    })
  )
  .add(
    MaiVersion3,
    Effect.fn(function* (from, to) {
      yield* Effect.gen(function* () {
        const legacyFoods = yield* from.from("foods").select();
        const userFoods = legacyFoods.map((food) => ({
          brand: food.brand,
          category: food.category,
          carbsGramsPer100g: food.carbsGramsPer100g,
          createdAt: food.createdAt,
          energyKcalPer100g: food.energyKcalPer100g,
          fatGramsPer100g: food.fatGramsPer100g,
          fiberGramsPer100g: food.fiberGramsPer100g,
          id: food.id,
          name: food.name,
          origin: food.origin ?? "user",
          proteinGramsPer100g: food.proteinGramsPer100g,
          saltGramsPer100g: food.saltGramsPer100g,
          saturatedFatGramsPer100g: food.saturatedFatGramsPer100g,
          sugarGramsPer100g: food.sugarGramsPer100g,
          updatedAt: food.updatedAt,
        }));
        const defaultFoods = yield* Schema.decodeEffect(
          Schema.Array(Domain.Food)
        )(DefaultFoods.DefaultFoods);

        yield* to.from("foods").upsertAll([...userFoods, ...defaultFoods]);
      }).pipe(Effect.provideService(References.PreventSchedulerYield, true));
    })
  )
  .add(
    MaiVersion4,
    Effect.fn(function* (from, to) {
      yield* Effect.gen(function* () {
        const legacyPlans = yield* from.from("plans").select();
        const dailyLogs = yield* from.from("dailyLogs").select();
        const activeMealPlanSelections = yield* from
          .from("activeMealPlanSelections")
          .select();
        const legacyMealEntries = yield* from.from("mealEntries").select();
        const plans =
          yield* CustomPlanMealsMigration.migratePlansToCustomPlanMeals({
            plans: legacyPlans,
          });
        const migratedMealEntries =
          yield* CustomPlanMealsMigration.migrateMealEntriesToCustomPlanMeals({
            activeMealPlanSelections,
            dailyLogs,
            mealEntries: legacyMealEntries,
            plans,
          });

        yield* from.deleteIndex("mealEntries", "byDateMeal");
        yield* to.from("plans").upsertAll(Array.from(plans));
        yield* to
          .from("dailyLogs")
          .upsertAll(Array.from(migratedMealEntries.dailyLogs));
        yield* to
          .from("mealEntries")
          .upsertAll(Array.from(migratedMealEntries.mealEntries));
        yield* to.createIndex("mealEntries", "byDateMealId");
        yield* to.createIndex("mealEntries", "byMeal");
      }).pipe(Effect.provideService(References.PreventSchedulerYield, true));
    })
  ) {}

export const BrowserDatabaseLayer = MaiDatabase.layer(
  Metadata.DatabaseName
).pipe(Layer.provide(IndexedDb.layerWindow));

const _mapStoreError = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new Store.NutritionStoreError({
          cause,
        })
    )
  );

export const IndexedDbLocalDataLayer = Layer.effect(
  NutritionLocalData.LocalData,
  Effect.gen(function* () {
    const database = yield* IndexedDbDatabase.IndexedDbDatabase;

    return NutritionLocalData.LocalData.of({
      reset: database.rebuild.pipe(
        Effect.mapError(
          (cause) =>
            new NutritionLocalData.LocalDataResetError({
              cause,
            })
        )
      ),
    });
  })
);

export const BrowserLocalDataLayer = IndexedDbLocalDataLayer.pipe(
  Layer.provide(BrowserDatabaseLayer)
);

export const IndexedDbNutritionStoreLayer = Layer.effect(
  Store.NutritionStore,
  Effect.gen(function* () {
    const api = yield* MaiDatabase.getQueryBuilder;
    const tables = [
      "activeMealPlanSelections",
      "dailyLogs",
      "foods",
      "mealEntries",
      "plans",
    ] as const;

    return {
      countMealEntriesByDate: (dateKey) =>
        _mapStoreError(api.from("mealEntries").count("byDate").equals(dateKey)),

      countMealEntriesByFood: (foodId) =>
        _mapStoreError(api.from("mealEntries").count("byFood").equals(foodId)),

      countMealEntriesByMealIds: (mealIds) =>
        _mapStoreError(
          Effect.forEach(mealIds, (mealId) =>
            api.from("mealEntries").count("byMeal").equals(mealId)
          ).pipe(
            Effect.map((counts) =>
              counts.reduce((total, count) => total + count, 0)
            )
          )
        ),

      deleteMealEntry: (mealEntryId) =>
        _mapStoreError(api.from("mealEntries").delete().equals(mealEntryId)),

      findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
        _mapStoreError(
          api
            .from("activeMealPlanSelections")
            .select()
            .equals(activeMealPlanSelectionId)
        ),

      findDailyLogByDateKey: (dateKey) =>
        _mapStoreError(api.from("dailyLogs").select().equals(dateKey)),

      findDailyLogsByPlan: (planId) =>
        _mapStoreError(api.from("dailyLogs").select("byPlan").equals(planId)),

      findFoodById: (foodId) =>
        _mapStoreError(api.from("foods").select().equals(foodId)),

      findFoodsByName: (name) =>
        _mapStoreError(api.from("foods").select("byName").equals(name)),

      findMealEntryById: (mealEntryId) =>
        _mapStoreError(api.from("mealEntries").select().equals(mealEntryId)),

      findMealEntriesByDate: (dateKey) =>
        _mapStoreError(
          api.from("mealEntries").select("byDate").equals(dateKey)
        ),

      findPlanById: (planId) =>
        _mapStoreError(api.from("plans").select().equals(planId)),

      findPlansByName: (name) =>
        _mapStoreError(api.from("plans").select("byName").equals(name)),

      insertFood: (food) => _mapStoreError(api.from("foods").insert(food)),

      insertMealEntry: (mealEntry) =>
        _mapStoreError(api.from("mealEntries").insert(mealEntry)),

      insertPlan: (plan) => _mapStoreError(api.from("plans").insert(plan)),

      listDailyLogs: _mapStoreError(api.from("dailyLogs").select()),

      listFoods: _mapStoreError(api.from("foods").select()),

      listMealEntries: _mapStoreError(api.from("mealEntries").select()),

      listPlans: _mapStoreError(api.from("plans").select()),

      readStores: _mapStoreError(
        api.withTransaction({
          mode: "readonly",
          tables,
        })(
          Effect.gen(function* () {
            const activeMealPlanSelections = yield* api
              .from("activeMealPlanSelections")
              .select();
            const dailyLogs = yield* api.from("dailyLogs").select();
            const foods = yield* api.from("foods").select();
            const mealEntries = yield* api.from("mealEntries").select();
            const plans = yield* api.from("plans").select();

            return {
              activeMealPlanSelections,
              dailyLogs,
              foods,
              mealEntries,
              plans,
            } satisfies Store.NutritionStores;
          })
        )
      ),

      replaceStores: (stores) =>
        _mapStoreError(
          api.withTransaction({
            mode: "readwrite",
            tables,
          })(
            Effect.gen(function* () {
              yield* api.from("activeMealPlanSelections").clear;
              yield* api.from("dailyLogs").clear;
              yield* api.from("foods").clear;
              yield* api.from("mealEntries").clear;
              yield* api.from("plans").clear;
              yield* api
                .from("activeMealPlanSelections")
                .upsertAll(Array.from(stores.activeMealPlanSelections));
              yield* api
                .from("dailyLogs")
                .upsertAll(Array.from(stores.dailyLogs));
              yield* api.from("foods").upsertAll(Array.from(stores.foods));
              yield* api
                .from("mealEntries")
                .upsertAll(Array.from(stores.mealEntries));
              yield* api.from("plans").upsertAll(Array.from(stores.plans));
            })
          )
        ),

      upsertActiveMealPlanSelection: (selection) =>
        _mapStoreError(api.from("activeMealPlanSelections").upsert(selection)),

      upsertDailyLog: (dailyLog) =>
        _mapStoreError(api.from("dailyLogs").upsert(dailyLog)),

      upsertFood: (food) => _mapStoreError(api.from("foods").upsert(food)),

      upsertFoods: (foods) =>
        _mapStoreError(api.from("foods").upsertAll(Array.from(foods))),

      upsertMealEntry: (mealEntry) =>
        _mapStoreError(api.from("mealEntries").upsert(mealEntry)),

      upsertMealEntries: (mealEntries) =>
        _mapStoreError(
          api.from("mealEntries").upsertAll(Array.from(mealEntries))
        ),

      upsertPlans: (plans) =>
        _mapStoreError(api.from("plans").upsertAll(Array.from(plans))),
    } satisfies Store.NutritionStore["Service"];
  })
);

export const BrowserNutritionStoreLayer = IndexedDbNutritionStoreLayer.pipe(
  Layer.provide(BrowserDatabaseLayer)
);

type DatabaseSchemaNode = {
  readonly previous: DatabaseSchemaNode | undefined;
};

export const IndexedDbCurrentDatabaseVersion = (() => {
  let version = 1;
  let schema: DatabaseSchemaNode = MaiDatabase;

  while (schema.previous !== undefined) {
    version += 1;
    schema = schema.previous;
  }

  return version;
})();
