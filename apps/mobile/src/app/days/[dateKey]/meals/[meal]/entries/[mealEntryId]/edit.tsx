import { FoodNutrientOverview } from "@/components/nutrition";
import {
  AppHeader,
  AppScreen,
  BottomActionBar,
  Button,
  IconButton,
  LoadingView,
  Notice,
  NumberField,
} from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { DailyLogs, Domain, Foods, MealEntries, Utils } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Save, Trash2 } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { createAsyncLogic, setup } from "xstate";

const EditMealEntryRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  food: Schema.UndefinedOr(Domain.Food),
  meal: Domain.MealId,
  mealLabel: Schema.NonEmptyString,
  mealEntry: Domain.MealEntry,
});

const EditMealEntryRouteLoaderInput = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

const EditMealEntryRouteLoadResult = Schema.Union([
  Schema.TaggedStruct("InvalidRoute", {}),
  Schema.TaggedStruct("Ready", {
    data: EditMealEntryRouteData,
  }),
]);

const MealEntryMutationResult = Schema.Union([
  Schema.TaggedStruct("MealEntryNotFound", {}),
  Schema.TaggedStruct("SchemaError", {}),
  Schema.TaggedStruct("Success", {}),
]);

type MealEntryMutationResult = typeof MealEntryMutationResult.Type;

const EditMealEntryRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

const editMealEntryRouteLoaderMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        data: Schema.NullOr(EditMealEntryRouteData),
        dateKey: Domain.DateKey,
        meal: Domain.MealId,
        mealEntryId: Domain.MealEntryId,
      })
    ),
    input: Schema.toStandardSchemaV1(EditMealEntryRouteLoaderInput),
  },
  states: {
    Loading: {},
    InvalidRoute: {},
    Ready: {},
  },
  actorSources: {
    loadRouteData: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(EditMealEntryRouteLoaderInput),
        output: Schema.toStandardSchemaV1(EditMealEntryRouteLoadResult),
      },
      run: ({ input: { dateKey, meal, mealEntryId } }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const foodsService = yield* Foods.Foods;
            const mealEntriesService = yield* MealEntries.MealEntries;
            const day = yield* dateKey === todayDateKey()
              ? dailyLogs.openOrCreate({
                  input: {
                    dateKey,
                  },
                })
              : dailyLogs.open({
                  input: {
                    dateKey,
                  },
                });

            if (day._tag === "UnrecordedDay") {
              return {
                _tag: "InvalidRoute" as const,
              };
            }

            const planMeal = day.selectedPlan.meals.find(
              (candidate) => candidate.id === meal
            );

            if (planMeal === undefined) {
              return {
                _tag: "InvalidRoute" as const,
              };
            }

            const mealEntries = yield* mealEntriesService.listForDay({
              input: {
                dateKey,
              },
            });
            const mealEntry = mealEntries.find(
              (entry) => entry.id === mealEntryId && entry.mealId === meal
            );

            if (mealEntry === undefined) {
              return {
                _tag: "InvalidRoute" as const,
              };
            }

            const foods = yield* foodsService.list();

            return {
              _tag: "Ready" as const,
              data: {
                dateKey,
                food: foods.find((food) => food.id === mealEntry.foodId),
                meal,
                mealLabel: planMeal.name,
                mealEntry,
              },
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    data: null,
    dateKey: input.dateKey,
    meal: input.meal,
    mealEntryId: input.mealEntryId,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          meal: context.meal,
          mealEntryId: context.mealEntryId,
        }),
        onDone: ({ event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              InvalidRoute: () => ({ target: "InvalidRoute" }),
              Ready: ({ data }) => ({
                target: "Ready",
                context: { data },
              }),
            })
          ),
        onError: {
          target: "InvalidRoute",
        },
      },
    },
    InvalidRoute: {
      entry: (_, enq) => {
        enq(() => router.replace("/"));
      },
    },
    Ready: {},
  },
});

const editMealEntryRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        data: EditMealEntryRouteData,
        notice: Schema.NullOr(Schema.String),
        quantityGrams: Schema.String,
      })
    ),
    events: {
      changeQuantity: Schema.toStandardSchemaV1(
        Schema.Struct({ quantityGrams: Schema.String })
      ),
      delete: Schema.toStandardSchemaV1(EmptyEvent),
      submit: Schema.toStandardSchemaV1(EmptyEvent),
      replaceDay: Schema.toStandardSchemaV1(
        Schema.Struct({ dateKey: Domain.DateKey })
      ),
    },
    input: Schema.toStandardSchemaV1(EditMealEntryRouteData),
  },
  states: {
    Ready: {},
    Deleting: {},
    Saving: {},
    Deleted: {},
    Saved: {},
  },
  actions: {
    replaceDay: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/days/[dateKey]",
        params,
      });
    },
  },
  actorSources: {
    deleteMealEntry: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(Domain.MealEntryId),
        output: Schema.toStandardSchemaV1(MealEntryMutationResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealEntries = yield* MealEntries.MealEntries;

            yield* mealEntries.delete({
              input: {
                mealEntryId: input,
              },
            });

            return {
              _tag: "Success" as const,
            };
          }).pipe(
            Effect.catchTag("MealEntryNotFound", () =>
              Effect.succeed({
                _tag: "MealEntryNotFound" as const,
              })
            ),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "SchemaError" as const,
              })
            )
          )
        ),
    }),
    reviseMealEntry: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            mealEntryId: Domain.MealEntryId,
            quantityGrams: Schema.String,
          })
        ),
        output: Schema.toStandardSchemaV1(MealEntryMutationResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealEntries = yield* MealEntries.MealEntries;

            yield* mealEntries.revise({
              input: {
                mealEntryId: input.mealEntryId,
                quantityGrams: input.quantityGrams,
              },
            });

            return {
              _tag: "Success" as const,
            };
          }).pipe(
            Effect.catchTag("MealEntryNotFound", () =>
              Effect.succeed({
                _tag: "MealEntryNotFound" as const,
              })
            ),
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
  context: ({ input }) => ({
    data: input,
    notice: null,
    quantityGrams: `${input.mealEntry.quantityGrams}`,
  }),
  initial: "Ready",
  on: {
    replaceDay: ({ actions, event }, enq) => {
      enq(actions.replaceDay, { dateKey: event.dateKey });
    },
  },
  states: {
    Ready: {
      on: {
        changeQuantity: ({ event }) => ({
          context: { quantityGrams: event.quantityGrams },
        }),
        delete: {
          target: "Deleting",
          context: { notice: null },
        },
        submit: {
          target: "Saving",
          context: { notice: null },
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteMealEntry",
        input: ({ context }) => context.data.mealEntry.id,
        onDone: ({ context, event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              MealEntryNotFound: (result) => ({
                target: "Ready",
                context: {
                  notice: _mutationMessage({ result }),
                },
              }),
              SchemaError: (result) => ({
                target: "Ready",
                context: {
                  notice: _mutationMessage({ result }),
                },
              }),
              Success: () => {
                enq(actions.replaceDay, { dateKey: context.data.dateKey });

                return { target: "Deleted" };
              },
            })
          ),
        onError: {
          target: "Ready",
          context: { notice: "Could not delete this entry. Please try again." },
        },
      },
    },
    Saving: {
      invoke: {
        src: "reviseMealEntry",
        input: ({ context }) => ({
          mealEntryId: context.data.mealEntry.id,
          quantityGrams: context.quantityGrams,
        }),
        onDone: ({ context, event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              MealEntryNotFound: (result) => ({
                target: "Ready",
                context: {
                  notice: _mutationMessage({ result }),
                },
              }),
              SchemaError: (result) => ({
                target: "Ready",
                context: {
                  notice: _mutationMessage({ result }),
                },
              }),
              Success: () => {
                enq(actions.replaceDay, { dateKey: context.data.dateKey });

                return { target: "Saved" };
              },
            })
          ),
        onError: {
          target: "Ready",
          context: { notice: "Could not save this entry. Please try again." },
        },
      },
    },
    Deleted: {},
    Saved: {},
  },
});

