import { Schema } from "effect";

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

export const Meal = Schema.Literals(["breakfast", "lunch", "dinner"]);

export type Meal = typeof Meal.Type;

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

export const FoodOrigin = Schema.Literals(["app-default", "user"]);

export type FoodOrigin = typeof FoodOrigin.Type;

export class Food extends Schema.Class<Food>("Food")({
  id: FoodId,
  basedOnFoodId: Schema.optional(FoodId),
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  category: Schema.optional(FoodCategory),
  origin: FoodOrigin,
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

export class Plan extends Schema.Class<Plan>("Plan")({
  id: PlanId,
  basedOnPlanId: Schema.optional(PlanId),
  name: NonEmptyString,
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
  meal: Meal,
  foodId: FoodId,
  quantityGrams: QuantityGrams,
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
