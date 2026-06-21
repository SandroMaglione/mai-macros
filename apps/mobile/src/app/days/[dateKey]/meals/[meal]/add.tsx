import {
  BottomActionBar,
  Button,
  IconButton,
  LoadingView,
  MaiHeader,
  Notice,
  NumberField,
} from "@/components/ui";
import {
  FoodDefaultOriginDot,
  FoodNutrientOverview,
  FoodSearch,
} from "@/components/nutrition";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import {
  calculateEntryNutrients,
  DateKey,
  type Food,
  Meal,
  QuantityGrams,
} from "@mai/nutrition";
import {
  foodLowercaseNameOrder,
  foodSearchMachine,
  foodUserOriginOrder,
  type FoodSearchEvent,
  type FoodSearchSelectedEvent,
} from "@mai/machines/foods";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import {
  MealEntries,
  type CreateMealEntryInput,
  type MealFoodUsage,
} from "@mai/nutrition/services/meal-entries";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, Effect, Option, Order, Schema } from "effect";
import { router, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  assertEvent,
  assign,
  fromPromise,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

type AddMealFoodRouteData = {
  readonly dateKey: DateKey;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly meal: Meal;
};

type AddMealFoodRouteLoadResult =
  | {
      readonly _tag: "InvalidRoute";
    }
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: DateKey;
    }
  | {
      readonly _tag: "Ready";
      readonly data: AddMealFoodRouteData;
    };

type AddMealFoodRouteEvent =
  | FoodSearchSelectedEvent
  | {
      readonly type: "changeQuantity";
      readonly quantityGrams: string;
    }
  | {
      readonly type: "clearNotice";
    }
  | {
      readonly type: "clearSelectedFood";
    }
  | {
      readonly type: "submit";
    };

type AddMealFoodRouteContext = {
  readonly dateKey: DateKey;
  readonly foodSearchActor: ActorRefFrom<typeof foodSearchMachine>;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly meal: Meal;
  readonly notice: string | null;
  readonly quantityGrams: string;
  readonly selectedFood: Food | null;
};

const mealLabels = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
} satisfies Record<Meal, string>;

