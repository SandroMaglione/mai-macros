import {
  ActiveMealPlanSelection,
  MaiDatabase,
  Plan,
  PlanId,
} from "@mai/nutrition";
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

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _CreateMealPlanInput = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  proteinTargetGrams: _FormNonNegativeNumber,
  carbsTargetGrams: _FormNonNegativeNumber,
  fatTargetGrams: _FormNonNegativeNumber,
  fiberTargetGrams: Schema.optional(_FormNonNegativeNumber),
  sugarTargetGrams: Schema.optional(_FormNonNegativeNumber),
  saltTargetGrams: Schema.optional(_FormNonNegativeNumber),
  saturatedFatTargetGrams: Schema.optional(_FormNonNegativeNumber),
});

const _SetActiveMealPlanInput = Schema.Struct({
  planId: PlanId,
});

export type CreateMealPlanInput = typeof _CreateMealPlanInput.Encoded;

export type SetActiveMealPlanInput = typeof _SetActiveMealPlanInput.Encoded;

export class CreatedMealPlan extends Data.TaggedClass("CreatedMealPlan")<{
  readonly plan: Plan;
}> {}

export class SetActiveMealPlan extends Data.TaggedClass("SetActiveMealPlan")<{
  readonly plan: Plan;
}> {}

export class PlanNotFound extends Data.TaggedError("PlanNotFound")<{
  readonly planId: PlanId;
}> {}

export class MealPlans extends Context.Service<MealPlans>()("MealPlans", {
  make: Effect.gen(function* () {
    const api = yield* MaiDatabase.getQueryBuilder;
    const crypto = yield* Crypto.Crypto;

    return {
      list: Effect.fn("MealPlans.list")(function* () {
        return yield* api.from("plans").select();
      }),

      create: Effect.fn("MealPlans.create")(function* ({
        input,
      }: {
        readonly input: CreateMealPlanInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_CreateMealPlanInput)(input);

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

        yield* api.from("plans").insert(plan);
        yield* api.from("activeMealPlanSelections").upsert(selection);

        return new CreatedMealPlan({
          plan,
        });
      }),

      setActive: Effect.fn("MealPlans.setActive")(function* ({
        input,
      }: {
        readonly input: SetActiveMealPlanInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(
          _SetActiveMealPlanInput
        )(input);

        const plans = yield* api
          .from("plans")
          .select()
          .equals(decodedInput.planId);

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

                yield* api.from("activeMealPlanSelections").upsert(selection);

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
