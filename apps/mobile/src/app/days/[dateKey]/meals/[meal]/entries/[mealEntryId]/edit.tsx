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
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import * as FoodMeasurements from "@/lib/food-measurements";
import { formatLoggedFoodQuantity } from "@/lib/format";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { DailyLogs, Domain, Foods, MealEntries } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Save, Trash2 } from "lucide-react-native";
import { useMemo } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

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
type EditMealEntryRouteLoaderInput = typeof EditMealEntryRouteLoaderInput.Type;

const EditMealEntryRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
});

class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Domain.MealEntryId,
}) {}

class InvalidRoute extends Schema.TaggedClass<InvalidRoute>("InvalidRoute")(
  "InvalidRoute",
  {}
) {}

class Ready extends Schema.TaggedClass<Ready>("Ready")("Ready", {
  data: EditMealEntryRouteData,
  notice: Schema.NullOr(Schema.String),
  portionId: Schema.NullOr(Domain.FoodPortionId),
  quantityAmount: Schema.String,
  quantityUnit: Domain.MeasurementUnit,
}) {}

class Editing extends Schema.TaggedClass<Editing>("Editing")("Editing", {}) {}
class Saving extends Schema.TaggedClass<Saving>("Saving")("Saving", {}) {}
class Deleting extends Schema.TaggedClass<Deleting>("Deleting")(
  "Deleting",
  {}
) {}
class Completed extends Schema.TaggedClass<Completed>("Completed")(
  "Completed",
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
class DeleteEntry extends Schema.TaggedClass<DeleteEntry>("DeleteEntry")(
  "DeleteEntry",
  {}
) {}
class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {}) {}
class Back extends Schema.TaggedClass<Back>("Back")("Back", {}) {}
class RouteLoaded extends Schema.TaggedClass<RouteLoaded>("RouteLoaded")(
  "RouteLoaded",
  { data: EditMealEntryRouteData }
) {}
class RouteInvalid extends Schema.TaggedClass<RouteInvalid>("RouteInvalid")(
  "RouteInvalid",
  {}
) {}
class MutationSucceeded extends Schema.TaggedClass<MutationSucceeded>(
  "MutationSucceeded"
)("MutationSucceeded", {}) {}
class MutationRejected extends Schema.TaggedClass<MutationRejected>(
  "MutationRejected"
)("MutationRejected", { message: Schema.String }) {}

const EditMealEntryRouteStates = Machine.defineStates({
  Loading,
  InvalidRoute,
  Ready: {
    schema: Ready,
    initial: "Editing",
    states: { Editing, Saving, Deleting, Completed },
  },
});

const editMealEntryRouteEffects = {
  loadRouteData: ({
    dateKey,
    meal,
    mealEntryId,
  }: EditMealEntryRouteLoaderInput) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const foodsService = yield* Foods.Foods;
      const mealEntriesService = yield* MealEntries.MealEntries;
      const day = yield* dateKey === todayDateKey()
        ? dailyLogs.openOrCreate({ input: { dateKey } })
        : dailyLogs.open({ input: { dateKey } });

      if (day._tag === "UnrecordedDay") {
        return new RouteInvalid();
      }
      const planMeal = day.selectedPlan.meals.find(
        (candidate) => candidate.id === meal
      );
      if (planMeal === undefined) {
        return new RouteInvalid();
      }
      const mealEntries = yield* mealEntriesService.listForDay({
        input: { dateKey },
      });
      const mealEntry = mealEntries.find(
        (entry) => entry.id === mealEntryId && entry.mealId === meal
      );
      if (mealEntry === undefined) {
        return new RouteInvalid();
      }
      const foods = yield* foodsService.list();
      return new RouteLoaded({
        data: {
          dateKey,
          food: foods.find((food) => food.id === mealEntry.foodId),
          meal,
          mealLabel: planMeal.name,
          mealEntry,
        },
      });
    }).pipe(Effect.catch(() => Effect.succeed(new RouteInvalid()))),
  deleteMealEntry: (mealEntryId: Domain.MealEntryId) =>
    Effect.gen(function* () {
      const mealEntries = yield* MealEntries.MealEntries;
      yield* mealEntries.delete({ input: { mealEntryId } });
      return new MutationSucceeded();
    }).pipe(
      Effect.catchTags({
        MealEntryNotFound: () =>
          Effect.succeed(
            new MutationRejected({
              message: "This meal entry is no longer available.",
            })
          ),
        SchemaError: () =>
          Effect.succeed(
            new MutationRejected({
              message: "Enter a quantity greater than zero.",
            })
          ),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new MutationRejected({
            message: "Could not delete this entry. Please try again.",
          })
        )
      )
    ),
  reviseMealEntry: ({
    mealEntryId,
    quantity,
  }: {
    readonly mealEntryId: Domain.MealEntryId;
    readonly quantity: FoodMeasurements.MealEntryQuantityFormInput;
  }) =>
    Effect.gen(function* () {
      const mealEntries = yield* MealEntries.MealEntries;
      yield* mealEntries.revise({ input: { mealEntryId, quantity } });
      return new MutationSucceeded();
    }).pipe(
      Effect.catchTags({
        MealEntryNotFound: () =>
          Effect.succeed(
            new MutationRejected({
              message: "This meal entry is no longer available.",
            })
          ),
        SchemaError: () =>
          Effect.succeed(
            new MutationRejected({
              message: "Enter a quantity greater than zero.",
            })
          ),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new MutationRejected({
            message: "Could not save this entry. Please try again.",
          })
        )
      )
    ),
};

