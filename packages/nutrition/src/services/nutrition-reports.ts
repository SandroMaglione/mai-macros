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
  calculateEntriesNutrientTotals,
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
  readonly food: Food;
  readonly mealEntry: MealEntry;
  readonly nutrients: ReturnType<typeof calculateEntryNutrients>;
};

export type NutritionReportDay = {
  readonly coverage: NutrientCoverage;
  readonly dailyLog: DailyLog | null;
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
          const dateKeySet = HashSet.fromIterable(dateKeys);
          const foods = yield* store.listFoods;
          const plans = yield* store.listPlans;

          if (!Array.isReadonlyArrayNonEmpty(plans)) {
            return yield* new NoNutritionReportPlans();
          }

          const foodsById = HashMap.fromIterable(
            foods.map((food): readonly [Food["id"], Food] => [food.id, food])
          );
          const plansById = HashMap.fromIterable(
            plans.map((plan): readonly [Plan["id"], Plan] => [plan.id, plan])
          );
          const dailyLogs = yield* store.listDailyLogs;
          const mealEntries = yield* store.listMealEntries;
          const selections = yield* store.findActiveMealPlanSelectionById(
            "active-meal-plan" satisfies ActiveMealPlanSelectionId
          );

          const activePlan = yield* Array.head(selections).pipe(
            Option.flatMap((selection) =>
              HashMap.get(plansById, selection.planId)
            ),
            Option.orElse(() => Array.last(plans)),
            Option.match({
              onNone: () => new NoNutritionReportPlans(),
              onSome: Effect.succeed,
            })
          );
          const dailyLogsByDateKey = HashMap.fromIterable(
            dailyLogs
              .filter((dailyLog) => HashSet.has(dateKeySet, dailyLog.dateKey))
              .map((dailyLog): readonly [DateKey, DailyLog] => [
                dailyLog.dateKey,
                dailyLog,
              ])
          );
          const mealEntriesByDateKey = Array.groupBy(
            mealEntries.filter((mealEntry) =>
              HashSet.has(dateKeySet, mealEntry.dateKey)
            ),
            (mealEntry) => mealEntry.dateKey
          );
          const days = dateKeys.map((dateKey) => {
            const dailyLog = HashMap.get(dailyLogsByDateKey, dateKey).pipe(
              Option.getOrNull
            );
            const plan =
              dailyLog === null
                ? activePlan
                : HashMap.get(plansById, dailyLog.planId).pipe(
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
                      food,
                      mealEntry,
                      nutrients: calculateEntryNutrients({
                        food,
                        quantityGrams: mealEntry.quantityGrams,
                      }),
                    },
                  ],
                })
              );
            });
            const aggregate = calculateEntriesNutrientTotals({
              entries: entries.map((entry) => ({
                food: entry.food,
                quantityGrams: entry.mealEntry.quantityGrams,
              })),
            });
            const targetStatuses = evaluatePlanNutrientTargets({
              plan,
              totals: aggregate.totals,
            });

            return {
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
            };
          });

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
