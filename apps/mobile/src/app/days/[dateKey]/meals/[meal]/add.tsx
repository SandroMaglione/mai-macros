import { FoodNutrientOverview } from "@/components/nutrition/food-nutrient-overview";
import {
  FoodSearchField,
  FoodSearchResults,
} from "@/components/nutrition/food-search";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { InputSelect } from "@/components/ui/input-select";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { todayDateKey } from "@/lib/date-keys";
import * as FoodMeasurements from "@/lib/food-measurements";
import { formatLoggedFoodQuantity, formatNumber } from "@/lib/format";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { FoodSearchMachine } from "@mai/machines";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Array, Effect, Option, Order, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import { Check, ChevronLeft, Plus } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

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

const AddMealEntryInput = Schema.Struct({
  dateKey: Domain.DateKey,
  foodId: Domain.FoodId,
  mealId: Domain.MealId,
  quantity: FoodMeasurements.MealEntryQuantityFormInput,
});
type AddMealEntryInput = typeof AddMealEntryInput.Type;

const AddMealFoodRouteLoaderInput = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});
type AddMealFoodRouteLoaderInput = typeof AddMealFoodRouteLoaderInput.Type;

const AddMealFoodRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
}) {}

class Failed extends Schema.TaggedClass<Failed>("Failed")("Failed", {
  message: Schema.String,
}) {}

class Redirected extends Schema.TaggedClass<Redirected>("Redirected")(
  "Redirected",
  {}
) {}

class Ready extends Schema.TaggedClass<Ready>("Ready")("Ready", {
  dateKey: Domain.DateKey,
  foodUsage: Schema.Array(MealFoodUsage),
  foods: Schema.Array(Domain.Food),
  meal: Domain.MealId,
  mealLabel: Schema.NonEmptyString,
  notice: Schema.NullOr(Schema.String),
  quantityAmount: Schema.String,
  quantityUnit: Domain.MeasurementUnit,
  portionId: Schema.NullOr(Domain.FoodPortionId),
  selectedFood: Schema.NullOr(Domain.Food),
}) {}

class SelectingFood extends Schema.TaggedClass<SelectingFood>("SelectingFood")(
  "SelectingFood",
  {}
) {}

class EnteringQuantity extends Schema.TaggedClass<EnteringQuantity>(
  "EnteringQuantity"
)("EnteringQuantity", {}) {}

class Submitting extends Schema.TaggedClass<Submitting>("Submitting")(
  "Submitting",
  {}
) {}

class Submitted extends Schema.TaggedClass<Submitted>("Submitted")(
  "Submitted",
  {}
) {}

class ChangeQuantity extends Schema.TaggedClass<ChangeQuantity>(
  "ChangeQuantity"
)("ChangeQuantity", { quantityAmount: Schema.String }) {}

class SelectMeasurementUnit extends Schema.TaggedClass<SelectMeasurementUnit>(
  "SelectMeasurementUnit"
)("SelectMeasurementUnit", { unit: Domain.MeasurementUnit }) {}

class SelectPortion extends Schema.TaggedClass<SelectPortion>("SelectPortion")(
  "SelectPortion",
  { portionId: Domain.FoodPortionId }
) {}

class ClearSelectedFood extends Schema.TaggedClass<ClearSelectedFood>(
  "ClearSelectedFood"
)("ClearSelectedFood", {}) {}

class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {}) {}

class RouteLoaded extends Schema.TaggedClass<RouteLoaded>("RouteLoaded")(
  "RouteLoaded",
  { data: AddMealFoodRouteData }
) {}

class RouteLoadFailed extends Schema.TaggedClass<RouteLoadFailed>(
  "RouteLoadFailed"
)("RouteLoadFailed", { message: Schema.String }) {}

class NewPlanRequired extends Schema.TaggedClass<NewPlanRequired>(
  "NewPlanRequired"
)("NewPlanRequired", { dateKey: Domain.DateKey }) {}

class EntryCreated extends Schema.TaggedClass<EntryCreated>("EntryCreated")(
  "EntryCreated",
  {}
) {}

class EntryRejected extends Schema.TaggedClass<EntryRejected>("EntryRejected")(
  "EntryRejected",
  { message: Schema.String }
) {}

