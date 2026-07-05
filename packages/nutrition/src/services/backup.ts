import { Context, Data, DateTime, Effect, Layer, Schema } from "effect";

import {
  ActiveMealPlanSelection,
  BodyWeightEntry,
  DailyLog,
  Food,
  FoodCategory,
  FoodId,
  FoodOrigin,
  MealEntry,
  MealId,
  MealPosition,
  NonEmptyString,
  NonNegativeNumber,
  Plan,
  PlanId,
  PlanMeal,
} from "../domain.ts";
import { DefaultFoods } from "../default-foods.ts";
import { CurrentDatabaseVersion, DatabaseName } from "../metadata.ts";
import * as CustomPlanMealsMigration from "../migrations/version-004-custom-plan-meals.ts";
import { NutritionStore } from "./store.ts";

export const MaiBackupFormat = Schema.Literal("mai.backup");

export const MaiBackupFormatVersion = Schema.Literal(1);

export const BackupCount = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("BackupCount"));

export type BackupCount = typeof BackupCount.Type;

export const BackupDatabaseVersion = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(CurrentDatabaseVersion)
).pipe(Schema.brand("BackupDatabaseVersion"));

export type BackupDatabaseVersion = typeof BackupDatabaseVersion.Type;

export const BackupStoreName = Schema.Literals([
  "activeMealPlanSelections",
  "bodyWeightEntries",
  "dailyLogs",
  "foods",
  "mealEntries",
  "plans",
]);

export type BackupStoreName = typeof BackupStoreName.Type;

