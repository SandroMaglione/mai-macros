import {
  IndexedDbDatabase,
  IndexedDbTable,
  IndexedDbVersion,
} from "@effect/platform-browser";
import { Effect, Layer, Schema } from "effect";
import { afterEach, assert, describe, it } from "vitest";

import {
  DefaultFoods,
  Domain,
  Metadata,
  Migrations,
  Utils,
} from "@mai/nutrition";
import { MaiDatabase } from "../src/index.ts";
import {
  deleteFakeDatabase,
  layerFakeIndexedDb,
} from "./indexed-db-test-utils.ts";

const databaseLayer = MaiDatabase.layer(Metadata.DatabaseName).pipe(
  Layer.provide(layerFakeIndexedDb)
);

const CustomPlanMealsMigration = Migrations.Version004CustomPlanMeals;

class LegacySeedFood extends Schema.Class<LegacySeedFood>("LegacySeedFood")({
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
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

class LegacySeedPlan extends Schema.Class<LegacySeedPlan>("LegacySeedPlan")({
  id: Domain.PlanId,
  basedOnPlanId: Schema.optional(Domain.PlanId),
  name: Domain.NonEmptyString,
  proteinTargetGrams: Domain.NonNegativeNumber,
  carbsTargetGrams: Domain.NonNegativeNumber,
  fatTargetGrams: Domain.NonNegativeNumber,
  fiberTargetGrams: Schema.optional(Domain.NonNegativeNumber),
  sugarTargetGrams: Schema.optional(Domain.NonNegativeNumber),
  saltTargetGrams: Schema.optional(Domain.NonNegativeNumber),
  saturatedFatTargetGrams: Schema.optional(Domain.NonNegativeNumber),
  createdAt: Schema.Number,
}) {}

class LegacySeedDailyLog extends Schema.Class<LegacySeedDailyLog>(
  "LegacySeedDailyLog"
)({
  dateKey: Domain.DateKey,
  planId: Domain.PlanId,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

class LegacySeedActiveMealPlanSelection extends Schema.Class<LegacySeedActiveMealPlanSelection>(
  "LegacySeedActiveMealPlanSelection"
)({
  id: Domain.ActiveMealPlanSelectionId,
  planId: Domain.PlanId,
  updatedAt: Schema.Number,
}) {}

class LegacySeedMealEntry extends Schema.Class<LegacySeedMealEntry>(
  "LegacySeedMealEntry"
)({
  id: Domain.MealEntryId,
  dateKey: Domain.DateKey,
  meal: Domain.LegacyMeal,
  foodId: Domain.FoodId,
  quantityGrams: Domain.QuantityGrams,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

class LegacySeedFoodsTable extends IndexedDbTable.make({
  name: "foods",
  schema: LegacySeedFood,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

class LegacySeedPlansTable extends IndexedDbTable.make({
  name: "plans",
  schema: LegacySeedPlan,
  keyPath: "id",
  indexes: {
    byName: "name",
  },
}) {}

class LegacySeedDailyLogsTable extends IndexedDbTable.make({
  name: "dailyLogs",
  schema: LegacySeedDailyLog,
  keyPath: "dateKey",
  indexes: {
    byPlan: "planId",
  },
}) {}

class LegacySeedActiveMealPlanSelectionsTable extends IndexedDbTable.make({
  name: "activeMealPlanSelections",
  schema: LegacySeedActiveMealPlanSelection,
  keyPath: "id",
}) {}

class LegacySeedMealEntriesTable extends IndexedDbTable.make({
  name: "mealEntries",
  schema: LegacySeedMealEntry,
  keyPath: "id",
  indexes: {
    byDate: "dateKey",
    byDateMeal: ["dateKey", "meal"],
    byFood: "foodId",
  },
}) {}

class LegacySeedVersion1 extends IndexedDbVersion.make(
  LegacySeedFoodsTable,
  LegacySeedPlansTable,
  LegacySeedDailyLogsTable,
  LegacySeedActiveMealPlanSelectionsTable,
  LegacySeedMealEntriesTable
) {}

class LegacySeedVersion2 extends IndexedDbVersion.make(
  LegacySeedFoodsTable,
  LegacySeedPlansTable,
  LegacySeedDailyLogsTable,
  LegacySeedActiveMealPlanSelectionsTable,
  LegacySeedMealEntriesTable
) {}

class LegacyVersion1Database extends IndexedDbDatabase.make(
  LegacySeedVersion1,
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
) {}

class LegacyVersion2Database extends IndexedDbDatabase.make(
  LegacySeedVersion1,
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
).add(
  LegacySeedVersion2,
  Effect.fn(function* (from, to) {
    yield* from.deleteIndex("plans", "byName");
    yield* to.createIndex("plans", "byName", { unique: true });
  })
) {}

const legacyVersion1DatabaseLayer = LegacyVersion1Database.layer(
  Metadata.DatabaseName
).pipe(Layer.provide(layerFakeIndexedDb));

const legacyVersion2DatabaseLayer = LegacyVersion2Database.layer(
  Metadata.DatabaseName
).pipe(Layer.provide(layerFakeIndexedDb));

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

const planInput: typeof Domain.Plan.Encoded = {
  id: "9535a059-a61f-42e1-a2e0-35ec87203c25",
  name: "Training day",
  meals: [
    {
      id: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
      name: "Breakfast",
      position: 0,
      createdAt: 0,
    },
  ],
  proteinTargetGrams: 160,
  carbsTargetGrams: 220,
  fatTargetGrams: 70,
  fiberTargetGrams: 30,
  sugarTargetGrams: 50,
  saltTargetGrams: 6,
  saturatedFatTargetGrams: 20,
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
  mealId: "9535a059-a61f-42e1-a2e0-35ec87203c25:breakfast",
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

    assert.equal(result.name, Metadata.DatabaseName);
    assert.equal(result.version, 4);
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
      "byDateMealId",
      "byFood",
      "byMeal",
    ]);
    assert.equal(result.seededFoodCount, DefaultFoods.DefaultFoods.length);
  });

  it("persists and reads daily meal data through plan and food references", async () => {
    const program = Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Domain.Food)(foodInput);
      const plan = yield* Schema.decodeEffect(Domain.Plan)(planInput);
      const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)(
        dailyLogInput
      );
      const mealEntry = yield* Schema.decodeEffect(Domain.MealEntry)(
        mealEntryInput
      );
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
      const dateMealKey: [
        typeof Domain.DateKey.Type,
        typeof Domain.MealId.Type,
      ] = [storedLog.dateKey, mealEntry.mealId];
      const storedEntries = yield* api
        .from("mealEntries")
        .select("byDateMealId")
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
      const calculatedNutrients = Utils.calculateEntryNutrients({
        food: storedFood,
        quantityGrams: storedEntry.quantityGrams,
      });
      const validatedNutrients = yield* Schema.decodeEffect(
        Domain.EntryNutrients
      )(calculatedNutrients);

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
    assert.equal(result.storedEntry.mealId, mealEntryInput.mealId);
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

    await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* LegacyVersion2Database.getQueryBuilder;
        const legacyFoods = yield* Schema.decodeEffect(
          Schema.Array(LegacySeedFood)
        )(legacyFoodInputs);

        yield* api.from("foods").upsertAll(Array.from(legacyFoods));
      }).pipe(Effect.provide(legacyVersion2DatabaseLayer))
    );

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
      DefaultFoods.DefaultFoods.length
    );
    assert.equal(result.foods.length, DefaultFoods.DefaultFoods.length + 3);
    assert.equal(completeFood.origin, "user");
    assert.equal(completeFood.category, "dairy-egg");
    assert.equal(completeFood.fiberGramsPer100g, 0);
    assert.equal(completeFood.sugarGramsPer100g, 3.6);
    assert.equal(sparseFood.origin, "user");
    assert.equal(sparseFood.brand, undefined);
    assert.equal(sparseFood.fiberGramsPer100g, undefined);
    assert.equal(sparseFood.saltGramsPer100g, undefined);
    assert.equal(derivedFood.origin, "user");
    assert.equal(Object.keys(derivedFood).includes("basedOnFoodId"), false);
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

  it("migrates legacy meal entries to plan-owned meals without losing rows", async () => {
    const legacyPlanInput: typeof LegacySeedPlan.Encoded = {
      carbsTargetGrams: planInput.carbsTargetGrams,
      createdAt: planInput.createdAt,
      fatTargetGrams: planInput.fatTargetGrams,
      fiberTargetGrams: planInput.fiberTargetGrams,
      id: planInput.id,
      name: planInput.name,
      proteinTargetGrams: planInput.proteinTargetGrams,
      saltTargetGrams: planInput.saltTargetGrams,
      saturatedFatTargetGrams: planInput.saturatedFatTargetGrams,
      sugarTargetGrams: planInput.sugarTargetGrams,
    };
    const legacyMealEntryInput: typeof LegacySeedMealEntry.Encoded = {
      id: mealEntryInput.id,
      dateKey: dailyLogInput.dateKey,
      meal: "dinner",
      foodId: foodInput.id,
      quantityGrams: mealEntryInput.quantityGrams,
      createdAt: mealEntryInput.createdAt,
      updatedAt: mealEntryInput.updatedAt,
    };

    await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* LegacyVersion2Database.getQueryBuilder;
        const food = yield* Schema.decodeEffect(LegacySeedFood)(foodInput);
        const plan =
          yield* Schema.decodeEffect(LegacySeedPlan)(legacyPlanInput);
        const selection = yield* Schema.decodeEffect(
          LegacySeedActiveMealPlanSelection
        )({
          id: "active-meal-plan",
          planId: legacyPlanInput.id,
          updatedAt: 10,
        });
        const mealEntry =
          yield* Schema.decodeEffect(LegacySeedMealEntry)(legacyMealEntryInput);

        yield* api.from("foods").upsert(food);
        yield* api.from("plans").upsert(plan);
        yield* api.from("activeMealPlanSelections").upsert(selection);
        yield* api.from("mealEntries").upsert(mealEntry);
      }).pipe(Effect.provide(legacyVersion2DatabaseLayer))
    );

    const program = Effect.gen(function* () {
      const api = yield* MaiDatabase.getQueryBuilder;
      const plans = yield* api.from("plans").select();
      const dailyLogs = yield* api.from("dailyLogs").select();
      const dateMealKey: [
        typeof Domain.DateKey.Type,
        typeof Domain.MealId.Type,
      ] = [
        yield* Schema.decodeEffect(Domain.DateKey)(dailyLogInput.dateKey),
        yield* Schema.decodeEffect(Domain.MealId)(
          CustomPlanMealsMigration.makeMigratedMealId({
            meal: "dinner",
            planId: planInput.id,
          })
        ),
      ];
      const mealEntries = yield* api
        .from("mealEntries")
        .select("byDateMealId")
        .equals(dateMealKey);

      return {
        dailyLogs,
        mealEntries,
        plans,
      };
    }).pipe(Effect.provide(databaseLayer));

    const result = await Effect.runPromise(program);
    const storedPlan = result.plans.find((plan) => plan.id === planInput.id);
    const storedDailyLog = result.dailyLogs.find(
      (dailyLog) => dailyLog.dateKey === dailyLogInput.dateKey
    );
    const storedMealEntry = result.mealEntries[0];

    assert.isDefined(storedPlan);
    assert.deepStrictEqual(
      storedPlan?.meals.map((meal) => ({
        id: meal.id,
        name: meal.name,
        position: meal.position,
      })),
      [
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "breakfast",
            planId: planInput.id,
          }),
          name: "Breakfast",
          position: 0,
        },
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "lunch",
            planId: planInput.id,
          }),
          name: "Lunch",
          position: 1,
        },
        {
          id: CustomPlanMealsMigration.makeMigratedMealId({
            meal: "dinner",
            planId: planInput.id,
          }),
          name: "Dinner",
          position: 2,
        },
      ]
    );
    assert.equal(storedDailyLog?.planId, planInput.id);
    assert.equal(storedMealEntry?.id, mealEntryInput.id);
    assert.equal(
      storedMealEntry?.mealId,
      CustomPlanMealsMigration.makeMigratedMealId({
        meal: "dinner",
        planId: planInput.id,
      })
    );
    assert.equal(storedMealEntry?.quantityGrams, mealEntryInput.quantityGrams);
  });

  it("renames duplicate legacy plan names before making the index unique", async () => {
    const legacyPlanInput: typeof LegacySeedPlan.Encoded = {
      carbsTargetGrams: planInput.carbsTargetGrams,
      createdAt: planInput.createdAt,
      fatTargetGrams: planInput.fatTargetGrams,
      fiberTargetGrams: planInput.fiberTargetGrams,
      id: planInput.id,
      name: planInput.name,
      proteinTargetGrams: planInput.proteinTargetGrams,
      saltTargetGrams: planInput.saltTargetGrams,
      saturatedFatTargetGrams: planInput.saturatedFatTargetGrams,
      sugarTargetGrams: planInput.sugarTargetGrams,
    };
    const legacyPlans: readonly (typeof LegacySeedPlan.Encoded)[] = [
      legacyPlanInput,
      {
        ...legacyPlanInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c27",
      },
      {
        ...legacyPlanInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c28",
        name: " Training day ",
      },
      {
        ...legacyPlanInput,
        id: "9535a059-a61f-42e1-a2e0-35ec87203c29",
        name: "training day",
      },
    ];

    await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* LegacyVersion1Database.getQueryBuilder;
        const decodedLegacyPlans = yield* Schema.decodeEffect(
          Schema.Array(LegacySeedPlan)
        )(legacyPlans);

        yield* api.from("plans").upsertAll(Array.from(decodedLegacyPlans));
      }).pipe(Effect.provide(legacyVersion1DatabaseLayer))
    );

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
  readonly foods: readonly Domain.Food[];
  readonly name: string;
}) {
  const food = foods.find((item) => item.name === name);

  if (food === undefined) {
    throw new Error(`Expected food ${name}`);
  }

  return food;
}