const AddMealFoodRouteStates = Machine.defineStates({
  Loading,
  Failed,
  Redirected,
  Ready: {
    schema: Ready,
    initial: "SelectingFood",
    states: {
      SelectingFood,
      EnteringQuantity,
      Submitting,
      Submitted,
    },
  },
});

const addMealFoodRouteEffects = {
  loadRouteData: ({ dateKey, meal }: AddMealFoodRouteLoaderInput) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const foodsService = yield* Foods.Foods;
      const mealEntriesService = yield* MealEntries.MealEntries;
      const day = yield* dateKey === todayDateKey()
        ? dailyLogs.openOrCreate({ input: { dateKey } })
        : dailyLogs.open({ input: { dateKey } });

      if (day._tag === "UnrecordedDay") {
        return new RouteLoadFailed({
          message: "Create this day before adding food.",
        });
      }

      const planMeal = day.selectedPlan.meals.find(
        (candidate) => candidate.id === meal
      );
      if (planMeal === undefined) {
        return new RouteLoadFailed({ message: "Could not find this meal." });
      }

      const foods = yield* foodsService.list();
      const foodUsage = yield* mealEntriesService.listFoodUsage();
      return new RouteLoaded({
        data: {
          dateKey: day.dailyLog.dateKey,
          foodUsage,
          foods,
          meal,
          mealLabel: planMeal.name,
        },
      });
    }).pipe(
      Effect.catchTag("NoMealPlans", ({ dateKey }) =>
        Effect.succeed(new NewPlanRequired({ dateKey }))
      ),
      Effect.catch(() =>
        Effect.succeed(
          new RouteLoadFailed({ message: "Could not load this meal." })
        )
      )
    ),
  addMealEntry: (input: AddMealEntryInput) =>
    Effect.gen(function* () {
      const mealEntries = yield* MealEntries.MealEntries;
      yield* mealEntries.create({ input });
      return new EntryCreated();
    }).pipe(
      Effect.catchTags({
        FoodNotFound: () =>
          Effect.succeed(
            new EntryRejected({
              message:
                "Could not find that food. Pick another food and try again.",
            })
          ),
        MealNotFound: () =>
          Effect.succeed(
            new EntryRejected({
              message:
                "Could not find that meal. Return to the day and try again.",
            })
          ),
        SchemaError: () =>
          Effect.succeed(
            new EntryRejected({
              message: "Enter a quantity greater than zero.",
            })
          ),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new EntryRejected({
            message:
              "Could not add the meal entry. Check the quantity and try again.",
          })
        )
      )
    ),
};

