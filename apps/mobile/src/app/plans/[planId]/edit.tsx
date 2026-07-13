import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen } from "@/components/ui/app-screen";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, MealPlans } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { router } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { createAsyncLogic, setup } from "xstate";

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

const EditPlanRouteParams = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
    planId: Domain.PlanId,
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

const ReviseMealPlanInput = Schema.Struct({
  dateKey: Schema.NullOr(Domain.DateKey),
  input: CreateMealPlanInput,
  planId: Schema.NullOr(Domain.PlanId),
});

const ReviseMealPlanResult = Schema.Union([
  Schema.TaggedStruct("Revised", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("PlanNameAlreadyExists", {}),
  Schema.TaggedStruct("PlanMealNameAlreadyExists", {}),
  Schema.TaggedStruct("SchemaError", {}),
  Schema.TaggedStruct("PlanNotFound", {}),
  Schema.TaggedStruct("UnknownError", {}),
]);

const editPlanRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        errorMessage: Schema.UndefinedOr(Schema.String),
        plan: Schema.NullOr(Domain.Plan),
        planId: Schema.NullOr(Domain.PlanId),
      })
    ),
    events: {
      back: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(
        Schema.Struct({
          input: CreateMealPlanInput,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(
      Schema.Struct({
        routeParams: EditPlanRouteParams,
      })
    ),
  },
  states: {
    Loading: {},
    InvalidRoute: {},
    Failed: {},
    Ready: {},
    Submitting: {},
    Revised: {},
  },
  actions: {
    replaceBack: (params: { readonly dateKey: Domain.DateKey | undefined }) => {
      if (params.dateKey === undefined) {
        router.replace("/");
        return;
      }

      router.replace({
        pathname: "/days/[dateKey]",
        params: { dateKey: params.dateKey },
      });
    },
    replaceHome: () => {
      router.replace("/");
    },
    replaceToDateKey: (params: { readonly dateKey: Domain.DateKey }) => {
      if (params.dateKey === todayDateKey()) {
        router.replace("/");
        return;
      }

      router.replace({
        pathname: "/days/[dateKey]",
        params: { dateKey: params.dateKey },
      });
    },
    showPlanNotSavedAlert: (params: { readonly message: string }) => {
      Alert.alert("Plan not saved", params.message);
    },
  },
  actorSources: {
    loadMealPlan: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(Schema.NullOr(Domain.PlanId)),
        output: Schema.toStandardSchemaV1(Schema.NullOr(Domain.Plan)),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            if (input === null) {
              return yield* Effect.succeed(null);
            }

            const mealPlans = yield* MealPlans.MealPlans;

            return yield* mealPlans.get({
              input: {
                planId: input,
              },
            });
          }).pipe(
            Effect.catchTag("PlanNotFound", () => Effect.succeed(null)),
            Effect.catchTag("SchemaError", () => Effect.succeed(null))
          )
        ),
    }),
    reviseMealPlan: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ReviseMealPlanInput),
        output: Schema.toStandardSchemaV1(ReviseMealPlanResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            if (input.planId === null) {
              return yield* Effect.succeed({
                _tag: "PlanNotFound" as const,
              });
            }

            if (input.dateKey === null) {
              return yield* Effect.succeed({
                _tag: "SchemaError" as const,
              });
            }

            const mealPlans = yield* MealPlans.MealPlans;

            yield* mealPlans.revise({
              input: {
                ...input.input,
                dateKey: input.dateKey,
                planId: input.planId,
              },
            });

            return {
              _tag: "Revised" as const,
              dateKey: input.dateKey,
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
        ),
    }),
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
  }),
  initial: "Loading",
  on: {
    back: ({ actions, context }, enq) => {
      enq(actions.replaceBack, { dateKey: context.dateKey });
    },
  },
  states: {
    Loading: {
      always: ({ context }) =>
        context.planId === null ? { target: "InvalidRoute" } : undefined,
      invoke: {
        src: "loadMealPlan",
        input: ({ context }) => context.planId,
        onDone: ({ event }) =>
          event.output === null
            ? { target: "InvalidRoute" }
            : {
                target: "Ready",
                context: {
                  plan: event.output,
                },
              },
        onError: {
          target: "Failed",
          context: {
            errorMessage: "Could not load this meal plan. Please try again.",
          },
        },
      },
    },
    InvalidRoute: {
      entry: ({ actions }, enq) => {
        enq(actions.replaceHome);
      },
    },
    Failed: {},
    Ready: {
      on: {
        submit: {
          target: "Submitting",
          context: {
            errorMessage: undefined,
          },
        },
      },
    },
    Submitting: {
      invoke: {
        src: "reviseMealPlan",
        input: ({ context, event }) => {
          if (event.type !== "submit") {
            throw new Error("Cannot revise a plan without a submit event.");
          }

          return {
            dateKey:
              context.dateKey !== undefined
                ? context.dateKey
                : Schema.decodeOption(Domain.DateKey)(todayDateKey()).pipe(
                    Option.getOrNull
                  ),
            input: event.input,
            planId: context.planId,
          };
        },
        onDone: ({ actions, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              PlanMealNameAlreadyExists: () => {
                const message =
                  "Meal names must be unique inside a plan. Rename the duplicate meal and try again.";
                enq(actions.showPlanNotSavedAlert, { message });

                return {
                  target: "Ready" as const,
                  context: {
                    errorMessage: message,
                  },
                };
              },
              PlanNameAlreadyExists: () => {
                const message =
                  "A plan with this name already exists. Choose a different name and try again.";
                enq(actions.showPlanNotSavedAlert, { message });

                return {
                  target: "Ready" as const,
                  context: {
                    errorMessage: message,
                  },
                };
              },
              PlanNotFound: () => ({ target: "InvalidRoute" as const }),
              Revised: ({ dateKey }) => {
                enq(actions.replaceToDateKey, { dateKey });

                return { target: "Revised" as const };
              },
              SchemaError: () => {
                const message =
                  "Check that the plan name and meal names are filled, and every target is a non-negative number.";
                enq(actions.showPlanNotSavedAlert, { message });

                return {
                  target: "Ready" as const,
                  context: {
                    errorMessage: message,
                  },
                };
              },
              UnknownError: () => {
                const message =
                  "Something went wrong while saving the plan. Please try again.";
                enq(actions.showPlanNotSavedAlert, { message });

                return {
                  target: "Ready" as const,
                  context: {
                    errorMessage: message,
                  },
                };
              },
            })
          ),
      },
    },
    Revised: {},
  },
});

export default function EditPlanScreen() {
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
  const [snapshot, , actor] = useMachine(editPlanRouteMachine, {
    input: {
      routeParams,
    },
  });

  if (snapshot.value === "Loading" || snapshot.value === "InvalidRoute") {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    );
  }

  if (snapshot.value === "Failed") {
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
      isSubmitting={snapshot.value === "Submitting"}
      onBack={() => {
        actor.trigger.back();
      }}
      onSubmit={(input) => {
        actor.trigger.submit({ input });
      }}
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