export default function EditMealEntryScreen() {
  const routeParams = useSchemaLocalSearchParams(EditMealEntryRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  const [snapshot] = useMachine(editMealEntryRouteLoaderMachine, {
    input: {
      dateKey: routeParams.value.dateKey,
      meal: routeParams.value.meal,
      mealEntryId: routeParams.value.mealEntryId,
    },
  });
  const routeState = snapshot.value;

  if (routeState === "Loading" || routeState === "InvalidRoute") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal entry" />
      </AppScreen>
    );
  }

  return snapshot.context.data === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading meal entry" />
    </AppScreen>
  ) : (
    <ReadyEditMealEntryScreen data={snapshot.context.data} />
  );
}

function ReadyEditMealEntryScreen({
  data,
}: {
  readonly data: typeof EditMealEntryRouteData.Type;
}) {
  const [snapshot, , actor] = useMachine(editMealEntryRouteMachine, {
    input: data,
  });
  const routeState = snapshot.value;
  const disabled =
    routeState === "Saving" ||
    routeState === "Saved" ||
    routeState === "Deleting" ||
    routeState === "Deleted";
  const food = data.food;
  const selectedFoodNutrients =
    food === undefined
      ? undefined
      : Schema.decodeOption(Domain.QuantityGrams)(
          Number(snapshot.context.quantityGrams)
        ).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (quantityGrams) =>
              Utils.calculateEntryNutrients({
                food,
                quantityGrams,
              }),
          })
        );
  const mealLabel = data.mealLabel;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <AppScreen contentStyle={styles.content} safeAreaEdges={["top"]}>
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel={`Back to ${mealLabel}`}
              icon={ChevronLeft}
              variant="ghost"
              onPress={() =>
                actor.trigger.replaceDay({ dateKey: data.dateKey })
              }
            />
          }
          shadow
          title={data.food?.name ?? "Meal entry"}
        />

        {snapshot.context.notice === null ? null : (
          <Notice
            message={snapshot.context.notice}
            style={styles.notice}
            tone="danger"
          />
        )}

        <View style={styles.body}>
          <NumberField
            accessibilityLabel={`${mealLabel} quantity in grams`}
            autoFocus
            editable={!disabled}
            label="Grams"
            onChangeText={(quantityGrams) => {
              actor.trigger.changeQuantity({ quantityGrams });
            }}
            placeholder="150"
            rightElement={<Text style={styles.unitLabel}>g</Text>}
            selectTextOnFocus
            value={snapshot.context.quantityGrams}
          />

          {data.food === undefined ? (
            <Notice
              message="This entry points to a food that is no longer available."
              tone="warning"
            />
          ) : (
            <FoodNutrientOverview
              brand={data.food.brand}
              name={data.food.name}
              nutrients={selectedFoodNutrients}
              secondaryLabel={`${data.mealEntry.quantityGrams} g logged`}
            />
          )}
        </View>
      </AppScreen>

      <BottomActionBar>
        <Button
          disabled={disabled}
          icon={Trash2}
          onPress={() => {
            Alert.alert(
              "Delete entry",
              "This removes the meal entry from this day.",
              [
                {
                  style: "cancel",
                  text: "Cancel",
                },
                {
                  onPress: () => {
                    actor.trigger.delete();
                  },
                  style: "destructive",
                  text: "Delete",
                },
              ]
            );
          }}
          style={styles.footerButton}
          variant="danger"
        >
          Delete
        </Button>
        <Button
          disabled={disabled || snapshot.context.quantityGrams.trim() === ""}
          icon={Save}
          loading={routeState === "Saving"}
          onPress={() => {
            actor.trigger.submit();
          }}
          style={styles.footerButton}
        >
          Save
        </Button>
      </BottomActionBar>
    </KeyboardAvoidingView>
  );
}

function _mutationMessage({
  result,
}: {
  readonly result: MealEntryMutationResult;
}) {
  if (result._tag === "MealEntryNotFound") {
    return "This meal entry is no longer available.";
  }

  if (result._tag === "SchemaError") {
    return "Enter a quantity greater than zero.";
  }

  return "";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  notice: {
    marginBottom: spacing.md,
  },
  body: {
    gap: spacing.lg,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  unitLabel: {
    color: color.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },
  footerButton: {
    flex: 1,
  },
});