const editMealEntryRouteMachine = Machine.make({
  states: EditMealEntryRouteStates.states,
  events: [
    ChangeQuantity,
    SelectMeasurementUnit,
    SelectPortion,
    DeleteEntry,
    Submit,
    Back,
    RouteLoaded,
    RouteInvalid,
    MutationSucceeded,
    MutationRejected,
  ],
  input: EditMealEntryRouteLoaderInput,
  initial: (input) =>
    EditMealEntryRouteStates.initial.Loading(new Loading(input)),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "load-edit-meal-entry-route",
        src: () =>
          Machine.effect(editMealEntryRouteEffects.loadRouteData(state)),
      }),
    on: {
      RouteLoaded: ({ event, target }) => {
        const quantity = event.data.mealEntry.quantity;
        return target.full.Ready(
          new Ready({
            data: event.data,
            notice: null,
            portionId:
              quantity._tag === "PortionFoodQuantity"
                ? quantity.portionId
                : null,
            quantityAmount: `${
              quantity._tag === "MeasuredFoodQuantity"
                ? quantity.amount
                : quantity.count
            }`,
            quantityUnit:
              quantity._tag === "MeasuredFoodQuantity"
                ? quantity.unit
                : quantity.portionSize.unit,
          }),
          (ready) => ready.Editing(new Editing())
        );
      },
      RouteInvalid: ({ target }) =>
        Machine.action(Effect.sync(() => router.replace("/"))).pipe(
          Effect.as(target.full.InvalidRoute(new InvalidRoute()))
        ),
    },
  },
  InvalidRoute: {},
  Ready: {
    on: {
      Back: ({ state }) =>
        Machine.action(
          Effect.sync(() =>
            router.replace({
              pathname: "/days/[dateKey]",
              params: { dateKey: state.data.dateKey },
            })
          )
        ),
    },
    states: {
      Editing: {
        on: {
          ChangeQuantity: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({
                ...parents.Ready,
                quantityAmount: event.quantityAmount,
              }),
              (ready) => ready.Editing(new Editing())
            ),
          SelectMeasurementUnit: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({
                ...parents.Ready,
                portionId: null,
                quantityUnit: event.unit,
              }),
              (ready) => ready.Editing(new Editing())
            ),
          SelectPortion: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, portionId: event.portionId }),
              (ready) => ready.Editing(new Editing())
            ),
          DeleteEntry: ({ parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, notice: null }),
              (ready) => ready.Deleting(new Deleting())
            ),
          Submit: ({ parents, target }) =>
            parents.Ready.quantityAmount.trim() === ""
              ? undefined
              : target.full.Ready(
                  new Ready({ ...parents.Ready, notice: null }),
                  (ready) => ready.Saving(new Saving())
                ),
        },
      },
      Deleting: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "delete-meal-entry",
            src: () =>
              Machine.effect(
                editMealEntryRouteEffects.deleteMealEntry(
                  parents.Ready.data.mealEntry.id
                )
              ),
          }),
        on: {
          MutationSucceeded: ({ parents, target }) =>
            Machine.action(
              Effect.sync(() =>
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: parents.Ready.data.dateKey },
                })
              )
            ).pipe(
              Effect.as(
                target.full.Ready(new Ready({ ...parents.Ready }), (ready) =>
                  ready.Completed(new Completed())
                )
              )
            ),
          MutationRejected: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, notice: event.message }),
              (ready) => ready.Editing(new Editing())
            ),
        },
      },
      Saving: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "revise-meal-entry",
            src: () =>
              Machine.effect(
                editMealEntryRouteEffects.reviseMealEntry({
                  mealEntryId: parents.Ready.data.mealEntry.id,
                  quantity:
                    parents.Ready.portionId === null
                      ? {
                          _tag: "MeasuredFoodQuantity",
                          amount: parents.Ready.quantityAmount,
                          unit: parents.Ready.quantityUnit,
                        }
                      : {
                          _tag: "PortionFoodQuantity",
                          count: parents.Ready.quantityAmount,
                          portionId: parents.Ready.portionId,
                        },
                })
              ),
          }),
        on: {
          MutationSucceeded: ({ parents, target }) =>
            Machine.action(
              Effect.sync(() =>
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: parents.Ready.data.dateKey },
                })
              )
            ).pipe(
              Effect.as(
                target.full.Ready(new Ready({ ...parents.Ready }), (ready) =>
                  ready.Completed(new Completed())
                )
              )
            ),
          MutationRejected: ({ event, parents, target }) =>
            target.full.Ready(
              new Ready({ ...parents.Ready, notice: event.message }),
              (ready) => ready.Editing(new Editing())
            ),
        },
      },
      Completed: {},
    },
  },
});

