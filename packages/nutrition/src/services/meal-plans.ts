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
  MealId,
  Plan,
  PlanId,
  PlanMeal,
} from "../domain.ts";
import { NutritionStore } from "./store.ts";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _PlanName = Schema.Trim.check(Schema.isNonEmpty());

const _PlanMealName = Schema.Trim.check(Schema.isNonEmpty());

const _MealPlanMealInput = Schema.Struct({
  id: Schema.optional(MealId),
  name: _PlanMealName,
});

const mealPlanInputFields = {
  name: _PlanName,
  meals: Schema.Array(_MealPlanMealInput).check(Schema.isNonEmpty()),
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
  readonly dailyLog: DailyLog | null;
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

export class PlanMealNameAlreadyExists extends Data.TaggedError(
  "PlanMealNameAlreadyExists"
)<{
  readonly name: string;
}> {}

export class MealPlans extends Context.Service<MealPlans>()("MealPlans", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const crypto = yield* Crypto.Crypto;
    const makePlanMeals = Effect.fn("MealPlans.makePlanMeals")(function* ({
      forkExistingMeals,
      mealInputs,
      now,
      previousPlan,
    }: {
      readonly forkExistingMeals: boolean;
      readonly mealInputs: readonly (typeof _MealPlanMealInput.Type)[];
      readonly now: number;
      readonly previousPlan: Plan | null;
    }) {
      const duplicateMealName = mealInputs.find(
        (mealInput, index) =>
          mealInputs.findIndex(
            (candidate) => candidate.name === mealInput.name
          ) !== index
      );

      if (duplicateMealName !== undefined) {
        return yield* new PlanMealNameAlreadyExists({
          name: duplicateMealName.name,
        });
      }

      return yield* Effect.forEach(
        mealInputs.map((mealInput, position) => ({ mealInput, position })),
        ({ mealInput, position }) =>
          Effect.gen(function* () {
            const previousMeal =
              mealInput.id === undefined || previousPlan === null
                ? undefined
                : previousPlan.meals.find((meal) => meal.id === mealInput.id);
            const id =
              forkExistingMeals || mealInput.id === undefined
                ? yield* crypto.randomUUIDv4
                : mealInput.id;
            const createdAt =
              previousMeal === undefined || forkExistingMeals
                ? now
                : DateTime.toEpochMillis(previousMeal.createdAt);

            return yield* Schema.decodeEffect(PlanMeal)({
              id,
              name: mealInput.name,
              position,
              createdAt,
            });
          })
      );
    });

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
        const meals = yield* makePlanMeals({
          forkExistingMeals: false,
          mealInputs: decodedInput.meals,
          now,
          previousPlan: null,
        });
        const encodedMeals = yield* Schema.encodeEffect(Schema.Array(PlanMeal))(
          meals
        );
        const plan = yield* Schema.decodeEffect(Plan)({
          id: yield* crypto.randomUUIDv4,
          name: decodedInput.name,
          meals: encodedMeals,
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
                const mealEntryCountForPlanMeals =
                  yield* store.countMealEntriesByMealIds(
                    previousPlan.meals.map((meal) => meal.id)
                  );
                const planIsUsed =
                  Array.isReadonlyArrayNonEmpty(dailyLogsForPlan) ||
                  mealEntryCountForPlanMeals > 0;
                const existingPlansWithName = yield* store.findPlansByName(
                  decodedInput.name
                );
                const hasNameConflict = existingPlansWithName.some((plan) =>
                  planIsUsed ? true : plan.id !== previousPlan.id
                );

                if (hasNameConflict) {
                  return yield* new PlanNameAlreadyExists({
                    name: decodedInput.name,
                  });
                }

                const encodedPreviousPlan =
                  yield* Schema.encodeEffect(Plan)(previousPlan);
                const planIdEffect = planIsUsed
                  ? crypto.randomUUIDv4
                  : Effect.succeed(previousPlan.id);
                const planId = yield* planIdEffect;
                const meals = yield* makePlanMeals({
                  forkExistingMeals: planIsUsed,
                  mealInputs: decodedInput.meals,
                  now,
                  previousPlan,
                });
                const encodedMeals = yield* Schema.encodeEffect(
                  Schema.Array(PlanMeal)
                )(meals);
                const plan = yield* Schema.decodeEffect(Plan)({
                  id: planId,
                  name: decodedInput.name,
                  meals: encodedMeals,
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
                  createdAt: planIsUsed ? now : encodedPreviousPlan.createdAt,
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
                const dailyLog = yield* planIsUsed
                  ? existingDailyLog.pipe(
                      Option.match({
                        onNone: () => Effect.succeed(null),
                        onSome: (dailyLog) => Effect.succeed(dailyLog),
                      })
                    )
                  : existingDailyLog.pipe(
                      Option.match({
                        onNone: () => Effect.succeed(null),
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

                if (planIsUsed) {
                  yield* store.insertPlan(plan);
                } else {
                  yield* store.upsertPlans([plan]);
                }

                yield* store.upsertActiveMealPlanSelection(selection);
                if (dailyLog !== null) {
                  const shouldWriteDailyLog =
                    !planIsUsed || Option.isNone(existingDailyLog);

                  if (shouldWriteDailyLog) {
                    yield* store.upsertDailyLog(dailyLog);
                  }
                }

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
