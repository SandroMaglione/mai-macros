import {
  Array,
  Context,
  Data,
  Effect,
  HashMap,
  HashSet,
  Layer,
  Option,
  Schema,
} from "effect";

import {
  type ActiveMealPlanSelectionId,
  DateKey,
  type DailyLog,
  type Food,
  type MealEntry,
  type Plan,
} from "../domain.ts";
import {
  calculateEntriesCostTotals,
  calculateEntriesNutrientTotals,
  calculateEntryCost,
  type EntriesCostTotals,
  type EntryCost,
  type NutrientCoverage,
  type NutrientTargetStatus,
  type NutrientTotals,
  evaluatePlanNutrientTargets,
  isInsideExpectedPlanRange,
} from "../reporting.ts";
import { NutritionStore } from "./store.ts";
import { calculateEntryNutrients, dateKeysInRange } from "../utils.ts";

const _GetNutritionReportRangeInput = Schema.Struct({
  endDateKey: DateKey,
  startDateKey: DateKey,
});

export type GetNutritionReportRangeInput =
  typeof _GetNutritionReportRangeInput.Encoded;

export type NutritionReportEntry = {
  readonly cost: EntryCost | null;
  readonly food: Food;
  readonly mealEntry: MealEntry;
  readonly nutrients: ReturnType<typeof calculateEntryNutrients>;
};

export type NutritionReportDay = {
  readonly costTotals: EntriesCostTotals;
  readonly coverage: NutrientCoverage;
  readonly dailyLog: DailyLog;
  readonly dateKey: DateKey;
  readonly entries: readonly NutritionReportEntry[];
  readonly isInsideExpectedPlanRange: boolean;
  readonly mealEntries: readonly MealEntry[];
  readonly plan: Plan;
  readonly targetStatuses: readonly NutrientTargetStatus[];
  readonly totals: NutrientTotals;
};

export type NutritionReportRange = {
  readonly activePlan: Plan;
  readonly days: readonly NutritionReportDay[];
  readonly endDateKey: DateKey;
  readonly startDateKey: DateKey;
};

export const countedNutritionDays = ({
  report,
}: {
  readonly report: NutritionReportRange;
}): readonly NutritionReportDay[] =>
  report.days.filter((day) => day.dailyLog.mode === "eating");

export class InvalidNutritionReportRange extends Data.TaggedError(
  "InvalidNutritionReportRange"
)<{
  readonly endDateKey: DateKey;
  readonly startDateKey: DateKey;
}> {}

export class NoNutritionReportPlans extends Data.TaggedError(
  "NoNutritionReportPlans"
)<{}> {}

