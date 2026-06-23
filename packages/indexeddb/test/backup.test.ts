import { Effect, Layer, Schema } from "effect";
import { afterEach, assert, describe, it } from "vitest";

import {
  Backup,
  DefaultFoods,
  Domain,
  LocalData as NutritionLocalData,
  Metadata,
  Store,
} from "@mai/nutrition";
import {
  IndexedDbLocalDataLayer,
  IndexedDbNutritionStoreLayer,
  MaiDatabase,
} from "../src/index.ts";
import {
  deleteFakeDatabase,
  layerFakeIndexedDb,
} from "./indexed-db-test-utils.ts";

const databaseLayer = MaiDatabase.layer(Metadata.DatabaseName).pipe(
  Layer.provide(layerFakeIndexedDb)
);

const backupsLayer = Backup.Backups.layer.pipe(
  Layer.provideMerge(
    IndexedDbNutritionStoreLayer.pipe(Layer.provideMerge(databaseLayer))
  )
);

const localDataLayer = Layer.mergeAll(
  IndexedDbNutritionStoreLayer,
  IndexedDbLocalDataLayer
).pipe(Layer.provide(databaseLayer));

const BackupJsonString = Schema.fromJsonString(Schema.Unknown);

afterEach(() =>
  Effect.runPromise(deleteFakeDatabase({ databaseName: Metadata.DatabaseName }))
);

const foodInput: typeof Domain.Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c24",
  name: "Greek yogurt",
  brand: "Mai",
  origin: "user",
  energyKcalPer100g: 59,
  proteinGramsPer100g: 10,
  carbsGramsPer100g: 3.6,
  fatGramsPer100g: 0.4,
  fiberGramsPer100g: 0,
  sugarGramsPer100g: 3.2,
  saturatedFatGramsPer100g: 0.1,
  saltGramsPer100g: 0.04,
  createdAt: 0,
  updatedAt: 0,
};

const temporaryFoodInput: typeof Domain.Food.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c34",
  name: "Temporary berries",
  origin: "user",
  energyKcalPer100g: 57,
  proteinGramsPer100g: 0.7,
  carbsGramsPer100g: 14.5,
  fatGramsPer100g: 0.3,
  createdAt: 0,
  updatedAt: 0,
};

const planInput: typeof Domain.Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  name: "Training day",
  proteinTargetGrams: 160,
  carbsTargetGrams: 220,
  fatTargetGrams: 70,
  fiberTargetGrams: 30,
  sugarTargetGrams: 50,
  saltTargetGrams: 6,
  saturatedFatTargetGrams: 20,
  createdAt: 0,
};

const temporaryPlanInput: typeof Domain.Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
  name: "Temporary day",
  proteinTargetGrams: 120,
  carbsTargetGrams: 180,
  fatTargetGrams: 60,
  createdAt: 0,
};

const dailyLogInput: typeof Domain.DailyLog.Encoded = {
  dateKey: "2026-06-18",
  planId: planInput.id,
  createdAt: 0,
  updatedAt: 0,
};

const mealEntryInput: typeof Domain.MealEntry.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
  dateKey: dailyLogInput.dateKey,
  meal: "breakfast",
  foodId: foodInput.id,
  quantityGrams: 150,
  createdAt: 0,
  updatedAt: 0,
};

const activeMealPlanSelectionInput: typeof Domain.ActiveMealPlanSelection.Encoded =
  {
    id: "active-meal-plan",
    planId: planInput.id,
    updatedAt: 0,
  };

