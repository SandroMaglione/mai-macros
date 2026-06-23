import {
  Array,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";

import {
  ActiveMealPlanSelection,
  DailyLog,
  DateKey,
  Plan,
  PlanId,
} from "../domain.ts";
import { NutritionStore } from "./store.ts";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _PlanName = Schema.Trim.check(Schema.isNonEmpty());

const mealPlanInputFields = {
  name: _PlanName,
  proteinTargetGrams: _FormNonNegativeNumber,
  carbsTargetGrams: _FormNonNegativeNumber,
  fatTargetGrams: _FormNonNegativeNumber,
  fiberTargetGrams: Schema.optional(_FormNonNegativeNumber),
  sugarTargetGrams: Schema.optional(_FormNonNegativeNumber),
  saltTargetGrams: Schema.optional(_FormNonNegativeNumber),
  saturatedFatTargetGrams: Schema.optional(_FormNonNegativeNumber),
};

const _CreateMealPlanInput = Schema.Struct(mealPlanInputFields);

const _GetMealPlanInput = Schema.Struct({
  planId: PlanId,
});

const _ReviseMealPlanInput = Schema.Struct({
  planId: PlanId,
  dateKey: DateKey,
  ...mealPlanInputFields,
});

const _SetActiveMealPlanInput = Schema.Struct({
  planId: PlanId,
});

export type CreateMealPlanInput = typeof _CreateMealPlanInput.Encoded;

export type GetMealPlanInput = typeof _GetMealPlanInput.Encoded;

export type ReviseMealPlanInput = typeof _ReviseMealPlanInput.Encoded;

export type SetActiveMealPlanInput = typeof _SetActiveMealPlanInput.Encoded;

export class CreatedMealPlan extends Data.TaggedClass("CreatedMealPlan")<{
  readonly plan: Plan;
}> {}

export class RevisedMealPlan extends Data.TaggedClass("RevisedMealPlan")<{
  readonly dailyLog: DailyLog;
  readonly plan: Plan;
  readonly previousPlan: Plan;
}> {}

export class SetActiveMealPlan extends Data.TaggedClass("SetActiveMealPlan")<{
  readonly plan: Plan;
}> {}

export class PlanNotFound extends Data.TaggedError("PlanNotFound")<{
  readonly planId: PlanId;
}> {}

export class PlanNameAlreadyExists extends Data.TaggedError(
  "PlanNameAlreadyExists"
)<{
  readonly name: string;
}> {}

export class MealPlans extends Context.Service<MealPlans>()("MealPlans", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const crypto = yield* Crypto.Crypto;

    return {
      list: Effect.fn("MealPlans.list")(function* () {
        return yield* store.listPlans;
      }),

      get: Effect.fn("MealPlans.get")(function* ({
        input,
      }: {
        readonly input: GetMealPlanInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_GetMealPlanInput)(input);
        const plans = yield* store.findPlanById(decodedInput.planId);

        return yield* Array.head(plans).pipe(
          Option.match({
            onNone: () =>
              new PlanNotFound({
                planId: decodedInput.planId,
              }),
            onSome: Effect.succeed,
          })
        );
      }),

      create: Effect.fn("MealPlans.create")(function* ({
        input,
      }: {
        readonly input: CreateMealPlanInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_CreateMealPlanInput)(input);
        const existingPlansWithName = yield* store.findPlansByName(
          decodedInput.name
        );

        if (Array.isReadonlyArrayNonEmpty(existingPlansWithName)) {
          return yield* new PlanNameAlreadyExists({
            name: decodedInput.name,
          });
        }

        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const plan = yield* Schema.decodeEffect(Plan)({
          id: yield* crypto.randomUUIDv4,
          name: decodedInput.name,
          proteinTargetGrams: decodedInput.proteinTargetGrams,
          carbsTargetGrams: decodedInput.carbsTargetGrams,
          fatTargetGrams: decodedInput.fatTargetGrams,
          ...(decodedInput.fiberTargetGrams === undefined
            ? {}
            : { fiberTargetGrams: decodedInput.fiberTargetGrams }),
          ...(decodedInput.sugarTargetGrams === undefined
            ? {}
            : { sugarTargetGrams: decodedInput.sugarTargetGrams }),
          ...(decodedInput.saltTargetGrams === undefined
            ? {}
            : { saltTargetGrams: decodedInput.saltTargetGrams }),
          ...(decodedInput.saturatedFatTargetGrams === undefined
            ? {}
            : {
                saturatedFatTargetGrams: decodedInput.saturatedFatTargetGrams,
              }),
          createdAt: now,
        });

        const selection = yield* Schema.decodeEffect(ActiveMealPlanSelection)({
          id: "active-meal-plan",
          planId: plan.id,
          updatedAt: now,
        });

        yield* store.insertPlan(plan);
        yield* store.upsertActiveMealPlanSelection(selection);

        return new CreatedMealPlan({
          plan,
        });
      }),

      revise: Effect.fn("MealPlans.revise")(function* ({
        input,
      }: {
        readonly input: ReviseMealPlanInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_ReviseMealPlanInput)(input);
        const previousPlans = yield* store.findPlanById(decodedInput.planId);

        return yield* Array.head(previousPlans).pipe(
          Option.match({
            onNone: () =>
              new PlanNotFound({
                planId: decodedInput.planId,
              }),
            onSome: (previousPlan) =>
              Effect.gen(function* () {
                const now = DateTime.toEpochMillis(yield* DateTime.now);
                const dailyLogsForPlan = yield* store.findDailyLogsByPlan(
                  previousPlan.id
                );
                const mealEntryCounts = yield* Effect.forEach(
                  dailyLogsForPlan,
                  (dailyLog) => store.countMealEntriesByDate(dailyLog.dateKey)
                );
                const hasRecordedMeals = mealEntryCounts.some(
                  (count) => count > 0
                );
                const existingPlansWithName = yield* store.findPlansByName(
                  decodedInput.name
                );
                const hasNameConflict = existingPlansWithName.some((plan) =>
                  hasRecordedMeals ? true : plan.id !== previousPlan.id
                );

                if (hasNameConflict) {
                  return yield* new PlanNameAlreadyExists({
                    name: decodedInput.name,
                  });
                }

                const encodedPreviousPlan =
                  yield* Schema.encodeEffect(Plan)(previousPlan);
                const planIdEffect = hasRecordedMeals
                  ? crypto.randomUUIDv4
                  : Effect.succeed(previousPlan.id);
                const planId = yield* planIdEffect;
                const plan = yield* Schema.decodeEffect(Plan)({
                  id: planId,
                  ...(hasRecordedMeals
                    ? { basedOnPlanId: previousPlan.id }
                    : encodedPreviousPlan.basedOnPlanId === undefined
                      ? {}
                      : { basedOnPlanId: encodedPreviousPlan.basedOnPlanId }),
                  name: decodedInput.name,
                  proteinTargetGrams: decodedInput.proteinTargetGrams,
                  carbsTargetGrams: decodedInput.carbsTargetGrams,
                  fatTargetGrams: decodedInput.fatTargetGrams,
                  ...(decodedInput.fiberTargetGrams === undefined
                    ? {}
                    : { fiberTargetGrams: decodedInput.fiberTargetGrams }),
                  ...(decodedInput.sugarTargetGrams === undefined
                    ? {}
                    : { sugarTargetGrams: decodedInput.sugarTargetGrams }),
                  ...(decodedInput.saltTargetGrams === undefined
                    ? {}
                    : { saltTargetGrams: decodedInput.saltTargetGrams }),
                  ...(decodedInput.saturatedFatTargetGrams === undefined
                    ? {}
                    : {
                        saturatedFatTargetGrams:
                          decodedInput.saturatedFatTargetGrams,
                      }),
                  createdAt: hasRecordedMeals
                    ? now
                    : encodedPreviousPlan.createdAt,
                });
                const selection = yield* Schema.decodeEffect(
                  ActiveMealPlanSelection
                )({
                  id: "active-meal-plan",
                  planId: plan.id,
                  updatedAt: now,
                });
                const dailyLogs = yield* store.findDailyLogByDateKey(
                  decodedInput.dateKey
                );
                const existingDailyLog = Array.head(dailyLogs);
                const dailyLog = yield* existingDailyLog.pipe(
                  Option.match({
                    onNone: () =>
                      Schema.decodeEffect(DailyLog)({
                        dateKey: decodedInput.dateKey,
                        planId: plan.id,
                        createdAt: now,
                        updatedAt: now,
                      }),
                    onSome: (dailyLog) =>
                      Schema.encodeEffect(DailyLog)(dailyLog).pipe(
                        Effect.flatMap((encodedDailyLog) =>
                          Schema.decodeEffect(DailyLog)({
                            ...encodedDailyLog,
                            planId: plan.id,
                            updatedAt: now,
                          })
                        )
                      ),
                  })
                );

                if (hasRecordedMeals) {
                  yield* store.insertPlan(plan);
                } else {
                  yield* store.upsertPlans([plan]);
                }

                yield* store.upsertActiveMealPlanSelection(selection);
                yield* store.upsertDailyLog(dailyLog);

                return new RevisedMealPlan({
                  dailyLog,
                  plan,
                  previousPlan,
                });
              }),
          })
        );
      }),

      setActive: Effect.fn("MealPlans.setActive")(function* ({
        input,
      }: {
        readonly input: SetActiveMealPlanInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          _SetActiveMealPlanInput
        )(input);

        const plans = yield* store.findPlanById(decodedInput.planId);

        return yield* Array.head(plans).pipe(
          Option.match({
            onNone: () =>
              new PlanNotFound({
                planId: decodedInput.planId,
              }),
            onSome: (plan) =>
              Effect.gen(function* () {
                const selection = yield* Schema.decodeEffect(
                  ActiveMealPlanSelection
                )({
                  id: "active-meal-plan",
                  planId: plan.id,
                  updatedAt: DateTime.toEpochMillis(yield* DateTime.now),
                });

                yield* store.upsertActiveMealPlanSelection(selection);

                return new SetActiveMealPlan({
                  plan,
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
