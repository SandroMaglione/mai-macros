import { Array, Data, DateTime, Effect, Option, Schema } from "effect";

import type { LegacyMeal as MealBeforeCustomPlanMeals } from "../domain.ts";
import {
  ActiveMealPlanSelection,
  DailyLog,
  DateKey,
  FoodId,
  LegacyMeal as MealBeforeCustomPlanMealsSchema,
  MealEntry,
  MealEntryId,
  MealId,
  MealPosition,
  NonEmptyString,
  NonNegativeNumber,
  Plan,
  PlanId,
  PlanMeal,
  QuantityGrams,
} from "../domain.ts";

export type { MealBeforeCustomPlanMeals };

export class PlanBeforeCustomPlanMeals extends Schema.Class<PlanBeforeCustomPlanMeals>(
  "PlanBeforeCustomPlanMeals"
)({
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

export class MealEntryBeforeCustomPlanMeals extends Schema.Class<MealEntryBeforeCustomPlanMeals>(
  "MealEntryBeforeCustomPlanMeals"
)({
  id: MealEntryId,
  dateKey: DateKey,
  meal: MealBeforeCustomPlanMealsSchema,
  foodId: FoodId,
  quantityGrams: QuantityGrams,
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class CustomPlanMealsMigrationError extends Data.TaggedError(
  "CustomPlanMealsMigrationError"
)<{
  readonly detail: string;
}> {}

export const mealLabelsBeforeCustomPlanMeals = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
} satisfies Record<MealBeforeCustomPlanMeals, string>;

export const mealsBeforeCustomPlanMeals = [
  "breakfast",
  "lunch",
  "dinner",
] as const satisfies readonly MealBeforeCustomPlanMeals[];

export const makeMigratedMealId = ({
  meal,
  planId,
}: {
  readonly meal: MealBeforeCustomPlanMeals;
  readonly planId: PlanId | string;
}) => `${planId}:${meal}`;

export const makeMigratedPlanMeals = Effect.fn("makeMigratedPlanMeals")(
  function* ({ plan }: { readonly plan: PlanBeforeCustomPlanMeals | Plan }) {
    return yield* Effect.forEach(
      mealsBeforeCustomPlanMeals.map((meal, position) => ({ meal, position })),
      ({ meal, position }) =>
        Schema.decodeEffect(PlanMeal)({
          id: makeMigratedMealId({ meal, planId: plan.id }),
          name: mealLabelsBeforeCustomPlanMeals[meal],
          position,
          createdAt: DateTime.toEpochMillis(plan.createdAt),
        })
    );
  }
);

export const migratePlanToCustomPlanMeals = Effect.fn(
  "migratePlanToCustomPlanMeals"
)(function* ({ plan }: { readonly plan: PlanBeforeCustomPlanMeals }) {
  const encodedPlan = yield* Schema.encodeEffect(PlanBeforeCustomPlanMeals)(
    plan
  );
  const { basedOnPlanId, ...planWithoutLineage } = encodedPlan;
  void basedOnPlanId;
  const meals = yield* makeMigratedPlanMeals({ plan });
  const encodedMeals = yield* Schema.encodeEffect(Schema.Array(PlanMeal))(
    meals
  );

  return yield* Schema.decodeEffect(Plan)({
    ...planWithoutLineage,
    meals: encodedMeals,
  });
});

export const migratePlansToCustomPlanMeals = Effect.fn(
  "migratePlansToCustomPlanMeals"
)(function* ({
  plans,
}: {
  readonly plans: readonly PlanBeforeCustomPlanMeals[];
}) {
  return yield* Effect.forEach(plans, (plan) =>
    migratePlanToCustomPlanMeals({ plan })
  );
});

export const migrateMealEntriesToCustomPlanMeals = Effect.fn(
  "migrateMealEntriesToCustomPlanMeals"
)(function* ({
  activeMealPlanSelections,
  dailyLogs,
  mealEntries,
  plans,
}: {
  readonly activeMealPlanSelections: readonly ActiveMealPlanSelection[];
  readonly dailyLogs: readonly DailyLog[];
  readonly mealEntries: readonly MealEntryBeforeCustomPlanMeals[];
  readonly plans: readonly Plan[];
}) {
  const activePlan = Array.head(activeMealPlanSelections).pipe(
    Option.flatMap((selection) =>
      Array.findFirst(plans, (plan) => plan.id === selection.planId)
    ),
    Option.getOrNull
  );
  const fallbackPlan = activePlan ?? Array.last(plans).pipe(Option.getOrNull);

  if (fallbackPlan === null && Array.isReadonlyArrayNonEmpty(mealEntries)) {
    return yield* new CustomPlanMealsMigrationError({
      detail:
        "Meal entries before custom plan meals cannot be migrated without a plan.",
    });
  }

  const migratedDailyLogs = yield* Effect.gen(function* () {
    if (fallbackPlan === null) {
      return dailyLogs;
    }

    const missingDateKeys = Array.dedupe(
      mealEntries
        .filter(
          (mealEntry) =>
            !dailyLogs.some(
              (dailyLog) => dailyLog.dateKey === mealEntry.dateKey
            )
        )
        .map((mealEntry) => mealEntry.dateKey)
    );
    const generatedDailyLogs = yield* Effect.forEach(
      missingDateKeys,
      (dateKey) => {
        const entriesForDate = mealEntries.filter(
          (mealEntry) => mealEntry.dateKey === dateKey
        );
        const firstEntry =
          entriesForDate.reduce<MealEntryBeforeCustomPlanMeals | null>(
            (current, mealEntry) =>
              current === null ||
              mealEntry.createdAt.epochMilliseconds <
                current.createdAt.epochMilliseconds
                ? mealEntry
                : current,
            null
          );
        const createdAt =
          firstEntry === null
            ? DateTime.toEpochMillis(fallbackPlan.createdAt)
            : DateTime.toEpochMillis(firstEntry.createdAt);

        return Schema.decodeEffect(DailyLog)({
          dateKey,
          planId: fallbackPlan.id,
          createdAt,
          updatedAt: createdAt,
        });
      }
    );

    return [...dailyLogs, ...generatedDailyLogs];
  });
  const migratedMealEntries = yield* Effect.forEach(mealEntries, (mealEntry) =>
    Effect.gen(function* () {
      const dailyLog = migratedDailyLogs.find(
        (candidate) => candidate.dateKey === mealEntry.dateKey
      );

      if (dailyLog === undefined) {
        return yield* new CustomPlanMealsMigrationError({
          detail: `Meal entry ${mealEntry.id} before custom plan meals does not have a daily log.`,
        });
      }

      const encodedMealEntry = yield* Schema.encodeEffect(
        MealEntryBeforeCustomPlanMeals
      )(mealEntry);

      return yield* Schema.decodeEffect(MealEntry)({
        id: encodedMealEntry.id,
        dateKey: encodedMealEntry.dateKey,
        mealId: makeMigratedMealId({
          meal: encodedMealEntry.meal,
          planId: dailyLog.planId,
        }),
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

  return {
    dailyLogs: migratedDailyLogs,
    mealEntries: migratedMealEntries,
  };
});

export const decodeMigratedMealId = Effect.fn("decodeMigratedMealId")(
  function* ({
    meal,
    planId,
  }: {
    readonly meal: MealBeforeCustomPlanMeals;
    readonly planId: PlanId;
  }) {
    return yield* Schema.decodeEffect(MealId)(
      makeMigratedMealId({ meal, planId })
    );
  }
);

export const decodeMigratedMealPosition = Effect.fn(
  "decodeMigratedMealPosition"
)(function* ({ meal }: { readonly meal: MealBeforeCustomPlanMeals }) {
  const position = mealsBeforeCustomPlanMeals.indexOf(meal);

  if (position < 0) {
    return yield* new CustomPlanMealsMigrationError({
      detail: `Unknown meal before custom plan meals ${meal}.`,
    });
  }

  return yield* Schema.decodeEffect(MealPosition)(position);
});
