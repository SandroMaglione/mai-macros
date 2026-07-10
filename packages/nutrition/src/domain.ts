import { Effect, Schema } from "effect";

export const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export const NonNegativeNumber = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

export const PositiveNumber = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0)
);

export const FoodId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("FoodId")
);

export type FoodId = typeof FoodId.Type;

export const PlanId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("PlanId")
);

export type PlanId = typeof PlanId.Type;

export const MealEntryId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("MealEntryId")
);

export type MealEntryId = typeof MealEntryId.Type;

export const DateKey = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)
).pipe(Schema.brand("DateKey"));

export type DateKey = typeof DateKey.Type;

export const ActiveMealPlanSelectionId = Schema.Literal("active-meal-plan");

export type ActiveMealPlanSelectionId = typeof ActiveMealPlanSelectionId.Type;

export const QuantityGrams = PositiveNumber.pipe(Schema.brand("QuantityGrams"));

export type QuantityGrams = typeof QuantityGrams.Type;

export const MeasurementAmount = PositiveNumber.pipe(
  Schema.brand("MeasurementAmount")
);

export type MeasurementAmount = typeof MeasurementAmount.Type;

export const MassUnit = Schema.Literals(["g", "kg", "oz", "lb"]);

export type MassUnit = typeof MassUnit.Type;

export const VolumeUnit = Schema.Literals(["ml", "l"]);

export type VolumeUnit = typeof VolumeUnit.Type;

export const MeasurementUnit = Schema.Union([MassUnit, VolumeUnit]);

export type MeasurementUnit = typeof MeasurementUnit.Type;

export class MeasuredQuantity extends Schema.Class<MeasuredQuantity>(
  "MeasuredQuantity"
)({
  amount: MeasurementAmount,
  unit: MeasurementUnit,
}) {}

export class MassQuantity extends Schema.Class<MassQuantity>("MassQuantity")({
  amount: MeasurementAmount,
  unit: MassUnit,
}) {}

export class VolumeQuantity extends Schema.Class<VolumeQuantity>(
  "VolumeQuantity"
)({
  amount: MeasurementAmount,
  unit: VolumeUnit,
}) {}

export const FoodPortionId = Schema.String.check(Schema.isUUID(4)).pipe(
  Schema.brand("FoodPortionId")
);

export type FoodPortionId = typeof FoodPortionId.Type;

export const FoodPortionPosition = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("FoodPortionPosition"));

export type FoodPortionPosition = typeof FoodPortionPosition.Type;

export class FoodPortion extends Schema.Class<FoodPortion>("FoodPortion")({
  id: FoodPortionId,
  name: NonEmptyString,
  size: MeasuredQuantity,
  position: FoodPortionPosition,
}) {}

export class FoodMassVolumeConversion extends Schema.Class<FoodMassVolumeConversion>(
  "FoodMassVolumeConversion"
)({
  mass: MassQuantity,
  volume: VolumeQuantity,
}) {}

export class MeasuredFoodQuantity extends Schema.TaggedClass<MeasuredFoodQuantity>()(
  "MeasuredFoodQuantity",
  {
    amount: MeasurementAmount,
    unit: MeasurementUnit,
  }
) {}

export class PortionFoodQuantity extends Schema.TaggedClass<PortionFoodQuantity>()(
  "PortionFoodQuantity",
  {
    count: PositiveNumber,
    portionId: FoodPortionId,
    portionName: NonEmptyString,
    portionSize: MeasuredQuantity,
  }
) {}

export const LoggedFoodQuantity = Schema.Union([
  MeasuredFoodQuantity,
  PortionFoodQuantity,
]);

export type LoggedFoodQuantity = typeof LoggedFoodQuantity.Type;

export const NutritionMultiplier = PositiveNumber.pipe(
  Schema.brand("NutritionMultiplier")
);

export type NutritionMultiplier = typeof NutritionMultiplier.Type;

export const BodyWeightKilograms = PositiveNumber.pipe(
  Schema.brand("BodyWeightKilograms")
);

export type BodyWeightKilograms = typeof BodyWeightKilograms.Type;

