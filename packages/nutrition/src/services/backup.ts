import * as EventDomain from "@mai/event-tracking/domain";
import {
  Context,
  Data,
  DateTime,
  Effect,
  HashSet,
  Layer,
  Match,
  Schema,
} from "effect";

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
  QuantityGrams,
} from "../domain.ts";
import { DefaultFoods } from "../default-foods.ts";
import { CurrentDatabaseVersion, DatabaseName } from "../metadata.ts";
import * as CustomPlanMealsMigration from "../migrations/version-004-custom-plan-meals.ts";
import * as FoodPricesMigration from "../migrations/version-007-food-prices.ts";
import { AppDataStore } from "./app-data-store.ts";

export const MaiBackupFormat = Schema.Literal("mai.backup");

export const MaiBackupFormatVersion = Schema.Literal(1);

export const BackupCount = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("BackupCount"));

export type BackupCount = typeof BackupCount.Type;

export const BackupDatabaseVersion = Schema.Literal(CurrentDatabaseVersion);

export type BackupDatabaseVersion = typeof BackupDatabaseVersion.Type;

export const BackupStoreName = Schema.Literals([
  "activeMealPlanSelections",
  "bodyWeightEntries",
  "dailyLogs",
  "foods",
  "mealEntries",
  "plans",
  "recordableEvents",
  "recordedEvents",
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

class BackupLegacyMealEntry extends Schema.Class<BackupLegacyMealEntry>(
  "BackupLegacyMealEntry"
)({
  id: MealEntry.fields.id,
  dateKey: MealEntry.fields.dateKey,
  mealId: MealEntry.fields.mealId,
  foodId: MealEntry.fields.foodId,
  quantityGrams: QuantityGrams,
  createdAt: MealEntry.fields.createdAt,
  updatedAt: MealEntry.fields.updatedAt,
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

class LegacyMaiBackupCounts extends Schema.Class<LegacyMaiBackupCounts>(
  "LegacyMaiBackupCounts"
)({
  activeMealPlanSelections: BackupCount,
  bodyWeightEntries: Schema.optional(BackupCount),
  dailyLogs: BackupCount,
  foods: BackupCount,
  mealEntries: BackupCount,
  plans: BackupCount,
}) {}

class LegacyMaiBackupIntegrity extends Schema.Class<LegacyMaiBackupIntegrity>(
  "LegacyMaiBackupIntegrity"
)({
  counts: LegacyMaiBackupCounts,
}) {}

export class MaiBackupCounts extends Schema.Class<MaiBackupCounts>(
  "MaiBackupCounts"
)({
  activeMealPlanSelections: BackupCount,
  bodyWeightEntries: BackupCount,
  dailyLogs: BackupCount,
  foods: BackupCount,
  mealEntries: BackupCount,
  plans: BackupCount,
  recordableEvents: BackupCount,
  recordedEvents: BackupCount,
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
  recordableEvents: Schema.Array(EventDomain.RecordableEvent),
  recordedEvents: Schema.Array(EventDomain.RecordedEvent),
}) {}

class MaiBackupImportStoresV7 extends Schema.Class<MaiBackupImportStoresV7>(
  "MaiBackupImportStoresV7"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  bodyWeightEntries: Schema.Array(BodyWeightEntry),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(Food),
  mealEntries: Schema.Array(MealEntry),
  plans: Schema.Array(BackupImportPlan),
}) {}

class LegacyMaiBackupStoresBeforePrices extends Schema.Class<LegacyMaiBackupStoresBeforePrices>(
  "LegacyMaiBackupStoresBeforePrices"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  bodyWeightEntries: Schema.Array(BodyWeightEntry),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(FoodPricesMigration.FoodBeforePrices),
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

class LegacyMaiBackupSourceV5 extends Schema.Class<LegacyMaiBackupSourceV5>(
  "LegacyMaiBackupSourceV5"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(5),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class LegacyMaiBackupSourceV6 extends Schema.Class<LegacyMaiBackupSourceV6>(
  "LegacyMaiBackupSourceV6"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(6),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

class MaiBackupSourceV7 extends Schema.Class<MaiBackupSourceV7>(
  "MaiBackupSourceV7"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(7),
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
  mealEntries: Schema.Array(BackupLegacyMealEntry),
  plans: Schema.Array(BackupImportPlan),
}) {}

class LegacyMaiBackupStoresBeforeMeasurements extends Schema.Class<LegacyMaiBackupStoresBeforeMeasurements>(
  "LegacyMaiBackupStoresBeforeMeasurements"
)({
  activeMealPlanSelections: Schema.Array(ActiveMealPlanSelection),
  bodyWeightEntries: Schema.Array(BodyWeightEntry),
  dailyLogs: Schema.Array(DailyLog),
  foods: Schema.Array(BackupLegacyFood),
  mealEntries: Schema.Array(BackupLegacyMealEntry),
  plans: Schema.Array(BackupImportPlan),
}) {}

class LegacyMaiBackupV1DatabaseVersion1 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion1>(
  "LegacyMaiBackupV1DatabaseVersion1"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV1,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion2 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion2>(
  "LegacyMaiBackupV1DatabaseVersion2"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV2,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion3 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion3>(
  "LegacyMaiBackupV1DatabaseVersion3"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV3,
  stores: LegacyMaiBackupStores,
}) {}

class LegacyMaiBackupV1DatabaseVersion4 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion4>(
  "LegacyMaiBackupV1DatabaseVersion4"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV4,
  stores: LegacyMaiBackupStoresBeforeBodyWeight,
}) {}

class LegacyMaiBackupV1DatabaseVersion5 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion5>(
  "LegacyMaiBackupV1DatabaseVersion5"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV5,
  stores: LegacyMaiBackupStoresBeforeMeasurements,
}) {}

class LegacyMaiBackupV1DatabaseVersion6 extends Schema.Class<LegacyMaiBackupV1DatabaseVersion6>(
  "LegacyMaiBackupV1DatabaseVersion6"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: LegacyMaiBackupSourceV6,
  stores: LegacyMaiBackupStoresBeforePrices,
}) {}

export class MaiBackupV1 extends Schema.Class<MaiBackupV1>("MaiBackupV1")({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: MaiBackupIntegrity,
  source: MaiBackupSource,
  stores: MaiBackupStores,
}) {}

class MaiBackupV1DatabaseVersion7 extends Schema.Class<MaiBackupV1DatabaseVersion7>(
  "MaiBackupV1DatabaseVersion7"
)({
  format: MaiBackupFormat,
  formatVersion: MaiBackupFormatVersion,
  integrity: LegacyMaiBackupIntegrity,
  source: MaiBackupSourceV7,
  stores: MaiBackupImportStoresV7,
}) {}

export type MaiBackup = typeof MaiBackupV1.Type;

export type MaiBackupEncoded = typeof MaiBackupV1.Encoded;

export const MaiBackupJson = Schema.fromJsonString(MaiBackupV1);

export const MaiBackupImportV1 = Schema.Union([
  LegacyMaiBackupV1DatabaseVersion1,
  LegacyMaiBackupV1DatabaseVersion2,
  LegacyMaiBackupV1DatabaseVersion3,
  LegacyMaiBackupV1DatabaseVersion4,
  LegacyMaiBackupV1DatabaseVersion5,
  LegacyMaiBackupV1DatabaseVersion6,
  MaiBackupV1DatabaseVersion7,
  MaiBackupV1,
]);

export type MaiBackupImport = typeof MaiBackupImportV1.Type;

export const MaiBackupImportJson = Schema.fromJsonString(MaiBackupImportV1);

const MaiBackupUnknownJson = Schema.fromJsonString(Schema.Unknown);

const MaiBackupImportVersionProbe = Schema.Struct({
  source: Schema.Struct({
    databaseVersion: Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8]),
  }),
});

const isMaiBackupImportV7 = Schema.is(MaiBackupV1DatabaseVersion7);
const isMaiBackupImportV8 = Schema.is(MaiBackupV1);

const isLegacyMaiBackupImportV1 = Schema.is(LegacyMaiBackupV1DatabaseVersion1);
const isLegacyMaiBackupImportV2 = Schema.is(LegacyMaiBackupV1DatabaseVersion2);
const isLegacyMaiBackupImportV3 = Schema.is(LegacyMaiBackupV1DatabaseVersion3);
const isLegacyMaiBackupImportV4 = Schema.is(LegacyMaiBackupV1DatabaseVersion4);
const isLegacyMaiBackupImportV5 = Schema.is(LegacyMaiBackupV1DatabaseVersion5);
const isLegacyMaiBackupImportV6 = Schema.is(LegacyMaiBackupV1DatabaseVersion6);

const ImportBackupJsonInputSchema = Schema.Struct({
  json: Schema.String,
});

export type ImportBackupJsonInput = typeof ImportBackupJsonInputSchema.Encoded;

export const BackupIntegrityErrorReason = Schema.Literals([
  "active-selection-plan-missing",
  "active-selection-count-mismatch",
  "count-mismatch",
  "duplicate-body-weight-date",
  "duplicate-daily-log-date",
  "daily-log-plan-missing",
  "duplicate-food-id",
  "duplicate-food-portion-id",
  "duplicate-food-price-id",
  "duplicate-meal-id",
  "duplicate-meal-entry-id",
  "duplicate-meal-name",
  "duplicate-meal-position",
  "duplicate-plan-id",
  "duplicate-plan-name",
  "duplicate-recordable-event-id",
  "duplicate-recordable-event-name",
  "duplicate-recorded-event-id",
  "meal-entry-food-missing",
  "meal-entry-meal-missing",
  "recorded-event-recordable-event-missing",
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

const _backupCounts = (
  stores: MaiBackupEncoded["stores"]
): MaiBackupEncoded["integrity"]["counts"] => ({
  activeMealPlanSelections: stores.activeMealPlanSelections.length,
  bodyWeightEntries: stores.bodyWeightEntries.length,
  dailyLogs: stores.dailyLogs.length,
  foods: stores.foods.length,
  mealEntries: stores.mealEntries.length,
  plans: stores.plans.length,
  recordableEvents: stores.recordableEvents.length,
  recordedEvents: stores.recordedEvents.length,
});

const _hasDuplicates = <Value>(values: readonly Value[]): boolean =>
  HashSet.size(HashSet.fromIterable(values)) !== values.length;

export const validateBackupImportCounts = Effect.fn(
  "validateBackupImportCounts"
)(function* ({ backup }: { readonly backup: MaiBackupImport }) {
  const { counts } = backup.integrity;
  const { stores } = backup;
  const bodyWeightEntryCount = Match.value(backup).pipe(
    Match.when(isLegacyMaiBackupImportV1, () => 0),
    Match.when(isLegacyMaiBackupImportV2, () => 0),
    Match.when(isLegacyMaiBackupImportV3, () => 0),
    Match.when(isLegacyMaiBackupImportV4, () => 0),
    Match.orElse(({ stores }) => stores.bodyWeightEntries.length)
  );
  const eventCounts = isMaiBackupImportV8(backup)
    ? {
        actualRecordableEvents: backup.stores.recordableEvents.length,
        actualRecordedEvents: backup.stores.recordedEvents.length,
        declaredRecordableEvents: backup.integrity.counts.recordableEvents,
        declaredRecordedEvents: backup.integrity.counts.recordedEvents,
      }
    : {
        actualRecordableEvents: 0,
        actualRecordedEvents: 0,
        declaredRecordableEvents: 0,
        declaredRecordedEvents: 0,
      };
  const countComparisons = [
    {
      actual: stores.activeMealPlanSelections.length,
      declared: counts.activeMealPlanSelections,
      storeName: "activeMealPlanSelections",
    },
    {
      actual: bodyWeightEntryCount,
      declared: counts.bodyWeightEntries ?? 0,
      storeName: "bodyWeightEntries",
    },
    {
      actual: stores.dailyLogs.length,
      declared: counts.dailyLogs,
      storeName: "dailyLogs",
    },
    {
      actual: stores.foods.length,
      declared: counts.foods,
      storeName: "foods",
    },
    {
      actual: stores.mealEntries.length,
      declared: counts.mealEntries,
      storeName: "mealEntries",
    },
    {
      actual: stores.plans.length,
      declared: counts.plans,
      storeName: "plans",
    },
    {
      actual: eventCounts.actualRecordableEvents,
      declared: eventCounts.declaredRecordableEvents,
      storeName: "recordableEvents",
    },
    {
      actual: eventCounts.actualRecordedEvents,
      declared: eventCounts.declaredRecordedEvents,
      storeName: "recordedEvents",
    },
  ] as const;
  const mismatch = countComparisons.find(
    ({ actual, declared }) => actual !== declared
  );

  if (mismatch !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `The ${mismatch.storeName} count does not match the stores.`,
      reason: "count-mismatch",
    });
  }
});

export const migrateBackupToCurrent = Effect.fn("migrateBackupToCurrent")(
  function* ({ backup }: { readonly backup: MaiBackupImport }) {
    yield* validateBackupImportCounts({ backup });

    return yield* Match.value(backup).pipe(
      Match.when(isLegacyMaiBackupImportV1, (backup) =>
        _migrateLegacyBackupV1ToV3({ backup, normalizePlanNames: true })
      ),
      Match.when(isLegacyMaiBackupImportV2, (backup) =>
        _migrateLegacyBackupV1ToV3({ backup, normalizePlanNames: false })
      ),
      Match.when(isLegacyMaiBackupImportV3, (backup) =>
        _migrateLegacyBackupV1ToV3({ backup, normalizePlanNames: false })
      ),
      Match.when(isLegacyMaiBackupImportV4, _migrateLegacyBackupV4OrV5),
      Match.when(isLegacyMaiBackupImportV5, _migrateLegacyBackupV4OrV5),
      Match.when(isLegacyMaiBackupImportV6, (backup) =>
        FoodPricesMigration.migrateFoodsToPrices({
          foods: backup.stores.foods,
        }).pipe(
          Effect.flatMap((foods) => _migrateModernBackup({ backup, foods }))
        )
      ),
      Match.when(isMaiBackupImportV7, (backup) =>
        _migrateModernBackup({ backup, foods: backup.stores.foods })
      ),
      Match.when(isMaiBackupImportV8, (backup) => Effect.succeed(backup)),
      Match.exhaustive
    );
  }
);

const _migrateModernBackup = Effect.fn("migrateModernBackup")(function* ({
  backup,
  foods,
}: {
  readonly backup:
    | LegacyMaiBackupV1DatabaseVersion6
    | MaiBackupV1DatabaseVersion7;
  readonly foods: readonly Food[];
}) {
  const plans = yield* Effect.forEach(
    backup.stores.plans,
    _planFromBackupImport
  );
  const activeMealPlanSelections = yield* Schema.encodeEffect(
    Schema.Array(ActiveMealPlanSelection)
  )(backup.stores.activeMealPlanSelections);
  const bodyWeightEntries = yield* Schema.encodeEffect(
    Schema.Array(BodyWeightEntry)
  )(backup.stores.bodyWeightEntries);
  const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
    backup.stores.dailyLogs
  );
  const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(foods);
  const mealEntries = yield* Schema.encodeEffect(Schema.Array(MealEntry))(
    backup.stores.mealEntries
  );
  const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(plans);
  const stores = {
    activeMealPlanSelections,
    bodyWeightEntries,
    dailyLogs,
    foods: encodedFoods,
    mealEntries,
    plans: encodedPlans,
    recordableEvents: [],
    recordedEvents: [],
  } satisfies MaiBackupEncoded["stores"];

  return yield* Schema.decodeEffect(MaiBackupV1)({
    format: backup.format,
    formatVersion: backup.formatVersion,
    integrity: { counts: _backupCounts(stores) },
    source: {
      databaseName: backup.source.databaseName,
      databaseVersion: CurrentDatabaseVersion,
      exportedAt: DateTime.toEpochMillis(backup.source.exportedAt),
    },
    stores,
  });
});

