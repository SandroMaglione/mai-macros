import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen, LoadingView, MaiHeader, Notice } from "@/components/ui";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import type { DateKey } from "@mai/nutrition";
import { DateKey as DateKeySchema } from "@mai/nutrition";
import {
  MealPlans,
  type CreateMealPlanInput,
} from "@mai/nutrition/services/meal-plans";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, Effect, Match, Option, Schema } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { assign, fromPromise, setup } from "xstate";

type SearchDecodeResult =
  | {
      readonly _tag: "Valid";
      readonly dateKey: DateKey | undefined;
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
      readonly _tag: "SchemaError";
    }
  | {
      readonly _tag: "UnknownError";
    };

const SearchParams = Schema.Struct({
  dateKey: Schema.optional(DateKeySchema),
});

const newPlanRouteMachine = setup({
  types: {
    context: {} as {
      readonly dateKey: DateKey | undefined;
      readonly errorMessage: string | undefined;
      readonly hasExistingPlan: boolean;
      readonly router: ReturnType<typeof useRouter>;
    },
    events: {} as {
      readonly input: CreateMealPlanInput;
      readonly type: "submit";
    },
    input: {} as {
      readonly router: ReturnType<typeof useRouter>;
      readonly search: SearchDecodeResult;
    },
  },
  actors: {
    createMealPlan: fromPromise<SubmitResult, CreateMealPlanInput>(
      ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealPlans = yield* MealPlans;

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
          const mealPlans = yield* MealPlans;
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
  const params = useLocalSearchParams();
  const [snapshot, send] = useMachine(newPlanRouteMachine, {
    input: {
      router,
      search: decodeNewPlanSearchParams({ dateKey: params.dateKey }),
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

export function decodeNewPlanSearchParams({
  dateKey,
}: {
  readonly dateKey: unknown;
}): SearchDecodeResult {
  const dateKeyParam = optionalStringParam({ value: dateKey });

  if (dateKeyParam._tag === "Invalid") {
    return {
      _tag: "Invalid",
    };
  }

  return Schema.decodeOption(SearchParams)({
    dateKey: dateKeyParam.value,
  }).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (search) => ({
        _tag: "Valid" as const,
        dateKey: search.dateKey,
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
    Match.tag("Created", () => ""),
    Match.exhaustive
  );
}

export function replaceToDateKey({
  dateKey,
  router,
}: {
  readonly dateKey: DateKey | undefined;
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
