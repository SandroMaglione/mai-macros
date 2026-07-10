import { FoodForm } from "@/components/nutrition/food-form";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { EmptyEvent, FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { router, useRouter } from "expo-router";
import { Alert } from "react-native";
import { Actor, createAsyncLogic, setup } from "xstate";

const CreateFoodRouteMode = Schema.Literals(["screen", "embedded"]);

type CreateFoodRouteMode = typeof CreateFoodRouteMode.Type;

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const FoodFormInput = Schema.Struct({
  name: Schema.String,
  brand: Schema.optionalKey(Schema.String),
  energyKcal: Schema.String,
  proteinGrams: Schema.String,
  carbsGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.optionalKey(Schema.String),
  sugarGrams: Schema.optionalKey(Schema.String),
  saturatedFatGrams: Schema.optionalKey(Schema.String),
  saltGrams: Schema.optionalKey(Schema.String),
  nutritionReference: Schema.Struct({
    amount: Schema.String,
    unit: Domain.MeasurementUnit,
  }),
  portions: Schema.Array(
    Schema.Struct({
      id: Schema.optionalKey(Domain.FoodPortionId),
      name: Schema.String,
      size: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MeasurementUnit,
      }),
    })
  ),
  massVolumeConversion: Schema.optionalKey(
    Schema.Struct({
      mass: Schema.Struct({
        amount: Schema.String,
        unit: Domain.MassUnit,
      }),
      volume: Schema.Struct({
        amount: Schema.String,
        unit: Domain.VolumeUnit,
      }),
    })
  ),
});

const SubmitFoodInput = Schema.Struct({
  input: FoodFormInput,
});

const SubmitFoodOutput = Schema.Union([
  Schema.TaggedStruct("Created", {}),
  Schema.TaggedStruct("SchemaError", {}),
]);

const CreateFoodRouteInput = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  initialNotice: Schema.NullOr(Schema.String),
  mode: CreateFoodRouteMode,
});

const FoodFormActorSchema = Schema.declare<FoodFormMachine.FoodFormActorRef>(
  (value): value is FoodFormMachine.FoodFormActorRef =>
    value instanceof Actor && value.logic === FoodFormMachine.foodFormMachine,
  { expected: "FoodFormActor" }
);

const createFoodRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        foodFormActor: FoodFormActorSchema,
        mode: CreateFoodRouteMode,
        notice: Schema.NullOr(Schema.String),
      })
    ),
    events: {
      clearNotice: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(SubmitFoodInput),
    },
    input: Schema.toStandardSchemaV1(CreateFoodRouteInput),
  },
  states: {
    Idle: {},
    Submitting: {},
    Failure: {},
    Created: {},
  },
  actions: {
    alertCreateFoodValidationError: () => {
      Alert.alert(
        "Food not saved",
        "Check the name, required nutrients, and any custom portions."
      );
    },
    alertCreateFoodFailure: () => {
      Alert.alert(
        "Food not saved",
        "Something went wrong while saving the food. Please try again."
      );
    },
    navigateAfterCreate: (params: {
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
        params: {
          dateKey: targetDateKey,
        },
      });
    },
    resetFoodForm: (params: {
      readonly foodFormActor: FoodFormMachine.FoodFormActorRef;
    }) => {
      params.foodFormActor.send({
        type: "reset",
      });
    },
  },
  actorSources: {
    foodForm: FoodFormMachine.foodFormMachine,
    submitFood: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SubmitFoodInput),
        output: Schema.toStandardSchemaV1(SubmitFoodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;

            yield* foods.create({
              input: input.input,
            });

            return {
              _tag: "Created" as const,
            };
          }).pipe(
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "SchemaError" as const,
              })
            )
          )
        ),
    }),
  },
}).createMachine({
  context: ({ actorSources, input, spawn }) => ({
    dateKey: input.dateKey,
    foodFormActor: spawn(actorSources.foodForm, {
      id: "createFoodRouteFoodForm",
      input: {
        initialFood: null,
        syncQuickInputFromFields: true,
      },
    }),
    mode: input.mode,
    notice: input.initialNotice,
  }),
  initial: "Idle",
  states: {
    Idle: {
      on: {
        clearNotice: () => ({
          context: {
            notice: null,
          },
        }),
        submit: () => ({
          target: "Submitting",
          context: {
            notice: null,
          },
        }),
      },
    },
    Submitting: {
      invoke: {
        src: "submitFood",
        input: ({ event }) => {
          if (event.type !== "submit") {
            throw new Error("Expected food submission input.");
          }

          return {
            input: event.input,
          };
        },
        onDone: ({ actions, context, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Created: () => {
                if (context.mode === "screen") {
                  enq(actions.navigateAfterCreate, {
                    dateKey: context.dateKey,
                  });

                  return {
                    target: "Created" as const,
                  };
                }

                enq(actions.resetFoodForm, {
                  foodFormActor: context.foodFormActor,
                });

                return {
                  target: "Idle" as const,
                  context: {
                    notice: "Food created.",
                  },
                };
              },
              SchemaError: () => {
                enq(actions.alertCreateFoodValidationError);

                return {
                  target: "Failure" as const,
                  context: {
                    notice:
                      "Check the name, required nutrients, and any custom portions.",
                  },
                };
              },
            })
          ),
        onError: ({ actions }, enq) => {
          enq(actions.alertCreateFoodFailure);

          return {
            target: "Failure",
            context: {
              notice:
                "Something went wrong while saving the food. Please try again.",
            },
          };
        },
      },
    },
    Failure: {
      on: {
        clearNotice: () => ({
          context: {
            notice: null,
          },
        }),
        submit: () => ({
          target: "Submitting",
          context: {
            notice: null,
          },
        }),
      },
    },
    Created: {},
  },
});

export default function NewFoodScreen() {
  const expoRouter = useRouter();
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (decodedSearch) => ({
        _tag: "Valid" as const,
        dateKey: decodedSearch.dateKey,
      }),
    })
  ) satisfies
    | {
        readonly _tag: "Valid";
        readonly dateKey: Domain.DateKey | undefined;
      }
    | {
        readonly _tag: "Invalid";
      };
  const dateKey = search._tag === "Valid" ? search.dateKey : undefined;
  return (
    <CreateFoodPanel
      dateKey={dateKey}
      initialNotice={
        search._tag === "Invalid"
          ? "The target date was not valid. Saving will return to today."
          : null
      }
      mode="screen"
      onBack={() => {
        if (dateKey === undefined) {
          expoRouter.replace("/");
          return;
        }

        expoRouter.replace({
          pathname: "/days/[dateKey]",
          params: {
            dateKey,
          },
        });
      }}
    />
  );
}

export function CreateFoodPanel({
  dateKey,
  initialNotice,
  mode,
  onBack,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly initialNotice: string | null;
  readonly mode: CreateFoodRouteMode;
  readonly onBack: () => void;
}) {
  const [rawSnapshot] = useMachine(createFoodRouteMachine, {
    input: {
      dateKey,
      initialNotice,
      mode,
    },
  });
  const { foodFormActor } = rawSnapshot.context;
  const routeState = rawSnapshot.value;
  const isSubmitting = routeState === "Submitting" || routeState === "Created";
  const notice = rawSnapshot.context.notice;
  const feedback =
    notice === null
      ? undefined
      : routeState === "Failure"
        ? {
            message: notice,
            title: "Food not saved",
            tone: "danger" as const,
          }
        : notice === "Food created."
          ? {
              message: notice,
              tone: "success" as const,
            }
          : {
              message: notice,
              tone: "neutral" as const,
            };

  return (
    <FoodForm
      action="create"
      actor={foodFormActor}
      disabled={isSubmitting}
      feedback={feedback}
      hasFailed={routeState === "Failure"}
      layout={mode}
      onBack={onBack}
    />
  );
}