const _migrateLegacyBackupV4OrV5 = Effect.fn("migrateLegacyBackupV4OrV5")(
  function* (
    legacyBackup:
      | LegacyMaiBackupV1DatabaseVersion4
      | LegacyMaiBackupV1DatabaseVersion5
  ) {
    const isVersion5 = isLegacyMaiBackupImportV5(legacyBackup);
    const userFoods = yield* Effect.forEach(legacyBackup.stores.foods, (food) =>
      _foodFromBackupImport({ food, originFallback: "user" })
    );
    const foods = isVersion5
      ? userFoods
      : [
          ...userFoods,
          ...(yield* Schema.decodeEffect(Schema.Array(Food))(
            DefaultFoods
          )).filter(
            (food) => !userFoods.some((userFood) => userFood.id === food.id)
          ),
        ];
    const mealEntries = yield* Effect.forEach(
      legacyBackup.stores.mealEntries,
      Effect.fn("mealEntryFromBackupImport")(function* (mealEntry) {
        const encodedMealEntry = yield* Schema.encodeEffect(
          BackupLegacyMealEntry
        )(mealEntry);

        return yield* Schema.decodeEffect(MealEntry)({
          id: encodedMealEntry.id,
          dateKey: encodedMealEntry.dateKey,
          mealId: encodedMealEntry.mealId,
          foodId: encodedMealEntry.foodId,
          quantity: {
            _tag: "MeasuredFoodQuantity",
            amount: encodedMealEntry.quantityGrams,
            unit: "g",
          },
          nutritionMultiplier: encodedMealEntry.quantityGrams / 100,
          createdAt: encodedMealEntry.createdAt,
          updatedAt: encodedMealEntry.updatedAt,
        });
      })
    );
    const plans = yield* Effect.forEach(
      legacyBackup.stores.plans,
      _planFromBackupImport
    );
    const activeMealPlanSelections = yield* Schema.encodeEffect(
      Schema.Array(ActiveMealPlanSelection)
    )(legacyBackup.stores.activeMealPlanSelections);
    const bodyWeightEntries = yield* Schema.encodeEffect(
      Schema.Array(BodyWeightEntry)
    )(isVersion5 ? legacyBackup.stores.bodyWeightEntries : []);
    const dailyLogs = yield* Schema.encodeEffect(Schema.Array(DailyLog))(
      legacyBackup.stores.dailyLogs
    );
    const encodedFoods = yield* Schema.encodeEffect(Schema.Array(Food))(foods);
    const encodedMealEntries = yield* Schema.encodeEffect(
      Schema.Array(MealEntry)
    )(mealEntries);
    const encodedPlans = yield* Schema.encodeEffect(Schema.Array(Plan))(plans);
    const stores = {
      activeMealPlanSelections,
      bodyWeightEntries,
      dailyLogs,
      foods: encodedFoods,
      mealEntries: encodedMealEntries,
      plans: encodedPlans,
      recordableEvents: [],
      recordedEvents: [],
    } satisfies MaiBackupEncoded["stores"];

    return yield* Schema.decodeEffect(MaiBackupV1)({
      format: legacyBackup.format,
      formatVersion: legacyBackup.formatVersion,
      integrity: { counts: _backupCounts(stores) },
      source: {
        databaseName: legacyBackup.source.databaseName,
        databaseVersion: CurrentDatabaseVersion,
        exportedAt: DateTime.toEpochMillis(legacyBackup.source.exportedAt),
      },
      stores,
    });
  }
);

