import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen } from "@/components/ui/app-screen";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { MobileMachine } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Domain, MealPlans } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { router } from "expo-router";
import { useMemo } from "react";
import { Alert, StyleSheet } from "react-native";

const EditRouteParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  planId: Domain.PlanId,
});

const MealPlanInputMeal = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.String,
});

const CreateMealPlanInput = Schema.Struct({
  name: Schema.String,
  meals: Schema.Array(MealPlanInputMeal),
  proteinTargetGrams: Schema.String,
  carbsTargetGrams: Schema.String,
  fatTargetGrams: Schema.String,
  fiberTargetGrams: Schema.optionalKey(Schema.String),
  sugarTargetGrams: Schema.optionalKey(Schema.String),
  saltTargetGrams: Schema.optionalKey(Schema.String),
  saturatedFatTargetGrams: Schema.optionalKey(Schema.String),
});
type CreateMealPlanInput = typeof CreateMealPlanInput.Type;

const EditPlanRouteParams = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
    planId: Domain.PlanId,
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

class EditPlanRoute extends Schema.TaggedClass<EditPlanRoute>("EditPlanRoute")(
  "EditPlanRoute",
  {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    planId: Schema.NullOr(Domain.PlanId),
  }
) {}

class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {}) {}
class InvalidRoute extends Schema.TaggedClass<InvalidRoute>("InvalidRoute")(
  "InvalidRoute",
  {}
) {}
class Failed extends Schema.TaggedClass<Failed>("Failed")("Failed", {
  message: Schema.String,
}) {}
class Ready extends Schema.TaggedClass<Ready>("Ready")("Ready", {
  errorMessage: Schema.UndefinedOr(Schema.String),
  plan: Domain.Plan,
}) {}
class Submitting extends Schema.TaggedClass<Submitting>("Submitting")(
  "Submitting",
  {
    input: CreateMealPlanInput,
    plan: Domain.Plan,
  }
) {}
class Revised extends Schema.TaggedClass<Revised>("Revised")("Revised", {}) {}

class Back extends Schema.TaggedClass<Back>("Back")("Back", {}) {}
class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {
  input: CreateMealPlanInput,
}) {}
class PlanLoaded extends Schema.TaggedClass<PlanLoaded>("PlanLoaded")(
  "PlanLoaded",
  { plan: Domain.Plan }
) {}
class LoadFailed extends Schema.TaggedClass<LoadFailed>("LoadFailed")(
  "LoadFailed",
  { message: Schema.String }
) {}
class PlanNotFound extends Schema.TaggedClass<PlanNotFound>("PlanNotFound")(
  "PlanNotFound",
  {}
) {}
class PlanRevised extends Schema.TaggedClass<PlanRevised>("PlanRevised")(
  "PlanRevised",
  { dateKey: Domain.DateKey }
) {}
class PlanRejected extends Schema.TaggedClass<PlanRejected>("PlanRejected")(
  "PlanRejected",
  { message: Schema.String }
) {}

const EditPlanStates = Machine.defineStates({
  Route: {
    schema: EditPlanRoute,
    initial: "Loading",
    states: { Loading, InvalidRoute, Failed, Ready, Submitting, Revised },
  },
});

const editPlanOperations = {
  replaceBack: (dateKey: Domain.DateKey | undefined) => {
    if (dateKey === undefined) {
      router.replace("/");
    } else {
      router.replace({
        pathname: "/days/[dateKey]",
        params: { dateKey },
      });
    }
  },

  replaceToDateKey: (dateKey: Domain.DateKey) => {
    if (dateKey === todayDateKey()) {
      router.replace("/");
    } else {
      router.replace({
        pathname: "/days/[dateKey]",
        params: { dateKey },
      });
    }
  },

  loadMealPlan: (planId: Domain.PlanId) =>
    Effect.gen(function* () {
      const mealPlans = yield* MealPlans.MealPlans;
      const plan = yield* mealPlans.get({ input: { planId } });
      return new PlanLoaded({ plan });
    }).pipe(
      Effect.catchTags({
        PlanNotFound: () => Effect.succeed(new PlanNotFound()),
        SchemaError: () => Effect.succeed(new PlanNotFound()),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new LoadFailed({
            message: "Could not load this meal plan. Please try again.",
          })
        )
      )
    ),

  reviseMealPlan: ({
    dateKey,
    input,
    planId,
  }: {
    readonly dateKey: Domain.DateKey | undefined;
    readonly input: CreateMealPlanInput;
    readonly planId: Domain.PlanId;
  }) =>
    Effect.gen(function* () {
      const targetDateKey =
        dateKey ?? (yield* Schema.decodeEffect(Domain.DateKey)(todayDateKey()));
      const mealPlans = yield* MealPlans.MealPlans;
      yield* mealPlans.revise({
        input: { ...input, dateKey: targetDateKey, planId },
      });
      return new PlanRevised({ dateKey: targetDateKey });
    }).pipe(
      Effect.catchTags({
        PlanMealNameAlreadyExists: () =>
          Effect.succeed(
            new PlanRejected({
              message:
                "Meal names must be unique inside a plan. Rename the duplicate meal and try again.",
            })
          ),
        PlanNameAlreadyExists: () =>
          Effect.succeed(
            new PlanRejected({
              message:
                "A plan with this name already exists. Choose a different name and try again.",
            })
          ),
        PlanNotFound: () => Effect.succeed(new PlanNotFound()),
        SchemaError: () =>
          Effect.succeed(
            new PlanRejected({
              message:
                "Check that the plan name and meal names are filled, and every target is a non-negative number.",
            })
          ),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new PlanRejected({
            message:
              "Something went wrong while saving the plan. Please try again.",
          })
        )
      )
    ),
};

