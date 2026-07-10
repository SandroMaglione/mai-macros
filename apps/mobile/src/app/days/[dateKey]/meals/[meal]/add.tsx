import {
  AppHeader,
  AppScreen,
  BottomActionBar,
  Button,
  IconButton,
  InputSelect,
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
import * as FoodMeasurements from "@/lib/food-measurements";
import { formatLoggedFoodQuantity, formatNumber } from "@/lib/format";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { EmptyEvent, FoodSearchMachine } from "@mai/machines";
import { useMachine } from "@xstate/react";
import { Array, Effect, Match, Option, Order, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { Check, ChevronLeft, Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Actor, createAsyncLogic, setup } from "xstate";

const MealFoodUsage = Schema.Struct({
  foodId: Domain.FoodId,
  latestQuantity: Domain.LoggedFoodQuantity,
  latestUsedAt: Schema.DateTimeUtcFromMillis,
  meals: Schema.Array(
    Schema.Struct({
      latestQuantity: Domain.LoggedFoodQuantity,
      latestUsedAt: Schema.DateTimeUtcFromMillis,
      mealId: Domain.MealId,
    })
  ),
});

const AddMealFoodRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  foodUsage: Schema.Array(MealFoodUsage),
  foods: Schema.Array(Domain.Food),
  meal: Domain.MealId,
  mealLabel: Schema.NonEmptyString,
});

type AddMealFoodRouteData = typeof AddMealFoodRouteData.Type;

const AddMealEntryInput = Schema.Struct({
  dateKey: Domain.DateKey,
  foodId: Domain.FoodId,
  mealId: Domain.MealId,
  quantity: FoodMeasurements.MealEntryQuantityFormInput,
});

const AddMealEntryResult = Schema.Union([
  Schema.TaggedStruct("FoodNotFound", {}),
  Schema.TaggedStruct("MealNotFound", {}),
  Schema.TaggedStruct("SchemaError", {}),
  Schema.TaggedStruct("Success", {}),
]);

const AddMealFoodRouteLoaderInput = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

