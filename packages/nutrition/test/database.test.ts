import { IndexedDb } from "@effect/platform-browser";
import { Effect, Layer, Schema } from "effect";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { afterEach, assert, describe, it } from "vitest";

import {
  calculateEntryNutrients,
  DailyLog,
  DatabaseName,
  DateKey,
  DefaultFoods,
  EntryNutrients,
  Food,
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

describe("MaiDatabase", () => {
  it("opens the latest version with stores and indexes", async () => {
    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase;
      const query = yield* MaiDatabase.getQueryBuilder;
      const name = yield* api.use((database) => database.name);
      const version = yield* api.use((database) => database.version);
      const storeNames = yield* api.use((database) =>
        Array.from(database.objectStoreNames)
      );
      const foodIndexes = yield* api.use((database) =>
        Array.from(
          database.transaction("foods").objectStore("foods").indexNames
        )
      );
      const entryIndexes = yield* api.use((database) =>
        Array.from(
          database.transaction("mealEntries").objectStore("mealEntries")
            .indexNames
        )
      );
      const planNameIndexIsUnique = yield* api.use(
        (database) =>
          database.transaction("plans").objectStore("plans").index("byName")
            .unique
      );
      const foods = yield* query.from("foods").select();

      return {
        entryIndexes,
        foodIndexes,
        name,
        planNameIndexIsUnique,
        seededFoodCount: foods.filter((food) => food.origin === "app-default")
          .length,
        storeNames,
        version,
      };
    }).pipe(Effect.provide(databaseLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.name, DatabaseName);
    assert.equal(result.version, 3);
    assert.equal(result.planNameIndexIsUnique, true);
    assert.deepStrictEqual(result.storeNames, [
      "activeMealPlanSelections",
      "dailyLogs",
      "foods",
      "mealEntries",
      "plans",
    ]);
    assert.deepStrictEqual(result.foodIndexes, ["byName"]);
    assert.deepStrictEqual(result.entryIndexes, [
      "byDate",
      "byDateMeal",
      "byFood",
    ]);
    assert.equal(result.seededFoodCount, DefaultFoods.length);
  });

  it("persists and reads daily meal data through plan and food references", async () => {
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Food)(foodInput);
      const plan = yield* Schema.decodeEffect(Plan)(planInput);
      const dailyLog = yield* Schema.decodeEffect(DailyLog)(dailyLogInput);
      const mealEntry = yield* Schema.decodeEffect(MealEntry)(mealEntryInput);
      const api = yield* MaiDatabase.getQueryBuilder;
      const insertedFoodKey = yield* api.from("foods").insert(food);
      const insertedPlanKey = yield* api.from("plans").insert(plan);
      const insertedLogKey = yield* api.from("dailyLogs").insert(dailyLog);
      const insertedEntryKey = yield* api.from("mealEntries").insert(mealEntry);
      const storedLog = yield* api
        .from("dailyLogs")
        .select()
        .equals(dailyLog.dateKey)
        .first();
      const storedPlan = yield* api
        .from("plans")
        .select()
        .equals(storedLog.planId)
        .first();
      const dateMealKey: [typeof DateKey.Type, typeof Meal.Type] = [
        storedLog.dateKey,
        "breakfast",
      ];
      const storedEntries = yield* api
        .from("mealEntries")
        .select("byDateMeal")
        .equals(dateMealKey);
      const storedEntry = storedEntries.at(0);
      if (storedEntry === undefined) {
        return yield* Effect.fail("Expected a breakfast entry");
      }
      const storedFood = yield* api
        .from("foods")
        .select()
        .equals(storedEntry.foodId)
        .first();
      const calculatedNutrients = calculateEntryNutrients({
        food: storedFood,
        quantityGrams: storedEntry.quantityGrams,
      });
      const validatedNutrients =
        yield* Schema.decodeEffect(EntryNutrients)(calculatedNutrients);

      return {
        insertedEntryKey,
        insertedFoodKey,
        insertedLogKey,
        insertedPlanKey,
        storedEntry,
        storedFood,
        storedLog,
        storedPlan,
        validatedNutrients,
      };
    }).pipe(Effect.provide(databaseLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.insertedFoodKey, foodInput.id);
    assert.equal(result.insertedPlanKey, planInput.id);
    assert.equal(result.insertedLogKey, dailyLogInput.dateKey);
    assert.equal(result.insertedEntryKey, mealEntryInput.id);
    assert.equal(result.storedLog.planId, result.storedPlan.id);
    assert.equal(result.storedPlan.name, "Training day");
    assert.equal(result.storedEntry.dateKey, result.storedLog.dateKey);
    assert.equal(result.storedEntry.foodId, result.storedFood.id);
    assert.equal(result.storedEntry.meal, "breakfast");
    assert.equal(result.storedFood.name, "Greek yogurt");
    assert.equal(result.validatedNutrients.energyKcal, 88.5);
    assert.equal(result.validatedNutrients.proteinGrams, 15);
  });

  it("migrates legacy foods with optional secondary nutrients and seeds defaults", async () => {
    const baseLegacyFoodInput = {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c30",
      name: "Legacy complete yogurt",
      brand: "Mai",
      category: "dairy-egg",
      energyKcalPer100g: 62,
      proteinGramsPer100g: 11,
      carbsGramsPer100g: 3.8,
      fatGramsPer100g: 0.5,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 3.6,
      saturatedFatGramsPer100g: 0.1,
      saltGramsPer100g: 0.04,
      createdAt: 10,
      updatedAt: 20,
    };
    const sparseLegacyFoodInput = {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c31",
      name: "Legacy sparse rice",
      energyKcalPer100g: 130,
      proteinGramsPer100g: 2.7,
      carbsGramsPer100g: 28,
      fatGramsPer100g: 0.3,
      createdAt: 30,
      updatedAt: 40,
    };
    const derivedLegacyFoodInput = {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c32",
      basedOnFoodId: baseLegacyFoodInput.id,
      name: "Legacy derived yogurt",
      energyKcalPer100g: 64,
      proteinGramsPer100g: 12,
      carbsGramsPer100g: 4,
      fatGramsPer100g: 0.4,
      fiberGramsPer100g: 0,
      sugarGramsPer100g: 0,
      createdAt: 50,
      updatedAt: 60,
    };
    const legacyFoodInputs = [
      baseLegacyFoodInput,
      sparseLegacyFoodInput,
      derivedLegacyFoodInput,
    ];

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DatabaseName, 2);

      request.onerror = () => {
        reject(request.error);
      };

      request.onupgradeneeded = () => {
        const database = request.result;
        const foodStore = database.createObjectStore("foods", {
          keyPath: "id",
        });
        foodStore.createIndex("byName", "name");

        const planStore = database.createObjectStore("plans", {
          keyPath: "id",
        });
        planStore.createIndex("byName", "name", { unique: true });

        const dailyLogStore = database.createObjectStore("dailyLogs", {
          keyPath: "dateKey",
        });
        dailyLogStore.createIndex("byPlan", "planId");

        database.createObjectStore("activeMealPlanSelections", {
          keyPath: "id",
        });

        const mealEntryStore = database.createObjectStore("mealEntries", {
          keyPath: "id",
        });
        mealEntryStore.createIndex("byDate", "dateKey");
        mealEntryStore.createIndex("byDateMeal", ["dateKey", "meal"]);
        mealEntryStore.createIndex("byFood", "foodId");
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("foods", "readwrite");
        const foodStore = transaction.objectStore("foods");

        for (const food of legacyFoodInputs) {
          foodStore.put(food);
        }

        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });

    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const foods = yield* api.from("foods").select();
      const foodIndexes = yield* api.use((database) =>
        Array.from(
          database.transaction("foods").objectStore("foods").indexNames
        )
      );

      return { foodIndexes, foods };
    }).pipe(Effect.provide(databaseLayer));

    const result = await Effect.runPromise(program);
    const completeFood = _expectFood({
      foods: result.foods,
      name: baseLegacyFoodInput.name,
    });
    const sparseFood = _expectFood({
      foods: result.foods,
      name: sparseLegacyFoodInput.name,
    });
    const derivedFood = _expectFood({
      foods: result.foods,
      name: derivedLegacyFoodInput.name,
    });
    const apple = _expectFood({ foods: result.foods, name: "apple" });
    const lemon = _expectFood({ foods: result.foods, name: "lemon" });
    const unmatchedDefaultNames = [
      "yam",
      "cannellini beans",
      "soybeans",
      "bulgur",
      "cornmeal",
      "pumpkin seeds",
    ];

    assert.deepStrictEqual(result.foodIndexes, ["byName"]);
    assert.equal(
      result.foods.filter((food) => food.origin === "app-default").length,
      DefaultFoods.length
    );
    assert.equal(result.foods.length, DefaultFoods.length + 3);
    assert.equal(completeFood.origin, "user");
    assert.equal(completeFood.category, "dairy-egg");
    assert.equal(completeFood.fiberGramsPer100g, 0);
    assert.equal(completeFood.sugarGramsPer100g, 3.6);
    assert.equal(sparseFood.origin, "user");
    assert.equal(sparseFood.brand, undefined);
    assert.equal(sparseFood.fiberGramsPer100g, undefined);
    assert.equal(sparseFood.saltGramsPer100g, undefined);
    assert.equal(derivedFood.origin, "user");
    assert.equal(derivedFood.basedOnFoodId, baseLegacyFoodInput.id);
    assert.equal(derivedFood.sugarGramsPer100g, 0);
    assert.equal(apple.origin, "app-default");
    assert.equal(apple.category, "fruit");
    assert.equal(lemon.origin, "app-default");
    assert.equal(lemon.saltGramsPer100g, undefined);

    for (const name of unmatchedDefaultNames) {
      assert.equal(
        result.foods.some(
          (food) => food.name === name && food.origin === "app-default"
        ),
        false
      );
    }
  });

  it("renames duplicate legacy plan names before making the index unique", async () => {
    const legacyPlans: readonly (typeof Plan.Encoded)[] = [
      planInput,
      {
        ...planInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c27",
      },
      {
        ...planInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c28",
        name: " Training day ",
      },
      {
        ...planInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c29",
        name: "training day",
      },
    ];

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DatabaseName, 1);

      request.onerror = () => {
        reject(request.error);
      };

      request.onupgradeneeded = () => {
        const database = request.result;
        const foodStore = database.createObjectStore("foods", {
          keyPath: "id",
        });
        foodStore.createIndex("byName", "name");

        const planStore = database.createObjectStore("plans", {
          keyPath: "id",
        });
        planStore.createIndex("byName", "name");

        const dailyLogStore = database.createObjectStore("dailyLogs", {
          keyPath: "dateKey",
        });
        dailyLogStore.createIndex("byPlan", "planId");

        database.createObjectStore("activeMealPlanSelections", {
          keyPath: "id",
        });

        const mealEntryStore = database.createObjectStore("mealEntries", {
          keyPath: "id",
        });
        mealEntryStore.createIndex("byDate", "dateKey");
        mealEntryStore.createIndex("byDateMeal", ["dateKey", "meal"]);
        mealEntryStore.createIndex("byFood", "foodId");
      };

      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("plans", "readwrite");
        const planStore = transaction.objectStore("plans");

        for (const plan of legacyPlans) {
          planStore.put(plan);
        }

        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });

    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const plans = yield* api.from("plans").select();
      const planNameIndexIsUnique = yield* api.use(
        (database) =>
          database.transaction("plans").objectStore("plans").index("byName")
            .unique
      );

      return {
        names: plans.map((plan) => plan.name),
        planNameIndexIsUnique,
      };
    }).pipe(Effect.provide(databaseLayer));

    const result = await Effect.runPromise(program);

    assert.equal(result.planNameIndexIsUnique, true);
    assert.deepStrictEqual(result.names, [
      "Training day",
      "Training day (1)",
      "Training day (2)",
      "training day",
    ]);
  });
});

function _expectFood({
  foods,
  name,
}: {
  readonly foods: readonly Food[];
  readonly name: string;
}) {
  const food = foods.find((item) => item.name === name);

  if (food === undefined) {
    throw new Error(`Expected food ${name}`);
  }

  return food;
}