const addMealFoodRouteMachine = setup({
  types: {
    context: {} as AddMealFoodRouteContext,
    events: {} as AddMealFoodRouteEvent,
    input: {} as AddMealFoodRouteData,
  },
  actors: {
    addMealEntry: fromPromise<
      "added" | "foodNotFound",
      {
        readonly input: CreateMealEntryInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries;
          yield* mealEntries.create({
            input: input.input,
          });

          return "added" as const;
        }).pipe(
          Effect.catchTag("FoodNotFound", () =>
            Effect.succeed("foodNotFound" as const)
          )
        )
      )
    ),
    foodSearch: foodSearchMachine,
  },
}).createMachine({
  context: ({ input, spawn }) => {
    const mealFoodRecencyOrder = Order.mapInput(
      Order.flip(Order.Number),
      (food: Food) =>
        _findFoodUsage({
          foodId: food.id,
          foodUsage: input.foodUsage,
        })?.meals.find((usage) => usage.meal === input.meal)?.latestUsedAt
          .epochMilliseconds ?? Number.NEGATIVE_INFINITY
    );

    return {
      dateKey: input.dateKey,
      foodSearchActor: spawn("foodSearch", {
        id: "addMealFoodRouteFoodSearch",
        input: {
          foods: EffectArray.sortBy(
            mealFoodRecencyOrder,
            foodUserOriginOrder,
            foodLowercaseNameOrder
          )(input.foods),
        },
      }),
      foodUsage: input.foodUsage,
      meal: input.meal,
      notice: null,
      quantityGrams: "",
      selectedFood: null,
    };
  },
  initial: "SelectingFood",
  states: {
    SelectingFood: {
      on: {
        clearNotice: {
          actions: assign({
            notice: null,
          }),
        },
        foodSearchSelected: {
          target: "EnteringQuantity",
          actions: assign(({ context, event }) => {
            const selectedFood =
              event.selection === "firstMatching"
                ? (event.food ?? context.selectedFood)
                : event.food;
            const foodUsage =
              event.food === null
                ? undefined
                : _findFoodUsage({
                    foodId: event.food.id,
                    foodUsage: context.foodUsage,
                  });
            const mealUsage =
              foodUsage === undefined
                ? undefined
                : foodUsage.meals.find((usage) => usage.meal === context.meal);
            const previousQuantityGrams = context.quantityGrams.trim();
            const recentQuantityGrams =
              foodUsage === undefined || mealUsage === undefined
                ? ""
                : _formatPreciseNumber({
                    value: foodUsage.latestQuantityGrams,
                  });
            const quantityGrams =
              event.selection === "firstMatching" &&
              (event.food === null || previousQuantityGrams !== "")
                ? context.quantityGrams
                : recentQuantityGrams;

            return {
              notice: null,
              quantityGrams,
              selectedFood,
            };
          }),
        },
      },
    },
    EnteringQuantity: {
      on: {
        changeQuantity: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeQuantity");

            return {
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        clearNotice: {
          actions: assign({
            notice: null,
          }),
        },
        clearSelectedFood: {
          target: "SelectingFood",
          actions: [
            assign({
              selectedFood: null,
            }),
            sendTo(({ context }) => context.foodSearchActor, {
              type: "clearSelectedFood",
            } satisfies FoodSearchEvent),
          ],
        },
        submit: {
          guard: ({ context }) =>
            context.selectedFood !== null &&
            context.quantityGrams.trim() !== "",
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "addMealEntry",
        input: ({ context }) => {
          if (context.selectedFood === null) {
            throw new Error("Cannot submit without a selected food.");
          }

          return {
            input: {
              dateKey: context.dateKey,
              foodId: context.selectedFood.id,
              meal: context.meal,
              quantityGrams: context.quantityGrams,
            },
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output === "foodNotFound",
            target: "EnteringQuantity",
            actions: assign({
              notice:
                "Could not find that food. Pick another food and try again.",
            }),
          },
          {
            target: "Submitted",
            actions: ({ context }) => {
              const today = todayDateKey();

              _replacePath(
                context.dateKey === today ? "/" : `/days/${context.dateKey}`
              );
            },
          },
        ],
        onError: {
          target: "EnteringQuantity",
          actions: assign({
            notice:
              "Could not add the meal entry. Check the quantity and try again.",
          }),
        },
      },
    },
    Submitted: {},
  },
});

type AddMealFoodRouteActorRef = ActorRefFrom<typeof addMealFoodRouteMachine>;

const addMealFoodRouteLoaderMachine = setup({
  types: {
    context: {} as {
      readonly data: AddMealFoodRouteData | null;
      readonly dateKeyParam: string | undefined;
      readonly mealParam: string | undefined;
      readonly message: string | null;
    },
    input: {} as {
      readonly dateKeyParam: string | undefined;
      readonly mealParam: string | undefined;
    },
  },
  actors: {
    loadRouteData: fromPromise<
      AddMealFoodRouteLoadResult,
      {
        readonly dateKeyParam: string | undefined;
        readonly mealParam: string | undefined;
      }
    >(({ input }) => RuntimeClient.runPromise(loadAddMealFoodRouteData(input))),
  },
}).createMachine({
  context: ({ input }) => ({
    data: null,
    dateKeyParam: input.dateKeyParam,
    mealParam: input.mealParam,
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => ({
          dateKeyParam: context.dateKeyParam,
          mealParam: context.mealParam,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "InvalidRoute",
            target: "Redirected",
            actions: () => {
              _replacePath("/");
            },
          },
          {
            guard: ({ event }) => event.output._tag === "NoMealPlans",
            target: "Redirected",
            actions: ({ event }) => {
              const output = event.output;

              if (output._tag === "NoMealPlans") {
                _replacePath(`/plans/new?dateKey=${output.dateKey}`);
              }
            },
          },
          {
            guard: ({ event }) => event.output._tag === "Ready",
            target: "Ready",
            actions: assign(({ event }) => ({
              data: getAddMealFoodRouteData({ result: event.output }),
            })),
          },
        ],
        onError: {
          target: "Failed",
          actions: assign({
            message: "Could not load this meal.",
          }),
        },
      },
    },
    Failed: {},
    Ready: {},
    Redirected: {},
  },
});

export default function AddMealFoodRoute() {
  const params = useLocalSearchParams<{
    readonly dateKey?: string | string[];
    readonly meal?: string | string[];
  }>();
  const dateKeyParam = _firstParam(params.dateKey);
  const mealParam = _firstParam(params.meal);
  const [snapshot] = useMachine(addMealFoodRouteLoaderMachine, {
    input: {
      dateKeyParam,
      mealParam,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return <LoadingView message="Loading meal" />;
  }

  if (snapshot.matches("Failed")) {
    return (
      <View style={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load this meal."}
          tone="danger"
        />
        <Button
          onPress={() => {
            _replacePath("/");
          }}
          variant="secondary"
        >
          Go home
        </Button>
      </View>
    );
  }

  return snapshot.context.data === null ? (
    <LoadingView message="Loading meal" />
  ) : (
    <ReadyAddMealFoodRoute data={snapshot.context.data} />
  );
}

function ReadyAddMealFoodRoute({
  data,
}: {
  readonly data: AddMealFoodRouteData;
}) {
  const [snapshot, , actor] = useMachine(addMealFoodRouteMachine, {
    input: data,
  });
  const { dateKey, foodSearchActor, foodUsage, meal, notice, quantityGrams } =
    snapshot.context;
  const selectedFood = snapshot.context.selectedFood;
  const disabled =
    snapshot.matches("Submitting") || snapshot.matches("Submitted");
  const submitEvent = { type: "submit" } satisfies AddMealFoodRouteEvent;
  const mealLabel = mealLabels[meal];
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        });
  const selectedMealUsage = selectedFoodUsage?.meals.find(
    (usage) => usage.meal === meal
  );
  const selectedFoodQuantityLabel =
    selectedFoodUsage === undefined || selectedMealUsage === undefined
      ? "No previous"
      : `${_formatPreciseNumber({
          value: selectedFoodUsage.latestQuantityGrams,
        })} g previous`;
  const selectedFoodNutrients =
    selectedFood === null
      ? undefined
      : Schema.decodeOption(QuantityGrams)(Number(quantityGrams)).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (validatedQuantityGrams) =>
              calculateEntryNutrients({
                food: selectedFood,
                quantityGrams: validatedQuantityGrams,
              }),
          })
        );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.content}>
        <MaiHeader
          action={
            <IconButton
              accessibilityLabel={`Back to ${dateKey}`}
              glyph="‹"
              onPress={() => {
                _replacePath(`/days/${dateKey}`);
              }}
              variant="ghost"
            />
          }
          eyebrow={dateKey}
          title={mealLabel}
        />

        {notice === null ? null : (
          <Notice message={notice} tone="danger" style={styles.notice} />
        )}

        {selectedFood === null ? (
          <FoodSearch
            actor={foodSearchActor}
            disabled={disabled}
            emptyFoodsText="Create a food before logging this meal."
            emptySearchText="No foods found."
            getPrimaryLabel={(food) => {
              const foodHistory = _findFoodUsage({
                foodId: food.id,
                foodUsage,
              });
              const mealHistory = foodHistory?.meals.find(
                (usage) => usage.meal === meal
              );
              const nutrients =
                foodHistory === undefined || mealHistory === undefined
                  ? undefined
                  : calculateEntryNutrients({
                      food,
                      quantityGrams: foodHistory.latestQuantityGrams,
                    });

              return nutrients === undefined
                ? "New"
                : `${formatNumber({
                    maximumFractionDigits: 0,
                    value: nutrients.energyKcal,
                  })} kcal`;
            }}
            getSecondaryLabel={(food) => {
              const foodHistory = _findFoodUsage({
                foodId: food.id,
                foodUsage,
              });
              const mealHistory = foodHistory?.meals.find(
                (usage) => usage.meal === meal
              );

              return foodHistory === undefined || mealHistory === undefined
                ? "No previous"
                : `${_formatPreciseNumber({
                    value: foodHistory.latestQuantityGrams,
                  })} g`;
            }}
          />
        ) : (
          <QuantityEntry
            actor={actor}
            disabled={disabled}
            mealLabel={mealLabel}
            quantityGrams={quantityGrams}
            selectedFood={selectedFood}
            selectedFoodNutrients={selectedFoodNutrients}
            selectedFoodQuantityLabel={selectedFoodQuantityLabel}
            submitDisabled={disabled || !snapshot.can(submitEvent)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function QuantityEntry({
  actor,
  disabled,
  mealLabel,
  quantityGrams,
  selectedFood,
  selectedFoodNutrients,
  selectedFoodQuantityLabel,
  submitDisabled,
}: {
  readonly actor: AddMealFoodRouteActorRef;
  readonly disabled: boolean;
  readonly mealLabel: string;
  readonly quantityGrams: string;
  readonly selectedFood: Food;
  readonly selectedFoodNutrients:
    | ReturnType<typeof calculateEntryNutrients>
    | undefined;
  readonly selectedFoodQuantityLabel: string;
  readonly submitDisabled: boolean;
}) {
  return (
    <View style={styles.quantityLayout}>
      <View style={styles.quantityBody}>
        <NumberField
          accessibilityLabel={`${mealLabel} quantity in grams`}
          editable={!disabled}
          label="Grams"
          onChangeText={(value) => {
            actor.send({
              quantityGrams: value,
              type: "changeQuantity",
            });
          }}
          placeholder="150"
          rightElement={<Text style={styles.unitLabel}>g</Text>}
          value={quantityGrams}
        />
        <FoodNutrientOverview
          brand={selectedFood.brand}
          name={selectedFood.name}
          namePrefix={<FoodDefaultOriginDot food={selectedFood} />}
          nutrients={selectedFoodNutrients}
          secondaryLabel={selectedFoodQuantityLabel}
        />
      </View>
      <BottomActionBar>
        <Button
          disabled={disabled}
          onPress={() => {
            actor.send({
              type: "clearSelectedFood",
            });
          }}
          style={styles.footerButton}
          variant="secondary"
        >
          Change food
        </Button>
        <Button
          accessibilityLabel={`Add food to ${mealLabel}`}
          disabled={submitDisabled}
          loading={disabled}
          onPress={() => {
            actor.send({
              type: "submit",
            });
          }}
          style={styles.footerButton}
        >
          Add
        </Button>
      </BottomActionBar>
    </View>
  );
}

export function getAddMealFoodRouteData({
  result,
}: {
  readonly result: AddMealFoodRouteLoadResult;
}): AddMealFoodRouteData {
  if (result._tag !== "Ready") {
    throw new Error("Expected add meal food route data.");
  }

  return result.data;
}

export function loadAddMealFoodRouteData({
  dateKeyParam,
  mealParam,
}: {
  readonly dateKeyParam: string | undefined;
  readonly mealParam: string | undefined;
}) {
  return Effect.gen(function* () {
    const dateKey = yield* Schema.decodeUnknownEffect(DateKey)(dateKeyParam);
    const meal = yield* Schema.decodeUnknownEffect(Meal)(mealParam);
    const dailyLogs = yield* DailyLogs;
    const foodsService = yield* Foods;
    const mealEntriesService = yield* MealEntries;
    const day = yield* dailyLogs.open({
      input: {
        dateKey,
      },
    });
    const foods = yield* foodsService.list();
    const foodUsage = yield* mealEntriesService.listFoodUsage();

    return {
      _tag: "Ready" as const,
      data: {
        dateKey: day.dailyLog.dateKey,
        foodUsage,
        foods,
        meal,
      },
    };
  }).pipe(
    Effect.catchTag("NoMealPlans", ({ dateKey }) =>
      Effect.succeed({
        _tag: "NoMealPlans" as const,
        dateKey,
      })
    ),
    Effect.catchTag("SchemaError", () =>
      Effect.succeed({
        _tag: "InvalidRoute" as const,
      })
    )
  );
}

function _findFoodUsage({
  foodId,
  foodUsage,
}: {
  readonly foodId: Food["id"];
  readonly foodUsage: readonly MealFoodUsage[];
}) {
  return foodUsage.find((usage) => usage.foodId === foodId);
}

function _firstParam(param: string | string[] | undefined) {
  return globalThis.Array.isArray(param) ? param[0] : param;
}

function _replacePath(path: string) {
  router.replace(path as Parameters<typeof router.replace>[0]);
}

function _formatPreciseNumber({ value }: { readonly value: number }) {
  return formatNumber({
    maximumFractionDigits: 2,
    value,
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
  },
  notice: {
    marginBottom: spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: color.bg,
  },
  quantityLayout: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  quantityBody: {
    flex: 1,
    gap: spacing.lg,
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
