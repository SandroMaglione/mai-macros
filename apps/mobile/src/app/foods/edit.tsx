import { FoodSearch } from "@/components/nutrition";
import {
  BottomActionBar,
  Button,
  Field,
  IconButton,
  LoadingView,
  MaiHeader,
  Notice,
  NumberField,
  SectionCard,
} from "@/components/ui";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import type { DateKey, Food } from "@mai/nutrition";
import { DateKey as DateKeySchema } from "@mai/nutrition";
import {
  createFoodInputFromFormValues,
  foodFormMachine,
  foodSearchMachine,
  sortFoodsByOriginAndName,
  type FoodFormActorRef,
  type FoodFormValues,
  type FoodNumberWarning,
  type FoodNutrientFieldName,
  type FoodSearchEvent,
  type FoodSearchSelectedEvent,
} from "@mai/machines/foods";
import { Foods, type ReviseFoodInput } from "@mai/nutrition/services/foods";
import {
  MealEntries,
  type MealFoodUsage,
} from "@mai/nutrition/services/meal-entries";
import { useMachine, useSelector } from "@xstate/react";
import { Array as EffectArray, Effect, Schema } from "effect";
import { type Href, router, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

type EditFoodsRouteData = {
  readonly dateKey: DateKey | undefined;
  readonly foods: readonly Food[];
  readonly foodUsage: readonly MealFoodUsage[];
};

type EditFoodsRouteLoadResult =
  | {
      readonly _tag: "InvalidRoute";
    }
  | {
      readonly _tag: "Ready";
      readonly data: EditFoodsRouteData;
    };

type ReviseFoodOutput =
  | {
      readonly _tag: "FoodNotFound";
      readonly data: FoodLibraryData;
    }
  | {
      readonly _tag: "Revised";
      readonly data: FoodLibraryData;
    }
  | {
      readonly _tag: "SchemaError";
    };

type FoodLibraryData = {
  readonly foods: readonly Food[];
  readonly foodUsage: readonly MealFoodUsage[];
};

type EditFoodsRouteEvent =
  | FoodSearchSelectedEvent
  | {
      readonly input: ReviseFoodInput;
      readonly type: "reviseFood";
    }
  | {
      readonly type: "clearNotice";
    }
  | {
      readonly type: "clearSelectedFood";
    };

type EditFoodsRouteContext = {
  readonly dateKey: DateKey | undefined;
  readonly foods: readonly Food[];
  readonly foodSearchActor: ActorRefFrom<typeof foodSearchMachine>;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly notice: string | null;
  readonly selectedFood: Food | null;
};

type FoodNutrientField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: FoodNutrientFieldName;
  readonly placeholder: string;
  readonly unit: "g" | "kcal";
};

const macroFields: readonly FoodNutrientField[] = [
  {
    accentColor: color.nutritionEnergy,
    label: "Calories",
    name: "energyKcalPer100g",
    placeholder: "62",
    unit: "kcal",
  },
  {
    accentColor: color.nutritionProtein,
    label: "Protein",
    name: "proteinGramsPer100g",
    placeholder: "10",
    unit: "g",
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Carbs",
    name: "carbsGramsPer100g",
    placeholder: "3.6",
    unit: "g",
  },
  {
    accentColor: color.nutritionFat,
    label: "Fat",
    name: "fatGramsPer100g",
    placeholder: "0.4",
    unit: "g",
  },
];

const nutrientFields: readonly FoodNutrientField[] = [
  {
    accentColor: color.nutritionFiber,
    label: "Fiber",
    name: "fiberGramsPer100g",
    placeholder: "0",
    unit: "g",
  },
  {
    accentColor: color.nutritionSugar,
    label: "Sugar",
    name: "sugarGramsPer100g",
    placeholder: "3.2",
    unit: "g",
  },
  {
    accentColor: color.nutritionFat,
    label: "Saturated fat",
    name: "saturatedFatGramsPer100g",
    placeholder: "0.1",
    unit: "g",
  },
  {
    accentColor: color.nutritionSalt,
    label: "Salt",
    name: "saltGramsPer100g",
    placeholder: "0.1",
    unit: "g",
  },
];

