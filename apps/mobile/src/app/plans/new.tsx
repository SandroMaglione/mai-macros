import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen, LoadingView, MaiHeader, Notice } from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { spacing } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, MealPlans } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, Effect, Match, Option, Schema } from "effect";
import { router } from "expo-router";
import { Alert, StyleSheet } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
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

const NewPlanRouteSearch = Schema.Union([
  Schema.TaggedStruct("Valid", {
    dateKey: Schema.optionalKey(Domain.DateKey),
  }),
  Schema.TaggedStruct("Invalid", {}),
]);

const CreateMealPlanResult = Schema.Union([
  Schema.TaggedStruct("Created", {}),
  Schema.TaggedStruct("PlanNameAlreadyExists", {}),
  Schema.TaggedStruct("PlanMealNameAlreadyExists", {}),
  Schema.TaggedStruct("SchemaError", {}),
  Schema.TaggedStruct("UnknownError", {}),
]);

const newPlanRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        errorMessage: Schema.UndefinedOr(Schema.String),
        hasExistingPlan: Schema.Boolean,
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
        search: NewPlanRouteSearch,
      })
    ),
  },
  states: {
    Loading: {},
    Failed: {},
    Ready: {},
    Submitting: {},
    Created: {},
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
    replaceToDateKey: (params: {
      readonly dateKey: Domain.DateKey | undefined;
    }) => {
      const today = todayDateKey();
      const targetDateKey = params.dateKey ?? today;

      if (targetDateKey === today) {
        router.replace("/");
        return;
      }

      router.replace({
        pathname: "/days/[dateKey]",
        params: { dateKey: targetDateKey },
      });
    },
    showPlanNotSavedAlert: (params: { readonly message: string }) => {
      Alert.alert("Plan not saved", params.message);
    },
  },
  actorSources: {
    createMealPlan: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(CreateMealPlanInput),
        output: Schema.toStandardSchemaV1(CreateMealPlanResult),
      },
      run: ({ input }) =>
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
        ),
    }),
    loadExistingPlans: createAsyncLogic({
      schemas: {
        output: Schema.toStandardSchemaV1(Schema.Boolean),
      },
      run: () =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealPlans = yield* MealPlans.MealPlans;
            const plans = yield* mealPlans.list();

            return Array.isReadonlyArrayNonEmpty(plans);
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.search._tag === "Valid" ? input.search.dateKey : undefined,
    errorMessage:
      input.search._tag === "Invalid" ? invalidDateMessage : undefined,
    hasExistingPlan: false,
  }),
  initial: "Loading",
  on: {
    back: ({ actions, context }, enq) => {
      enq(actions.replaceBack, { dateKey: context.dateKey });
    },
  },
  states: {
    Loading: {
      invoke: {
        src: "loadExistingPlans",
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            hasExistingPlan: event.output,
          },
        }),
        onError: {
          target: "Failed",
          context: {
            errorMessage: "Could not load meal plans. Please try again.",
          },
        },
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
        src: "createMealPlan",
        input: ({ event }) => {
          if (event.type !== "submit") {
            throw new Error("Cannot create a plan without a submit event.");
          }

          return event.input;
        },
        onDone: ({ actions, context, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Created: () => {
                enq(actions.replaceToDateKey, { dateKey: context.dateKey });

                return { target: "Created" as const };
              },
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
    Created: {},
  },
});

export default function NewPlanScreen() {
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
  const [snapshot, , actor] = useMachine(newPlanRouteMachine, {
    input: {
      search,
    },
  });

  if (snapshot.value === "Loading") {
    return (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  if (snapshot.value === "Failed") {
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
