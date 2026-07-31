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
import { Array, Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { router } from "expo-router";
import { useMemo } from "react";
import { Alert, StyleSheet } from "react-native";

const PlanSource = Schema.Literal("settings");
type PlanSource = typeof PlanSource.Type;

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  returnDateKey: Schema.optionalKey(Domain.DateKey),
  source: Schema.optionalKey(PlanSource),
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

const NewPlanRouteSearch = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
    returnDateKey: Schema.optionalKey(Domain.DateKey),
    source: Schema.optionalKey(PlanSource),
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

class NewPlanRoute extends Schema.TaggedClass<NewPlanRoute>("NewPlanRoute")(
  "NewPlanRoute",
  {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    returnDateKey: Schema.UndefinedOr(Domain.DateKey),
    source: Schema.UndefinedOr(PlanSource),
  }
) {}

class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {}) {}

class Failed extends Schema.TaggedClass<Failed>("Failed")("Failed", {
  message: Schema.String,
}) {}

class Ready extends Schema.TaggedClass<Ready>("Ready")("Ready", {
  errorMessage: Schema.UndefinedOr(Schema.String),
  hasExistingPlan: Schema.Boolean,
}) {}

class Submitting extends Schema.TaggedClass<Submitting>("Submitting")(
  "Submitting",
  {
    hasExistingPlan: Schema.Boolean,
    input: CreateMealPlanInput,
  }
) {}

class Created extends Schema.TaggedClass<Created>("Created")("Created", {}) {}

class Back extends Schema.TaggedClass<Back>("Back")("Back", {}) {}

class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {
  input: CreateMealPlanInput,
}) {}

class ExistingPlansLoaded extends Schema.TaggedClass<ExistingPlansLoaded>(
  "ExistingPlansLoaded"
)("ExistingPlansLoaded", {
  hasExistingPlan: Schema.Boolean,
}) {}

class LoadFailed extends Schema.TaggedClass<LoadFailed>("LoadFailed")(
  "LoadFailed",
  {
    message: Schema.String,
  }
) {}

class PlanCreated extends Schema.TaggedClass<PlanCreated>("PlanCreated")(
  "PlanCreated",
  {}
) {}

class PlanRejected extends Schema.TaggedClass<PlanRejected>("PlanRejected")(
  "PlanRejected",
  {
    message: Schema.String,
  }
) {}

const NewPlanStates = Machine.defineStates({
  Route: {
    schema: NewPlanRoute,
    initial: "Loading",
    states: {
      Loading,
      Failed,
      Ready,
      Submitting,
      Created,
    },
  },
});

const newPlanOperations = {
  replaceBack: ({
    dateKey,
    returnDateKey,
    source,
  }: {
    readonly dateKey: Domain.DateKey | undefined;
    readonly returnDateKey: Domain.DateKey | undefined;
    readonly source: PlanSource | undefined;
  }) => {
    if (source === "settings") {
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace(
        returnDateKey === undefined
          ? "/settings"
          : { pathname: "/settings", params: { dateKey: returnDateKey } }
      );
      return;
    }

    if (dateKey === undefined) {
      router.replace("/");
      return;
    }

    router.replace({
      pathname: "/days/[dateKey]",
      params: { dateKey },
    });
  },

  replaceToDateKey: (params: {
    readonly dateKey: Domain.DateKey | undefined;
    readonly returnDateKey: Domain.DateKey | undefined;
    readonly source: PlanSource | undefined;
  }) => {
    if (params.source === "settings") {
      newPlanOperations.replaceBack(params);
      return;
    }

    const { dateKey } = params;
    const today = todayDateKey();
    const targetDateKey = dateKey ?? today;

    if (targetDateKey === today) {
      router.replace("/");
      return;
    }

    router.replace({
      pathname: "/days/[dateKey]",
      params: { dateKey: targetDateKey },
    });
  },
};

const loadExistingPlans = Effect.gen(function* () {
  const mealPlans = yield* MealPlans.MealPlans;
  const plans = yield* mealPlans.list();
  return new ExistingPlansLoaded({
    hasExistingPlan: Array.isReadonlyArrayNonEmpty(plans),
  });
}).pipe(
  Effect.catch(() =>
    Effect.succeed(
      new LoadFailed({
        message: "Could not load meal plans. Please try again.",
      })
    )
  )
);