class BackupLegacyFood extends Schema.Class<BackupLegacyFood>(
  "BackupLegacyFood"
)({
  id: FoodId,
  basedOnFoodId: Schema.optional(FoodId),
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  category: Schema.optional(FoodCategory),
  origin: Schema.optional(FoodOrigin),
  energyKcalPer100g: NonNegativeNumber,
  proteinGramsPer100g: NonNegativeNumber,
  carbsGramsPer100g: NonNegativeNumber,
  fatGramsPer100g: NonNegativeNumber,
  fiberGramsPer100g: Schema.optional(NonNegativeNumber),
  sugarGramsPer100g: Schema.optional(NonNegativeNumber),
  saturatedFatGramsPer100g: Schema.optional(NonNegativeNumber),
  saltGramsPer100g: Schema.optional(NonNegativeNumber),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

class BackupImportPlanMeal extends Schema.Class<BackupImportPlanMeal>(
  "BackupImportPlanMeal"
)({
  id: MealId,
  basedOnMealId: Schema.optional(MealId),
  name: NonEmptyString,
  order: Schema.optional(MealPosition),
  position: Schema.optional(MealPosition),
  createdAt: Schema.DateTimeUtcFromMillis,
}) {}

class BackupImportPlan extends Schema.Class<BackupImportPlan>(
  "BackupImportPlan"
)({
  id: PlanId,
  basedOnPlanId: Schema.optional(PlanId),
  name: NonEmptyString,
  meals: Schema.Array(BackupImportPlanMeal).check(Schema.isNonEmpty()),
  proteinTargetGrams: NonNegativeNumber,
  carbsTargetGrams: NonNegativeNumber,
  fatTargetGrams: NonNegativeNumber,
  fiberTargetGrams: Schema.optional(NonNegativeNumber),
  sugarTargetGrams: Schema.optional(NonNegativeNumber),
  saltTargetGrams: Schema.optional(NonNegativeNumber),
  saturatedFatTargetGrams: Schema.optional(NonNegativeNumber),
  createdAt: Schema.DateTimeUtcFromMillis,
}) {}

export class MaiBackupSource extends Schema.Class<MaiBackupSource>(
  "MaiBackupSource"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: BackupDatabaseVersion,
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class MaiBackupCounts extends Schema.Class<MaiBackupCounts>(
  "MaiBackupCounts"
)({
  activeMealPlanSelections: BackupCount,
  bodyWeightEntries: Schema.optional(BackupCount),
  dailyLogs: BackupCount,
  foods: BackupCount,
  mealEntries: BackupCount,
  plans: BackupCount,
}) {}

export class MaiBackupIntegrity extends Schema.Class<MaiBackupIntegrity>(
  "MaiBackupIntegrity"
)({
  counts: MaiBackupCounts,
}) {}

export class MaiBackupStores extends Schema.Class<MaiBackupStores>(
  "MaiBackupStores"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  bodyWeightEntries: Schema.Array(BodyWeightEntry),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(Food),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(Plan),
}) {}

class CurrentMaiBackupImportStores extends Schema.Class<CurrentMaiBackupImportStores>(
  "CurrentMaiBackupImportStores"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  bodyWeightEntries: Schema.Array(BodyWeightEntry),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(BackupLegacyFood),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(BackupImportPlan),
}) {}

class LegacyMaiBackupSourceV1 extends Schema.Class<LegacyMaiBackupSourceV1>(
  "LegacyMaiBackupSourceV1"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(1),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyMaiBackupSourceV2 extends Schema.Class<LegacyMaiBackupSourceV2>(
  "LegacyMaiBackupSourceV2"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(2),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyMaiBackupSourceV3 extends Schema.Class<LegacyMaiBackupSourceV3>(
  "LegacyMaiBackupSourceV3"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(3),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyMaiBackupSourceV4 extends Schema.Class<LegacyMaiBackupSourceV4>(
  "LegacyMaiBackupSourceV4"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(4),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyMaiBackupStores extends Schema.Class<LegacyMaiBackupStores>(
  "LegacyMaiBackupStores"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(BackupLegacyFood),
  mealEntries: Schema.Array(
    CustomPlanMealsMigration.MealEntryBeforeCustomPlanMeals
  ),
  plans: Schema.Array(CustomPlanMealsMigration.PlanBeforeCustomPlanMeals),
}) {}

class LegacyMaiBackupStoresBeforeBodyWeight extends Schema.Class<LegacyMaiBackupStoresBeforeBodyWeight>(
  "LegacyMaiBackupStoresBeforeBodyWeight"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(BackupLegacyFood),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(BackupImportPlan),
}) {}

class LegacyMaiBackupV1DatabaseVersion1 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion1>(
  "LegacyMaiBackupV1DatabaseVersion1"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: LegacyMaiBackupSourceV1,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion2 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion2>(
  "LegacyMaiBackupV1DatabaseVersion2"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: LegacyMaiBackupSourceV2,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion3 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion3>(
  "LegacyMaiBackupV1DatabaseVersion3"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: LegacyMaiBackupSourceV3,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion4 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion4>(
  "LegacyMaiBackupV1DatabaseVersion4"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: LegacyMaiBackupSourceV4,
  stores: LegacyMaiBackupStoresBeforeBodyWeight,
}) {}

export class MaiBackupV1 extends Schema.Class<MaiBackupV1>("MaiBackupV1")({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: MaiBackupSource,
  stores: MaiBackupStores,
}) {}

class CurrentMaiBackupImportV1 extends Schema.Class<CurrentMaiBackupImportV1>(
  "CurrentMaiBackupImportV1"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: MaiBackupSource,
  stores: CurrentMaiBackupImportStores,
}) {}

export type MaiBackup = typeof MaiBackupV1.Type;

export type MaiBackupEncoded = typeof MaiBackupV1.Encoded;

export const MaiBackupJson = Schema.fromJsonString(MaiBackupV1);

export const MaiBackupImportV1 = Schema.Union([
  LegacyMaiBackupV1DatabaseVersion1,
  LegacyMaiBackupV1DatabaseVersion2,
  LegacyMaiBackupV1DatabaseVersion3,
  LegacyMaiBackupV1DatabaseVersion4,
  CurrentMaiBackupImportV1,
]);

export type MaiBackupImport = typeof MaiBackupImportV1.Type;

export const MaiBackupImportJson = Schema.fromJsonString(MaiBackupImportV1);

const MaiBackupUnknownJson = Schema.fromJsonString(Schema.Unknown);

const MaiBackupImportVersionProbe = Schema.Struct({
  source: Schema.Struct({
    databaseVersion: Schema.Int,
  }),
});

const LegacyMaiBackupImportV1 = Schema.Union([
  LegacyMaiBackupV1DatabaseVersion1,
  LegacyMaiBackupV1DatabaseVersion2,
  LegacyMaiBackupV1DatabaseVersion3,
]);

const LegacyMaiBackupImportV4 = Schema.Union([
  LegacyMaiBackupV1DatabaseVersion4,
]);

const isCurrentMaiBackupImportV1 = Schema.is(CurrentMaiBackupImportV1);

const isLegacyMaiBackupImportV1 = Schema.is(LegacyMaiBackupImportV1);

const isLegacyMaiBackupImportV4 = Schema.is(LegacyMaiBackupImportV4);

const ImportBackupJsonInputSchema = Schema.Struct({
  json: Schema.String,
});

export type ImportBackupJsonInput = typeof ImportBackupJsonInputSchema.Encoded;

export const BackupIntegrityErrorReason = Schema.Literals([
  "active-selection-plan-missing",
  "active-selection-count-mismatch",
  "count-mismatch",
  "duplicate-body-weight-date",
  "daily-log-plan-missing",
  "duplicate-food-id",
  "duplicate-meal-id",
  "duplicate-meal-entry-id",
  "duplicate-meal-name",
  "duplicate-meal-position",
  "duplicate-plan-id",
  "duplicate-plan-name",
  "meal-entry-food-missing",
  "meal-entry-meal-missing",
]);

export type BackupIntegrityErrorReason = typeof BackupIntegrityErrorReason.Type;

export class BackupIntegrityError extends Data.TaggedError(
  "BackupIntegrityError"
)<{
  readonly detail: string;
  readonly reason: BackupIntegrityErrorReason;
}> {}

export class ExportedBackup extends Data.TaggedClass("ExportedBackup")<{
  readonly backup: MaiBackup;
  readonly json: string;
}> {}

export class ImportedBackup extends Data.TaggedClass("ImportedBackup")<{
  readonly backup: MaiBackup;
}> {}

export const migrateBackupToCurrent = Effect.fn("migrateBackupToCurrent")(
  function* ({ backup }: { readonly backup: MaiBackupImport }) {
    if (isCurrentMaiBackupImportV1(backup)) {
      const currentBackup = backup;
      const foods = yield* Effect.forEach(currentBackup.stores.foods, (food) =>
        _foodFromBackupImport({ food, originFallback: "user" })
      );
      const plans = yield* Effect.forEach(
        currentBackup.stores.plans,
        _planFromBackupImport
      );
      const activeMealPlanSelections = yield* Schema.encodeEffect(
        Schema.Array(ActiveMealPlanSelection)
      )(currentBackup.stores.activeMealPlanSelections);
      const bodyWeightEntries = yield* Schema.encodeEffect(
        Schema.Array(BodyWeightEntry)
      )(currentBackup.stores.bodyWeightEntries);
      const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
        currentBackup.stores.dailyLogs
      );
      const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(
        foods
      );
      const mealEntries = yield* Schema.encodeEffect(Schema.Array(MealEntry))(
        currentBackup.stores.mealEntries
      );
      const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(
        plans
      );

      return yield* Schema.decodeEffect(MaiBackupV1)({
        format: currentBackup.format,
        formatVersion: currentBackup.formatVersion,
        integrity: currentBackup.integrity,
        source: {
          databaseName: currentBackup.source.databaseName,
          databaseVersion: CurrentDatabaseVersion,
          exportedAt: DateTime.toEpochMillis(currentBackup.source.exportedAt),
        },
        stores: {
          activeMealPlanSelections,
          bodyWeightEntries,
          dailyLogs,
          foods: encodedFoods,
          mealEntries,
          plans: encodedPlans,
        },
      });
    }

    if (isLegacyMaiBackupImportV4(backup)) {
      const legacyBackup = backup;
      const userFoods = yield* Effect.forEach(
        legacyBackup.stores.foods,
        (food) => _foodFromBackupImport({ food, originFallback: "user" })
      );
      const userFoodIds = userFoods.map((food) => food.id);
      const defaultFoods = yield* Schema.decodeEffect(Schema.Array(Food))(
        DefaultFoods
      );
      const foods = [
        ...userFoods,
        ...defaultFoods.filter((food) => !userFoodIds.includes(food.id)),
      ];
      const plans = yield* Effect.forEach(
        legacyBackup.stores.plans,
        _planFromBackupImport
      );
      const activeMealPlanSelections = yield* Schema.encodeEffect(
        Schema.Array(ActiveMealPlanSelection)
      )(legacyBackup.stores.activeMealPlanSelections);
      const bodyWeightEntries = yield* Schema.encodeEffect(
        Schema.Array(BodyWeightEntry)
      )([]);
      const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
        legacyBackup.stores.dailyLogs
      );
      const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(
        foods
      );
      const mealEntries = yield* Schema.encodeEffect(Schema.Array(MealEntry))(
        legacyBackup.stores.mealEntries
      );
      const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(
        plans
      );

      return yield* Schema.decodeEffect(MaiBackupV1)({
        format: legacyBackup.format,
        formatVersion: legacyBackup.formatVersion,
        integrity: {
          counts: {
            activeMealPlanSelections: activeMealPlanSelections.length,
            bodyWeightEntries: bodyWeightEntries.length,
            dailyLogs: dailyLogs.length,
            foods: foods.length,
            mealEntries: mealEntries.length,
            plans: plans.length,
          },
        },
        source: {
          databaseName: legacyBackup.source.databaseName,
          databaseVersion: CurrentDatabaseVersion,
          exportedAt: DateTime.toEpochMillis(legacyBackup.source.exportedAt),
        },
        stores: {
          activeMealPlanSelections,
          bodyWeightEntries,
          dailyLogs,
          foods: encodedFoods,
          mealEntries,
          plans: encodedPlans,
        },
      });
    }

    if (!isLegacyMaiBackupImportV1(backup)) {
      return yield* Effect.die("Unsupported backup database version.");
    }

    const legacyBackup = backup;
    const usedPlanNames: string[] = [];
    const plans =
      legacyBackup.source.databaseVersion === 1
        ? yield* Effect.forEach(legacyBackup.stores.plans, (plan) =>
            Effect.gen(function* () {
              const encodedPlan = yield* Schema.encodeEffect(
                CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
              )(plan);
              const baseName =
                encodedPlan.name.trim() === ""
                  ? "Plan"
                  : encodedPlan.name.trim();
              let planNameIndex = 0;
              let name = baseName;

              while (usedPlanNames.includes(name)) {
                planNameIndex += 1;
                name = `${baseName} (${planNameIndex})`;
              }

              usedPlanNames.push(name);

              return yield* Schema.decodeEffect(
                CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
              )({
                ...encodedPlan,
                name,
              });
            })
          )
        : legacyBackup.stores.plans;
    const userFoods = yield* Effect.forEach(legacyBackup.stores.foods, (food) =>
      _foodFromBackupImport({ food, originFallback: "user" })
    );
    const userFoodIds = userFoods.map((food) => food.id);
    const defaultFoods = yield* Schema.decodeEffect(Schema.Array(Food))(
      DefaultFoods
    );
    const foods = [
      ...userFoods,
      ...defaultFoods.filter((food) => !userFoodIds.includes(food.id)),
    ];
    const migratedPlans =
      yield* CustomPlanMealsMigration.migratePlansToCustomPlanMeals({ plans });
    const migratedMealEntries =
      yield* CustomPlanMealsMigration.migrateMealEntriesToCustomPlanMeals({
        activeMealPlanSelections: legacyBackup.stores.activeMealPlanSelections,
        dailyLogs: legacyBackup.stores.dailyLogs,
        mealEntries: legacyBackup.stores.mealEntries,
        plans: migratedPlans,
      });
    const activeMealPlanSelections = yield* Schema.encodeEffect(
      Schema.Array(ActiveMealPlanSelection)
    )(legacyBackup.stores.activeMealPlanSelections);
    const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
      migratedMealEntries.dailyLogs
    );
    const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(foods);
    const mealEntries = yield* Schema.encodeEffect(Schema.Array(MealEntry))(
      migratedMealEntries.mealEntries
    );
    const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(
      migratedPlans
    );

    return yield* Schema.decodeEffect(MaiBackupV1)({
      format: backup.format,
      formatVersion: backup.formatVersion,
      integrity: {
        counts: {
          activeMealPlanSelections: activeMealPlanSelections.length,
          bodyWeightEntries: 0,
          dailyLogs: dailyLogs.length,
          foods: foods.length,
          mealEntries: mealEntries.length,
          plans: plans.length,
        },
      },
      source: {
        databaseName: backup.source.databaseName,
        databaseVersion: CurrentDatabaseVersion,
        exportedAt: DateTime.toEpochMillis(backup.source.exportedAt),
      },
      stores: {
        activeMealPlanSelections,
        bodyWeightEntries: [],
        dailyLogs,
        foods: encodedFoods,
        mealEntries,
        plans: encodedPlans,
      },
    });
  }
);

const _foodFromBackupImport = Effect.fn("_foodFromBackupImport")(function* ({
  food,
  originFallback,
}: {
  readonly food: BackupLegacyFood;
  readonly originFallback: FoodOrigin;
}) {
  const encodedFood = yield* Schema.encodeEffect(BackupLegacyFood)(food);
  const { basedOnFoodId, ...foodWithoutLineage } = encodedFood;
  void basedOnFoodId;

  return yield* Schema.decodeEffect(Food)({
    ...foodWithoutLineage,
    origin: foodWithoutLineage.origin ?? originFallback,
  });
});

const _planFromBackupImport = Effect.fn("_planFromBackupImport")(function* (
  plan: BackupImportPlan
) {
  const encodedPlan = yield* Schema.encodeEffect(BackupImportPlan)(plan);
  const {
    basedOnPlanId,
    meals: encodedMeals,
    ...planWithoutLineage
  } = encodedPlan;
  void basedOnPlanId;
  const meals = yield* Effect.forEach(encodedMeals, (meal) => {
    const { basedOnMealId, order, position, ...mealWithoutLineage } = meal;
    void basedOnMealId;
    const mealPosition = position ?? order;

    return Schema.decodeUnknownEffect(PlanMeal)({
      ...mealWithoutLineage,
      ...(mealPosition === undefined ? {} : { position: mealPosition }),
    });
  });
  const encodedCurrentMeals = yield* Schema.encodeEffect(
    Schema.Array(PlanMeal)
  )(meals);

  return yield* Schema.decodeEffect(Plan)({
    ...planWithoutLineage,
    meals: encodedCurrentMeals,
  });
});

export const validateBackup = Effect.fn("validateBackup")(function* ({
  backup,
}: {
  readonly backup: MaiBackup;
}) {
  const { counts } = backup.integrity;
  const {
    activeMealPlanSelections,
    bodyWeightEntries,
    dailyLogs,
    foods,
    mealEntries,
    plans,
  } = backup.stores;
  const bodyWeightEntryDateKeys = bodyWeightEntries.map(
    (bodyWeightEntry) => bodyWeightEntry.dateKey
  );
  const foodIds = foods.map((food) => food.id);
  const planIds = plans.map((plan) => plan.id);
  const planNames = plans.map((plan) => plan.name);
  const mealIds = plans.flatMap((plan) => plan.meals.map((meal) => meal.id));
  const mealEntryIds = mealEntries.map((mealEntry) => mealEntry.id);

  if (counts.activeMealPlanSelections !== activeMealPlanSelections.length) {
    return yield* new BackupIntegrityError({
      detail: "The active meal plan selection count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if ((counts.bodyWeightEntries ?? 0) !== bodyWeightEntries.length) {
    return yield* new BackupIntegrityError({
      detail: "The body weight entry count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.dailyLogs !== dailyLogs.length) {
    return yield* new BackupIntegrityError({
      detail: "The daily log count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.foods !== foods.length) {
    return yield* new BackupIntegrityError({
      detail: "The food count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.mealEntries !== mealEntries.length) {
    return yield* new BackupIntegrityError({
      detail: "The meal entry count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.plans !== plans.length) {
    return yield* new BackupIntegrityError({
      detail: "The plan count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (activeMealPlanSelections.length > 1) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains more than one active meal plan selection.",
      reason: "active-selection-count-mismatch",
    });
  }

  if (
    bodyWeightEntryDateKeys.some(
      (dateKey, index) => bodyWeightEntryDateKeys.indexOf(dateKey) !== index
    )
  ) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate body weight dates.",
      reason: "duplicate-body-weight-date",
    });
  }

  if (foodIds.some((foodId, index) => foodIds.indexOf(foodId) !== index)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate food ids.",
      reason: "duplicate-food-id",
    });
  }

  if (planIds.some((planId, index) => planIds.indexOf(planId) !== index)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate plan ids.",
      reason: "duplicate-plan-id",
    });
  }

  if (
    planNames.some((planName, index) => planNames.indexOf(planName) !== index)
  ) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate plan names.",
      reason: "duplicate-plan-name",
    });
  }

  if (
    mealEntryIds.some(
      (mealEntryId, index) => mealEntryIds.indexOf(mealEntryId) !== index
    )
  ) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate meal entry ids.",
      reason: "duplicate-meal-entry-id",
    });
  }

  if (mealIds.some((mealId, index) => mealIds.indexOf(mealId) !== index)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate meal ids.",
      reason: "duplicate-meal-id",
    });
  }

  const planWithDuplicateMealName = plans.find((plan) =>
    plan.meals.some(
      (meal, index) =>
        plan.meals.findIndex((candidate) => candidate.name === meal.name) !==
        index
    )
  );

  if (planWithDuplicateMealName !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Plan ${planWithDuplicateMealName.id} contains duplicate meal names.`,
      reason: "duplicate-meal-name",
    });
  }

  const planWithDuplicateMealPosition = plans.find((plan) =>
    plan.meals.some(
      (meal, index) =>
        plan.meals.findIndex(
          (candidate) => candidate.position === meal.position
        ) !== index
    )
  );

  if (planWithDuplicateMealPosition !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Plan ${planWithDuplicateMealPosition.id} contains duplicate meal positions.`,
      reason: "duplicate-meal-position",
    });
  }

  const dailyLogWithMissingPlan = dailyLogs.find(
    (dailyLog) => !planIds.includes(dailyLog.planId)
  );

  if (dailyLogWithMissingPlan !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Daily log ${dailyLogWithMissingPlan.dateKey} references a missing plan.`,
      reason: "daily-log-plan-missing",
    });
  }

  const activeSelectionWithMissingPlan = activeMealPlanSelections.find(
    (selection) => !planIds.includes(selection.planId)
  );

  if (activeSelectionWithMissingPlan !== undefined) {
    return yield* new BackupIntegrityError({
      detail: "The active meal plan selection references a missing plan.",
      reason: "active-selection-plan-missing",
    });
  }

  const mealEntryWithMissingFood = mealEntries.find(
    (mealEntry) => !foodIds.includes(mealEntry.foodId)
  );

  if (mealEntryWithMissingFood !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Meal entry ${mealEntryWithMissingFood.id} references a missing food.`,
      reason: "meal-entry-food-missing",
    });
  }

  const mealEntryWithMissingMeal = mealEntries.find(
    (mealEntry) => !mealIds.includes(mealEntry.mealId)
  );

  if (mealEntryWithMissingMeal !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Meal entry ${mealEntryWithMissingMeal.id} references a missing meal.`,
      reason: "meal-entry-meal-missing",
    });
  }

  return yield* Effect.void;
});

export class Backups extends Context.Service<Backups>()("Backups", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;

    return {
      exportToJson: Effect.fn("Backups.exportToJson")(function* () {
        const stores = new MaiBackupStores(yield* store.readStores);
        const encodedStores =
          yield* Schema.encodeEffect(MaiBackupStores)(stores);
        const rawBackup = {
          format: "mai.backup",
          formatVersion: 1,
          integrity: {
            counts: {
              activeMealPlanSelections:
                encodedStores.activeMealPlanSelections.length,
              bodyWeightEntries: encodedStores.bodyWeightEntries.length,
              dailyLogs: encodedStores.dailyLogs.length,
              foods: encodedStores.foods.length,
              mealEntries: encodedStores.mealEntries.length,
              plans: encodedStores.plans.length,
            },
          },
          source: {
            databaseName: DatabaseName,
            databaseVersion: CurrentDatabaseVersion,
            exportedAt: DateTime.toEpochMillis(yield* DateTime.now),
          },
          stores: encodedStores,
        } satisfies MaiBackupEncoded;
        const backup = yield* Schema.decodeEffect(MaiBackupV1)(rawBackup);

        yield* validateBackup({ backup });

        const json = yield* Schema.encodeEffect(MaiBackupJson)(backup);

        return new ExportedBackup({
          backup,
          json,
        });
      }),

      importFromJson: Effect.fn("Backups.importFromJson")(function* ({
        input,
      }: {
        readonly input: ImportBackupJsonInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          ImportBackupJsonInputSchema
        )(input);
        const rawBackup = yield* Schema.decodeEffect(MaiBackupUnknownJson)(
          decodedInput.json
        );
        const versionProbe = yield* Schema.decodeUnknownEffect(
          MaiBackupImportVersionProbe
        )(rawBackup);
        const importBackup =
          versionProbe.source.databaseVersion === 1
            ? yield* Schema.decodeUnknownEffect(
                LegacyMaiBackupV1DatabaseVersion1
              )(rawBackup)
            : versionProbe.source.databaseVersion === 2
              ? yield* Schema.decodeUnknownEffect(
                  LegacyMaiBackupV1DatabaseVersion2
                )(rawBackup)
              : versionProbe.source.databaseVersion === 3
                ? yield* Schema.decodeUnknownEffect(
                    LegacyMaiBackupV1DatabaseVersion3
                  )(rawBackup)
                : versionProbe.source.databaseVersion === 4
                  ? yield* Schema.decodeUnknownEffect(
                      LegacyMaiBackupV1DatabaseVersion4
                    )(rawBackup)
                  : yield* Schema.decodeUnknownEffect(CurrentMaiBackupImportV1)(
                      rawBackup
                    );
        const backup = yield* migrateBackupToCurrent({ backup: importBackup });

        yield* validateBackup({ backup });
        yield* store.replaceStores(backup.stores);

        return new ImportedBackup({
          backup,
        });
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}
