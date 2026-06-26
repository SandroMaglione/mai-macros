import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen, LoadingView, MaiHeader, Notice } from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import { Domain, MealPlans } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { useRouter } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { assign, fromPromise, setup } from "xstate";

type SubmitResult =
  | {
      readonly _tag: "Revised";
      readonly dateKey: Domain.DateKey;
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
      readonly _tag: "PlanNotFound";
    }
  | {
      readonly _tag: "UnknownError";
    };

const EditRouteParams = Schema.Struct({
  dateKey: Schema.optional(Domain.DateKey),
  planId: Domain.PlanId,
});

const editPlanRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: Domain.DateKey | undefined;
      readonly errorMessage: string | undefined;
      readonly plan: Domain.Plan | null;
      readonly planId: Domain.PlanId | null;
      readonly router: ReturnType<typeof useRouter>;
    },
    events: {} as {
      readonly input: MealPlans.CreateMealPlanInput;
      readonly type: "submit";
    },
    input: {} as {
      readonly routeParams:
        | {
            readonly _tag: "Valid";
            readonly dateKey: Domain.DateKey | undefined;
            readonly planId: Domain.PlanId;
          }
        | {
            readonly _tag: "Invalid";
          };
      readonly router: ReturnType<typeof useRouter>;
    },
  },
  actors: {
    loadMealPlan: fromPromise<Domain.Plan | null, Domain.PlanId | null>(
      (input) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            if (input.input === null) {
              return yield* Effect.succeed(null);
            }

            const planId = input.input;
            const mealPlans = yield* MealPlans.MealPlans;

            return yield* mealPlans.get({
              input: {
                planId,
              },
            });
          }).pipe(
            Effect.catchTag("PlanNotFound", () => Effect.succeed(null)),
            Effect.catchTag("SchemaError", () => Effect.succeed(null))
          )
        )
    ),
    reviseMealPlan: fromPromise<
      SubmitResult,
      {
        readonly dateKey: Option.Option<Domain.DateKey>;
        readonly input: MealPlans.CreateMealPlanInput;
        readonly planId: Domain.PlanId | null;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          if (input.planId === null) {
            return yield* Effect.succeed({
              _tag: "PlanNotFound" as const,
            });
          }

          const planId = input.planId;

          return yield* input.dateKey.pipe(
            Option.match({
              onNone: () =>
                Effect.succeed({
                  _tag: "SchemaError" as const,
                }),
              onSome: (dateKey) =>
                Effect.gen(function* () {
                  const mealPlans = yield* MealPlans.MealPlans;

                  yield* mealPlans.revise({
                    input: {
                      ...input.input,
                      dateKey,
                      planId,
                    },
                  });

                  return {
                    _tag: "Revised" as const,
                    dateKey,
                  };
                }),
            })
          );
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
          Effect.catchTag("PlanNotFound", () =>
            Effect.succeed({
              _tag: "PlanNotFound" as const,
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
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey:
      input.routeParams._tag === "Valid"
        ? input.routeParams.dateKey
        : undefined,
    errorMessage: undefined,
    plan: null,
    planId:
      input.routeParams._tag === "Valid" ? input.routeParams.planId : null,
    router: input.router,
  }),
  initial: "Loading",
  states: {
    Loading: {
      always: {
        guard: ({ context }) => context.planId === null,
        target: "InvalidRoute",
      },
      invoke: {
        src: "loadMealPlan",
        input: ({ context }) => context.planId,
        onDone: [
          {
            guard: ({ event }) => event.output === null,
            target: "InvalidRoute",
          },
          {
            target: "Ready",
            actions: assign(({ event }) => ({
              plan: event.output,
            })),
          },
        ],
        onError: {
          target: "Failed",
          actions: assign({
            errorMessage: "Could not load this meal plan. Please try again.",
          }),
        },
      },
    },
    InvalidRoute: {
      entry: ({ context }) => context.router.replace("/"),
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
        src: "reviseMealPlan",
        input: ({ context, event }) => ({
          dateKey: resolveDateKey({ dateKey: context.dateKey }),
          input: event.input,
          planId: context.planId,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "Revised",
            target: "Revised",
            actions: ({ context, event }) => {
              if (event.output._tag !== "Revised") {
                return;
              }

              replaceToDateKey({
                dateKey: event.output.dateKey,
                router: context.router,
              });
            },
          },
          {
            guard: ({ event }) => event.output._tag === "PlanNotFound",
            target: "InvalidRoute",
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
    Revised: {},
  },
});

export default function EditPlanScreen() {
  const router = useRouter();
  const routeParams = useSchemaLocalSearchParams(EditRouteParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
        planId: params.planId,
      }),
    })
  );
  const [snapshot, send] = useMachine(editPlanRouteMachine, {
    input: {
      routeParams,
      router,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("InvalidRoute")) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Edit plan" />
        <Notice
          message={
            snapshot.context.errorMessage ??
            "Could not load this meal plan. Please try again."
          }
          title="Plan unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  if (snapshot.context.plan === null) {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    );
  }

  return (
    <MealPlanForm
      action="edit"
      errorMessage={snapshot.context.errorMessage}
      initialPlan={snapshot.context.plan}
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
    Match.tag("PlanNotFound", () => "This plan is no longer available."),
    Match.tag("Revised", () => ""),
    Match.exhaustive
  );
}

export function replaceToDateKey({
  dateKey,
  router,
}: {
  readonly dateKey: Domain.DateKey;
  readonly router: ReturnType<typeof useRouter>;
}) {
  if (dateKey === todayDateKey()) {
    router.replace("/");
    return;
  }

  router.replace({
    pathname: "/days/[dateKey]",
    params: { dateKey },
  });
}

export function resolveDateKey({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey | undefined;
}): Option.Option<Domain.DateKey> {
  if (dateKey !== undefined) {
    return Option.some(dateKey);
  }

  return Schema.decodeOption(Domain.DateKey)(todayDateKey());
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

const styles = StyleSheet.create({
  loadingScreen: {
    justifyContent: "center",
  },
  stateScreen: {
    gap: spacing.lg,
  },
});