export const LegacyMeal = Schema.Literals(["breakfast", "lunch", "dinner"]);

export type LegacyMeal = typeof LegacyMeal.Type;

export const MealId = NonEmptyString.pipe(Schema.brand("MealId"));

export type MealId = typeof MealId.Type;

export const MealPosition = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("MealPosition"));

export type MealPosition = typeof MealPosition.Type;

export const FoodCategory = Schema.Literals([
  "bread-like",
  "dairy-egg",
  "fish-seafood",
  "fruit",
  "grain",
  "legume",
  "meat",
  "nut",
  "oil-fat",
  "plant-protein",
  "seed",
  "sweetener",
  "tuber",
  "vegetable",
]);

export type FoodCategory = typeof FoodCategory.Type;

export const FoodOrigin = Schema.Literals(["import", "app-default", "user"]);

export type FoodOrigin = typeof FoodOrigin.Type;

export class Food extends Schema.Class<Food>("Food")({
  id: FoodId,
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  category: Schema.optional(FoodCategory),
  origin: FoodOrigin,
  nutritionReference: MeasuredQuantity.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ amount: 100, unit: "g" }))
  ),
  energyKcal: NonNegativeNumber,
  proteinGrams: NonNegativeNumber,
  carbsGrams: NonNegativeNumber,
  fatGrams: NonNegativeNumber,
  fiberGrams: Schema.optional(NonNegativeNumber),
  sugarGrams: Schema.optional(NonNegativeNumber),
  saturatedFatGrams: Schema.optional(NonNegativeNumber),
  saltGrams: Schema.optional(NonNegativeNumber),
  portions: Schema.Array(FoodPortion).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
  massVolumeConversion: Schema.optional(FoodMassVolumeConversion),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class PlanMeal extends Schema.Class<PlanMeal>("PlanMeal")({
  id: MealId,
  name: NonEmptyString,
  position: MealPosition,
  createdAt: Schema.DateTimeUtcFromMillis,
}) {}

export class Plan extends Schema.Class<Plan>("Plan")({
  id: PlanId,
  name: NonEmptyString,
  meals: Schema.Array(PlanMeal).check(Schema.isNonEmpty()),
  proteinTargetGrams: NonNegativeNumber,
  carbsTargetGrams: NonNegativeNumber,
  fatTargetGrams: NonNegativeNumber,
  fiberTargetGrams: Schema.optional(NonNegativeNumber),
  sugarTargetGrams: Schema.optional(NonNegativeNumber),
  saltTargetGrams: Schema.optional(NonNegativeNumber),
  saturatedFatTargetGrams: Schema.optional(NonNegativeNumber),
  createdAt: Schema.DateTimeUtcFromMillis,
}) {}

export class DailyLog extends Schema.Class<DailyLog>("DailyLog")({
  dateKey: DateKey,
  planId: PlanId,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class ActiveMealPlanSelection extends Schema.Class<ActiveMealPlanSelection>(
  "ActiveMealPlanSelection"
)({
  id: ActiveMealPlanSelectionId,
  planId: PlanId,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class MealEntry extends Schema.Class<MealEntry>("MealEntry")({
  id: MealEntryId,
  dateKey: DateKey,
  mealId: MealId,
  foodId: FoodId,
  quantity: LoggedFoodQuantity,
  nutritionMultiplier: NutritionMultiplier,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class BodyWeightEntry extends Schema.Class<BodyWeightEntry>(
  "BodyWeightEntry"
)({
  dateKey: DateKey,
  weightKilograms: BodyWeightKilograms,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class EntryNutrients extends Schema.Class<EntryNutrients>(
  "EntryNutrients"
)({
  energyKcal: NonNegativeNumber,
  proteinGrams: NonNegativeNumber,
  carbsGrams: NonNegativeNumber,
  fatGrams: NonNegativeNumber,
  fiberGrams: Schema.optional(NonNegativeNumber),
  sugarGrams: Schema.optional(NonNegativeNumber),
  saturatedFatGrams: Schema.optional(NonNegativeNumber),
  saltGrams: Schema.optional(NonNegativeNumber),
}) {}