const AddMealFoodRouteLoadResult = Schema.Union([
  Schema.TaggedStruct("InvalidRoute", {}),
  Schema.TaggedStruct("NoMealPlans", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("Ready", {
    data: AddMealFoodRouteData,
  }),
  Schema.TaggedStruct("UnrecordedDay", {
    dateKey: Domain.DateKey,
  }),
]);

const FoodSearchSelectedEvent = Schema.Struct({
  food: Schema.NullOr(Domain.Food),
  selection: Schema.Literals(["explicit", "firstMatching"]),
});

const FoodSearchActorSchema =
  Schema.declare<FoodSearchMachine.FoodSearchActorRef>(
    (value): value is FoodSearchMachine.FoodSearchActorRef =>
      value instanceof Actor &&
      value.logic === FoodSearchMachine.foodSearchMachine,
    { expected: "FoodSearchActor" }
  );

const AddMealFoodRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

const addMealFoodRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Domain.DateKey,
        foodSearchActor: FoodSearchActorSchema,
        foodUsage: Schema.Array(MealFoodUsage),
        meal: Domain.MealId,
        mealLabel: Schema.NonEmptyString,
        notice: Schema.NullOr(Schema.String),
        quantityAmount: Schema.String,
        quantityUnit: Domain.MeasurementUnit,
        portionId: Schema.NullOr(Domain.FoodPortionId),
        selectedFood: Schema.NullOr(Domain.Food),
      })
    ),
    events: {
      changeQuantity: Schema.toStandardSchemaV1(
        Schema.Struct({ quantityAmount: Schema.String })
      ),
      selectMeasurementUnit: Schema.toStandardSchemaV1(
        Schema.Struct({ unit: Domain.MeasurementUnit })
      ),
      selectPortion: Schema.toStandardSchemaV1(
        Schema.Struct({ portionId: Domain.FoodPortionId })
      ),
      clearNotice: Schema.toStandardSchemaV1(EmptyEvent),
      clearSelectedFood: Schema.toStandardSchemaV1(EmptyEvent),
      foodSearchSelected: Schema.toStandardSchemaV1(FoodSearchSelectedEvent),
      submit: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(AddMealFoodRouteData),
  },
  states: {
    SelectingFood: {},
    EnteringQuantity: {},
    Submitting: {},
    Submitted: {},
  },
  actions: {
    replaceDay: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/days/[dateKey]",
        params,
      });
    },
    replaceHome: () => {
      router.replace("/");
    },
  },
  actorSources: {
    addMealEntry: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(AddMealEntryInput),
        output: Schema.toStandardSchemaV1(AddMealEntryResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const mealEntries = yield* MealEntries.MealEntries;
            yield* mealEntries.create({
              input,
            });

            return {
              _tag: "Success" as const,
            };
          }).pipe(
            Effect.catchTag("FoodNotFound", () =>
              Effect.succeed({
                _tag: "FoodNotFound" as const,
              })
            ),
            Effect.catchTag("MealNotFound", () =>
              Effect.succeed({
                _tag: "MealNotFound" as const,
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
      foodSearchActor: spawn(FoodSearchMachine.foodSearchMachine, {
        id: "addMealFoodRouteFoodSearch",
        input: {
          foods: Array.sortBy(
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
      quantityAmount: "",
      quantityUnit: "g",
      portionId: null,
      selectedFood: null,
    };
  },
  initial: "SelectingFood",
  states: {
    SelectingFood: {
      on: {
        clearNotice: {
          context: { notice: null },
        },
        foodSearchSelected: ({ context, event }) => {
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
              : foodUsage.meals.find((usage) => usage.mealId === context.meal);
          const previousQuantityAmount = context.quantityAmount.trim();
          const recentQuantity =
            foodUsage === undefined || mealUsage === undefined
              ? undefined
              : mealUsage.latestQuantity;
          const recentSelection =
            FoodMeasurements.quantitySelectionFromLoggedQuantity({
              food: selectedFood,
              quantity: recentQuantity,
            });
          const quantitySelection =
            event.selection === "firstMatching" &&
            (event.food === null || previousQuantityAmount !== "")
              ? {
                  quantityAmount: context.quantityAmount,
                  quantityUnit: context.quantityUnit,
                  portionId: context.portionId,
                }
              : recentSelection;

          return {
            target: "EnteringQuantity",
            context: {
              notice: null,
              ...quantitySelection,
              selectedFood,
            },
          };
        },
      },
    },
    EnteringQuantity: {
      on: {
        changeQuantity: ({ event }) => ({
          context: {
            quantityAmount: event.quantityAmount,
          },
        }),
        selectMeasurementUnit: ({ event }) => ({
          context: {
            portionId: null,
            quantityUnit: event.unit,
          },
        }),
        selectPortion: ({ event }) => ({
          context: {
            portionId: event.portionId,
          },
        }),
        clearNotice: {
          context: { notice: null },
        },
        clearSelectedFood: ({ context }, enq) => {
          enq.sendTo(context.foodSearchActor, {
            type: "clearSelectedFood",
          } satisfies FoodSearchMachine.FoodSearchEvent);

          return {
            target: "SelectingFood",
            context: {
              selectedFood: null,
            },
          };
        },
        submit: ({ context }) =>
          context.selectedFood !== null && context.quantityAmount.trim() !== ""
            ? { target: "Submitting" }
            : undefined,
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
            dateKey: context.dateKey,
            foodId: context.selectedFood.id,
            mealId: context.meal,
            quantity: FoodMeasurements.mealEntryQuantityInputFromSelection({
              quantityAmount: context.quantityAmount,
              quantityUnit: context.quantityUnit,
              portionId: context.portionId,
            }),
          };
        },
        onDone: ({ actions, context, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              FoodNotFound: () => ({
                target: "EnteringQuantity" as const,
                context: {
                  notice:
                    "Could not find that food. Pick another food and try again.",
                },
              }),
              MealNotFound: () => ({
                target: "EnteringQuantity" as const,
                context: {
                  notice:
                    "Could not find that food. Pick another food and try again.",
                },
              }),
              SchemaError: () => ({
                target: "EnteringQuantity" as const,
                context: {
                  notice: "Enter a quantity greater than zero.",
                },
              }),
              Success: () => {
                const today = todayDateKey();

                if (context.dateKey === today) {
                  enq(actions.replaceHome);

                  return { target: "Submitted" as const };
                }

                enq(actions.replaceDay, { dateKey: context.dateKey });

                return { target: "Submitted" as const };
              },
            })
          ),
        onError: {
          target: "EnteringQuantity",
          context: {
            notice:
              "Could not add the meal entry. Check the quantity and try again.",
          },
        },
      },
    },
    Submitted: {},
  },
});

const addMealFoodRouteLoaderMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        data: Schema.NullOr(AddMealFoodRouteData),
        dateKey: Domain.DateKey,
        meal: Domain.MealId,
        message: Schema.NullOr(Schema.String),
      })
    ),
    input: Schema.toStandardSchemaV1(AddMealFoodRouteLoaderInput),
  },
  states: {
    Loading: {},
    Failed: {},
    Ready: {},
    Redirected: {},
  },
  actions: {
    replaceNewPlan: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/plans/new",
        params,
      });
    },
  },
  actorSources: {
    loadRouteData: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(AddMealFoodRouteLoaderInput),
        output: Schema.toStandardSchemaV1(AddMealFoodRouteLoadResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const foodsService = yield* Foods.Foods;
            const mealEntriesService = yield* MealEntries.MealEntries;
            const day = yield* input.dateKey === todayDateKey()
              ? dailyLogs.openOrCreate({
                  input: {
                    dateKey: input.dateKey,
                  },
                })
              : dailyLogs.open({
                  input: {
                    dateKey: input.dateKey,
                  },
                });

            if (day._tag === "UnrecordedDay") {
              return {
                _tag: "UnrecordedDay" as const,
                dateKey: day.dateKey,
              };
            }

            const foods = yield* foodsService.list();
            const foodUsage = yield* mealEntriesService.listFoodUsage();
            const planMeal = day.selectedPlan.meals.find(
              (candidate) => candidate.id === input.meal
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
                meal: input.meal,
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
          )
        ),
    }),
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
        onDone: ({ actions, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              InvalidRoute: () => ({
                target: "Failed" as const,
                context: { message: "Could not find this meal." },
              }),
              NoMealPlans: ({ dateKey }) => {
                enq(actions.replaceNewPlan, { dateKey });

                return { target: "Redirected" as const };
              },
              Ready: ({ data }) => ({
                target: "Ready" as const,
                context: { data },
              }),
              UnrecordedDay: () => ({
                target: "Failed" as const,
                context: { message: "Create this day before adding food." },
              }),
            })
          ),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load this meal.",
          },
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
  const routeState = snapshot.value;

  if (routeState === "Loading" || routeState === "Redirected") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal" />
      </AppScreen>
    );
  }

  if (routeState === "Failed") {
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
    portionId,
    quantityAmount,
    quantityUnit,
  } = snapshot.context;
  const selectedFood = snapshot.context.selectedFood;
  const routeState = snapshot.value;
  const disabled = routeState === "Submitting" || routeState === "Submitted";
  const canClearSelectedFood = routeState === "EnteringQuantity";
  const submitDisabled =
    disabled || selectedFood === null || quantityAmount.trim() === "";
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
      : `${formatLoggedFoodQuantity({
          quantity: selectedMealUsage.latestQuantity,
        })} previous`;
  const selectedFoodNutrients =
    selectedFood === null
      ? undefined
      : FoodMeasurements.loggedQuantityFromForm({
          food: selectedFood,
          portionId,
          quantityAmount,
          quantityUnit,
        }).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (quantity) =>
              FoodMeasurements.nutrientsFromLoggedQuantity({
                food: selectedFood,
                quantity,
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
                canClearSelectedFood
                  ? "Back to food selection"
                  : `Back to ${dateKey}`
              }
              icon={ChevronLeft}
              onPress={() => {
                if (canClearSelectedFood) {
                  actor.trigger.clearSelectedFood();
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
                  actor.trigger.submit();
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
                    : FoodMeasurements.nutrientsFromLoggedQuantity({
                        food,
                        quantity: mealHistory.latestQuantity,
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
                  : formatLoggedFoodQuantity({
                      quantity: mealHistory.latestQuantity,
                    });
              }}
            />
          </View>
        ) : (
          <QuantityEntry
            changeQuantity={(value) => {
              actor.trigger.changeQuantity({ quantityAmount: value });
            }}
            disabled={disabled}
            mealLabel={mealLabel}
            portionId={portionId}
            quantityAmount={quantityAmount}
            quantityUnit={quantityUnit}
            selectMeasurementUnit={(unit) => {
              actor.trigger.selectMeasurementUnit({ unit });
            }}
            selectPortion={(selectedPortionId) => {
              actor.trigger.selectPortion({
                portionId: selectedPortionId,
              });
            }}
            selectedFood={selectedFood}
            selectedFoodNutrients={selectedFoodNutrients}
            selectedFoodQuantityLabel={selectedFoodQuantityLabel}
            submit={actor.trigger.submit}
            submitDisabled={submitDisabled}
          />
        )}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function QuantityEntry({
  changeQuantity,
  disabled,
  mealLabel,
  portionId,
  quantityAmount,
  quantityUnit,
  selectMeasurementUnit,
  selectPortion,
  selectedFood,
  selectedFoodNutrients,
  selectedFoodQuantityLabel,
  submit,
  submitDisabled,
}: {
  readonly changeQuantity: (quantityAmount: string) => void;
  readonly disabled: boolean;
  readonly mealLabel: string;
  readonly portionId: Domain.FoodPortionId | null;
  readonly quantityAmount: string;
  readonly quantityUnit: Domain.MeasurementUnit;
  readonly selectMeasurementUnit: (unit: Domain.MeasurementUnit) => void;
  readonly selectPortion: (portionId: Domain.FoodPortionId) => void;
  readonly selectedFood: Domain.Food;
  readonly selectedFoodNutrients: ReturnType<
    typeof FoodMeasurements.nutrientsFromLoggedQuantity
  >;
  readonly selectedFoodQuantityLabel: string | undefined;
  readonly submit: () => void;
  readonly submitDisabled: boolean;
}) {
  const selectedPortion =
    portionId === null
      ? undefined
      : selectedFood.portions.find((portion) => portion.id === portionId);
  const selectedMeasureLabel =
    selectedPortion?.name ?? (quantityUnit === "l" ? "L" : quantityUnit);
  const measurementUnits = FoodMeasurements.availableMeasurementUnits({
    food: selectedFood,
  });
  const measureOptions = [
    ...measurementUnits.map((unit) => ({
      _tag: "MeasurementUnit" as const,
      label: unit === "l" ? "L" : unit,
      unit,
      value: `unit:${unit}`,
    })),
    ...selectedFood.portions.map((portion) => ({
      _tag: "Portion" as const,
      label: portion.name,
      portionId: portion.id,
      value: `portion:${portion.id}`,
    })),
  ];
  const selectedMeasureValue =
    selectedPortion === undefined
      ? `unit:${quantityUnit}`
      : `portion:${selectedPortion.id}`;

  return (
    <View style={styles.quantityLayout}>
      <View style={styles.quantityBody}>
        <NumberField
          accessibilityLabel={`${mealLabel} quantity in ${selectedMeasureLabel}`}
          autoFocus
          editable={!disabled}
          label="Amount"
          onChangeText={(value) => {
            changeQuantity(value);
          }}
          placeholder={selectedPortion === undefined ? "150" : "1"}
          rightElement={
            <InputSelect
              disabled={disabled}
              onSelect={(value) => {
                const selectedOption = measureOptions.find(
                  (option) => option.value === value
                );

                if (selectedOption?._tag === "MeasurementUnit") {
                  selectMeasurementUnit(selectedOption.unit);
                } else if (selectedOption?._tag === "Portion") {
                  selectPortion(selectedOption.portionId);
                }
              }}
              options={measureOptions}
              selectedValue={selectedMeasureValue}
              title="Measure amount as"
            />
          }
          selectTextOnFocus
          value={quantityAmount}
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
            submit();
          }}
          style={styles.footerButton}
        >
          Add
        </Button>
      </BottomActionBar>
    </View>
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
  footerButton: {
    flex: 1,
  },
});