const addMealFoodRouteMachine = Machine.make({
  states: AddMealFoodRouteStates.states,
  events: [
    ChangeQuantity,
    SelectMeasurementUnit,
    SelectPortion,
    ClearSelectedFood,
    Submit,
    RouteLoaded,
    RouteLoadFailed,
    NewPlanRequired,
    EntryCreated,
    EntryRejected,
    FoodSearchMachine.FoodSearchSelected,
  ],
  input: AddMealFoodRouteLoaderInput,
  initial: ({ dateKey, meal }) =>
    AddMealFoodRouteStates.initial.Loading(new Loading({ dateKey, meal })),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "load-add-meal-food-route",
        src: () =>
          Machine.effect(
            addMealFoodRouteEffects.loadRouteData({
              dateKey: state.dateKey,
              meal: state.meal,
            })
          ),
      }),
    on: {
      RouteLoaded: ({ event, target }) =>
        target.full.Ready(
          new Ready({
            ...event.data,
            notice: null,
            quantityAmount: "",
            quantityUnit: "g",
            portionId: null,
            selectedFood: null,
          }),
          (ready) => ready.SelectingFood(new SelectingFood())
        ),
      RouteLoadFailed: ({ event, target }) =>
        target.full.Failed(new Failed({ message: event.message })),
      NewPlanRequired: ({ event, target }) =>
        Machine.action(
          Effect.sync(() =>
            router.replace({
              pathname: "/plans/new",
              params: { dateKey: event.dateKey },
            })
          )
        ).pipe(Effect.as(target.full.Redirected(new Redirected()))),
    },
  },
  Failed: {},
  Redirected: {},
  Ready: {
    invoke: ({ state }) => {
      const mealFoodRecencyOrder = Order.mapInput(
        Order.flip(Order.Number),
        (food: Domain.Food) =>
          _findFoodUsage({
            foodId: food.id,
            foodUsage: state.foodUsage,
          })?.meals.find((usage) => usage.mealId === state.meal)?.latestUsedAt
            .epochMilliseconds ?? Number.NEGATIVE_INFINITY
      );
      return Machine.invokeMachine({
        child: FoodSearchMachine.FoodSearchChild,
        input: {
          baseOrder: "provided",
          foods: Array.sortBy(
            mealFoodRecencyOrder,
            FoodSearchMachine.foodUserOriginOrder,
            FoodSearchMachine.foodLowercaseNameOrder
          )(state.foods),
        },
      });
    },
    on: {
      FoodSearchSelected: ({ event, state, target }) => {
        const selectedFood =
          event.selection === "firstMatching"
            ? (event.food ?? state.selectedFood)
            : event.food;
        const foodUsage =
          event.food === null
            ? undefined
            : _findFoodUsage({
                foodId: event.food.id,
                foodUsage: state.foodUsage,
              });
        const mealUsage = foodUsage?.meals.find(
          (usage) => usage.mealId === state.meal
        );
        const recentSelection =
          FoodMeasurements.quantitySelectionFromLoggedQuantity({
            food: selectedFood,
            quantity: mealUsage?.latestQuantity,
          });
        const quantitySelection =
          event.selection === "firstMatching" &&
          (event.food === null || state.quantityAmount.trim() !== "")
            ? {
                quantityAmount: state.quantityAmount,
                quantityUnit: state.quantityUnit,
                portionId: state.portionId,
              }
            : recentSelection;
        return target.full.Ready(
          new Ready({
            ...state,
            notice: null,
            ...quantitySelection,
            selectedFood,
          }),
          (ready) => ready.EnteringQuantity(new EnteringQuantity())
        );
      },
    },
    states: {
      SelectingFood: {},
      EnteringQuantity: {
        on: {
          ChangeQuantity: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({
                ...parents.Ready,
                quantityAmount: event.quantityAmount,
              }),
              (ready) => ready.EnteringQuantity(new EnteringQuantity())
            ),
          SelectMeasurementUnit: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({
                ...parents.Ready,
                portionId: null,
                quantityUnit: event.unit,
              }),
              (ready) => ready.EnteringQuantity(new EnteringQuantity())
            ),
          SelectPortion: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, portionId: event.portionId }),
              (ready) => ready.EnteringQuantity(new EnteringQuantity())
            ),
          ClearSelectedFood: ({ parents, target }) =>
            Machine.action(
              Machine.sendTo(
                FoodSearchMachine.FoodSearchChild,
                new FoodSearchMachine.ClearSelectedFood()
              )
            ).pipe(
              Effect.as(
                target.full.Ready(
                  new Ready({ ...parents.Ready, selectedFood: null }),
                  (ready) => ready.SelectingFood(new SelectingFood())
                )
              )
            ),
          Submit: ({ parents, target }) =>
            parents.Ready.selectedFood === null ||
            parents.Ready.quantityAmount.trim() === ""
              ? undefined
              : target.full.Ready(
                  new Ready({ ...parents.Ready, notice: null }),
                  (ready) => ready.Submitting(new Submitting())
                ),
        },
      },
      Submitting: {
        invoke: ({ parents }) => {
          const selectedFood = parents.Ready.selectedFood;
          return Machine.invoke({
            id: "add-meal-entry",
            src: () =>
              Machine.effect(
                selectedFood === null
                  ? Effect.succeed(
                      new EntryRejected({
                        message: "Pick a food before adding it.",
                      })
                    )
                  : addMealFoodRouteEffects.addMealEntry({
                      dateKey: parents.Ready.dateKey,
                      foodId: selectedFood.id,
                      mealId: parents.Ready.meal,
                      quantity:
                        FoodMeasurements.mealEntryQuantityInputFromSelection({
                          quantityAmount: parents.Ready.quantityAmount,
                          quantityUnit: parents.Ready.quantityUnit,
                          portionId: parents.Ready.portionId,
                        }),
                    })
              ),
          });
        },
        on: {
          EntryCreated: ({ parents, target }) =>
            Machine.action(
              Effect.sync(() => {
                if (parents.Ready.dateKey === todayDateKey()) {
                  router.replace("/");
                  return;
                }
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: parents.Ready.dateKey },
                });
              })
            ).pipe(
              Effect.as(
                target.full.Ready(new Ready({ ...parents.Ready }), (ready) =>
                  ready.Submitted(new Submitted())
                )
              )
            ),
          EntryRejected: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, notice: event.message }),
              (ready) => ready.EnteringQuantity(new EnteringQuantity())
            ),
        },
      },
      Submitted: {},
    },
  },
});