export class NutritionReports extends Context.Service<NutritionReports>()(
  "NutritionReports",
  {
    make: Effect.gen(function* () {
      const store = yield* NutritionStore;

      return {
        getRange: Effect.fn("NutritionReports.getRange")(function* ({
          input,
        }: {
          readonly input: GetNutritionReportRangeInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            _GetNutritionReportRangeInput
          )(input);

          if (decodedInput.startDateKey > decodedInput.endDateKey) {
            return yield* new InvalidNutritionReportRange({
              endDateKey: decodedInput.endDateKey,
              startDateKey: decodedInput.startDateKey,
            });
          }

          const dateKeys = yield* dateKeysInRange({
            endDateKey: decodedInput.endDateKey,
            startDateKey: decodedInput.startDateKey,
          }).pipe(
            Effect.mapError(
              () =>
                new InvalidNutritionReportRange({
                  endDateKey: decodedInput.endDateKey,
                  startDateKey: decodedInput.startDateKey,
                })
            )
          );
          const range = {
            endDateKey: decodedInput.endDateKey,
            startDateKey: decodedInput.startDateKey,
          };
          const dailyLogs = yield* store.findDailyLogsByRange(range);
          const mealEntries = yield* store.findMealEntriesByRange(range);
          const selections = yield* store.findActiveMealPlanSelectionById(
            "active-meal-plan" satisfies ActiveMealPlanSelectionId
          );
          const selectedPlanId = Array.head(selections).pipe(
            Option.map((selection) => selection.planId)
          );
          const planIds = Array.fromIterable(
            HashSet.fromIterable([
              ...dailyLogs.map((dailyLog) => dailyLog.planId),
              ...Option.match(selectedPlanId, {
                onNone: () => [],
                onSome: (planId) => [planId],
              }),
            ])
          );
          const plans = yield* store.findPlansByIds(planIds);
          const referencedPlansById = HashMap.fromIterable(
            plans.map((plan): readonly [Plan["id"], Plan] => [plan.id, plan])
          );
          const selectedPlan = selectedPlanId.pipe(
            Option.flatMap((planId) => HashMap.get(referencedPlansById, planId))
          );
          const activePlan = yield* selectedPlan.pipe(
            Option.match({
              onNone: () =>
                store.findLatestPlan.pipe(
                  Effect.flatMap(
                    Effect.fnUntraced(function* (fallbackPlans) {
                      return yield* Array.head(fallbackPlans).pipe(
                        Option.match({
                          onNone: () => new NoNutritionReportPlans(),
                          onSome: Effect.succeed,
                        })
                      );
                    })
                  )
                ),
              onSome: Effect.succeed,
            })
          );
          const plansById = HashMap.set(
            referencedPlansById,
            activePlan.id,
            activePlan
          );
          const foodIds = Array.fromIterable(
            HashSet.fromIterable(
              mealEntries.map((mealEntry) => mealEntry.foodId)
            )
          );
          const foods = yield* store.findFoodsByIds(foodIds);
          const foodsById = HashMap.fromIterable(
            foods.map((food): readonly [Food["id"], Food] => [food.id, food])
          );
          const dailyLogsByDateKey = HashMap.fromIterable(
            dailyLogs.map((dailyLog): readonly [DateKey, DailyLog] => [
              dailyLog.dateKey,
              dailyLog,
            ])
          );
          const mealEntriesByDateKey = Array.groupBy(
            mealEntries,
            (mealEntry) => mealEntry.dateKey
          );
          const days = dateKeys.flatMap((dateKey) =>
            HashMap.get(dailyLogsByDateKey, dateKey).pipe(
              Option.match({
                onNone: () => [],
                onSome: (dailyLog) => {
                  const plan = HashMap.get(plansById, dailyLog.planId).pipe(
                    Option.match({
                      onNone: () => activePlan,
                      onSome: (plan) => plan,
                    })
                  );
                  const dayMealEntries = mealEntriesByDateKey[dateKey] ?? [];
                  const entries = dayMealEntries.flatMap((mealEntry) => {
                    return HashMap.get(foodsById, mealEntry.foodId).pipe(
                      Option.match({
                        onNone: () => [],
                        onSome: (food) => [
                          {
                            cost: calculateEntryCost({
                              food,
                              quantity: mealEntry.quantity,
                            }),
                            food,
                            mealEntry,
                            nutrients: calculateEntryNutrients({
                              food,
                              nutritionMultiplier:
                                mealEntry.nutritionMultiplier,
                            }),
                          },
                        ],
                      })
                    );
                  });
                  const aggregate = calculateEntriesNutrientTotals({
                    entries: entries.map((entry) => ({
                      food: entry.food,
                      nutritionMultiplier: entry.mealEntry.nutritionMultiplier,
                    })),
                  });
                  const costTotals = calculateEntriesCostTotals({
                    entries: entries.map((entry) => ({
                      food: entry.food,
                      quantity: entry.mealEntry.quantity,
                    })),
                  });
                  const targetStatuses = evaluatePlanNutrientTargets({
                    plan,
                    totals: aggregate.totals,
                  });

                  return [
                    {
                      costTotals,
                      coverage: aggregate.coverage,
                      dailyLog,
                      dateKey,
                      entries,
                      isInsideExpectedPlanRange: isInsideExpectedPlanRange({
                        statuses: targetStatuses,
                      }),
                      mealEntries: dayMealEntries,
                      plan,
                      targetStatuses,
                      totals: aggregate.totals,
                    },
                  ];
                },
              })
            )
          );

          return {
            activePlan,
            days,
            endDateKey: decodedInput.endDateKey,
            startDateKey: decodedInput.startDateKey,
          } satisfies NutritionReportRange;
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}
