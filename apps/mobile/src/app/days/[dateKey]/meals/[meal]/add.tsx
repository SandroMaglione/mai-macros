import { QuantityAccuracySelect } from "@/components/nutrition/quantity-accuracy-select";
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
import { useMachine } from "@/hooks/use-machine";
import * as FoodMeasurements from "@/lib/food-measurements";
import { formatLoggedFoodQuantity, formatNumber } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import {
  AddMealFoodEvents,
  AddMealFoodLoaderMachine,
  AddMealFoodMachine,
  AddMealFoodStates,
  findFoodUsage,
  type AddMealFoodData,
} from "@/machines/add-meal-food-machine";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { FoodSearchMachine } from "@mai/machines";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { Check, ChevronLeft, Plus } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

const AddMealFoodRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
});

export default function AddMealFoodRoute() {
  const routeParams = useSchemaLocalSearchParams(AddMealFoodRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  return (
    <AddMealFoodRouteLoader
      dateKey={routeParams.value.dateKey}
      meal={routeParams.value.meal}
    />
  );
}

function AddMealFoodRouteLoader({
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.MealId;
}) {
  const [snapshot] = useMachine(() =>
    MachineAtoms.make(AddMealFoodLoaderMachine, { dateKey, meal })
  );
  const state = snapshot.state;

  if (
    state.path === "Loading" ||
    state.path === "Redirecting" ||
    state.path === "Redirected"
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal" />
      </AppScreen>
    );
  }

  if (state.path === "Failed") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={state.value.message} tone="danger" />
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

  return <ReadyAddMealFoodRoute data={state.value.data} />;
}

function ReadyAddMealFoodRoute({ data }: { readonly data: AddMealFoodData }) {
  const [snapshot, send, machine] = useMachine(() =>
    MachineAtoms.make(AddMealFoodMachine, data)
  );
  const {
    dateKey,
    foodUsage,
    meal,
    mealLabel,
    notice,
    portionId,
    quantityAccuracy,
    quantityAmount,
    quantityUnit,
  } = snapshot.value;
  const foodSearch = machine.child(FoodSearchMachine.FoodSearchChild);
  const selectedFood = AddMealFoodStates.get(snapshot, "Logging.Quantity").pipe(
    Option.map((quantity) => quantity.selectedFood),
    Option.getOrNull
  );
  const disabled =
    AddMealFoodStates.matches(snapshot, "Logging.Quantity.Submitting") ||
    AddMealFoodStates.matches(snapshot, "Logging.Quantity.Submitted");
  const canClearSelectedFood = AddMealFoodStates.matches(
    snapshot,
    "Logging.Quantity.Entering"
  );
  const submitDisabled =
    disabled || selectedFood === null || quantityAmount.trim() === "";
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : findFoodUsage({
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
                  send(AddMealFoodEvents.ClearSelectedFood());
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
                  send(AddMealFoodEvents.Submit());
                }}
                variant="ghost"
              />
            )
          }
        >
          {selectedFood === null ? (
            <FoodSearchField foodSearch={foodSearch} disabled={disabled} />
          ) : null}
        </AppHeader>

        {notice === null ? null : (
          <Notice message={notice} tone="danger" style={styles.notice} />
        )}

        {selectedFood === null ? (
          <View style={styles.searchBody}>
            <FoodSearchResults
              header={
                <View style={styles.entryOptions}>
                  <Button
                    icon={Plus}
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: "/days/[dateKey]/meals/[meal]/one-off",
                        params: { dateKey, meal },
                      })
                    }
                  >
                    Add one-off entry
                  </Button>
                </View>
              }
              foodSearch={foodSearch}
              disabled={disabled}
              emptyFoodsText="Create a food before logging this meal."
              emptySearchText="No foods found."
              getPrimaryLabel={(food) => {
                const foodHistory = findFoodUsage({
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
                  ? undefined
                  : `${formatNumber({
                      maximumFractionDigits: 0,
                      value: nutrients.energyKcal,
                    })} kcal`;
              }}
              getSecondaryLabel={(food) => {
                const foodHistory = findFoodUsage({
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
            quantityAccuracy={quantityAccuracy}
            changeAccuracy={(accuracy) =>
              send(AddMealFoodEvents.ChangeAccuracy({ accuracy }))
            }
            changeQuantity={(value) => {
              send(AddMealFoodEvents.ChangeQuantity({ quantityAmount: value }));
            }}
            disabled={disabled}
            mealLabel={mealLabel}
            portionId={portionId}
            quantityAmount={quantityAmount}
            quantityUnit={quantityUnit}
            selectMeasurementUnit={(unit) => {
              send(AddMealFoodEvents.SelectMeasurementUnit({ unit }));
            }}
            selectPortion={(selectedPortionId) => {
              send(
                AddMealFoodEvents.SelectPortion({
                  portionId: selectedPortionId,
                })
              );
            }}
            selectedFood={selectedFood}
            selectedFoodNutrients={selectedFoodNutrients}
            selectedFoodQuantityLabel={selectedFoodQuantityLabel}
            submit={() => {
              send(AddMealFoodEvents.Submit());
            }}
            submitDisabled={submitDisabled}
          />
        )}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function QuantityEntry({
  quantityAccuracy,
  changeAccuracy,
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
  readonly quantityAccuracy: Domain.QuantityAccuracy;
  readonly changeAccuracy: (accuracy: Domain.QuantityAccuracy) => void;
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
      <ScrollView
        style={styles.quantityScroll}
        contentContainerStyle={styles.quantityBody}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
        <QuantityAccuracySelect
          accuracy={quantityAccuracy}
          disabled={disabled}
          change={changeAccuracy}
        />
      </ScrollView>
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

function _replacePath(path: Parameters<typeof router.replace>[0]) {
  router.replace(path);
}

const styles = StyleSheet.create({
  entryOptions: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
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
  quantityScroll: {
    flex: 1,
  },
  quantityBody: {
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  footerButton: {
    flex: 1,
  },
});
