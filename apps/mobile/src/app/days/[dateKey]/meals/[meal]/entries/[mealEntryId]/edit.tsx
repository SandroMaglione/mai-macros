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
import { FoodNutrientOverview } from "@/components/nutrition";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { DailyLogs, Domain, Foods, MealEntries, Utils } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Save, Trash2 } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type EditMealEntryRouteData = {
  readonly dateKey: Domain.DateKey;
  readonly food: Domain.Food | undefined;
  readonly meal: Domain.MealId;
  readonly mealLabel: string;
  readonly mealEntry: Domain.MealEntry;
};

type MealEntryMutationResult =
  | {
      readonly _tag: "MealEntryNotFound";
    }
  | {
      readonly _tag: "SchemaError";
    }
  | {
      readonly _tag: "Success";
    };

const EditMealEntryRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

const editMealEntryRouteLoaderMachine = setup({
  types: {
    context: {} as {
      readonly data: EditMealEntryRouteData | null;
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.MealId;
      readonly mealEntryId: Domain.MealEntryId;
    },
    input: {} as {
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.MealId;
      readonly mealEntryId: Domain.MealEntryId;
    },
  },
  actors: {
    loadRouteData: fromPromise<
      | {
          readonly _tag: "InvalidRoute";
        }
      | {
          readonly _tag: "Ready";
          readonly data: EditMealEntryRouteData;
        },
      {
        readonly dateKey: Domain.DateKey;
        readonly meal: Domain.MealId;
        readonly mealEntryId: Domain.MealEntryId;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(loadEditMealEntryRouteData(input))
    ),
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
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "InvalidRoute",
            target: "InvalidRoute",
          },
          {
            guard: ({ event }) => event.output._tag === "Ready",
            target: "Ready",
            actions: assign(({ event }) => ({
              data: event.output._tag === "Ready" ? event.output.data : null,
            })),
          },
        ],
        onError: {
          target: "InvalidRoute",
        },
      },
    },
    InvalidRoute: {
      entry: () => {
        router.replace("/");
      },
    },
    Ready: {},
  },
});

const editMealEntryRouteMachine = setup({
  types: {
    context: {} as {
      readonly data: EditMealEntryRouteData;
      readonly notice: string | null;
      readonly quantityGrams: string;
    },
    events: {} as
      | {
          readonly quantityGrams: string;
          readonly type: "changeQuantity";
        }
      | {
          readonly type: "delete";
        }
      | {
          readonly type: "submit";
        },
    input: {} as EditMealEntryRouteData,
  },
  actors: {
    deleteMealEntry: fromPromise<MealEntryMutationResult, Domain.MealEntryId>(
      ({ input }) =>
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
        )
    ),
    reviseMealEntry: fromPromise<
      MealEntryMutationResult,
      {
        readonly mealEntryId: Domain.MealEntryId;
        readonly quantityGrams: string;
      }
    >(({ input }) =>
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
      )
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    data: input,
    notice: null,
    quantityGrams: `${input.mealEntry.quantityGrams}`,
  }),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        changeQuantity: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeQuantity");

            return {
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        delete: {
          target: "Deleting",
          actions: assign({
            notice: null,
          }),
        },
        submit: {
          target: "Saving",
          actions: assign({
            notice: null,
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteMealEntry",
        input: ({ context }) => context.data.mealEntry.id,
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "Success",
            target: "Deleted",
            actions: ({ context }) => {
              _replaceDay({ dateKey: context.data.dateKey });
            },
          },
          {
            target: "Ready",
            actions: assign(({ event }) => ({
              notice: _mutationMessage({ result: event.output }),
            })),
          },
        ],
        onError: {
          target: "Ready",
          actions: assign({
            notice: "Could not delete this entry. Please try again.",
          }),
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
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "Success",
            target: "Saved",
            actions: ({ context }) => {
              _replaceDay({ dateKey: context.data.dateKey });
            },
          },
          {
            target: "Ready",
            actions: assign(({ event }) => ({
              notice: _mutationMessage({ result: event.output }),
            })),
          },
        ],
        onError: {
          target: "Ready",
          actions: assign({
            notice: "Could not save this entry. Please try again.",
          }),
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

  if (snapshot.matches("Loading") || snapshot.matches("InvalidRoute")) {
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
  readonly data: EditMealEntryRouteData;
}) {
  const [snapshot, send] = useMachine(editMealEntryRouteMachine, {
    input: data,
  });
  const disabled =
    snapshot.matches("Saving") ||
    snapshot.matches("Saved") ||
    snapshot.matches("Deleting") ||
    snapshot.matches("Deleted");
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
              onPress={() => {
                _replaceDay({ dateKey: data.dateKey });
              }}
              variant="ghost"
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
              send({
                quantityGrams,
                type: "changeQuantity",
              });
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
                    send({
                      type: "delete",
                    });
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
          loading={snapshot.matches("Saving")}
          onPress={() => {
            send({
              type: "submit",
            });
          }}
          style={styles.footerButton}
        >
          Save
        </Button>
      </BottomActionBar>
    </KeyboardAvoidingView>
  );
}

export function loadEditMealEntryRouteData({
  dateKey,
  mealEntryId,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly mealEntryId: Domain.MealEntryId;
  readonly meal: Domain.MealId;
}) {
  return Effect.gen(function* () {
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
  });
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

function _replaceDay({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  router.replace({
    pathname: "/days/[dateKey]",
    params: {
      dateKey,
    },
  });
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