describe("Backups", () => {
  it("exports the full database as schema-validated JSON", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)(
        dailyLogInput
      );
      const mealEntry = yield* Schema.decodeEffect(Domain.MealEntry)(
        mealEntryInput
      );
      const activeMealPlanSelection = yield* Schema.decodeEffect(
        Domain.ActiveMealPlanSelection
      )(activeMealPlanSelectionInput);

      yield* api.from("foods").insert(food);
      yield* api.from("plans").insert(plan);
      yield* api.from("dailyLogs").insert(dailyLog);
      yield* api.from("mealEntries").insert(mealEntry);
      yield* api
        .from("activeMealPlanSelections")
        .insert(activeMealPlanSelection);

      const backups = yield* Backup.Backups;
      const exportedBackup = yield* backups.exportToJson();
      const decodedFromJson = yield* Schema.decodeEffect(Backup.MaiBackupJson)(
        exportedBackup.json
      );

      return { decodedFromJson, exportedBackup };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.decodedFromJson.format, "mai.backup");
    assert.equal(result.decodedFromJson.formatVersion, 1);
    assert.equal(
      result.decodedFromJson.source.databaseName,
      Metadata.DatabaseName
    );
    assert.equal(result.decodedFromJson.source.databaseVersion, 3);
    assert.equal(result.decodedFromJson.stores.dailyLogs.length, 1);
    assert.equal(result.decodedFromJson.stores.mealEntries.length, 1);
    assert.equal(
      result.decodedFromJson.integrity.counts.foods,
      result.decodedFromJson.stores.foods.length
    );
    assert.equal(
      result.exportedBackup.backup.stores.activeMealPlanSelections[0]?.planId,
      planInput.id
    );
  });

  it("imports a backup by replacing the local database stores", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const temporaryFood = yield* Schema.decodeEffect(Domain.Food)(
        temporaryFoodInput
      );
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const temporaryPlan = yield* Schema.decodeEffect(Domain.Plan)(
        temporaryPlanInput
      );
      const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)(
        dailyLogInput
      );
      const mealEntry = yield* Schema.decodeEffect(Domain.MealEntry)(
        mealEntryInput
      );
      const activeMealPlanSelection = yield* Schema.decodeEffect(
        Domain.ActiveMealPlanSelection
      )(activeMealPlanSelectionInput);

      yield* api.from("foods").insert(food);
      yield* api.from("plans").insert(plan);
      yield* api.from("dailyLogs").insert(dailyLog);
      yield* api.from("mealEntries").insert(mealEntry);
      yield* api
        .from("activeMealPlanSelections")
        .insert(activeMealPlanSelection);

      const backups = yield* Backup.Backups;
      const exportedBackup = yield* backups.exportToJson();

      yield* api.from("foods").insert(temporaryFood);
      yield* api.from("plans").insert(temporaryPlan);
      yield* api.from("mealEntries").delete().equals(mealEntry.id);
      yield* backups.importFromJson({
        input: {
          json: exportedBackup.json,
        },
      });

      const foods = yield* api.from("foods").select();
      const plans = yield* api.from("plans").select();
      const mealEntries = yield* api.from("mealEntries").select();
      const activeMealPlanSelections = yield* api
        .from("activeMealPlanSelections")
        .select();
      const dateMealKey: [typeof Domain.DateKey.Type, typeof Domain.Meal.Type] =
        [dailyLog.dateKey, mealEntry.meal];
      const foodsByName = yield* api
        .from("foods")
        .select("byName")
        .equals(food.name);
      const plansByName = yield* api
        .from("plans")
        .select("byName")
        .equals(plan.name);
      const dailyLogsByPlan = yield* api
        .from("dailyLogs")
        .select("byPlan")
        .equals(plan.id);
      const mealEntriesByDate = yield* api
        .from("mealEntries")
        .select("byDate")
        .equals(dailyLog.dateKey);
      const mealEntriesByDateMeal = yield* api
        .from("mealEntries")
        .select("byDateMeal")
        .equals(dateMealKey);
      const mealEntriesByFood = yield* api
        .from("mealEntries")
        .select("byFood")
        .equals(food.id);

      return {
        activeMealPlanSelections,
        dailyLogsByPlan,
        foods,
        foodsByName,
        mealEntries,
        mealEntriesByDate,
        mealEntriesByDateMeal,
        mealEntriesByFood,
        plans,
        plansByName,
      };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);

    assert.equal(
      result.foods.some((food) => food.id === temporaryFoodInput.id),
      false
    );
    assert.equal(
      result.plans.some((plan) => plan.id === temporaryPlanInput.id),
      false
    );
    assert.equal(
      result.mealEntries.some(
        (mealEntry) => mealEntry.id === mealEntryInput.id
      ),
      true
    );
    assert.equal(result.activeMealPlanSelections[0]?.planId, planInput.id);
    assert.equal(
      result.foodsByName.some((food) => food.id === foodInput.id),
      true
    );
    assert.equal(result.plansByName[0]?.id, planInput.id);
    assert.equal(result.dailyLogsByPlan[0]?.dateKey, dailyLogInput.dateKey);
    assert.equal(result.mealEntriesByDate[0]?.id, mealEntryInput.id);
    assert.equal(result.mealEntriesByDateMeal[0]?.id, mealEntryInput.id);
    assert.equal(result.mealEntriesByFood[0]?.id, mealEntryInput.id);
  });

  it("resets the browser database back to migration-seeded defaults", async () => {
    const program = Effect.gen(function* () {
      const store = yield* Store.NutritionStore;
      const localData = yield* NutritionLocalData.LocalData;
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

      yield* store.insertFood(food);
      yield* store.insertPlan(plan);
      yield* localData.reset;

      return yield* store.readStores;
    }).pipe(Effect.provide(localDataLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.activeMealPlanSelections.length, 0);
    assert.equal(result.dailyLogs.length, 0);
    assert.equal(result.mealEntries.length, 0);
    assert.equal(result.plans.length, 0);
    assert.equal(result.foods.length, DefaultFoods.DefaultFoods.length);
    assert.equal(
      result.foods.some((food) => food.id === foodInput.id),
      false
    );
  });

  it("imports database version 1 backups through plan-name migration", async () => {
    const program = Effect.gen(function* () {
      const legacyPlanInput = {
        ...planInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c27",
      };
      const legacyBackupInput = {
        format: "mai.backup",
        formatVersion: 1,
        integrity: {
          counts: {
            activeMealPlanSelections: 1,
            dailyLogs: 1,
            foods: 1,
            mealEntries: 1,
            plans: 2,
          },
        },
        source: {
          databaseName: Metadata.DatabaseName,
          databaseVersion: 1,
          exportedAt: 0,
        },
        stores: {
          activeMealPlanSelections: [activeMealPlanSelectionInput],
          dailyLogs: [dailyLogInput],
          foods: [
            {
              ...foodInput,
              origin: undefined,
            },
          ],
          mealEntries: [mealEntryInput],
          plans: [planInput, legacyPlanInput],
        },
      };
      const json =
        yield* Schema.encodeEffect(BackupJsonString)(legacyBackupInput);
      const backups = yield* Backup.Backups;
      const importedBackup = yield* backups.importFromJson({
        input: {
          json,
        },
      });
      const api = yield* MaiDatabase.getQueryBuilder;
      const foods = yield* api.from("foods").select();
      const plans = yield* api.from("plans").select();

      return { foods, importedBackup, plans };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);
    const yogurt = result.foods.find((food) => food.id === foodInput.id);

    assert.equal(
      result.importedBackup.backup.source.databaseVersion,
      Metadata.CurrentDatabaseVersion
    );
    assert.deepStrictEqual(
      result.plans.map((plan) => plan.name),
      ["Training day", "Training day (1)"]
    );
    assert.equal(yogurt?.origin, "user");
    assert.equal(
      result.foods.filter((food) => food.origin === "app-default").length,
      DefaultFoods.DefaultFoods.length
    );
  });

  it("imports database version 2 backups through food-origin migration", async () => {
    const program = Effect.gen(function* () {
      const legacyBackupInput = {
        format: "mai.backup",
        formatVersion: 1,
        integrity: {
          counts: {
            activeMealPlanSelections: 1,
            dailyLogs: 1,
            foods: 1,
            mealEntries: 1,
            plans: 1,
          },
        },
        source: {
          databaseName: Metadata.DatabaseName,
          databaseVersion: 2,
          exportedAt: 0,
        },
        stores: {
          activeMealPlanSelections: [activeMealPlanSelectionInput],
          dailyLogs: [dailyLogInput],
          foods: [
            {
              ...foodInput,
              origin: undefined,
            },
          ],
          mealEntries: [mealEntryInput],
          plans: [planInput],
        },
      };
      const json =
        yield* Schema.encodeEffect(BackupJsonString)(legacyBackupInput);
      const backups = yield* Backup.Backups;
      const importedBackup = yield* backups.importFromJson({
        input: {
          json,
        },
      });
      const api = yield* MaiDatabase.getQueryBuilder;
      const foods = yield* api.from("foods").select();

      return { foods, importedBackup };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);
    const yogurt = result.foods.find((food) => food.id === foodInput.id);

    assert.equal(
      result.importedBackup.backup.source.databaseVersion,
      Metadata.CurrentDatabaseVersion
    );
    assert.equal(yogurt?.origin, "user");
    assert.equal(
      result.foods.filter((food) => food.origin === "app-default").length,
      DefaultFoods.DefaultFoods.length
    );
  });

  it("rejects invalid backups before replacing local data", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);

      yield* api.from("plans").insert(plan);

      const invalidBackup = yield* Schema.decodeEffect(Backup.MaiBackupV1)({
        format: "mai.backup",
        formatVersion: 1,
        integrity: {
          counts: {
            activeMealPlanSelections: 0,
            dailyLogs: 0,
            foods: 0,
            mealEntries: 1,
            plans: 1,
          },
        },
        source: {
          databaseName: Metadata.DatabaseName,
          databaseVersion: 3,
          exportedAt: 0,
        },
        stores: {
          activeMealPlanSelections: [],
          dailyLogs: [],
          foods: [],
          mealEntries: [mealEntryInput],
          plans: [planInput],
        },
      });
      const invalidJson = yield* Schema.encodeEffect(Backup.MaiBackupJson)(
        invalidBackup
      );
      const backups = yield* Backup.Backups;
      const failure = yield* backups
        .importFromJson({
          input: {
            json: invalidJson,
          },
        })
        .pipe(Effect.flip);
      const plans = yield* api.from("plans").select();

      return { failure, plans };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);

    if (!(result.failure instanceof Backup.BackupIntegrityError)) {
      assert.fail("Expected BackupIntegrityError");
    }

    assert.equal(result.failure.reason, "meal-entry-food-missing");
    assert.equal(result.plans.length, 1);
    assert.equal(result.plans[0]?.id, planInput.id);
  });
});
