import { Context, Data, DateTime, Effect, Layer, Schema } from "effect";

import {
  ActiveMealPlanSelection,
  DailyLog,
  Food,
  FoodCategory,
  FoodId,
  FoodOrigin,
  MealEntry,
  NonEmptyString,
  NonNegativeNumber,
  Plan,
} from "../domain.ts";
import { DefaultFoods } from "../default-foods.ts";
import { CurrentDatabaseVersion, DatabaseName } from "../metadata.ts";
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
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(Food),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(Plan),
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

class LegacyMaiBackupStores extends Schema.Class<LegacyMaiBackupStores>(
  "LegacyMaiBackupStores"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(BackupLegacyFood),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(Plan),
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

export class MaiBackupV1 extends Schema.Class<MaiBackupV1>("MaiBackupV1")({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: MaiBackupSource,
  stores: MaiBackupStores,
}) {}

export type MaiBackup = typeof MaiBackupV1.Type;

export type MaiBackupEncoded = typeof MaiBackupV1.Encoded;

export const MaiBackupJson = Schema.fromJsonString(MaiBackupV1);

export const MaiBackupImportV1 = Schema.Union([
  LegacyMaiBackupV1DatabaseVersion1,
  LegacyMaiBackupV1DatabaseVersion2,
  MaiBackupV1,
]);

export type MaiBackupImport = typeof MaiBackupImportV1.Type;

export const MaiBackupImportJson = Schema.fromJsonString(MaiBackupImportV1);

const ImportBackupJsonInputSchema = Schema.Struct({
  json: Schema.String,
});

export type ImportBackupJsonInput = typeof ImportBackupJsonInputSchema.Encoded;

export const BackupIntegrityErrorReason = Schema.Literals([
  "active-selection-plan-missing",
  "active-selection-count-mismatch",
  "count-mismatch",
  "daily-log-plan-missing",
  "duplicate-food-id",
  "duplicate-meal-entry-id",
  "duplicate-plan-id",
  "duplicate-plan-name",
  "food-revision-source-missing",
  "meal-entry-food-missing",
  "plan-revision-source-missing",
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
    const isCurrentBackup = (backup: MaiBackupImport): backup is MaiBackup =>
      backup.source.databaseVersion !== 1 &&
      backup.source.databaseVersion !== 2;

    if (isCurrentBackup(backup)) {
      return backup;
    }

    const usedPlanNames: string[] = [];
    const plans =
      backup.source.databaseVersion === 1
        ? yield* Effect.forEach(backup.stores.plans, (plan) =>
            Effect.gen(function* () {
              const encodedPlan = yield* Schema.encodeEffect(Plan)(plan);
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

              return yield* Schema.decodeEffect(Plan)({
                ...encodedPlan,
                name,
              });
            })
          )
        : backup.stores.plans;
    const userFoods = yield* Effect.forEach(backup.stores.foods, (food) =>
      Effect.gen(function* () {
        const encodedFood = yield* Schema.encodeEffect(BackupLegacyFood)(food);

        return yield* Schema.decodeEffect(Food)({
          ...encodedFood,
          origin: encodedFood.origin ?? "user",
        });
      })
    );
    const userFoodIds = userFoods.map((food) => food.id);
    const defaultFoods = yield* Schema.decodeEffect(Schema.Array(Food))(
      DefaultFoods
    );
    const foods = [
      ...userFoods,
      ...defaultFoods.filter((food) => !userFoodIds.includes(food.id)),
    ];
    const activeMealPlanSelections = yield* Schema.encodeEffect(
      Schema.Array(ActiveMealPlanSelection)
    )(backup.stores.activeMealPlanSelections);
    const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
      backup.stores.dailyLogs
    );
    const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(foods);
    const mealEntries = yield* Schema.encodeEffect(Schema.Array(MealEntry))(
      backup.stores.mealEntries
    );
    const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(plans);

    return yield* Schema.decodeEffect(MaiBackupV1)({
      format: backup.format,
      formatVersion: backup.formatVersion,
      integrity: {
        counts: {
          activeMealPlanSelections: activeMealPlanSelections.length,
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
        dailyLogs,
        foods: encodedFoods,
        mealEntries,
        plans: encodedPlans,
      },
    });
  }
);

export const validateBackup = Effect.fn("validateBackup")(function* ({
  backup,
}: {
  readonly backup: MaiBackup;
}) {
  const { counts } = backup.integrity;
  const { activeMealPlanSelections, dailyLogs, foods, mealEntries, plans } =
    backup.stores;
  const foodIds = foods.map((food) => food.id);
  const planIds = plans.map((plan) => plan.id);
  const planNames = plans.map((plan) => plan.name);
  const mealEntryIds = mealEntries.map((mealEntry) => mealEntry.id);

  if (counts.activeMealPlanSelections !== activeMealPlanSelections.length) {
    return yield* new BackupIntegrityError({
      detail: "The active meal plan selection count does not match the stores.",
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

  const foodWithMissingSource = foods.find(
    (food) =>
      food.basedOnFoodId !== undefined && !foodIds.includes(food.basedOnFoodId)
  );

  if (foodWithMissingSource !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Food ${foodWithMissingSource.id} references a missing source food.`,
      reason: "food-revision-source-missing",
    });
  }

  const planWithMissingSource = plans.find(
    (plan) =>
      plan.basedOnPlanId !== undefined && !planIds.includes(plan.basedOnPlanId)
  );

  if (planWithMissingSource !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Plan ${planWithMissingSource.id} references a missing source plan.`,
      reason: "plan-revision-source-missing",
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
        const importBackup = yield* Schema.decodeEffect(MaiBackupImportJson)(
          decodedInput.json
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
