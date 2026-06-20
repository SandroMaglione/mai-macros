import {
  ActiveMealPlanSelection,
  ActiveMealPlanSelectionId,
  DailyLog,
  DateKey,
  Food,
  FoodCategory,
  FoodId,
  FoodOrigin,
  Meal,
  MealEntry,
  MealEntryId,
  NonEmptyString,
  NonNegativeNumber,
  NutritionStore,
  NutritionStoreError,
  Plan,
  PlanId,
  PositiveNumber,
  type NutritionStores,
} from "@mai/nutrition";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

const EmptyRequest = Schema.Struct({});

const CountRow = Schema.Struct({
  count: Schema.Number,
});

const _mapStoreError = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new NutritionStoreError({
          cause,
        })
    )
  );

const FoodRow = Schema.Struct({
  basedOnFoodId: Schema.NullOr(FoodId),
  brand: Schema.NullOr(NonEmptyString),
  carbsGramsPer100g: NonNegativeNumber,
  category: Schema.NullOr(FoodCategory),
  createdAt: Schema.Number,
  energyKcalPer100g: NonNegativeNumber,
  fatGramsPer100g: NonNegativeNumber,
  fiberGramsPer100g: Schema.NullOr(NonNegativeNumber),
  id: FoodId,
  name: NonEmptyString,
  origin: FoodOrigin,
  proteinGramsPer100g: NonNegativeNumber,
  saltGramsPer100g: Schema.NullOr(NonNegativeNumber),
  saturatedFatGramsPer100g: Schema.NullOr(NonNegativeNumber),
  sugarGramsPer100g: Schema.NullOr(NonNegativeNumber),
  updatedAt: Schema.Number,
});

const PlanRow = Schema.Struct({
  basedOnPlanId: Schema.NullOr(PlanId),
  carbsTargetGrams: NonNegativeNumber,
  createdAt: Schema.Number,
  fatTargetGrams: NonNegativeNumber,
  fiberTargetGrams: Schema.NullOr(NonNegativeNumber),
  id: PlanId,
  name: NonEmptyString,
  proteinTargetGrams: NonNegativeNumber,
  saltTargetGrams: Schema.NullOr(NonNegativeNumber),
  saturatedFatTargetGrams: Schema.NullOr(NonNegativeNumber),
  sugarTargetGrams: Schema.NullOr(NonNegativeNumber),
});

const DailyLogRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: DateKey,
  planId: PlanId,
  updatedAt: Schema.Number,
});

const ActiveMealPlanSelectionRow = Schema.Struct({
  id: ActiveMealPlanSelectionId,
  planId: PlanId,
  updatedAt: Schema.Number,
});

const MealEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: DateKey,
  foodId: FoodId,
  id: MealEntryId,
  meal: Meal,
  quantityGrams: PositiveNumber,
  updatedAt: Schema.Number,
});

const selectFoodColumns = `
  id,
  based_on_food_id AS basedOnFoodId,
  name,
  brand,
  category,
  origin,
  energy_kcal_per_100g AS energyKcalPer100g,
  protein_grams_per_100g AS proteinGramsPer100g,
  carbs_grams_per_100g AS carbsGramsPer100g,
  fat_grams_per_100g AS fatGramsPer100g,
  fiber_grams_per_100g AS fiberGramsPer100g,
  sugar_grams_per_100g AS sugarGramsPer100g,
  saturated_fat_grams_per_100g AS saturatedFatGramsPer100g,
  salt_grams_per_100g AS saltGramsPer100g,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const selectPlanColumns = `
  id,
  based_on_plan_id AS basedOnPlanId,
  name,
  protein_target_grams AS proteinTargetGrams,
  carbs_target_grams AS carbsTargetGrams,
  fat_target_grams AS fatTargetGrams,
  fiber_target_grams AS fiberTargetGrams,
  sugar_target_grams AS sugarTargetGrams,
  salt_target_grams AS saltTargetGrams,
  saturated_fat_target_grams AS saturatedFatTargetGrams,
  created_at AS createdAt
