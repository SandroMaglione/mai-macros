import {
  DailyLog,
  DateKey,
  PlanId,
  type ActiveMealPlanSelectionId,
  type Plan,
} from "../domain.ts";
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";

import { NutritionStore } from "./store.ts";
import { PlanNotFound } from "./meal-plans.ts";

const _OpenDayInput = Schema.Struct({
  dateKey: DateKey,
});

const _ChangeDayPlanInput = Schema.Struct({
  dateKey: DateKey,
  planId: PlanId,
});

export type OpenDayInput = typeof _OpenDayInput.Encoded;

export type ChangeDayPlanInput = typeof _ChangeDayPlanInput.Encoded;

export class OpenedDay extends Data.TaggedClass("OpenedDay")<{
  readonly dailyLog: DailyLog;
  readonly plans: readonly Plan[];
  readonly selectedPlan: Plan;
}> {}

export class UnrecordedDay extends Data.TaggedClass("UnrecordedDay")<{
  readonly dateKey: DateKey;
  readonly plans: readonly Plan[];
  readonly selectedPlan: Plan;
}> {}

export type Day = OpenedDay | UnrecordedDay;

export class ChangedDayPlan extends Data.TaggedClass("ChangedDayPlan")<{
  readonly dailyLog: DailyLog;
  readonly plans: readonly Plan[];
  readonly selectedPlan: Plan;
}> {}

export class NoMealPlans extends Data.TaggedError("NoMealPlans")<{
  readonly dateKey: DateKey;
}> {}

export class CannotChangeLoggedDayPlan extends Data.TaggedError(
  "CannotChangeLoggedDayPlan"
)<{
  readonly dateKey: DateKey;
}> {}

export class DailyLogNotFound extends Data.TaggedError("DailyLogNotFound")<{
  readonly dateKey: DateKey;
}> {}