const _migrateLegacyBackupV1ToV3 = Effect.fn("migrateLegacyBackupV1ToV3")(
  function* ({
    backup: legacyBackup,
    normalizePlanNames,
  }: {
    readonly backup:
      | LegacyMaiBackupV1DatabaseVersion1
      | LegacyMaiBackupV1DatabaseVersion2
      | LegacyMaiBackupV1DatabaseVersion3;
    readonly normalizePlanNames: boolean;
  }) {
    const usedPlanNames: string[] = [];
    const plans = normalizePlanNames
      ? yield* Effect.forEach(legacyBackup.stores.plans, (plan) =>
          Effect.gen(function* () {
            const encodedPlan = yield* Schema.encodeEffect(
              CustomPlanMealsMigration.PlanBeforeCustomPlanMeals
            )(plan);
            const baseName =
              encodedPlan.name.trim() === "" ? "Plan" : encodedPlan.name.trim();
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
    const stores = {
      activeMealPlanSelections,
      bodyWeightEntries: [],
      dailyLogs,
      foods: encodedFoods,
      mealEntries,
      plans: encodedPlans,
      recordableEvents: [],
      recordedEvents: [],
    } satisfies MaiBackupEncoded["stores"];

    return yield* Schema.decodeEffect(MaiBackupV1)({
      format: legacyBackup.format,
      formatVersion: legacyBackup.formatVersion,
      integrity: { counts: _backupCounts(stores) },
      source: {
        databaseName: legacyBackup.source.databaseName,
        databaseVersion: CurrentDatabaseVersion,
        exportedAt: DateTime.toEpochMillis(legacyBackup.source.exportedAt),
      },
      stores,
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
    id: foodWithoutLineage.id,
    name: foodWithoutLineage.name,
    ...(foodWithoutLineage.brand === undefined
      ? {}
      : { brand: foodWithoutLineage.brand }),
    ...(foodWithoutLineage.category === undefined
      ? {}
      : { category: foodWithoutLineage.category }),
    origin: foodWithoutLineage.origin ?? originFallback,
    nutritionReference: { amount: 100, unit: "g" },
    energyKcal: foodWithoutLineage.energyKcalPer100g,
    proteinGrams: foodWithoutLineage.proteinGramsPer100g,
    carbsGrams: foodWithoutLineage.carbsGramsPer100g,
    fatGrams: foodWithoutLineage.fatGramsPer100g,
    ...(foodWithoutLineage.fiberGramsPer100g === undefined
      ? {}
      : { fiberGrams: foodWithoutLineage.fiberGramsPer100g }),
    ...(foodWithoutLineage.sugarGramsPer100g === undefined
      ? {}
      : { sugarGrams: foodWithoutLineage.sugarGramsPer100g }),
    ...(foodWithoutLineage.saturatedFatGramsPer100g === undefined
      ? {}
      : {
          saturatedFatGrams: foodWithoutLineage.saturatedFatGramsPer100g,
        }),
    ...(foodWithoutLineage.saltGramsPer100g === undefined
      ? {}
      : { saltGrams: foodWithoutLineage.saltGramsPer100g }),
    portions: [],
    createdAt: foodWithoutLineage.createdAt,
    updatedAt: foodWithoutLineage.updatedAt,
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
    recordableEvents,
    recordedEvents,
  } = backup.stores;
  const bodyWeightEntryDateKeys = bodyWeightEntries.map(
    (bodyWeightEntry) => bodyWeightEntry.dateKey
  );
  const dailyLogDateKeys = dailyLogs.map((dailyLog) => dailyLog.dateKey);
  const foodIds = foods.map((food) => food.id);
  const foodPortionIds = foods.flatMap((food) =>
    food.portions.map((portion) => portion.id)
  );
  const foodPriceIds = foods.flatMap((food) =>
    food.prices.map((price) => price.id)
  );
  const planIds = plans.map((plan) => plan.id);
  const planNames = plans.map((plan) => plan.name);
  const mealIds = plans.flatMap((plan) => plan.meals.map((meal) => meal.id));
  const mealEntryIds = mealEntries.map((mealEntry) => mealEntry.id);
  const recordableEventIds = recordableEvents.map(
    (recordableEvent) => recordableEvent.id
  );
  const normalizedRecordableEventNames = recordableEvents.map(
    (recordableEvent) =>
      EventDomain.recordableEventNameKey({ name: recordableEvent.name })
  );
  const recordedEventIds = recordedEvents.map(
    (recordedEvent) => recordedEvent.id
  );

  if (counts.activeMealPlanSelections !== activeMealPlanSelections.length) {
    return yield* new BackupIntegrityError({
      detail: "The active meal plan selection count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.bodyWeightEntries !== bodyWeightEntries.length) {
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

  if (counts.recordableEvents !== recordableEvents.length) {
    return yield* new BackupIntegrityError({
      detail: "The recordable event count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (counts.recordedEvents !== recordedEvents.length) {
    return yield* new BackupIntegrityError({
      detail: "The recorded event count does not match the stores.",
      reason: "count-mismatch",
    });
  }

  if (activeMealPlanSelections.length > 1) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains more than one active meal plan selection.",
      reason: "active-selection-count-mismatch",
    });
  }

  if (_hasDuplicates(bodyWeightEntryDateKeys)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate body weight dates.",
      reason: "duplicate-body-weight-date",
    });
  }

  if (_hasDuplicates(dailyLogDateKeys)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate daily log dates.",
      reason: "duplicate-daily-log-date",
    });
  }

  if (_hasDuplicates(foodIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate food ids.",
      reason: "duplicate-food-id",
    });
  }

  if (_hasDuplicates(foodPortionIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate food portion ids.",
      reason: "duplicate-food-portion-id",
    });
  }

  if (_hasDuplicates(foodPriceIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate food price ids.",
      reason: "duplicate-food-price-id",
    });
  }

  if (_hasDuplicates(planIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate plan ids.",
      reason: "duplicate-plan-id",
    });
  }

  if (_hasDuplicates(planNames)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate plan names.",
      reason: "duplicate-plan-name",
    });
  }

  if (_hasDuplicates(mealEntryIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate meal entry ids.",
      reason: "duplicate-meal-entry-id",
    });
  }

  if (_hasDuplicates(mealIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate meal ids.",
      reason: "duplicate-meal-id",
    });
  }

  if (_hasDuplicates(recordableEventIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate recordable event ids.",
      reason: "duplicate-recordable-event-id",
    });
  }

  if (_hasDuplicates(normalizedRecordableEventNames)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate recordable event names.",
      reason: "duplicate-recordable-event-name",
    });
  }

  if (_hasDuplicates(recordedEventIds)) {
    return yield* new BackupIntegrityError({
      detail: "The backup contains duplicate recorded event ids.",
      reason: "duplicate-recorded-event-id",
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

  const recordedEventWithMissingRecordableEvent = recordedEvents.find(
    (recordedEvent) =>
      !recordableEventIds.includes(recordedEvent.recordableEventId)
  );

  if (recordedEventWithMissingRecordableEvent !== undefined) {
    return yield* new BackupIntegrityError({
      detail: `Recorded event ${recordedEventWithMissingRecordableEvent.id} references a missing recordable event.`,
      reason: "recorded-event-recordable-event-missing",
    });
  }

  return yield* Effect.void;
});

export class Backups extends Context.Service<Backups>()("Backups", {
  make: Effect.gen(function* () {
    const store = yield* AppDataStore;

    return {
      exportToJson: Effect.fn("Backups.exportToJson")(function* () {
        const stores = new MaiBackupStores(yield* store.readStores);
        const encodedStores =
          yield* Schema.encodeEffect(MaiBackupStores)(stores);
        const rawBackup = {
          format: "mai.backup",
          formatVersion: 1,
          integrity: {
            counts: _backupCounts(encodedStores),
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
        const importBackup = yield* Match.value(
          versionProbe.source.databaseVersion
        ).pipe(
          Match.when(1, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion1)(
              rawBackup
            )
          ),
          Match.when(2, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion2)(
              rawBackup
            )
          ),
          Match.when(3, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion3)(
              rawBackup
            )
          ),
          Match.when(4, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion4)(
              rawBackup
            )
          ),
          Match.when(5, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion5)(
              rawBackup
            )
          ),
          Match.when(6, () =>
            Schema.decodeUnknownEffect(LegacyMaiBackupV1DatabaseVersion6)(
              rawBackup
            )
          ),
          Match.when(7, () =>
            Schema.decodeUnknownEffect(MaiBackupV1DatabaseVersion7)(rawBackup)
          ),
          Match.when(8, () =>
            Schema.decodeUnknownEffect(MaiBackupV1)(rawBackup)
          ),
          Match.exhaustive
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