`;

const selectDailyLogColumns = `
  date_key AS dateKey,
  plan_id AS planId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const selectActiveMealPlanSelectionColumns = `
  id,
  plan_id AS planId,
  updated_at AS updatedAt
`;

const selectMealEntryColumns = `
  id,
  date_key AS dateKey,
  meal,
  food_id AS foodId,
  quantity_grams AS quantityGrams,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export const makeSqliteNutritionStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;

  const decodeFoodRow = ({
    basedOnFoodId,
    brand,
    category,
    fiberGramsPer100g,
    saltGramsPer100g,
    saturatedFatGramsPer100g,
    sugarGramsPer100g,
    ...row
  }: typeof FoodRow.Type) =>
    Schema.decodeEffect(Food)({
      ...row,
      ...(basedOnFoodId === null ? {} : { basedOnFoodId }),
      ...(brand === null ? {} : { brand }),
      ...(category === null ? {} : { category }),
      ...(fiberGramsPer100g === null ? {} : { fiberGramsPer100g }),
      ...(saltGramsPer100g === null ? {} : { saltGramsPer100g }),
      ...(saturatedFatGramsPer100g === null
        ? {}
        : { saturatedFatGramsPer100g }),
      ...(sugarGramsPer100g === null ? {} : { sugarGramsPer100g }),
    });

  const decodePlanRow = ({
    basedOnPlanId,
    fiberTargetGrams,
    saltTargetGrams,
    saturatedFatTargetGrams,
    sugarTargetGrams,
    ...row
  }: typeof PlanRow.Type) =>
    Schema.decodeEffect(Plan)({
      ...row,
      ...(basedOnPlanId === null ? {} : { basedOnPlanId }),
      ...(fiberTargetGrams === null ? {} : { fiberTargetGrams }),
      ...(saltTargetGrams === null ? {} : { saltTargetGrams }),
      ...(saturatedFatTargetGrams === null ? {} : { saturatedFatTargetGrams }),
      ...(sugarTargetGrams === null ? {} : { sugarTargetGrams }),
    });

  const decodeDailyLogRow = (row: typeof DailyLogRow.Type) =>
    Schema.decodeEffect(DailyLog)(row);

  const decodeActiveMealPlanSelectionRow = (
    row: typeof ActiveMealPlanSelectionRow.Type
  ) => Schema.decodeEffect(ActiveMealPlanSelection)(row);

  const decodeMealEntryRow = (row: typeof MealEntryRow.Type) =>
    Schema.decodeEffect(MealEntry)(row);

  const listFoodRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: FoodRow,
    execute: () => sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods`,
  });

  const findFoodByIdRows = SqlSchema.findAll({
    Request: FoodId,
    Result: FoodRow,
    execute: (foodId) =>
      sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods WHERE id = ${foodId}`,
  });

  const findFoodsByNameRows = SqlSchema.findAll({
    Request: NonEmptyString,
    Result: FoodRow,
    execute: (name) =>
      sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods WHERE name = ${name}`,
  });

  const listPlanRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: PlanRow,
    execute: () => sql`SELECT ${sql.literal(selectPlanColumns)} FROM plans`,
  });

  const findPlanByIdRows = SqlSchema.findAll({
    Request: PlanId,
    Result: PlanRow,
    execute: (planId) =>
      sql`SELECT ${sql.literal(selectPlanColumns)} FROM plans WHERE id = ${planId}`,
  });

  const findPlansByNameRows = SqlSchema.findAll({
    Request: NonEmptyString,
    Result: PlanRow,
    execute: (name) =>
      sql`SELECT ${sql.literal(selectPlanColumns)} FROM plans WHERE name = ${name}`,
  });

  const listDailyLogRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: DailyLogRow,
    execute: () =>
      sql`SELECT ${sql.literal(selectDailyLogColumns)} FROM daily_logs`,
  });

  const findDailyLogByDateKeyRows = SqlSchema.findAll({
    Request: DateKey,
    Result: DailyLogRow,
    execute: (dateKey) =>
      sql`SELECT ${sql.literal(selectDailyLogColumns)} FROM daily_logs WHERE date_key = ${dateKey}`,
  });

  const findDailyLogsByPlanRows = SqlSchema.findAll({
    Request: PlanId,
    Result: DailyLogRow,
    execute: (planId) =>
      sql`SELECT ${sql.literal(selectDailyLogColumns)} FROM daily_logs WHERE plan_id = ${planId}`,
  });

  const findActiveMealPlanSelectionRows = SqlSchema.findAll({
    Request: ActiveMealPlanSelectionId,
    Result: ActiveMealPlanSelectionRow,
    execute: (id) =>
      sql`SELECT ${sql.literal(selectActiveMealPlanSelectionColumns)} FROM active_meal_plan_selections WHERE id = ${id}`,
  });

  const listMealEntryRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: MealEntryRow,
    execute: () =>
      sql`SELECT ${sql.literal(selectMealEntryColumns)} FROM meal_entries`,
  });

  const findMealEntryByIdRows = SqlSchema.findAll({
    Request: MealEntryId,
    Result: MealEntryRow,
    execute: (mealEntryId) =>
      sql`SELECT ${sql.literal(selectMealEntryColumns)} FROM meal_entries WHERE id = ${mealEntryId}`,
  });

  const findMealEntriesByDateRows = SqlSchema.findAll({
    Request: DateKey,
    Result: MealEntryRow,
    execute: (dateKey) =>
      sql`SELECT ${sql.literal(selectMealEntryColumns)} FROM meal_entries WHERE date_key = ${dateKey}`,
  });

  const countMealEntriesByDateRows = SqlSchema.findOne({
    Request: DateKey,
    Result: CountRow,
    execute: (dateKey) =>
      sql`SELECT COUNT(*) AS count FROM meal_entries WHERE date_key = ${dateKey}`,
  });

  const countMealEntriesByFoodRows = SqlSchema.findOne({
    Request: FoodId,
    Result: CountRow,
    execute: (foodId) =>
      sql`SELECT COUNT(*) AS count FROM meal_entries WHERE food_id = ${foodId}`,
  });

  const listFoods = listFoodRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeFoodRow))
  );

  const listPlans = listPlanRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodePlanRow))
  );

  const listDailyLogs = listDailyLogRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeDailyLogRow))
  );

  const listMealEntries = listMealEntryRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeMealEntryRow))
  );

  const foodRowValues = (food: typeof Food.Encoded) => ({
    based_on_food_id: food.basedOnFoodId ?? null,
    brand: food.brand ?? null,
    carbs_grams_per_100g: food.carbsGramsPer100g,
    category: food.category ?? null,
    created_at: food.createdAt,
    energy_kcal_per_100g: food.energyKcalPer100g,
    fat_grams_per_100g: food.fatGramsPer100g,
    fiber_grams_per_100g: food.fiberGramsPer100g ?? null,
    id: food.id,
    name: food.name,
    origin: food.origin,
    protein_grams_per_100g: food.proteinGramsPer100g,
    salt_grams_per_100g: food.saltGramsPer100g ?? null,
    saturated_fat_grams_per_100g: food.saturatedFatGramsPer100g ?? null,
    sugar_grams_per_100g: food.sugarGramsPer100g ?? null,
    updated_at: food.updatedAt,
  });

  const planRowValues = (plan: typeof Plan.Encoded) => ({
    based_on_plan_id: plan.basedOnPlanId ?? null,
    carbs_target_grams: plan.carbsTargetGrams,
    created_at: plan.createdAt,
    fat_target_grams: plan.fatTargetGrams,
    fiber_target_grams: plan.fiberTargetGrams ?? null,
    id: plan.id,
    name: plan.name,
    protein_target_grams: plan.proteinTargetGrams,
    salt_target_grams: plan.saltTargetGrams ?? null,
    saturated_fat_target_grams: plan.saturatedFatTargetGrams ?? null,
    sugar_target_grams: plan.sugarTargetGrams ?? null,
  });

  const dailyLogRowValues = (dailyLog: typeof DailyLog.Encoded) => ({
    created_at: dailyLog.createdAt,
    date_key: dailyLog.dateKey,
    plan_id: dailyLog.planId,
    updated_at: dailyLog.updatedAt,
  });

  const activeMealPlanSelectionRowValues = (
    selection: typeof ActiveMealPlanSelection.Encoded
  ) => ({
    id: selection.id,
    plan_id: selection.planId,
    updated_at: selection.updatedAt,
  });

  const mealEntryRowValues = (mealEntry: typeof MealEntry.Encoded) => ({
    created_at: mealEntry.createdAt,
    date_key: mealEntry.dateKey,
    food_id: mealEntry.foodId,
    id: mealEntry.id,
    meal: mealEntry.meal,
    quantity_grams: mealEntry.quantityGrams,
    updated_at: mealEntry.updatedAt,
  });

  const upsertFood = (food: Food) =>
    Schema.encodeEffect(Food)(food).pipe(
      Effect.flatMap((encodedFood) => {
        const row = foodRowValues(encodedFood);

        return sql`
          INSERT INTO foods ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  const upsertPlan = (plan: Plan) =>
    Schema.encodeEffect(Plan)(plan).pipe(
      Effect.flatMap((encodedPlan) => {
        const row = planRowValues(encodedPlan);

        return sql`
          INSERT INTO plans ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  const upsertDailyLog = (dailyLog: DailyLog) =>
    Schema.encodeEffect(DailyLog)(dailyLog).pipe(
      Effect.flatMap((encodedDailyLog) => {
        const row = dailyLogRowValues(encodedDailyLog);

        return sql`
          INSERT INTO daily_logs ${sql.insert(row)}
          ON CONFLICT(date_key) DO UPDATE SET
            ${sql.update(row, ["date_key"])}
        `;
      })
    );

  const upsertActiveMealPlanSelection = (selection: ActiveMealPlanSelection) =>
    Schema.encodeEffect(ActiveMealPlanSelection)(selection).pipe(
      Effect.flatMap((encodedSelection) => {
        const row = activeMealPlanSelectionRowValues(encodedSelection);

        return sql`
          INSERT INTO active_meal_plan_selections ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  const upsertMealEntry = (mealEntry: MealEntry) =>
    Schema.encodeEffect(MealEntry)(mealEntry).pipe(
      Effect.flatMap((encodedMealEntry) => {
        const row = mealEntryRowValues(encodedMealEntry);

        return sql`
          INSERT INTO meal_entries ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  return NutritionStore.of({
    countMealEntriesByDate: (dateKey) =>
      _mapStoreError(
        countMealEntriesByDateRows(dateKey).pipe(Effect.map((row) => row.count))
      ),

    countMealEntriesByFood: (foodId) =>
      _mapStoreError(
        countMealEntriesByFoodRows(foodId).pipe(Effect.map((row) => row.count))
      ),

    deleteMealEntry: (mealEntryId) =>
      _mapStoreError(sql`DELETE FROM meal_entries WHERE id = ${mealEntryId}`),

    findActiveMealPlanSelectionById: (activeMealPlanSelectionId) =>
      _mapStoreError(
        findActiveMealPlanSelectionRows(activeMealPlanSelectionId).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, decodeActiveMealPlanSelectionRow)
          )
        )
      ),

    findDailyLogByDateKey: (dateKey) =>
      _mapStoreError(
        findDailyLogByDateKeyRows(dateKey).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeDailyLogRow))
        )
      ),

    findDailyLogsByPlan: (planId) =>
      _mapStoreError(
        findDailyLogsByPlanRows(planId).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeDailyLogRow))
        )
      ),

    findFoodById: (foodId) =>
      _mapStoreError(
        findFoodByIdRows(foodId).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeFoodRow))
        )
      ),

    findFoodsByName: (name) =>
      _mapStoreError(
        findFoodsByNameRows(name).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeFoodRow))
        )
      ),

    findMealEntryById: (mealEntryId) =>
      _mapStoreError(
        findMealEntryByIdRows(mealEntryId).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeMealEntryRow))
        )
      ),

    findMealEntriesByDate: (dateKey) =>
      _mapStoreError(
        findMealEntriesByDateRows(dateKey).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeMealEntryRow))
        )
      ),

    findPlanById: (planId) =>
      _mapStoreError(
        findPlanByIdRows(planId).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodePlanRow))
        )
      ),

    findPlansByName: (name) =>
      _mapStoreError(
        findPlansByNameRows(name).pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodePlanRow))
        )
      ),

    insertFood: (food) => _mapStoreError(upsertFood(food)),

    insertMealEntry: (mealEntry) => _mapStoreError(upsertMealEntry(mealEntry)),

    insertPlan: (plan) => _mapStoreError(upsertPlan(plan)),

    listDailyLogs: _mapStoreError(listDailyLogs),

    listFoods: _mapStoreError(listFoods),

    listMealEntries: _mapStoreError(listMealEntries),

    listPlans: _mapStoreError(listPlans),

    readStores: _mapStoreError(
      Effect.gen(function* () {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const activeMealPlanSelections =
              yield* findActiveMealPlanSelectionRows(
                "active-meal-plan" satisfies ActiveMealPlanSelectionId
              ).pipe(
                Effect.flatMap((rows) =>
                  Effect.forEach(rows, decodeActiveMealPlanSelectionRow)
                )
              );
            const dailyLogs = yield* listDailyLogs;
            const foods = yield* listFoods;
            const mealEntries = yield* listMealEntries;
            const plans = yield* listPlans;

            return {
              activeMealPlanSelections,
              dailyLogs,
              foods,
              mealEntries,
              plans,
            } satisfies NutritionStores;
          })
        );
      })
    ),

    replaceStores: (stores) =>
      _mapStoreError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM meal_entries`;
            yield* sql`DELETE FROM active_meal_plan_selections`;
            yield* sql`DELETE FROM daily_logs`;
            yield* sql`DELETE FROM foods`;
            yield* sql`DELETE FROM plans`;
            yield* Effect.forEach(stores.plans, upsertPlan, { discard: true });
            yield* Effect.forEach(stores.foods, upsertFood, { discard: true });
            yield* Effect.forEach(stores.dailyLogs, upsertDailyLog, {
              discard: true,
            });
            yield* Effect.forEach(
              stores.activeMealPlanSelections,
              upsertActiveMealPlanSelection,
              { discard: true }
            );
            yield* Effect.forEach(stores.mealEntries, upsertMealEntry, {
              discard: true,
            });
          })
        )
      ),

    upsertActiveMealPlanSelection: (selection) =>
      _mapStoreError(upsertActiveMealPlanSelection(selection)),

    upsertDailyLog: (dailyLog) => _mapStoreError(upsertDailyLog(dailyLog)),

    upsertFood: (food) => _mapStoreError(upsertFood(food)),

    upsertFoods: (foods) =>
      _mapStoreError(Effect.forEach(foods, upsertFood, { discard: true })),

    upsertMealEntry: (mealEntry) => _mapStoreError(upsertMealEntry(mealEntry)),

    upsertMealEntries: (mealEntries) =>
      _mapStoreError(
        Effect.forEach(mealEntries, upsertMealEntry, { discard: true })
      ),

    upsertPlans: (plans) =>
      _mapStoreError(Effect.forEach(plans, upsertPlan, { discard: true })),
  });
});

export const SqliteNutritionStoreLayer = Layer.effect(
  NutritionStore,
  makeSqliteNutritionStore.pipe(
    Effect.mapError(
      (cause) =>
        new NutritionStoreError({
          cause,
        })
    )
  )
);
