import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen, LoadingView, MaiHeader, Notice } from "@/components/ui";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import type { DateKey, Plan, PlanId } from "@mai/nutrition";
import {
  DateKey as DateKeySchema,
  PlanId as PlanIdSchema,
} from "@mai/nutrition";
import {
  MealPlans,
  type CreateMealPlanInput,
} from "@mai/nutrition/services/meal-plans";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { assign, fromPromise, setup } from "xstate";

type RouteDecodeResult =
  | {
      readonly _tag: "Valid";
      readonly dateKey: DateKey | undefined;
      readonly planId: PlanId;
    }
  | {
      readonly _tag: "Invalid";
    };

type SubmitResult =
  | {
      readonly _tag: "Revised";
    }
  | {
      readonly _tag: "PlanNameAlreadyExists";
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
  dateKey: Schema.optional(DateKeySchema),
  planId: PlanIdSchema,
});

const editPlanRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: DateKey | undefined;
      readonly errorMessage: string | undefined;
      readonly plan: Plan | null;
      readonly planId: PlanId | null;
      readonly router: ReturnType<typeof useRouter>;
    },
    events: {} as {
      readonly input: CreateMealPlanInput;
      readonly type: "submit";
    },
    input: {} as {
      readonly routeParams: RouteDecodeResult;
      readonly router: ReturnType<typeof useRouter>;
    },
  },
  actors: {
    loadMealPlan: fromPromise<Plan | null, PlanId>((input) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans;

          return yield* mealPlans.get({
            input: {
              planId: input.input,
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
        readonly dateKey: DateKey;
        readonly input: CreateMealPlanInput;
        readonly planId: PlanId;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealPlans = yield* MealPlans;

          yield* mealPlans.revise({
            input: {
              ...input.input,
              dateKey: input.dateKey,
              planId: input.planId,
            },
          });

          return {
            _tag: "Revised" as const,
          };
        }).pipe(
          Effect.catchTag("PlanNameAlreadyExists", () =>
            Effect.succeed({
              _tag: "PlanNameAlreadyExists" as const,
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
        input: ({ context }) => {
          if (context.planId === null) {
            throw new Error("Missing plan id.");
          }

          return context.planId;
        },
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
        input: ({ context, event }) => {
          if (context.planId === null) {
            throw new Error("Cannot revise without a plan id.");
          }

          return {
            dateKey: context.dateKey ?? decodeTodayDateKey(),
            input: event.input,
            planId: context.planId,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "Revised",
            target: "Revised",
            actions: ({ context }) => {
              replaceToDateKey({
                dateKey: context.dateKey ?? decodeTodayDateKey(),
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
  const params = useLocalSearchParams();
  const [snapshot, send] = useMachine(editPlanRouteMachine, {
    input: {
      routeParams: decodeEditPlanRouteParams({
        dateKey: params.dateKey,
        planId: params.planId,
      }),
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

export function decodeEditPlanRouteParams({
  dateKey,
  planId,
}: {
  readonly dateKey: unknown;
  readonly planId: unknown;
}): RouteDecodeResult {
  const dateKeyParam = optionalStringParam({ value: dateKey });
  const planIdParam = requiredStringParam({ value: planId });

  if (dateKeyParam._tag === "Invalid" || planIdParam._tag === "Invalid") {
    return {
      _tag: "Invalid",
    };
  }

  return Schema.decodeOption(EditRouteParams)({
    dateKey: dateKeyParam.value,
    planId: planIdParam.value,
  }).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (routeParams) => ({
        _tag: "Valid" as const,
        dateKey: routeParams.dateKey,
        planId: routeParams.planId,
      }),
    })
  );
}

export function optionalStringParam({ value }: { readonly value: unknown }):
  | {
      readonly _tag: "Valid";
      readonly value: string | undefined;
    }
  | {
      readonly _tag: "Invalid";
    } {
  if (value === undefined) {
    return {
      _tag: "Valid",
      value: undefined,
    };
  }

  if (typeof value === "string") {
    return {
      _tag: "Valid",
      value,
    };
  }

  return {
    _tag: "Invalid",
  };
}

export function requiredStringParam({ value }: { readonly value: unknown }):
  | {
      readonly _tag: "Valid";
      readonly value: string;
    }
  | {
      readonly _tag: "Invalid";
    } {
  if (typeof value === "string") {
    return {
      _tag: "Valid",
      value,
    };
  }

  return {
    _tag: "Invalid",
  };
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
      "SchemaError",
      () =>
        "Check that the name is filled and every target is a non-negative number."
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
  readonly dateKey: DateKey;
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

export function decodeTodayDateKey(): DateKey {
  return Schema.decodeOption(DateKeySchema)(todayDateKey()).pipe(
    Option.getOrThrow
  );
}

export function replaceBack({
  dateKey,
  router,
}: {
  readonly dateKey: DateKey | undefined;
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