const editFoodsRouteMachine = setup({
  types: {
    context: {} as EditFoodsRouteContext,
    events: {} as EditFoodsRouteEvent,
    input: {} as EditFoodsRouteData,
  },
  actors: {
    foodSearch: foodSearchMachine,
    reviseFood: fromPromise<
      ReviseFoodOutput,
      {
        readonly input: ReviseFoodInput;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const foods = yield* Foods;

          yield* foods.revise({
            input: input.input,
          });

          return {
            _tag: "Revised" as const,
            data: yield* _loadFoodLibraryData(),
          };
        }).pipe(
          Effect.catchTag("FoodNotFound", () =>
            _loadFoodLibraryData().pipe(
              Effect.map((data) => ({
                _tag: "FoodNotFound" as const,
                data,
              }))
            )
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
  context: ({ input, spawn }) => ({
    dateKey: input.dateKey,
    foods: input.foods,
    foodSearchActor: spawn("foodSearch", {
      id: "editFoodsRouteFoodSearch",
      input: {
        foods: input.foods,
      },
    }),
    foodUsage: input.foodUsage,
    notice: null,
    selectedFood: null,
  }),
  initial: "Idle",
  on: {
    clearNotice: {
      actions: assign({
        notice: null,
      }),
    },
    clearSelectedFood: {
      actions: [
        assign({
          selectedFood: null,
        }),
        sendTo(({ context }) => context.foodSearchActor, {
          type: "clearSelectedFood",
        } satisfies FoodSearchEvent),
      ],
    },
    foodSearchSelected: {
      actions: assign(({ event }) => ({
        notice: null,
        selectedFood: event.food,
      })),
    },
  },
  states: {
    Idle: {
      on: {
        reviseFood: {
          target: "RevisingFood",
        },
      },
    },
    RevisingFood: {
      invoke: {
        src: "reviseFood",
        input: ({ event }) => {
          assertEvent(event, "reviseFood");

          return {
            input: event.input,
          };
        },
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "FoodNotFound",
            target: "Idle",
            actions: [
              assign(({ event }) => {
                const output = event.output;
                assertFoodLibraryOutput(output);

                return {
                  foods: output.data.foods,
                  foodUsage: output.data.foodUsage,
                  notice:
                    "Could not find that food. Pick another food and try again.",
                  selectedFood: null,
                };
              }),
              sendTo(
                ({ context }) => context.foodSearchActor,
                ({ event }) => {
                  const output = event.output;
                  assertFoodLibraryOutput(output);

                  return {
                    type: "reset",
                    foods: output.data.foods,
                    query: "",
                    selectedFoodId: null,
                  } satisfies FoodSearchEvent;
                }
              ),
            ],
          },
          {
            guard: ({ event }) => event.output._tag === "SchemaError",
            target: "Idle",
            actions: assign({
              notice:
                "Check that the name is filled and every nutrient is a non-negative number.",
            }),
          },
          {
            target: "Idle",
            actions: [
              assign(({ event }) => {
                const output = event.output;
                assertFoodLibraryOutput(output);

                return {
                  foods: output.data.foods,
                  foodUsage: output.data.foodUsage,
                  notice: "Food saved.",
                  selectedFood: null,
                };
              }),
              sendTo(
                ({ context }) => context.foodSearchActor,
                ({ event }) => {
                  const output = event.output;
                  assertFoodLibraryOutput(output);

                  return {
                    type: "reset",
                    foods: output.data.foods,
                    query: "",
                    selectedFoodId: null,
                  } satisfies FoodSearchEvent;
                }
              ),
            ],
          },
        ],
        onError: {
          target: "Idle",
          actions: assign({
            notice: "Could not update the food. Try again.",
          }),
        },
      },
    },
  },
});