export default function EditMealEntryScreen() {
  const routeParams = useSchemaLocalSearchParams(EditMealEntryRouteParams);

  if (Option.isNone(routeParams)) {
    return <Redirect href="/" />;
  }

  return <ValidEditMealEntryScreen {...routeParams.value} />;
}

function ValidEditMealEntryScreen({
  dateKey,
  meal,
  mealEntryId,
}: typeof EditMealEntryRouteParams.Type) {
  const machineAtom = useMemo(
    () =>
      AtomMachine.make(MobileAtomRuntime, editMealEntryRouteMachine, {
        dateKey,
        meal,
        mealEntryId,
      }),
    [dateKey, meal, mealEntryId]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    EditMealEntryRouteStates.matches(stateResult.value, "Loading") ||
    EditMealEntryRouteStates.matches(stateResult.value, "InvalidRoute")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading meal entry" />
      </AppScreen>
    );
  }

  const ready = EditMealEntryRouteStates.get(stateResult.value, "Ready").pipe(
    Option.getOrNull
  );
  return ready === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading meal entry" />
    </AppScreen>
  ) : (
    <ReadyEditMealEntryScreen
      ready={ready}
      routeState={stateResult.value}
      send={send}
    />
  );
}

function ReadyEditMealEntryScreen({
  ready,
  routeState,
  send,
}: {
  readonly ready: Ready;
  readonly routeState: Machine.Machine.Snapshot<
    typeof EditMealEntryRouteStates.states
  >;
  readonly send: (
    event:
      | ChangeQuantity
      | SelectMeasurementUnit
      | SelectPortion
      | DeleteEntry
      | Submit
      | Back
  ) => void;
}) {
  const { data } = ready;
  const disabled =
    EditMealEntryRouteStates.matches(routeState, "Ready.Saving") ||
    EditMealEntryRouteStates.matches(routeState, "Ready.Deleting") ||
    EditMealEntryRouteStates.matches(routeState, "Ready.Completed");
  const food = data.food;
  const selectedPortion =
    food === undefined || ready.portionId === null
      ? undefined
      : food.portions.find((portion) => portion.id === ready.portionId);
  const selectedMeasureLabel =
    selectedPortion?.name ??
    (ready.quantityUnit === "l" ? "L" : ready.quantityUnit);
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
      ? `unit:${ready.quantityUnit}`
      : `portion:${selectedPortion.id}`;
  const selectedFoodNutrients =
    food === undefined
      ? undefined
      : FoodMeasurements.loggedQuantityFromForm({
          food,
          portionId: ready.portionId,
          quantityAmount: ready.quantityAmount,
          quantityUnit: ready.quantityUnit,
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
              onPress={() => send(new Back())}
            />
          }
          shadow
          title={data.food?.name ?? "Meal entry"}
        />

        {ready.notice === null ? null : (
          <Notice message={ready.notice} style={styles.notice} tone="danger" />
        )}

        <View style={styles.body}>
          <NumberField
            accessibilityLabel={`${mealLabel} quantity in ${selectedMeasureLabel}`}
            autoFocus
            editable={!disabled}
            label="Amount"
            onChangeText={(quantityAmount) => {
              send(new ChangeQuantity({ quantityAmount }));
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
                        new SelectMeasurementUnit({
                          unit: selectedOption.unit,
                        })
                      );
                    } else if (selectedOption?._tag === "Portion") {
                      send(
                        new SelectPortion({
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
            value={ready.quantityAmount}
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
                    send(new DeleteEntry());
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
          disabled={disabled || ready.quantityAmount.trim() === ""}
          icon={Save}
          loading={EditMealEntryRouteStates.matches(routeState, "Ready.Saving")}
          onPress={() => {
            send(new Submit());
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
