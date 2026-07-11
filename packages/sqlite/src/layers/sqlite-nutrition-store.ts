import { Domain, Store } from "@mai/nutrition";
import { Array, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

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
        new Store.NutritionStoreError({
          cause,
        })
    )
  );

const FoodRow = Schema.Struct({
  brand: Schema.NullOr(Domain.NonEmptyString),
  carbsGrams: Domain.NonNegativeNumber,
  category: Schema.NullOr(Domain.FoodCategory),
  conversionMassAmount: Schema.NullOr(Domain.PositiveNumber),
  conversionMassUnit: Schema.NullOr(Domain.MassUnit),
  conversionVolumeAmount: Schema.NullOr(Domain.PositiveNumber),
  conversionVolumeUnit: Schema.NullOr(Domain.VolumeUnit),
  createdAt: Schema.Number,
  energyKcal: Domain.NonNegativeNumber,
  fatGrams: Domain.NonNegativeNumber,
  fiberGrams: Schema.NullOr(Domain.NonNegativeNumber),
  id: Domain.FoodId,
  name: Domain.NonEmptyString,
  nutritionReferenceAmount: Domain.PositiveNumber,
  nutritionReferenceUnit: Domain.MeasurementUnit,
  origin: Domain.FoodOrigin,
  proteinGrams: Domain.NonNegativeNumber,
  saltGrams: Schema.NullOr(Domain.NonNegativeNumber),
  saturatedFatGrams: Schema.NullOr(Domain.NonNegativeNumber),
  sugarGrams: Schema.NullOr(Domain.NonNegativeNumber),
  updatedAt: Schema.Number,
});

const FoodPortionRow = Schema.Struct({
  foodId: Domain.FoodId,
  id: Domain.FoodPortionId,
  name: Domain.NonEmptyString,
  position: Domain.FoodPortionPosition,
  sizeAmount: Domain.PositiveNumber,
  sizeUnit: Domain.MeasurementUnit,
});

const PlanRow = Schema.Struct({
  carbsTargetGrams: Domain.NonNegativeNumber,
  createdAt: Schema.Number,
  fatTargetGrams: Domain.NonNegativeNumber,
  fiberTargetGrams: Schema.NullOr(Domain.NonNegativeNumber),
  id: Domain.PlanId,
  name: Domain.NonEmptyString,
  proteinTargetGrams: Domain.NonNegativeNumber,
  saltTargetGrams: Schema.NullOr(Domain.NonNegativeNumber),
  saturatedFatTargetGrams: Schema.NullOr(Domain.NonNegativeNumber),
  sugarTargetGrams: Schema.NullOr(Domain.NonNegativeNumber),
});

const PlanMealRow = Schema.Struct({
  createdAt: Schema.Number,
  id: Domain.MealId,
  name: Domain.NonEmptyString,
  position: Domain.MealPosition,
  planId: Domain.PlanId,
});

const DailyLogRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Domain.DateKey,
  planId: Domain.PlanId,
  updatedAt: Schema.Number,
});

const BodyWeightEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Domain.DateKey,
  updatedAt: Schema.Number,
  weightKilograms: Domain.BodyWeightKilograms,
});

const ActiveMealPlanSelectionRow = Schema.Struct({
  id: Domain.ActiveMealPlanSelectionId,
  planId: Domain.PlanId,
  updatedAt: Schema.Number,
});

const MealEntryRow = Schema.Struct({
  createdAt: Schema.Number,
  dateKey: Domain.DateKey,
  foodId: Domain.FoodId,
  id: Domain.MealEntryId,
  mealId: Domain.MealId,
  nutritionMultiplier: Domain.NutritionMultiplier,
  portionId: Schema.NullOr(Domain.FoodPortionId),
  portionName: Schema.NullOr(Domain.NonEmptyString),
  portionSizeAmount: Schema.NullOr(Domain.PositiveNumber),
  portionSizeUnit: Schema.NullOr(Domain.MeasurementUnit),
  quantityAmount: Domain.PositiveNumber,
  quantityKind: Schema.Literals(["measured", "portion"]),
  quantityUnit: Schema.NullOr(Domain.MeasurementUnit),
  updatedAt: Schema.Number,
});

