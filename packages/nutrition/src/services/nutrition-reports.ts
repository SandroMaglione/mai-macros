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
  type CatalogMealEntry,
  type OneOffMealEntry,
  mealEntryFoodIds,
  type Plan,
} from "../domain.ts";
import {
  calculateMealEntriesCostTotals,
  calculateMealEntriesNutrientTotals,
  resolveMealEntryNutrients,
  type MealEntriesNutrientTotals,
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

export type CatalogNutritionReportEntry = {
  readonly cost: EntryCost | null;
  readonly food: Food;
  readonly mealEntry: CatalogMealEntry;
  readonly nutrients: ReturnType<typeof calculateEntryNutrients>;
};

export type OneOffNutritionReportEntry = {
  readonly mealEntry: OneOffMealEntry;
  readonly food: null;
  readonly cost: null;
  readonly nutrients: Partial<ReturnType<typeof calculateEntryNutrients>>;
};
export type NutritionReportEntry =
  | CatalogNutritionReportEntry
  | OneOffNutritionReportEntry;
export const isCatalogReportEntry = (
  entry: NutritionReportEntry
): entry is CatalogNutritionReportEntry => entry.food !== null;

export type NutritionReportDay = {
  readonly costTotals: EntriesCostTotals;
  readonly coverage: NutrientCoverage;
  readonly nutrition: MealEntriesNutrientTotals;
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
            HashSet.fromIterable(mealEntryFoodIds(mealEntries))
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
                  const entries = dayMealEntries.flatMap<NutritionReportEntry>(
                    (mealEntry) => {
                      if (mealEntry.kind === "one-off") {
                        const quality = resolveMealEntryNutrients({
                          mealEntry,
                          food: undefined,
                        });
                        let nutrients: Partial<
                          ReturnType<typeof calculateEntryNutrients>
                        > = {};
                        for (const name of [
                          "energyKcal",
                          "proteinGrams",
                          "carbsGrams",
                          "fatGrams",
                          "fiberGrams",
                          "sugarGrams",
                          "saturatedFatGrams",
                          "saltGrams",
                        ] as const) {
                          const value = quality[name];
                          if (value._tag !== "Unknown")
                            nutrients = { ...nutrients, [name]: value.value };
                        }
                        return [
                          { mealEntry, food: null, cost: null, nutrients },
                        ];
                      }
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
                    }
                  );
                  const aggregate = calculateMealEntriesNutrientTotals({
                    foods,
                    mealEntries: dayMealEntries,
                  });
                  const costTotals = calculateMealEntriesCostTotals({
                    foods,
                    mealEntries: dayMealEntries,
                  });
                  const allTargetStatuses = evaluatePlanNutrientTargets({
                    plan,
                    totals: aggregate.totals,
                  });
                  const targetStatuses = allTargetStatuses.filter(
                    (status) =>
                      aggregate.missing[status.nutrientName] === 0 &&
                      aggregate.estimatedCoverage[status.nutrientName] === 0
                  );

                  return [
                    {
                      costTotals,
                      coverage: aggregate.coverage,
                      nutrition: aggregate,
                      dailyLog,
                      dateKey,
                      entries,
                      isInsideExpectedPlanRange:
                        aggregate.missing.energyKcal === 0 &&
                        aggregate.estimatedCoverage.energyKcal === 0 &&
                        targetStatuses.length === allTargetStatuses.length &&
                        Array.isReadonlyArrayNonEmpty(targetStatuses) &&
                        isInsideExpectedPlanRange({
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
