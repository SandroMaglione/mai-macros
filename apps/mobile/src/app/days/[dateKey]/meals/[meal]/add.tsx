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
import {
  FoodNutrientOverview,
  FoodSearchField,
  FoodSearchResults,
} from "@/components/nutrition";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { DailyLogs, Domain, Foods, MealEntries, Utils } from "@mai/nutrition";
import { FoodSearchMachine } from "@mai/machines";
import { useMachine } from "@xstate/react";
import { Array as EffectArray, Effect, Option, Order, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { Check, ChevronLeft, Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  assertEvent,
  assign,
  fromPromise,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";

type AddMealFoodRouteData = {
  readonly dateKey: Domain.DateKey;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly foods: readonly Domain.Food[];
  readonly meal: Domain.MealId;
  readonly mealLabel: string;
};

type AddMealFoodRouteLoadResult =
  | {
      readonly _tag: "InvalidRoute";
    }
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: Domain.DateKey;
    }
  | {
      readonly _tag: "Ready";
      readonly data: AddMealFoodRouteData;
    };

type AddMealFoodRouteEvent =
  | FoodSearchMachine.FoodSearchSelectedEvent
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
  readonly dateKey: Domain.DateKey;
  readonly foodSearchActor: ActorRefFrom<
    typeof FoodSearchMachine.foodSearchMachine
  >;
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
  readonly meal: Domain.MealId;
  readonly mealLabel: string;
  readonly notice: string | null;
  readonly quantityGrams: string;
  readonly selectedFood: Domain.Food | null;
};

const AddMealFoodRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

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
        readonly input: MealEntries.CreateMealEntryInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const mealEntries = yield* MealEntries.MealEntries;
          yield* mealEntries.create({
            input: input.input,
          });

          return "added" as const;
        }).pipe(
          Effect.catchTag("FoodNotFound", () =>
            Effect.succeed("foodNotFound" as const)
          ),
          Effect.catchTag("MealNotFound", () =>
            Effect.succeed("foodNotFound" as const)
          )
        )
      )
    ),
    foodSearch: FoodSearchMachine.foodSearchMachine,
  },
}).createMachine({
  context: ({ input, spawn }) => {
    const mealFoodRecencyOrder = Order.mapInput(
      Order.flip(Order.Number),
      (food: Domain.Food) =>
        _findFoodUsage({
          foodId: food.id,
          foodUsage: input.foodUsage,
        })?.meals.find((usage) => usage.mealId === input.meal)?.latestUsedAt
          .epochMilliseconds ?? Number.NEGATIVE_INFINITY
    );

    return {
      dateKey: input.dateKey,
      foodSearchActor: spawn("foodSearch", {
        id: "addMealFoodRouteFoodSearch",
        input: {
          foods: EffectArray.sortBy(
            mealFoodRecencyOrder,
            FoodSearchMachine.foodUserOriginOrder,
            FoodSearchMachine.foodLowercaseNameOrder
          )(input.foods),
        },
      }),
      foodUsage: input.foodUsage,
      meal: input.meal,
      mealLabel: input.mealLabel,
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
                : foodUsage.meals.find(
                    (usage) => usage.mealId === context.meal
                  );
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
            } satisfies FoodSearchMachine.FoodSearchEvent),
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
              mealId: context.meal,
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

              if (context.dateKey === today) {
                _replacePath("/");
                return;
              }

              _replacePath({
                pathname: "/days/[dateKey]",
                params: {
                  dateKey: context.dateKey,
                },
              });
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
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.MealId;
      readonly message: string | null;
    },
    input: {} as {
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.MealId;
    },
  },
  actors: {
    loadRouteData: fromPromise<
      AddMealFoodRouteLoadResult,
      {
        readonly dateKey: Domain.DateKey;
        readonly meal: Domain.MealId;
      }
    >(({ input }) => RuntimeClient.runPromise(loadAddMealFoodRouteData(input))),
  },
}).createMachine({
  context: ({ input }) => ({
    data: null,
    dateKey: input.dateKey,
    meal: input.meal,
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          meal: context.meal,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "InvalidRoute",
            target: "Failed",
            actions: assign({
              message: "Could not find this meal.",
            }),
          },
          {
            guard: ({ event }) => event.output._tag === "NoMealPlans",
            target: "Redirected",
            actions: ({ event }) => {
              const output = event.output;

              if (output._tag === "NoMealPlans") {
                _replacePath({
                  pathname: "/plans/new",
                  params: {
                    dateKey: output.dateKey,
                  },
                });
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
  const routeParams = useSchemaLocalSearchParams(AddMealFoodRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  const [snapshot] = useMachine(addMealFoodRouteLoaderMachine, {
    input: {
      dateKey: routeParams.value.dateKey,
      meal: routeParams.value.meal,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <AppScreen contentStyle={styles.centered}>
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
      </AppScreen>
    );
  }

  return snapshot.context.data === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading meal" />
    </AppScreen>
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
  const {
    dateKey,
    foodSearchActor,
    foodUsage,
    meal,
    mealLabel,
    notice,
    quantityGrams,
  } = snapshot.context;
  const selectedFood = snapshot.context.selectedFood;
  const disabled =
    snapshot.matches("Submitting") || snapshot.matches("Submitted");
  const clearSelectedFoodEvent = {
    type: "clearSelectedFood",
  } satisfies AddMealFoodRouteEvent;
  const submitEvent = { type: "submit" } satisfies AddMealFoodRouteEvent;
  const submitDisabled = disabled || !snapshot.can(submitEvent);
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        });
  const selectedMealUsage = selectedFoodUsage?.meals.find(
    (usage) => usage.mealId === meal
  );
  const selectedFoodQuantityLabel =
    selectedFoodUsage === undefined || selectedMealUsage === undefined
      ? undefined
      : `${_formatPreciseNumber({
          value: selectedFoodUsage.latestQuantityGrams,
        })} g previous`;
  const selectedFoodNutrients =
    selectedFood === null
      ? undefined
      : Schema.decodeOption(Domain.QuantityGrams)(Number(quantityGrams)).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (validatedQuantityGrams) =>
              Utils.calculateEntryNutrients({
                food: selectedFood,
                quantityGrams: validatedQuantityGrams,
              }),
          })
        );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={selectedFood === null ? ["top", "bottom"] : ["top"]}
      >
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel={
                snapshot.can(clearSelectedFoodEvent)
                  ? "Back to food selection"
                  : `Back to ${dateKey}`
              }
              icon={ChevronLeft}
              onPress={() => {
                if (snapshot.can(clearSelectedFoodEvent)) {
                  actor.send(clearSelectedFoodEvent);
                  return;
                }

                _replacePath({
                  pathname: "/days/[dateKey]",
                  params: {
                    dateKey,
                  },
                });
              }}
              variant="ghost"
            />
          }
          shadow
          style={selectedFood === null ? styles.searchHeader : undefined}
          title={mealLabel}
          trailing={
            selectedFood === null ? (
              <IconButton
                accessibilityLabel="Create food"
                icon={Plus}
                onPress={() => {
                  router.push({
                    pathname: "/foods/new",
                    params: {
                      dateKey,
                    },
                  });
                }}
                variant="ghost"
              />
            ) : (
              <IconButton
                accessibilityLabel={`Add food to ${mealLabel}`}
                disabled={submitDisabled}
                icon={Check}
                onPress={() => {
                  actor.send(submitEvent);
                }}
                variant="ghost"
              />
            )
          }
        >
          {selectedFood === null ? (
            <FoodSearchField actor={foodSearchActor} disabled={disabled} />
          ) : null}
        </AppHeader>

        {notice === null ? null : (
          <Notice message={notice} tone="danger" style={styles.notice} />
        )}

        {selectedFood === null ? (
          <View style={styles.searchBody}>
            <FoodSearchResults
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
                  (usage) => usage.mealId === meal
                );
                const nutrients =
                  foodHistory === undefined || mealHistory === undefined
                    ? undefined
                    : Utils.calculateEntryNutrients({
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
                  (usage) => usage.mealId === meal
                );

                return foodHistory === undefined || mealHistory === undefined
                  ? undefined
                  : `${_formatPreciseNumber({
                      value: foodHistory.latestQuantityGrams,
                    })} g`;
              }}
            />
          </View>
        ) : (
          <QuantityEntry
            actor={actor}
            disabled={disabled}
            mealLabel={mealLabel}
            quantityGrams={quantityGrams}
            selectedFood={selectedFood}
            selectedFoodNutrients={selectedFoodNutrients}
            selectedFoodQuantityLabel={selectedFoodQuantityLabel}
            submitDisabled={submitDisabled}
          />
        )}
      </AppScreen>
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
  readonly selectedFood: Domain.Food;
  readonly selectedFoodNutrients:
    | ReturnType<typeof Utils.calculateEntryNutrients>
    | undefined;
  readonly selectedFoodQuantityLabel: string | undefined;
  readonly submitDisabled: boolean;
}) {
  return (
    <View style={styles.quantityLayout}>
      <View style={styles.quantityBody}>
        <NumberField
          accessibilityLabel={`${mealLabel} quantity in grams`}
          autoFocus
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
          selectTextOnFocus
          value={quantityGrams}
        />
        <FoodNutrientOverview
          brand={selectedFood.brand}
          name={selectedFood.name}
          nutrients={selectedFoodNutrients}
          secondaryLabel={selectedFoodQuantityLabel}
        />
      </View>
      <BottomActionBar>
        <Button
          accessibilityLabel={`Add food to ${mealLabel}`}
          disabled={submitDisabled}
          icon={Check}
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
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.MealId;
}) {
  return Effect.gen(function* () {
    const dailyLogs = yield* DailyLogs.DailyLogs;
    const foodsService = yield* Foods.Foods;
    const mealEntriesService = yield* MealEntries.MealEntries;
    const day = yield* dailyLogs.open({
      input: {
        dateKey,
      },
    });
    const foods = yield* foodsService.list();
    const foodUsage = yield* mealEntriesService.listFoodUsage();
    const planMeal = day.selectedPlan.meals.find(
      (candidate) => candidate.id === meal
    );

    if (planMeal === undefined) {
      return {
        _tag: "InvalidRoute" as const,
      };
    }

    return {
      _tag: "Ready" as const,
      data: {
        dateKey: day.dailyLog.dateKey,
        foodUsage,
        foods,
        meal,
        mealLabel: planMeal.name,
      },
    };
  }).pipe(
    Effect.catchTag("NoMealPlans", ({ dateKey }) =>
      Effect.succeed({
        _tag: "NoMealPlans" as const,
        dateKey,
      })
    )
  );
}

function _findFoodUsage({
  foodId,
  foodUsage,
}: {
  readonly foodId: Domain.Food["id"];
  readonly foodUsage: readonly MealEntries.MealFoodUsage[];
}) {
  return foodUsage.find((usage) => usage.foodId === foodId);
}

function _replacePath(path: Parameters<typeof router.replace>[0]) {
  router.replace(path);
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
    paddingBottom: 0,
  },
  searchHeader: {
    marginBottom: 0,
  },
  searchBody: {
    flex: 1,
    marginHorizontal: -spacing.lg,
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