const selectFoodColumns = `
  id,
  name,
  brand,
  category,
  origin,
  nutrition_reference_amount AS nutritionReferenceAmount,
  nutrition_reference_unit AS nutritionReferenceUnit,
  conversion_mass_amount AS conversionMassAmount,
  conversion_mass_unit AS conversionMassUnit,
  conversion_volume_amount AS conversionVolumeAmount,
  conversion_volume_unit AS conversionVolumeUnit,
  energy_kcal_per_100g AS energyKcal,
  protein_grams_per_100g AS proteinGrams,
  carbs_grams_per_100g AS carbsGrams,
  fat_grams_per_100g AS fatGrams,
  fiber_grams_per_100g AS fiberGrams,
  sugar_grams_per_100g AS sugarGrams,
  saturated_fat_grams_per_100g AS saturatedFatGrams,
  salt_grams_per_100g AS saltGrams,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const selectFoodPortionColumns = `
  id,
  food_id AS foodId,
  name,
  size_amount AS sizeAmount,
  size_unit AS sizeUnit,
  position
`;

const selectPlanColumns = `
  id,
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

const selectPlanMealColumns = `
  id,
  plan_id AS planId,
  name,
  position,
  created_at AS createdAt
`;

const selectDailyLogColumns = `
  date_key AS dateKey,
  plan_id AS planId,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const selectBodyWeightEntryColumns = `
  date_key AS dateKey,
  weight_kilograms AS weightKilograms,
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
  meal_id AS mealId,
  food_id AS foodId,
  quantity_kind AS quantityKind,
  quantity_amount AS quantityAmount,
  quantity_unit AS quantityUnit,
  portion_id AS portionId,
  portion_name AS portionName,
  portion_size_amount AS portionSizeAmount,
  portion_size_unit AS portionSizeUnit,
  nutrition_multiplier AS nutritionMultiplier,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export const makeSqliteNutritionStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`PRAGMA foreign_keys = ON`;

  const decodeFoodPortionRow = ({
    foodId: _foodId,
    sizeAmount,
    sizeUnit,
    ...row
  }: typeof FoodPortionRow.Type) =>
    Schema.decodeEffect(Domain.FoodPortion)({
      ...row,
      size: {
        amount: sizeAmount,
        unit: sizeUnit,
      },
    });

  const decodeFoodRow = ({
    portions,
    row: {
      brand,
      category,
      conversionMassAmount,
      conversionMassUnit,
      conversionVolumeAmount,
      conversionVolumeUnit,
      fiberGrams,
      nutritionReferenceAmount,
      nutritionReferenceUnit,
      saltGrams,
      saturatedFatGrams,
      sugarGrams,
      ...row
    },
  }: {
    readonly portions: readonly (typeof Domain.FoodPortion.Encoded)[];
    readonly row: typeof FoodRow.Type;
  }) =>
    Schema.decodeEffect(Domain.Food)({
      ...row,
      nutritionReference: {
        amount: nutritionReferenceAmount,
        unit: nutritionReferenceUnit,
      },
      portions,
      ...(brand === null ? {} : { brand }),
      ...(category === null ? {} : { category }),
      ...(fiberGrams === null ? {} : { fiberGrams }),
      ...(saltGrams === null ? {} : { saltGrams }),
      ...(saturatedFatGrams === null ? {} : { saturatedFatGrams }),
      ...(sugarGrams === null ? {} : { sugarGrams }),
      ...(conversionMassAmount === null ||
      conversionMassUnit === null ||
      conversionVolumeAmount === null ||
      conversionVolumeUnit === null
        ? {}
        : {
            massVolumeConversion: {
              mass: {
                amount: conversionMassAmount,
                unit: conversionMassUnit,
              },
              volume: {
                amount: conversionVolumeAmount,
                unit: conversionVolumeUnit,
              },
            },
          }),
    });

  const decodePlanMealRow = (row: typeof PlanMealRow.Type) =>
    Schema.decodeEffect(Domain.PlanMeal)(row);

  const decodePlanRow = ({
    meals,
    row: {
      fiberTargetGrams,
      saltTargetGrams,
      saturatedFatTargetGrams,
      sugarTargetGrams,
      ...row
    },
  }: {
    readonly meals: readonly (typeof Domain.PlanMeal.Encoded)[];
    readonly row: typeof PlanRow.Type;
  }) =>
    Schema.decodeEffect(Domain.Plan)({
      ...row,
      meals,
      ...(fiberTargetGrams === null ? {} : { fiberTargetGrams }),
      ...(saltTargetGrams === null ? {} : { saltTargetGrams }),
      ...(saturatedFatTargetGrams === null ? {} : { saturatedFatTargetGrams }),
      ...(sugarTargetGrams === null ? {} : { sugarTargetGrams }),
    });

  const decodeDailyLogRow = (row: typeof DailyLogRow.Type) =>
    Schema.decodeEffect(Domain.DailyLog)(row);

  const decodeBodyWeightEntryRow = (row: typeof BodyWeightEntryRow.Type) =>
    Schema.decodeEffect(Domain.BodyWeightEntry)(row);

  const decodeActiveMealPlanSelectionRow = (
    row: typeof ActiveMealPlanSelectionRow.Type
  ) => Schema.decodeEffect(Domain.ActiveMealPlanSelection)(row);

  const decodeMealEntryRow = ({
    portionId,
    portionName,
    portionSizeAmount,
    portionSizeUnit,
    quantityAmount,
    quantityKind,
    quantityUnit,
    ...row
  }: typeof MealEntryRow.Type) =>
    Effect.gen(function* () {
      if (quantityKind === "measured") {
        if (quantityUnit === null) {
          return yield* Effect.fail(
            "Measured meal entry is missing its measurement unit."
          );
        }

        const unit = yield* Schema.decodeEffect(Domain.MeasurementUnit)(
          quantityUnit
        );

        return yield* Schema.decodeEffect(Domain.MealEntry)({
          ...row,
          quantity: {
            _tag: "MeasuredFoodQuantity",
            amount: quantityAmount,
            unit,
          },
        });
      }

      if (
        portionId === null ||
        portionName === null ||
        portionSizeAmount === null ||
        portionSizeUnit === null
      ) {
        return yield* Effect.fail(
          "Portion meal entry is missing its portion snapshot."
        );
      }

      const decodedPortionId = yield* Schema.decodeEffect(Domain.FoodPortionId)(
        portionId
      );
      const decodedPortionName = yield* Schema.decodeEffect(
        Domain.NonEmptyString
      )(portionName);
      const decodedPortionSizeAmount = yield* Schema.decodeEffect(
        Domain.PositiveNumber
      )(portionSizeAmount);
      const decodedPortionSizeUnit = yield* Schema.decodeEffect(
        Domain.MeasurementUnit
      )(portionSizeUnit);

      return yield* Schema.decodeEffect(Domain.MealEntry)({
        ...row,
        quantity: {
          _tag: "PortionFoodQuantity",
          count: quantityAmount,
          portionId: decodedPortionId,
          portionName: decodedPortionName,
          portionSize: {
            amount: decodedPortionSizeAmount,
            unit: decodedPortionSizeUnit,
          },
        },
      });
    });

  const listFoodRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: FoodRow,
    execute: () => sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods`,
  });

  const listFoodPortionRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: FoodPortionRow,
    execute: () =>
      sql`
        SELECT ${sql.literal(selectFoodPortionColumns)}
        FROM food_portions
        ORDER BY food_id, position
      `,
  });

  const findFoodPortionRowsByFood = SqlSchema.findAll({
    Request: Domain.FoodId,
    Result: FoodPortionRow,
    execute: (foodId) =>
      sql`
        SELECT ${sql.literal(selectFoodPortionColumns)}
        FROM food_portions
        WHERE food_id = ${foodId}
        ORDER BY position
      `,
  });

  const findFoodByIdRows = SqlSchema.findAll({
    Request: Domain.FoodId,
    Result: FoodRow,
    execute: (foodId) =>
      sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods WHERE id = ${foodId}`,
  });

  const findFoodsByNameRows = SqlSchema.findAll({
    Request: Domain.NonEmptyString,
    Result: FoodRow,
    execute: (name) =>
      sql`SELECT ${sql.literal(selectFoodColumns)} FROM foods WHERE name = ${name}`,
  });

  const listPlanRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: PlanRow,
    execute: () => sql`SELECT ${sql.literal(selectPlanColumns)} FROM plans`,
  });

  const listPlanMealRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: PlanMealRow,
    execute: () =>
      sql`
        SELECT ${sql.literal(selectPlanMealColumns)}
        FROM plan_meals
        ORDER BY plan_id, position
      `,
  });

  const findPlanMealRowsByPlan = SqlSchema.findAll({
    Request: Domain.PlanId,
    Result: PlanMealRow,
    execute: (planId) =>
      sql`
        SELECT ${sql.literal(selectPlanMealColumns)}
        FROM plan_meals
        WHERE plan_id = ${planId}
        ORDER BY position
      `,
  });

  const findPlanByIdRows = SqlSchema.findAll({
    Request: Domain.PlanId,
    Result: PlanRow,
    execute: (planId) =>
      sql`SELECT ${sql.literal(selectPlanColumns)} FROM plans WHERE id = ${planId}`,
  });

  const findPlansByNameRows = SqlSchema.findAll({
    Request: Domain.NonEmptyString,
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
    Request: Domain.DateKey,
    Result: DailyLogRow,
    execute: (dateKey) =>
      sql`SELECT ${sql.literal(selectDailyLogColumns)} FROM daily_logs WHERE date_key = ${dateKey}`,
  });

  const listBodyWeightEntryRows = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: BodyWeightEntryRow,
    execute: () =>
      sql`
        SELECT ${sql.literal(selectBodyWeightEntryColumns)}
        FROM body_weight_entries
        ORDER BY date_key
      `,
  });

  const findBodyWeightEntryByDateKeyRows = SqlSchema.findAll({
    Request: Domain.DateKey,
    Result: BodyWeightEntryRow,
    execute: (dateKey) =>
      sql`
        SELECT ${sql.literal(selectBodyWeightEntryColumns)}
        FROM body_weight_entries
        WHERE date_key = ${dateKey}
      `,
  });

  const BodyWeightEntryRangeRequest = Schema.Struct({
    endDateKey: Domain.DateKey,
    startDateKey: Domain.DateKey,
  });

  const findBodyWeightEntriesByRangeRows = SqlSchema.findAll({
    Request: BodyWeightEntryRangeRequest,
    Result: BodyWeightEntryRow,
    execute: ({ endDateKey, startDateKey }) =>
      sql`
        SELECT ${sql.literal(selectBodyWeightEntryColumns)}
        FROM body_weight_entries
        WHERE date_key BETWEEN ${startDateKey} AND ${endDateKey}
        ORDER BY date_key
      `,
  });

  const findDailyLogsByPlanRows = SqlSchema.findAll({
    Request: Domain.PlanId,
    Result: DailyLogRow,
    execute: (planId) =>
      sql`SELECT ${sql.literal(selectDailyLogColumns)} FROM daily_logs WHERE plan_id = ${planId}`,
  });

  const findActiveMealPlanSelectionRows = SqlSchema.findAll({
    Request: Domain.ActiveMealPlanSelectionId,
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
    Request: Domain.MealEntryId,
    Result: MealEntryRow,
    execute: (mealEntryId) =>
      sql`SELECT ${sql.literal(selectMealEntryColumns)} FROM meal_entries WHERE id = ${mealEntryId}`,
  });

  const findMealEntriesByDateRows = SqlSchema.findAll({
    Request: Domain.DateKey,
    Result: MealEntryRow,
    execute: (dateKey) =>
      sql`SELECT ${sql.literal(selectMealEntryColumns)} FROM meal_entries WHERE date_key = ${dateKey}`,
  });

  const countMealEntriesByDateRows = SqlSchema.findOne({
    Request: Domain.DateKey,
    Result: CountRow,
    execute: (dateKey) =>
      sql`SELECT COUNT(*) AS count FROM meal_entries WHERE date_key = ${dateKey}`,
  });

  const countMealEntriesByFoodRows = SqlSchema.findOne({
    Request: Domain.FoodId,
    Result: CountRow,
    execute: (foodId) =>
      sql`SELECT COUNT(*) AS count FROM meal_entries WHERE food_id = ${foodId}`,
  });

  const countMealEntriesByMealRows = SqlSchema.findOne({
    Request: Domain.MealId,
    Result: CountRow,
    execute: (mealId) =>
      sql`SELECT COUNT(*) AS count FROM meal_entries WHERE meal_id = ${mealId}`,
  });

  const decodeFoodRows = (rows: readonly (typeof FoodRow.Type)[]) =>
    Effect.gen(function* () {
      const portionRows = yield* listFoodPortionRows({});
      const portions = yield* Effect.forEach(portionRows, decodeFoodPortionRow);
      const encodedPortions = yield* Schema.encodeEffect(
        Schema.Array(Domain.FoodPortion)
      )(portions);

      return yield* Effect.forEach(rows, (row) =>
        decodeFoodRow({
          row,
          portions: encodedPortions.filter((portion) =>
            portionRows.some(
              (portionRow) =>
                portionRow.id === portion.id && portionRow.foodId === row.id
            )
          ),
        })
      );
    });

  const decodeFoodRowsWithPortionQuery = (
    rows: readonly (typeof FoodRow.Type)[]
  ) =>
    Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const portionRows = yield* findFoodPortionRowsByFood(row.id);
        const portions = yield* Effect.forEach(
          portionRows,
          decodeFoodPortionRow
        );
        const encodedPortions = yield* Schema.encodeEffect(
          Schema.Array(Domain.FoodPortion)
        )(portions);

        return yield* decodeFoodRow({ row, portions: encodedPortions });
      })
    );

  const listFoods = listFoodRows({}).pipe(Effect.flatMap(decodeFoodRows));

  const decodePlanRows = (rows: readonly (typeof PlanRow.Type)[]) =>
    Effect.gen(function* () {
      const mealRows = yield* listPlanMealRows({});
      const meals = yield* Effect.forEach(mealRows, decodePlanMealRow);
      const encodedMeals = yield* Schema.encodeEffect(
        Schema.Array(Domain.PlanMeal)
      )(meals);

      return yield* Effect.forEach(rows, (row) =>
        decodePlanRow({
          row,
          meals: encodedMeals.filter((meal) =>
            mealRows.some(
              (mealRow) => mealRow.id === meal.id && mealRow.planId === row.id
            )
          ),
        })
      );
    });

  const decodePlanRowsWithPlanMealQuery = (
    rows: readonly (typeof PlanRow.Type)[]
  ) =>
    Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const mealRows = yield* findPlanMealRowsByPlan(row.id);
        const meals = yield* Effect.forEach(mealRows, decodePlanMealRow);
        const encodedMeals = yield* Schema.encodeEffect(
          Schema.Array(Domain.PlanMeal)
        )(meals);

        return yield* decodePlanRow({ row, meals: encodedMeals });
      })
    );

  const listPlans = listPlanRows({}).pipe(Effect.flatMap(decodePlanRows));

  const listDailyLogs = listDailyLogRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeDailyLogRow))
  );

  const listBodyWeightEntries = listBodyWeightEntryRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeBodyWeightEntryRow))
  );

  const listMealEntries = listMealEntryRows({}).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, decodeMealEntryRow))
  );

  const foodRowValues = (food: typeof Domain.Food.Encoded) => ({
    brand: food.brand ?? null,
    carbs_grams_per_100g: food.carbsGrams,
    category: food.category ?? null,
    conversion_mass_amount: food.massVolumeConversion?.mass.amount ?? null,
    conversion_mass_unit: food.massVolumeConversion?.mass.unit ?? null,
    conversion_volume_amount: food.massVolumeConversion?.volume.amount ?? null,
    conversion_volume_unit: food.massVolumeConversion?.volume.unit ?? null,
    created_at: food.createdAt,
    energy_kcal_per_100g: food.energyKcal,
    fat_grams_per_100g: food.fatGrams,
    fiber_grams_per_100g: food.fiberGrams ?? null,
    id: food.id,
    name: food.name,
    nutrition_reference_amount: food.nutritionReference?.amount ?? 100,
    nutrition_reference_unit: food.nutritionReference?.unit ?? "g",
    origin: food.origin,
    protein_grams_per_100g: food.proteinGrams,
    salt_grams_per_100g: food.saltGrams ?? null,
    saturated_fat_grams_per_100g: food.saturatedFatGrams ?? null,
    sugar_grams_per_100g: food.sugarGrams ?? null,
    updated_at: food.updatedAt,
  });

  const foodPortionRowValues = ({
    foodId,
    portion,
  }: {
    readonly foodId: Domain.FoodId | string;
    readonly portion: typeof Domain.FoodPortion.Encoded;
  }) => ({
    food_id: foodId,
    id: portion.id,
    name: portion.name,
    position: portion.position,
    size_amount: portion.size.amount,
    size_unit: portion.size.unit,
  });

  const planRowValues = (plan: typeof Domain.Plan.Encoded) => ({
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

  const planMealRowValues = ({
    meal,
    planId,
  }: {
    readonly meal: typeof Domain.PlanMeal.Encoded;
    readonly planId: Domain.PlanId | string;
  }) => ({
    created_at: meal.createdAt,
    id: meal.id,
    name: meal.name,
    plan_id: planId,
    position: meal.position,
  });

  const dailyLogRowValues = (dailyLog: typeof Domain.DailyLog.Encoded) => ({
    created_at: dailyLog.createdAt,
    date_key: dailyLog.dateKey,
    plan_id: dailyLog.planId,
    updated_at: dailyLog.updatedAt,
  });

  const bodyWeightEntryRowValues = (
    bodyWeightEntry: typeof Domain.BodyWeightEntry.Encoded
  ) => ({
    created_at: bodyWeightEntry.createdAt,
    date_key: bodyWeightEntry.dateKey,
    updated_at: bodyWeightEntry.updatedAt,
    weight_kilograms: bodyWeightEntry.weightKilograms,
  });

  const activeMealPlanSelectionRowValues = (
    selection: typeof Domain.ActiveMealPlanSelection.Encoded
  ) => ({
    id: selection.id,
    plan_id: selection.planId,
    updated_at: selection.updatedAt,
  });

  const mealEntryRowValues = (mealEntry: typeof Domain.MealEntry.Encoded) => ({
    created_at: mealEntry.createdAt,
    date_key: mealEntry.dateKey,
    food_id: mealEntry.foodId,
    id: mealEntry.id,
    meal_id: mealEntry.mealId,
    nutrition_multiplier: mealEntry.nutritionMultiplier,
    portion_id:
      mealEntry.quantity._tag === "PortionFoodQuantity"
        ? mealEntry.quantity.portionId
        : null,
    portion_name:
      mealEntry.quantity._tag === "PortionFoodQuantity"
        ? mealEntry.quantity.portionName
        : null,
    portion_size_amount:
      mealEntry.quantity._tag === "PortionFoodQuantity"
        ? mealEntry.quantity.portionSize.amount
        : null,
    portion_size_unit:
      mealEntry.quantity._tag === "PortionFoodQuantity"
        ? mealEntry.quantity.portionSize.unit
        : null,
    quantity_amount:
      mealEntry.quantity._tag === "MeasuredFoodQuantity"
        ? mealEntry.quantity.amount
        : mealEntry.quantity.count,
    quantity_kind:
      mealEntry.quantity._tag === "MeasuredFoodQuantity"
        ? "measured"
        : "portion",
    quantity_unit:
      mealEntry.quantity._tag === "MeasuredFoodQuantity"
        ? mealEntry.quantity.unit
        : null,
    updated_at: mealEntry.updatedAt,
  });

  const upsertFood = (food: Domain.Food) =>
    Schema.encodeEffect(Domain.Food)(food).pipe(
      Effect.flatMap((encodedFood) => {
        const row = foodRowValues(encodedFood);
        const portionRows = (encodedFood.portions ?? []).map((portion) =>
          foodPortionRowValues({ foodId: encodedFood.id, portion })
        );

        return Effect.gen(function* () {
          yield* sql`
            INSERT INTO foods ${sql.insert(row)}
            ON CONFLICT(id) DO UPDATE SET
              ${sql.update(row, ["id"])}
          `;
          yield* Effect.forEach(
            portionRows,
            (portionRow) =>
              sql`
                INSERT INTO food_portions ${sql.insert(portionRow)}
                ON CONFLICT(id) DO UPDATE SET
                  ${sql.update(portionRow, ["id"])}
              `,
            { discard: true }
          );

          if (!Array.isReadonlyArrayNonEmpty(portionRows)) {
            yield* sql`
              DELETE FROM food_portions
              WHERE food_id = ${encodedFood.id}
            `;
          } else {
            yield* sql`
              DELETE FROM food_portions
              WHERE food_id = ${encodedFood.id}
                AND id NOT IN ${sql.in(portionRows.map((portionRow) => portionRow.id))}
            `;
          }
        });
      })
    );

  const upsertPlan = (plan: Domain.Plan) =>
    Schema.encodeEffect(Domain.Plan)(plan).pipe(
      Effect.flatMap((encodedPlan) => {
        const row = planRowValues(encodedPlan);
        const mealRows = encodedPlan.meals.map((meal) =>
          planMealRowValues({ meal, planId: encodedPlan.id })
        );

        return Effect.gen(function* () {
          yield* sql`
            INSERT INTO plans ${sql.insert(row)}
            ON CONFLICT(id) DO UPDATE SET
              ${sql.update(row, ["id"])}
          `;
          yield* Effect.forEach(
            mealRows,
            (mealRow) =>
              sql`
                INSERT INTO plan_meals ${sql.insert(mealRow)}
                ON CONFLICT(id) DO UPDATE SET
                  ${sql.update(mealRow, ["id"])}
              `,
            { discard: true }
          );
          yield* sql`
            DELETE FROM plan_meals
            WHERE plan_id = ${encodedPlan.id}
              AND id NOT IN ${sql.in(mealRows.map((mealRow) => mealRow.id))}
          `;
        });
      })
    );

  const upsertDailyLog = (dailyLog: Domain.DailyLog) =>
    Schema.encodeEffect(Domain.DailyLog)(dailyLog).pipe(
      Effect.flatMap((encodedDailyLog) => {
        const row = dailyLogRowValues(encodedDailyLog);

        return sql`
          INSERT INTO daily_logs ${sql.insert(row)}
          ON CONFLICT(date_key) DO UPDATE SET
            ${sql.update(row, ["date_key"])}
        `;
      })
    );

  const upsertBodyWeightEntry = (bodyWeightEntry: Domain.BodyWeightEntry) =>
    Schema.encodeEffect(Domain.BodyWeightEntry)(bodyWeightEntry).pipe(
      Effect.flatMap((encodedBodyWeightEntry) => {
        const row = bodyWeightEntryRowValues(encodedBodyWeightEntry);

        return sql`
          INSERT INTO body_weight_entries ${sql.insert(row)}
          ON CONFLICT(date_key) DO UPDATE SET
            ${sql.update(row, ["date_key"])}
        `;
      })
    );

  const upsertActiveMealPlanSelection = (
    selection: Domain.ActiveMealPlanSelection
  ) =>
    Schema.encodeEffect(Domain.ActiveMealPlanSelection)(selection).pipe(
      Effect.flatMap((encodedSelection) => {
        const row = activeMealPlanSelectionRowValues(encodedSelection);

        return sql`
          INSERT INTO active_meal_plan_selections ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  const upsertMealEntry = (mealEntry: Domain.MealEntry) =>
    Schema.encodeEffect(Domain.MealEntry)(mealEntry).pipe(
      Effect.flatMap((encodedMealEntry) => {
        const row = mealEntryRowValues(encodedMealEntry);

        return sql`
          INSERT INTO meal_entries ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET
            ${sql.update(row, ["id"])}
        `;
      })
    );

  return Store.NutritionStore.of({
    applyFoodEdit: ({ food, mealEntries }) =>
      _mapStoreError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* upsertFood(food);
            yield* Effect.forEach(mealEntries, upsertMealEntry, {
              discard: true,
            });
          })
        )
      ),

    countMealEntriesByDate: (dateKey) =>
      _mapStoreError(
        countMealEntriesByDateRows(dateKey).pipe(Effect.map((row) => row.count))
      ),

    countMealEntriesByFood: (foodId) =>
      _mapStoreError(
        countMealEntriesByFoodRows(foodId).pipe(Effect.map((row) => row.count))
      ),

    countMealEntriesByMealIds: (mealIds) =>
      _mapStoreError(
        Effect.forEach(mealIds, (mealId) =>
          countMealEntriesByMealRows(mealId).pipe(
            Effect.map((row) => row.count)
          )
        ).pipe(
          Effect.map((counts) =>
            counts.reduce((total, count) => total + count, 0)
          )
        )
      ),

    deleteMealEntry: (mealEntryId) =>
      _mapStoreError(sql`DELETE FROM meal_entries WHERE id = ${mealEntryId}`),

    deleteDailyLog: (dateKey) =>
      _mapStoreError(sql`DELETE FROM daily_logs WHERE date_key = ${dateKey}`),

    deleteBodyWeightEntry: (dateKey) =>
      _mapStoreError(
        sql`DELETE FROM body_weight_entries WHERE date_key = ${dateKey}`
      ),

    findBodyWeightEntryByDateKey: (dateKey) =>
      _mapStoreError(
        findBodyWeightEntryByDateKeyRows(dateKey).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, decodeBodyWeightEntryRow)
          )
        )
      ),

    findBodyWeightEntriesByRange: (input) =>
      _mapStoreError(
        findBodyWeightEntriesByRangeRows(input).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, decodeBodyWeightEntryRow)
          )
        )
      ),

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
          Effect.flatMap(decodeFoodRowsWithPortionQuery)
        )
      ),

    findFoodsByName: (name) =>
      _mapStoreError(
        findFoodsByNameRows(name).pipe(
          Effect.flatMap(decodeFoodRowsWithPortionQuery)
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
          Effect.flatMap(decodePlanRowsWithPlanMealQuery)
        )
      ),

    findPlansByName: (name) =>
      _mapStoreError(
        findPlansByNameRows(name).pipe(
          Effect.flatMap(decodePlanRowsWithPlanMealQuery)
        )
      ),

    insertFood: (food) => _mapStoreError(upsertFood(food)),

    insertMealEntry: (mealEntry) => _mapStoreError(upsertMealEntry(mealEntry)),

    insertPlan: (plan) => _mapStoreError(upsertPlan(plan)),

    listDailyLogs: _mapStoreError(listDailyLogs),

    listBodyWeightEntries: _mapStoreError(listBodyWeightEntries),

    listFoods: _mapStoreError(listFoods),

    listMealEntries: _mapStoreError(listMealEntries),

    listPlans: _mapStoreError(listPlans),

    readStores: _mapStoreError(
      Effect.gen(function* () {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const activeMealPlanSelections =
              yield* findActiveMealPlanSelectionRows(
                "active-meal-plan" satisfies Domain.ActiveMealPlanSelectionId
              ).pipe(
                Effect.flatMap((rows) =>
                  Effect.forEach(rows, decodeActiveMealPlanSelectionRow)
                )
              );
            const dailyLogs = yield* listDailyLogs;
            const bodyWeightEntries = yield* listBodyWeightEntries;
            const foods = yield* listFoods;
            const mealEntries = yield* listMealEntries;
            const plans = yield* listPlans;

            return {
              activeMealPlanSelections,
              bodyWeightEntries,
              dailyLogs,
              foods,
              mealEntries,
              plans,
            } satisfies Store.NutritionStores;
          })
        );
      })
    ),

    replaceStores: (stores) =>
      _mapStoreError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM meal_entries`;
            yield* sql`DELETE FROM body_weight_entries`;
            yield* sql`DELETE FROM active_meal_plan_selections`;
            yield* sql`DELETE FROM daily_logs`;
            yield* sql`DELETE FROM plan_meals`;
            yield* sql`DELETE FROM food_portions`;
            yield* sql`DELETE FROM foods`;
            yield* sql`DELETE FROM plans`;
            yield* Effect.forEach(stores.plans, upsertPlan, { discard: true });
            yield* Effect.forEach(stores.foods, upsertFood, { discard: true });
            yield* Effect.forEach(
              stores.bodyWeightEntries,
              upsertBodyWeightEntry,
              { discard: true }
            );
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

    upsertBodyWeightEntry: (bodyWeightEntry) =>
      _mapStoreError(upsertBodyWeightEntry(bodyWeightEntry)),

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
  Store.NutritionStore,
  makeSqliteNutritionStore.pipe(
    Effect.mapError(
      (cause) =>
        new Store.NutritionStoreError({
          cause,
        })
    )
  )
);
