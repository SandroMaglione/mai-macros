import { QuantityAccuracySelect } from "@/components/nutrition/quantity-accuracy-select";
import { FoodNutrientOverview } from "@/components/nutrition/food-nutrient-overview";
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
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import * as FoodMeasurements from "@/lib/food-measurements";
import { formatLoggedFoodQuantity } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  EditMealEntryEvents,
  EditMealEntryLoaderMachine,
  EditMealEntryMachine,
  type EditMealEntryData,
} from "@/machines/edit-meal-entry-machine";
import { color, spacing } from "@/theme/tokens";
import * as Domain from "@mai/nutrition/domain";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Save, Trash2 } from "lucide-react-native";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

const EditMealEntryRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

export default function EditMealEntryScreen() {
  const routeParams = useSchemaLocalSearchParams(EditMealEntryRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  return (
    <EditMealEntryScreenLoader
      dateKey={routeParams.value.dateKey}
      meal={routeParams.value.meal}
      mealEntryId={routeParams.value.mealEntryId}
    />
  );
}

function EditMealEntryScreenLoader({
  dateKey,
  meal,
  mealEntryId,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.MealId;
  readonly mealEntryId: Domain.MealEntryId;
}) {
  const [snapshot] = useMachine(() =>
    MachineAtoms.make(EditMealEntryLoaderMachine, {
      dateKey,
      meal,
      mealEntryId,
    })
  );
  const state = snapshot.state;

  if (state.path === "Loading" || state.path === "InvalidRoute") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal entry" />
      </AppScreen>
    );
  }

  return <ReadyEditMealEntryScreen data={state.value.data} />;
}

function ReadyEditMealEntryScreen({
  data,
}: {
  readonly data: EditMealEntryData;
}) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(EditMealEntryMachine, data)
  );
  const routeState = snapshot.state.path;
  const disabled =
    routeState === "Saving" ||
    routeState === "Saved" ||
    routeState === "Deleting" ||
    routeState === "Deleted";
  const food = data.food;
  const selectedPortion =
    food === undefined || snapshot.value.portionId === null
      ? undefined
      : food.portions.find(
          (portion) => portion.id === snapshot.value.portionId
        );
  const selectedMeasureLabel =
    selectedPortion?.name ??
    (snapshot.value.quantityUnit === "l" ? "L" : snapshot.value.quantityUnit);
  const measureOptions =
    food === undefined
      ? []
      : [
          ...FoodMeasurements.availableMeasurementUnits({ food }).map(
            (unit) => ({
              _tag: "MeasurementUnit" as const,
              label: unit === "l" ? "L" : unit,
              unit,
              value: `unit:${unit}`,
            })
          ),
          ...food.portions.map((portion) => ({
            _tag: "Portion" as const,
            label: portion.name,
            portionId: portion.id,
            value: `portion:${portion.id}`,
          })),
        ];
  const selectedMeasureValue =
    selectedPortion === undefined
      ? `unit:${snapshot.value.quantityUnit}`
      : `portion:${selectedPortion.id}`;
  const selectedFoodNutrients =
    food === undefined
      ? undefined
      : FoodMeasurements.loggedQuantityFromForm({
          food,
          portionId: snapshot.value.portionId,
          quantityAmount: snapshot.value.quantityAmount,
          quantityUnit: snapshot.value.quantityUnit,
        }).pipe(
          Option.match({
            onNone: () => undefined,
            onSome: (quantity) =>
              FoodMeasurements.nutrientsFromLoggedQuantity({
                food,
                quantity,
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
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: data.dateKey },
                })
              }
            />
          }
          shadow
          title={data.food?.name ?? "Meal entry"}
        />

        {snapshot.value.notice === null ? null : (
          <Notice
            message={snapshot.value.notice}
            style={styles.notice}
            tone="danger"
          />
        )}

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <NumberField
            accessibilityLabel={`${mealLabel} quantity in ${selectedMeasureLabel}`}
            autoFocus
            editable={!disabled}
            label="Amount"
            onChangeText={(quantityAmount) => {
              send(EditMealEntryEvents.ChangeQuantity({ quantityAmount }));
            }}
            placeholder={selectedPortion === undefined ? "150" : "1"}
            rightElement={
              food === undefined ? (
                <Text style={styles.unitLabel}>{selectedMeasureLabel}</Text>
              ) : (
                <InputSelect
                  disabled={disabled}
                  onSelect={(value) => {
                    const selectedOption = measureOptions.find(
                      (option) => option.value === value
                    );

                    if (selectedOption?._tag === "MeasurementUnit") {
                      send(
                        EditMealEntryEvents.SelectMeasurementUnit({
                          unit: selectedOption.unit,
                        })
                      );
                    } else if (selectedOption?._tag === "Portion") {
                      send(
                        EditMealEntryEvents.SelectPortion({
                          portionId: selectedOption.portionId,
                        })
                      );
                    }
                  }}
                  options={measureOptions}
                  selectedValue={selectedMeasureValue}
                  title="Measure amount as"
                />
              )
            }
            selectTextOnFocus
            value={snapshot.value.quantityAmount}
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
              secondaryLabel={`${formatLoggedFoodQuantity({
                quantity: data.mealEntry.quantity,
              })} logged`}
            />
          )}
          <QuantityAccuracySelect
            accuracy={snapshot.value.quantityAccuracy}
            disabled={disabled}
            change={(accuracy) =>
              send(EditMealEntryEvents.ChangeAccuracy({ accuracy }))
            }
          />
        </ScrollView>
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
                    send(EditMealEntryEvents.Delete());
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
          disabled={disabled || snapshot.value.quantityAmount.trim() === ""}
          icon={Save}
          loading={routeState === "Saving"}
          onPress={() => {
            send(EditMealEntryEvents.Submit());
          }}
          style={styles.footerButton}
        >
          Save
        </Button>
      </BottomActionBar>
    </KeyboardAvoidingView>
  );
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
  bodyScroll: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
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