type EditFoodsRouteActorRef = ActorRefFrom<typeof editFoodsRouteMachine>;

const editFoodsRouteLoaderMachine = setup({
  types: {
    context: {} as {
      readonly data: EditFoodsRouteData | null;
      readonly dateKeyParam: string | undefined;
      readonly message: string | null;
    },
    events: {} as {
      readonly type: "retry";
    },
    input: {} as {
      readonly dateKeyParam: string | undefined;
    },
  },
  actors: {
    loadRouteData: fromPromise<
      EditFoodsRouteLoadResult,
      {
        readonly dateKeyParam: string | undefined;
      }
    >(({ input }) => RuntimeClient.runPromise(loadEditFoodsRouteData(input))),
  },
}).createMachine({
  context: ({ input }) => ({
    data: null,
    dateKeyParam: input.dateKeyParam,
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => ({
          dateKeyParam: context.dateKeyParam,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "InvalidRoute",
            target: "Redirected",
            actions: () => {
              router.replace("/");
            },
          },
          {
            guard: ({ event }) => event.output._tag === "Ready",
            target: "Ready",
            actions: assign(({ event }) => ({
              data: getEditFoodsRouteData({ result: event.output }),
            })),
          },
        ],
        onError: {
          target: "Failed",
          actions: assign({
            message: "Could not load foods. Please try again.",
          }),
        },
      },
    },
    Failed: {
      on: {
        retry: {
          target: "Loading",
          actions: assign({
            message: null,
          }),
        },
      },
    },
    Ready: {},
    Redirected: {},
  },
});