const newPlanEffects = {
  createMealPlan: (input: CreateMealPlanInput) =>
    Effect.gen(function* () {
      const mealPlans = yield* MealPlans.MealPlans;
      yield* mealPlans.create({ input });
      return new PlanCreated();
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

const newPlanRouteMachine = Machine.make({
  states: NewPlanStates.states,
  events: [Back, Submit],
  internalEvents: [ExistingPlansLoaded, LoadFailed, PlanCreated, PlanRejected],
  input: Schema.Struct({ search: NewPlanRouteSearch }),
  initial: ({ search }) =>
    NewPlanStates.initial.Route(
      new NewPlanRoute({
        dateKey: search._tag === "Valid" ? search.dateKey : undefined,
        returnDateKey:
          search._tag === "Valid" ? search.returnDateKey : undefined,
        source: search._tag === "Valid" ? search.source : undefined,
      }),
      (route) => route.Loading(new Loading())
    ),
}).handle({
  Route: {
    on: {
      Back: ({ state }) =>
        Machine.action(
          Effect.sync(() =>
            newPlanOperations.replaceBack({
              dateKey: state.dateKey,
              returnDateKey: state.returnDateKey,
              source: state.source,
            })
          )
        ),
    },
    states: {
      Loading: {
        invoke: Machine.invoke({
          id: "load-existing-plans",
          src: () => Machine.effect(loadExistingPlans),
        }),
        on: {
          ExistingPlansLoaded: ({ event, target }) =>
            target.local.Ready(
              new Ready({
                errorMessage: undefined,
                hasExistingPlan: event.hasExistingPlan,
              })
            ),
          LoadFailed: ({ event, target }) =>
            target.local.Failed(new Failed({ message: event.message })),
        },
      },
      Failed: {},
      Ready: {
        on: {
          Submit: ({ event, state, target }) =>
            target.local.Submitting(
              new Submitting({
                hasExistingPlan: state.hasExistingPlan,
                input: event.input,
              })
            ),
        },
      },
      Submitting: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "create-meal-plan",
            src: () =>
              Machine.effect(newPlanEffects.createMealPlan(state.input)),
          }),
        on: {
          PlanCreated: ({ parents, target }) =>
            Machine.action(
              Effect.sync(() =>
                newPlanOperations.replaceToDateKey({
                  dateKey: parents.Route.dateKey,
                  returnDateKey: parents.Route.returnDateKey,
                  source: parents.Route.source,
                })
              ),
              target.local.Created(new Created())
            ),
          PlanRejected: ({ event, state, target }) =>
            Machine.action(
              Effect.sync(() => Alert.alert("Plan not saved", event.message)),
              target.local.Ready(
                new Ready({
                  errorMessage: event.message,
                  hasExistingPlan: state.hasExistingPlan,
                })
              )
            ),
        },
      },
      Created: {},
    },
  },
});

export default function NewPlanScreen() {
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({ _tag: "Invalid" as const }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
        returnDateKey: params.returnDateKey,
        source: params.source,
      }),
    })
  );
  const machineAtom = useMemo(
    () => MobileMachine.make(newPlanRouteMachine, { search }),
    [
      search._tag,
      search._tag === "Valid" ? search.dateKey : undefined,
      search._tag === "Valid" ? search.returnDateKey : undefined,
      search._tag === "Valid" ? search.source : undefined,
    ]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    NewPlanStates.matches(stateResult.value, "Route.Loading")
  ) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  const failed = NewPlanStates.get(stateResult.value, "Route.Failed").pipe(
    Option.getOrUndefined
  );
  if (failed !== undefined) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Create plan" />
        <Notice
          message={failed.message}
          title="Plans unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  const ready = NewPlanStates.get(stateResult.value, "Route.Ready").pipe(
    Option.getOrUndefined
  );
  const submitting = NewPlanStates.get(
    stateResult.value,
    "Route.Submitting"
  ).pipe(Option.getOrUndefined);
  return (
    <MealPlanForm
      action="create"
      canNavigateBack={
        (ready?.hasExistingPlan ?? submitting?.hasExistingPlan ?? true) ||
        (search._tag === "Valid" && search.source === "settings")
      }
      errorMessage={
        ready?.errorMessage ??
        (search._tag === "Invalid" ? invalidDateMessage : undefined)
      }
      initialPlan={null}
      isSubmitting={submitting !== undefined}
      onBack={() => send(new Back())}
      onSubmit={(input) => send(new Submit({ input }))}
    />
  );
}

const invalidDateMessage =
  "The target date was not valid. Saving will return to today.";

const styles = StyleSheet.create({
  loadingScreen: {
    justifyContent: "center",
  },
  stateScreen: {
    gap: spacing.lg,
  },
});