const editPlanRouteMachine = Machine.make({
  states: EditPlanStates.states,
  events: [Back, Submit],
  internalEvents: [
    PlanLoaded,
    LoadFailed,
    PlanNotFound,
    PlanRevised,
    PlanRejected,
  ],
  input: Schema.Struct({ routeParams: EditPlanRouteParams }),
  initial: ({ routeParams }) =>
    EditPlanStates.initial.Route(
      new EditPlanRoute({
        dateKey: routeParams._tag === "Valid" ? routeParams.dateKey : undefined,
        planId: routeParams._tag === "Valid" ? routeParams.planId : null,
      }),
      (route) => route.Loading(new Loading())
    ),
}).handle({
  Route: {
    on: {
      Back: ({ state }) =>
        Machine.action(
          Effect.sync(() => editPlanOperations.replaceBack(state.dateKey))
        ),
    },
    states: {
      Loading: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "load-meal-plan",
            src: () =>
              Machine.effect(
                parents.Route.planId === null
                  ? Effect.succeed(new PlanNotFound())
                  : editPlanOperations.loadMealPlan(parents.Route.planId)
              ),
          }),
        on: {
          PlanLoaded: ({ event, target }) =>
            target.local.Ready(
              new Ready({ errorMessage: undefined, plan: event.plan })
            ),
          PlanNotFound: ({ target }) =>
            target.local.InvalidRoute(new InvalidRoute()),
          LoadFailed: ({ event, target }) =>
            target.local.Failed(new Failed({ message: event.message })),
        },
      },
      InvalidRoute: {
        entry: () => Machine.action(Effect.sync(() => router.replace("/"))),
      },
      Failed: {},
      Ready: {
        on: {
          Submit: ({ event, state, target }) =>
            target.local.Submitting(
              new Submitting({ input: event.input, plan: state.plan })
            ),
        },
      },
      Submitting: {
        invoke: ({ parents, state }) =>
          Machine.invoke({
            id: "revise-meal-plan",
            src: () =>
              Machine.effect(
                parents.Route.planId === null
                  ? Effect.succeed(new PlanNotFound())
                  : editPlanOperations.reviseMealPlan({
                      dateKey: parents.Route.dateKey,
                      input: state.input,
                      planId: parents.Route.planId,
                    })
              ),
          }),
        on: {
          PlanNotFound: ({ target }) =>
            target.local.InvalidRoute(new InvalidRoute()),
          PlanRevised: ({ event, target }) =>
            Machine.action(
              Effect.sync(() =>
                editPlanOperations.replaceToDateKey(event.dateKey)
              ),
              target.local.Revised(new Revised())
            ),
          PlanRejected: ({ event, state, target }) =>
            Machine.action(
              Effect.sync(() => Alert.alert("Plan not saved", event.message)),
              target.local.Ready(
                new Ready({
                  errorMessage: event.message,
                  plan: state.plan,
                })
              )
            ),
        },
      },
      Revised: {},
    },
  },
});

export default function EditPlanScreen() {
  const routeParams = useSchemaLocalSearchParams(EditRouteParams).pipe(
    Option.match({
      onNone: () => ({ _tag: "Invalid" as const }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
        planId: params.planId,
      }),
    })
  );
  const machineAtom = useMemo(
    () =>
      MobileMachine.make(editPlanRouteMachine, {
        routeParams,
      }),
    [
      routeParams._tag,
      routeParams._tag === "Valid" ? routeParams.dateKey : undefined,
      routeParams._tag === "Valid" ? routeParams.planId : undefined,
    ]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    EditPlanStates.matches(stateResult.value, "Route.Loading") ||
    EditPlanStates.matches(stateResult.value, "Route.InvalidRoute")
  ) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    );
  }

  const failed = EditPlanStates.get(stateResult.value, "Route.Failed").pipe(
    Option.getOrUndefined
  );
  if (failed !== undefined) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Edit plan" />
        <Notice
          message={failed.message}
          title="Plan unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  const ready = EditPlanStates.get(stateResult.value, "Route.Ready").pipe(
    Option.getOrUndefined
  );
  const submitting = EditPlanStates.get(
    stateResult.value,
    "Route.Submitting"
  ).pipe(Option.getOrUndefined);
  const plan = ready?.plan ?? submitting?.plan;

  if (plan === undefined) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    );
  }

  return (
    <MealPlanForm
      action="edit"
      errorMessage={ready?.errorMessage}
      initialPlan={plan}
      isSubmitting={submitting !== undefined}
      onBack={() => send(new Back())}
      onSubmit={(input) => send(new Submit({ input }))}
    />
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    justifyContent: "center",
  },
  stateScreen: {
    gap: spacing.lg,
  },
});