export default function EditFoodsRoute() {
  const params = useLocalSearchParams<{
    readonly dateKey?: string | string[];
  }>();
  const dateKeyParam = firstParam(params.dateKey);
  const [snapshot, send] = useMachine(editFoodsRouteLoaderMachine, {
    input: {
      dateKeyParam,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return <LoadingView message="Loading foods" />;
  }

  if (snapshot.matches("Failed")) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.content}>
          <MaiHeader
            action={<BackButton dateKey={undefined} />}
            title="Edit foods"
          />
          <View style={styles.centered}>
            <Notice
              message={
                snapshot.context.message ??
                "Could not load foods. Please try again."
              }
              title="Food library unavailable"
              tone="danger"
            />
            <Button
              onPress={() => {
                send({
                  type: "retry",
                });
              }}
              variant="secondary"
            >
              Try again
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return snapshot.context.data === null ? (
    <LoadingView message="Loading foods" />
  ) : (
    <ReadyEditFoodsRoute data={snapshot.context.data} />
  );
}

function ReadyEditFoodsRoute({ data }: { readonly data: EditFoodsRouteData }) {
  const [snapshot, , actor] = useMachine(editFoodsRouteMachine, {
    input: data,
  });
  const { dateKey, foodSearchActor, foodUsage, notice, selectedFood } =
    snapshot.context;
  const disabled = snapshot.matches("RevisingFood");
  const selectedFoodUsage =
    selectedFood === null
      ? undefined
      : _findFoodUsage({
          foodId: selectedFood.id,
          foodUsage,
        });
  const revisionMessage =
    selectedFood === null
      ? ""
      : selectedFood.origin === "app-default"
        ? "Saving creates your copy. The pre-installed food stays unchanged."
        : selectedFoodUsage === undefined
          ? "Saving replaces this unused food."
          : "Saving creates a revised copy. Existing logs keep the original food.";
  const submitLabel =
    selectedFood !== null &&
    (selectedFood.origin === "app-default" || selectedFoodUsage !== undefined)
      ? "Save revised copy"
      : "Save food";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.content}>
        <MaiHeader
          action={<BackButton dateKey={dateKey} />}
          eyebrow={dateKey ?? todayDateKey()}
          title={selectedFood === null ? "Edit foods" : "Edit food"}
        />

        {notice === null ? null : (
          <Notice
            message={notice}
            tone={notice === "Food saved." ? "success" : "danger"}
            style={styles.notice}
          />
        )}

        {selectedFood === null ? (
          <View style={styles.searchBody}>
            <FoodSearch
              actor={foodSearchActor}
              disabled={disabled}
              emptyFoodsText="Create a food before editing it."
              emptySearchText="No foods found."
              getPrimaryLabel={(food) =>
                `${formatNumber({
                  maximumFractionDigits: 0,
                  value: food.energyKcalPer100g,
                })} kcal`
              }
              getSecondaryLabel={(food) =>
                _findFoodUsage({
                  foodId: food.id,
                  foodUsage,
                }) === undefined
                  ? "Unused"
                  : "Used"
              }
            />
          </View>
        ) : (
          <FoodEditForm
            actor={actor}
            disabled={disabled}
            revisionMessage={revisionMessage}
            selectedFood={selectedFood}
            submitLabel={submitLabel}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function FoodEditForm({
  actor,
  disabled,
  revisionMessage,
  selectedFood,
  submitLabel,
}: {
  readonly actor: EditFoodsRouteActorRef;
  readonly disabled: boolean;
  readonly revisionMessage: string;
  readonly selectedFood: Food;
  readonly submitLabel: string;
}) {
  const [snapshot, , formActor] = useMachine(foodFormMachine, {
    input: {
      initialFood: selectedFood,
      syncQuickInputFromFields: false,
    },
  });
  const { formValues, numberWarnings } = snapshot.context;

  return (
    <View style={styles.formLayout}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        style={styles.formScroll}
      >
        <Notice message={revisionMessage} tone="neutral" />
        <FoodFormFields
          actor={formActor}
          disabled={disabled}
          selectedFood={selectedFood}
          values={formValues}
        />
        <FoodNumberWarnings warnings={numberWarnings} />
      </ScrollView>

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
          disabled={disabled}
          loading={disabled}
          onPress={() => {
            actor.send({
              type: "reviseFood",
              input: {
                ...createFoodInputFromFormValues({ formValues }),
                foodId: selectedFood.id,
              },
            });
          }}
          style={styles.footerButton}
        >
          {submitLabel}
        </Button>
      </BottomActionBar>
    </View>
  );
}

function FoodFormFields({
  actor,
  disabled,
  selectedFood,
  values,
}: {
  readonly actor: FoodFormActorRef;
  readonly disabled: boolean;
  readonly selectedFood: Food;
  readonly values: FoodFormValues;
}) {
  return (
    <View style={styles.formSections}>
      <SectionCard style={styles.card} title="Details">
        <View style={styles.fieldGroup}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Name"
            onChangeText={(value) => {
              actor.send({
                name: "name",
                type: "changeFormValue",
                value,
              });
            }}
            placeholder="Greek yogurt"
            returnKeyType="next"
            value={values.name}
          />
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Brand"
            onChangeText={(value) => {
              actor.send({
                name: "brand",
                type: "changeFormValue",
                value,
              });
            }}
            placeholder="Mai"
            returnKeyType="next"
            value={values.brand}
          />
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Calories and macros per 100g">
        <View style={styles.fieldGroup}>
          {macroFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              key={field.name}
              selectedFood={selectedFood}
              value={values[field.name]}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Nutrient details per 100g">
        <View style={styles.fieldGroup}>
          {nutrientFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              key={field.name}
              selectedFood={selectedFood}
              value={values[field.name]}
            />
          ))}
        </View>
      </SectionCard>
    </View>
  );
}

function FoodNutrientInput({
  actor,
  disabled,
  field,
  selectedFood,
  value,
}: {
  readonly actor: FoodFormActorRef;
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
  readonly selectedFood: Food;
  readonly value: string;
}) {
  const fieldWarning = useSelector(actor, (snapshot) =>
    snapshot.context.numberWarnings.find(
      (warning) => warning.field === field.name
    )
  );

  return (
    <View style={styles.nutrientField}>
      <Text style={[styles.nutrientLabel, { color: field.accentColor }]}>
        {field.label}
      </Text>
      <NumberField
        accessibilityLabel={`${selectedFood.name} ${field.label}`}
        editable={!disabled}
        error={fieldWarning?.message}
        onChangeText={(nextValue) => {
          actor.send({
            name: field.name,
            type: "changeFormValue",
            value: nextValue,
          });
        }}
        placeholder={field.placeholder}
        rightElement={<Text style={styles.unitLabel}>{field.unit}</Text>}
        value={value}
      />
    </View>
  );
}

function FoodNumberWarnings({
  warnings,
}: {
  readonly warnings: readonly FoodNumberWarning[];
}) {
  const generalWarnings = warnings.filter(
    (warning) => warning.field === undefined
  );

  if (!EffectArray.isReadonlyArrayNonEmpty(generalWarnings)) {
    return null;
  }

  return (
    <View style={styles.warnings}>
      {generalWarnings.map((warning) => (
        <Notice
          key={warning.message}
          message={warning.message}
          tone="warning"
        />
      ))}
    </View>
  );
}

function BackButton({ dateKey }: { readonly dateKey: DateKey | undefined }) {
  return (
    <IconButton
      accessibilityLabel={
        dateKey === undefined ? "Back to home" : "Back to day"
      }
      glyph="‹"
      onPress={() => {
        router.replace(backHrefForDateKey({ dateKey }));
      }}
      variant="ghost"
    />
  );
}

export function getEditFoodsRouteData({
  result,
}: {
  readonly result: EditFoodsRouteLoadResult;
}): EditFoodsRouteData {
  if (result._tag !== "Ready") {
    throw new Error("Expected edit foods route data.");
  }

  return result.data;
}

export function loadEditFoodsRouteData({
  dateKeyParam,
}: {
  readonly dateKeyParam: string | undefined;
}) {
  return Effect.gen(function* () {
    const dateKey =
      dateKeyParam === undefined
        ? undefined
        : yield* Schema.decodeEffect(DateKeySchema)(dateKeyParam);
    const data = yield* _loadFoodLibraryData();

    return {
      _tag: "Ready" as const,
      data: {
        dateKey,
        ...data,
      },
    };
  }).pipe(
    Effect.catchTag("SchemaError", () =>
      Effect.succeed({
        _tag: "InvalidRoute" as const,
      })
    )
  );
}

function _loadFoodLibraryData() {
  return Effect.gen(function* () {
    const foodsService = yield* Foods;
    const mealEntriesService = yield* MealEntries;
    const foods = sortFoodsByOriginAndName({
      foods: yield* foodsService.list(),
    });
    const foodUsage = yield* mealEntriesService.listFoodUsage();

    return {
      foods,
      foodUsage,
    } satisfies FoodLibraryData;
  });
}

export function assertFoodLibraryOutput(
  output: ReviseFoodOutput
): asserts output is Extract<
  ReviseFoodOutput,
  { readonly _tag: "FoodNotFound" | "Revised" }
> {
  if (output._tag === "SchemaError") {
    throw new Error("Expected food library output.");
  }
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

export function firstParam(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}

export function backHrefForDateKey({
  dateKey,
}: {
  readonly dateKey: DateKey | undefined;
}): Href {
  return dateKey === undefined
    ? "/"
    : {
        pathname: "/days/[dateKey]",
        params: {
          dateKey,
        },
      };
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
  },
  searchBody: {
    flex: 1,
    paddingTop: spacing.md,
  },
  formLayout: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  formSections: {
    gap: spacing.lg,
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  fieldGroup: {
    gap: spacing.md,
  },
  nutrientField: {
    gap: spacing.xs,
  },
  nutrientLabel: {
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  unitLabel: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  warnings: {
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
