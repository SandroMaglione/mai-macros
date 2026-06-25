import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen, LoadingView, MaiHeader, Notice } from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import { Domain, MealPlans } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, Effect, Match, Option, Schema } from "effect";
import { useRouter } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { assign, fromPromise, setup } from "xstate";

type SearchDecodeResult =
  | {
      readonly _tag: "Valid";
      readonly dateKey: Domain.DateKey | undefined;
    }
  | {
      readonly _tag: "Invalid";
    };

type SubmitResult =
  | {
      readonly _tag: "Created";
    }
  | {
      readonly _tag: "PlanNameAlreadyExists";
    }
  | {
      readonly _tag: "PlanMealNameAlreadyExists";
    }
  | {
      readonly _tag: "SchemaError";
    }
  | {
      readonly _tag: "UnknownError";
    };

const SearchParams = Schema.Struct({
  dateKey: Schema.optional(Domain.DateKey),
});

const newPlanRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: Domain.DateKey | undefined;
      readonly errorMessage: string | undefined;
      readonly hasExistingPlan: boolean;
      readonly router: ReturnType<typeof useRouter>;
    },
    events: {} as {
      readonly input: MealPlans.CreateMealPlanInput;
      readonly type: "submit";
    },
    input: {} as {
      readonly router: ReturnType<typeof useRouter>;
      readonly search: SearchDecodeResult;
    },
  },
  actors: {
    createMealPlan: fromPromise<SubmitResult, MealPlans.CreateMealPlanInput>(
      ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealPlans = yield* MealPlans.MealPlans;

            yield* mealPlans.create({ input });

            return {
              _tag: "Created" as const,
            };
          }).pipe(
            Effect.catchTag("PlanNameAlreadyExists", () =>
              Effect.succeed({
                _tag: "PlanNameAlreadyExists" as const,
              })
            ),
            Effect.catchTag("PlanMealNameAlreadyExists", () =>
              Effect.succeed({
                _tag: "PlanMealNameAlreadyExists" as const,
              })
            ),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "SchemaError" as const,
              })
            ),
            Effect.catch(() =>
              Effect.succeed({
                _tag: "UnknownError" as const,
              })
            )
          )
        )
    ),
    loadExistingPlans: fromPromise(() =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans.MealPlans;
          const plans = yield* mealPlans.list();

          return EffectArray.isReadonlyArrayNonEmpty(plans);
        })
      )
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.search._tag === "Valid" ? input.search.dateKey : undefined,
    errorMessage:
      input.search._tag === "Invalid" ? invalidDateMessage : undefined,
    hasExistingPlan: false,
    router: input.router,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadExistingPlans",
        onDone: {
          target: "Ready",
          actions: assign(({ event }) => ({
            hasExistingPlan: event.output,
          })),
        },
        onError: {
          target: "Failed",
          actions: assign({
            errorMessage: "Could not load meal plans. Please try again.",
          }),
        },
      },
    },
    Failed: {},
    Ready: {
      on: {
        submit: {
          target: "Submitting",
          actions: assign({
            errorMessage: undefined,
          }),
        },
      },
    },
    Submitting: {
      invoke: {
        src: "createMealPlan",
        input: ({ event }) => event.input,
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "Created",
            target: "Created",
            actions: ({ context }) => {
              replaceToDateKey({
                dateKey: context.dateKey,
                router: context.router,
              });
            },
          },
          {
            target: "Ready",
            actions: assign(({ event }) => {
              const message = submitErrorMessage({ result: event.output });
              Alert.alert("Plan not saved", message);

              return {
                errorMessage: message,
              };
            }),
          },
        ],
      },
    },
    Created: {},
  },
});

export default function NewPlanScreen() {
  const router = useRouter();
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
      }),
    })
  );
  const [snapshot, send] = useMachine(newPlanRouteMachine, {
    input: {
      router,
      search,
    },
  });

  if (snapshot.matches("Loading")) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Create plan" />
        <Notice
          message={
            snapshot.context.errorMessage ??
            "Could not load meal plans. Please try again."
          }
          title="Plans unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  return (
    <MealPlanForm
      action="create"
      canNavigateBack={snapshot.context.hasExistingPlan}
      errorMessage={snapshot.context.errorMessage}
      initialPlan={null}
      isSubmitting={snapshot.matches("Submitting")}
      onBack={() => {
        replaceBack({
          dateKey: snapshot.context.dateKey,
          router,
        });
      }}
      onSubmit={(input) => {
        send({ type: "submit", input });
      }}
    />
  );
}

export function submitErrorMessage({
  result,
}: {
  readonly result: SubmitResult;
}) {
  return Match.value(result).pipe(
    Match.tag(
      "PlanNameAlreadyExists",
      () =>
        "A plan with this name already exists. Choose a different name and try again."
    ),
    Match.tag(
      "PlanMealNameAlreadyExists",
      () =>
        "Meal names must be unique inside a plan. Rename the duplicate meal and try again."
    ),
    Match.tag(
      "SchemaError",
      () =>
        "Check that the plan name and meal names are filled, and every target is a non-negative number."
    ),
    Match.tag(
      "UnknownError",
      () => "Something went wrong while saving the plan. Please try again."
    ),
    Match.tag("Created", () => ""),
    Match.exhaustive
  );
}

export function replaceToDateKey({
  dateKey,
  router,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly router: ReturnType<typeof useRouter>;
}) {
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
}

export function replaceBack({
  dateKey,
  router,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly router: ReturnType<typeof useRouter>;
}) {
  if (dateKey === undefined) {
    router.replace("/");
    return;
  }

  router.replace({
    pathname: "/days/[dateKey]",
    params: { dateKey },
  });
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