export default function AddMealFoodRoute() {
  const routeParams = useSchemaLocalSearchParams(AddMealFoodRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  return <ValidAddMealFoodRoute {...routeParams.value} />;
}

function ValidAddMealFoodRoute({
  dateKey,
  meal,
}: typeof AddMealFoodRouteParams.Type) {
  const machineAtom = useMemo(
    () =>
      AtomMachine.make(MobileAtomRuntime, addMealFoodRouteMachine, {
        dateKey,
        meal,
      }),
    [dateKey, meal]
  );
  const foodSearchAtom = useMemo(
    () => machineAtom.child(FoodSearchMachine.FoodSearchChild),
    [machineAtom]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    AddMealFoodRouteStates.matches(stateResult.value, "Loading") ||
    AddMealFoodRouteStates.matches(stateResult.value, "Redirected")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal" />
      </AppScreen>
    );
  }

  const failed = AddMealFoodRouteStates.get(stateResult.value, "Failed").pipe(
    Option.getOrNull
  );
  if (failed !== null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={failed.message} tone="danger" />
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

  const ready = AddMealFoodRouteStates.get(stateResult.value, "Ready").pipe(
    Option.getOrNull
  );
  return ready === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading meal" />
    </AppScreen>
  ) : (
    <ReadyAddMealFoodRoute
      foodSearchAtom={foodSearchAtom}
      ready={ready}
      routeState={stateResult.value}
      send={send}
    />
  );
}

function ReadyAddMealFoodRoute({
  foodSearchAtom,
  ready,
  routeState,
  send,
}: {
  readonly foodSearchAtom: AtomMachine.ChildMachineAtom<
    typeof FoodSearchMachine.FoodSearchChild,
    unknown
  >;
  readonly ready: Ready;
  readonly routeState: Machine.Machine.Snapshot<
    typeof AddMealFoodRouteStates.states
  >;
  readonly send: (
    event:
      | ChangeQuantity
      | SelectMeasurementUnit
      | SelectPortion
      | ClearSelectedFood
      | Submit
  ) => void;
}) {
  const {
    dateKey,
    foodUsage,
    meal,
    mealLabel,
    notice,
    portionId,
    quantityAmount,
    quantityUnit,
  } = ready;
  const selectedFood = ready.selectedFood;
  const disabled =
    AddMealFoodRouteStates.matches(routeState, "Ready.Submitting") ||
    AddMealFoodRouteStates.matches(routeState, "Ready.Submitted");
  const canClearSelectedFood = AddMealFoodRouteStates.matches(
    routeState,
    "Ready.EnteringQuantity"
  );
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
                  send(new ClearSelectedFood());
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
                  send(new Submit());
                }}
                variant="ghost"
              />
            )
          }
        >
          {selectedFood === null ? (
            <FoodSearchField actor={foodSearchAtom} disabled={disabled} />
          ) : null}
        </AppHeader>

        {notice === null ? null : (
          <Notice message={notice} tone="danger" style={styles.notice} />
        )}

        {selectedFood === null ? (
          <View style={styles.searchBody}>
            <FoodSearchResults
              actor={foodSearchAtom}
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
              send(new ChangeQuantity({ quantityAmount: value }));
            }}
            disabled={disabled}
            mealLabel={mealLabel}
            portionId={portionId}
            quantityAmount={quantityAmount}
            quantityUnit={quantityUnit}
            selectMeasurementUnit={(unit) => {
              send(new SelectMeasurementUnit({ unit }));
            }}
            selectPortion={(selectedPortionId) => {
              send(
                new SelectPortion({
                  portionId: selectedPortionId,
                })
              );
            }}
            selectedFood={selectedFood}
            selectedFoodNutrients={selectedFoodNutrients}
            selectedFoodQuantityLabel={selectedFoodQuantityLabel}
            submit={() => send(new Submit())}
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
