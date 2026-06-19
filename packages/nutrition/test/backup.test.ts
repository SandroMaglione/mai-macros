import { IndexedDb } from "@effect/platform-browser";
import { Effect, Layer, Schema } from "effect";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, assert, describe, it } from "vitest";

import {
  ActiveMealPlanSelection,
  Backups,
  CurrentDatabaseVersion,
  DailyLog,
  DatabaseName,
  DateKey,
  DefaultFoods,
  Food,
  MaiBackupJson,
  MaiBackupV1,
  MaiDatabase,
  Meal,
  MealEntry,
  Plan,
} from "../src/index.ts";

const layerFakeIndexedDb = Layer.succeed(
  IndexedDb.IndexedDb,
  IndexedDb.make({ indexedDB, IDBKeyRange })
);

const databaseLayer = MaiDatabase.layer(DatabaseName).pipe(
  Layer.provide(layerFakeIndexedDb)
);

const backupsLayer = Backups.layer.pipe(Layer.provideMerge(databaseLayer));

const BackupJsonString = Schema.fromJsonString(Schema.Unknown);

afterEach(() => {
  indexedDB.deleteDatabase(DatabaseName);
});

const foodInput: typeof Food.Encoded = {
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

const temporaryFoodInput: typeof Food.Encoded = {
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

const planInput: typeof Plan.Encoded = {
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

const temporaryPlanInput: typeof Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c35",
  name: "Temporary day",
  proteinTargetGrams: 120,
  carbsTargetGrams: 180,
  fatTargetGrams: 60,
  createdAt: 0,
};

const dailyLogInput: typeof DailyLog.Encoded = {
  dateKey: "2026-06-18",
  planId: planInput.id,
  createdAt: 0,
  updatedAt: 0,
};

const mealEntryInput: typeof MealEntry.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c26",
  dateKey: dailyLogInput.dateKey,
  meal: "breakfast",
  foodId: foodInput.id,
  quantityGrams: 150,
  createdAt: 0,
  updatedAt: 0,
};

const activeMealPlanSelectionInput: typeof ActiveMealPlanSelection.Encoded = {
  id: "active-meal-plan",
  planId: planInput.id,
  updatedAt: 0,
};

describe("Backups", () => {
  it("exports the full database as schema-validated JSON", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const food = yield* Schema.decodeEffect(Food)(foodInput);
      const plan = yield* Schema.decodeEffect(Plan)(planInput);
      const dailyLog = yield* Schema.decodeEffect(DailyLog)(dailyLogInput);
      const mealEntry = yield* Schema.decodeEffect(MealEntry)(mealEntryInput);
      const activeMealPlanSelection = yield* Schema.decodeEffect(
        ActiveMealPlanSelection
      )(activeMealPlanSelectionInput);

      yield* api.from("foods").insert(food);
      yield* api.from("plans").insert(plan);
      yield* api.from("dailyLogs").insert(dailyLog);
      yield* api.from("mealEntries").insert(mealEntry);
      yield* api
        .from("activeMealPlanSelections")
        .insert(activeMealPlanSelection);

      const backups = yield* Backups;
      const exportedBackup = yield* backups.exportToJson();
      const decodedFromJson = yield* Schema.decodeEffect(MaiBackupJson)(
        exportedBackup.json
      );

      return { decodedFromJson, exportedBackup };
    }).pipe(Effect.provide(backupsLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.decodedFromJson.format, "mai.backup");
    assert.equal(result.decodedFromJson.formatVersion, 1);
    assert.equal(result.decodedFromJson.source.databaseName, DatabaseName);
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
      const food = yield* Schema.decodeEffect(Food)(foodInput);
      const temporaryFood =
        yield* Schema.decodeEffect(Food)(temporaryFoodInput);
      const plan = yield* Schema.decodeEffect(Plan)(planInput);
      const temporaryPlan =
        yield* Schema.decodeEffect(Plan)(temporaryPlanInput);
      const dailyLog = yield* Schema.decodeEffect(DailyLog)(dailyLogInput);
      const mealEntry = yield* Schema.decodeEffect(MealEntry)(mealEntryInput);
      const activeMealPlanSelection = yield* Schema.decodeEffect(
        ActiveMealPlanSelection
      )(activeMealPlanSelectionInput);

      yield* api.from("foods").insert(food);
      yield* api.from("plans").insert(plan);
      yield* api.from("dailyLogs").insert(dailyLog);
      yield* api.from("mealEntries").insert(mealEntry);
      yield* api
        .from("activeMealPlanSelections")
        .insert(activeMealPlanSelection);

      const backups = yield* Backups;
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
      const dateMealKey: [typeof DateKey.Type, typeof Meal.Type] = [
        dailyLog.dateKey,
        mealEntry.meal,
      ];
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
    assert.equal(result.foodsByName[0]?.id, foodInput.id);
    assert.equal(result.plansByName[0]?.id, planInput.id);
    assert.equal(result.dailyLogsByPlan[0]?.dateKey, dailyLogInput.dateKey);
    assert.equal(result.mealEntriesByDate[0]?.id, mealEntryInput.id);
    assert.equal(result.mealEntriesByDateMeal[0]?.id, mealEntryInput.id);
    assert.equal(result.mealEntriesByFood[0]?.id, mealEntryInput.id);
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
          databaseName: DatabaseName,
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
      const backups = yield* Backups;
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
      CurrentDatabaseVersion
    );
    assert.deepStrictEqual(
      result.plans.map((plan) => plan.name),
      ["Training day", "Training day (1)"]
    );
    assert.equal(yogurt?.origin, "user");
    assert.equal(
      result.foods.filter((food) => food.origin === "app-default").length,
      DefaultFoods.length
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
          databaseName: DatabaseName,
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
      const backups = yield* Backups;
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
      CurrentDatabaseVersion
    );
    assert.equal(yogurt?.origin, "user");
    assert.equal(
      result.foods.filter((food) => food.origin === "app-default").length,
      DefaultFoods.length
    );
  });

  it("rejects invalid backups before replacing local data", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const plan = yield* Schema.decodeEffect(Plan)(planInput);

      yield* api.from("plans").insert(plan);

      const invalidBackup = yield* Schema.decodeEffect(MaiBackupV1)({
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
          databaseName: DatabaseName,
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
      const invalidJson =
        yield* Schema.encodeEffect(MaiBackupJson)(invalidBackup);
      const backups = yield* Backups;
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

    if (result.failure._tag !== "BackupIntegrityError") {
      assert.fail(`Expected BackupIntegrityError, got ${result.failure._tag}`);
    }

    assert.equal(result.failure.reason, "meal-entry-food-missing");
    assert.equal(result.plans.length, 1);
    assert.equal(result.plans[0]?.id, planInput.id);
  });
});