export class DailyLogs extends Context.Service<DailyLogs>()("DailyLogs", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const findSelectedPlan = Effect.fn("DailyLogs.findSelectedPlan")(
      function* ({
        dateKey,
        plans,
      }: {
        readonly dateKey: DateKey;
        readonly plans: readonly Plan[];
      }) {
        const selections = yield* store.findActiveMealPlanSelectionById(
          "active-meal-plan" satisfies ActiveMealPlanSelectionId
        );

        return yield* Array.head(selections).pipe(
          Option.flatMap((selection) =>
            Array.findFirst(plans, (plan) => plan.id === selection.planId)
          ),
          Option.orElse(() => Array.last(plans)),
          Option.match({
            onNone: () =>
              new NoMealPlans({
                dateKey,
              }),
            onSome: Effect.succeed,
          })
        );
      }
    );
    const open = Effect.fn("DailyLogs.open")(function* ({
      input,
    }: {
      readonly input: OpenDayInput;
    }) {
      const decodedInput = yield* Schema.decodeEffect(_OpenDayInput)(input);
      const plans = yield* store.listPlans;

      if (!Array.isReadonlyArrayNonEmpty(plans)) {
        return yield* new NoMealPlans({
          dateKey: decodedInput.dateKey,
        });
      }

      const dailyLogs = yield* store.findDailyLogByDateKey(
        decodedInput.dateKey
      );
      const existingDailyLog = Array.head(dailyLogs);

      const openedDay = existingDailyLog.pipe(
        Option.flatMap((dailyLog) =>
          Array.findFirst(plans, (plan) => plan.id === dailyLog.planId).pipe(
            Option.map(
              (selectedPlan) =>
                new OpenedDay({
                  dailyLog,
                  plans,
                  selectedPlan,
                })
            )
          )
        ),
        Option.getOrNull
      );

      if (openedDay !== null) {
        return openedDay;
      }

      const selectedPlan = yield* findSelectedPlan({
        dateKey: decodedInput.dateKey,
        plans,
      });

      return new UnrecordedDay({
        dateKey: decodedInput.dateKey,
        plans,
        selectedPlan,
      });
    });
    const create = Effect.fn("DailyLogs.create")(function* ({
      input,
    }: {
      readonly input: ChangeDayPlanInput;
    }) {
      const decodedInput =
        yield* Schema.decodeEffect(_ChangeDayPlanInput)(input);
      const plans = yield* store.findPlanById(decodedInput.planId);

      return yield* Array.head(plans).pipe(
        Option.match({
          onNone: () =>
            new PlanNotFound({
              planId: decodedInput.planId,
            }),
          onSome: (selectedPlan) =>
            Effect.gen(function* () {
              const allPlans = yield* store.listPlans;
              const dailyLogs = yield* store.findDailyLogByDateKey(
                decodedInput.dateKey
              );
              const existingDailyLog = Array.head(dailyLogs);
              const dailyLog = yield* existingDailyLog.pipe(
                Option.match({
                  onNone: () =>
                    Effect.gen(function* () {
                      const now = DateTime.toEpochMillis(yield* DateTime.now);

                      return yield* Schema.decodeEffect(DailyLog)({
                        dateKey: decodedInput.dateKey,
                        planId: selectedPlan.id,
                        createdAt: now,
                        updatedAt: now,
                      });
                    }),
                  onSome: Effect.succeed,
                })
              );
              const openedPlan = yield* Array.findFirst(
                allPlans,
                (plan) => plan.id === dailyLog.planId
              ).pipe(
                Option.match({
                  onNone: () =>
                    new PlanNotFound({
                      planId: dailyLog.planId,
                    }),
                  onSome: Effect.succeed,
                })
              );

              yield* store.upsertDailyLog(dailyLog);

              return new OpenedDay({
                dailyLog,
                plans: allPlans,
                selectedPlan: openedPlan,
              });
            }),
        })
      );
    });

    return {
      open,

      create,

      openOrCreate: Effect.fn("DailyLogs.openOrCreate")(function* ({
        input,
      }: {
        readonly input: OpenDayInput;
      }) {
        const day = yield* open({
          input,
        });

        if (day._tag === "OpenedDay") {
          return day;
        }

        return yield* create({
          input: {
            dateKey: day.dateKey,
            planId: day.selectedPlan.id,
          },
        });
      }),

      changePlan: Effect.fn("DailyLogs.changePlan")(function* ({
        input,
      }: {
        readonly input: ChangeDayPlanInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_ChangeDayPlanInput)(input);

        const plans = yield* store.findPlanById(decodedInput.planId);

        return yield* Array.head(plans).pipe(
          Option.match({
            onNone: () =>
              new PlanNotFound({
                planId: decodedInput.planId,
              }),
            onSome: (selectedPlan) =>
              Effect.gen(function* () {
                const allPlans = yield* store.listPlans;
                const dailyLogs = yield* store.findDailyLogByDateKey(
                  decodedInput.dateKey
                );
                const existingDailyLog = Array.head(dailyLogs);
                const dailyLog = yield* existingDailyLog.pipe(
                  Option.match({
                    onNone: () =>
                      new DailyLogNotFound({
                        dateKey: decodedInput.dateKey,
                      }),
                    onSome: Effect.succeed,
                  })
                );
                const mealEntryCount = yield* store.countMealEntriesByDate(
                  decodedInput.dateKey
                );
                const changesExistingPlan = dailyLog.planId !== selectedPlan.id;

                if (mealEntryCount > 0 && changesExistingPlan) {
                  return yield* new CannotChangeLoggedDayPlan({
                    dateKey: decodedInput.dateKey,
                  });
                }

                const now = DateTime.toEpochMillis(yield* DateTime.now);
                const updatedDailyLog = yield* Schema.encodeEffect(DailyLog)(
                  dailyLog
                ).pipe(
                  Effect.flatMap((encodedDailyLog) =>
                    Schema.decodeEffect(DailyLog)({
                      ...encodedDailyLog,
                      planId: selectedPlan.id,
                      updatedAt: now,
                    })
                  )
                );

                yield* store.upsertDailyLog(updatedDailyLog);

                return new ChangedDayPlan({
                  dailyLog: updatedDailyLog,
                  plans: allPlans,
                  selectedPlan,
                });
              }),
          })
        );
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}
