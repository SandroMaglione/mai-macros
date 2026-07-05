import {
  AppHeader,
  AppScreen,
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
import {
  FoodNutrientOverview,
  FoodSearchField,
  FoodSearchResults,
} from "@/components/nutrition";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import {
  foodNutrientOverviewFromFormValues,
  foodNutrientOverviewPrimaryLabel,
  formatNumber,
} from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent, FoodFormMachine, FoodSearchMachine } from "@mai/machines";
import { Domain, Foods, MealEntries } from "@mai/nutrition";
import { useMachine, useSelector } from "@xstate/react";
import { Array, Effect, Match, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Pencil, RotateCcw, Save } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Actor, createAsyncLogic, setup } from "xstate";

type EditFoodsLayout = "screen" | "embedded";

const FoodFormInputFields = {
  name: Schema.String,
  brand: Schema.optionalKey(Schema.String),
  energyKcalPer100g: Schema.String,
  proteinGramsPer100g: Schema.String,
  carbsGramsPer100g: Schema.String,
  fatGramsPer100g: Schema.String,
  fiberGramsPer100g: Schema.optionalKey(Schema.String),
  sugarGramsPer100g: Schema.optionalKey(Schema.String),
  saturatedFatGramsPer100g: Schema.optionalKey(Schema.String),
  saltGramsPer100g: Schema.optionalKey(Schema.String),
};

const ReviseFoodInput = Schema.Struct({
  foodId: Domain.FoodId,
  ...FoodFormInputFields,
});

const MealFoodUsage = Schema.Struct({
  foodId: Domain.FoodId,
  latestQuantityGrams: Domain.QuantityGrams,
  latestUsedAt: Schema.DateTimeUtc,
  meals: Schema.Array(
    Schema.Struct({
      latestUsedAt: Schema.DateTimeUtc,
      mealId: Domain.MealId,
    })
  ),
});

const FoodLibraryData = Schema.Struct({
  foods: Schema.Array(Domain.Food),
  foodUsage: Schema.Array(MealFoodUsage),
});

type FoodLibraryData = typeof FoodLibraryData.Type;

const EditFoodsRouteData = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  foods: Schema.Array(Domain.Food),
  foodUsage: Schema.Array(MealFoodUsage),
});

type EditFoodsRouteData = typeof EditFoodsRouteData.Type;

const EditFoodsRouteLoaderInput = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
});

const EditFoodsRouteLoaderContext = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
});

const EditFoodsRouteLoaderFailureContext = Schema.Struct({
  message: Schema.String,
});

const EditFoodsRouteLoaderReadyContext = Schema.Struct({
  data: EditFoodsRouteData,
});

const FoodSearchActorSchema =
  Schema.declare<FoodSearchMachine.FoodSearchActorRef>(
    (value): value is FoodSearchMachine.FoodSearchActorRef =>
      value instanceof Actor &&
      value.logic === FoodSearchMachine.foodSearchMachine,
    { expected: "FoodSearchActor" }
  );

type FoodNutrientField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: FoodFormMachine.FoodNutrientFieldName;
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
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        foods: Schema.Array(Domain.Food),
        foodSearchActor: FoodSearchActorSchema,
        foodUsage: Schema.Array(MealFoodUsage),
        notice: Schema.NullOr(Schema.String),
        selectedFood: Schema.NullOr(Domain.Food),
      })
    ),
    events: {
      clearNotice: Schema.toStandardSchemaV1(EmptyEvent),
      clearSelectedFood: Schema.toStandardSchemaV1(EmptyEvent),
      foodSearchSelected: Schema.toStandardSchemaV1(
        Schema.Struct({
          food: Schema.NullOr(Domain.Food),
          selection: Schema.Literals(["explicit", "firstMatching"]),
        })
      ),
      reviseFood: Schema.toStandardSchemaV1(
        Schema.Struct({
          input: ReviseFoodInput,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(EditFoodsRouteData),
  },
  states: {
    Idle: {},
    RevisingFood: {},
  },
  actorSources: {
    foodSearch: FoodSearchMachine.foodSearchMachine,
    reviseFood: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            input: ReviseFoodInput,
          })
        ),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;

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
        ),
    }),
  },
}).createMachine({
  context: ({ actorSources, input, spawn }) => ({
    dateKey: input.dateKey,
    foods: input.foods,
    foodSearchActor: spawn(actorSources.foodSearch, {
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
    clearNotice: () => ({
      context: {
        notice: null,
      },
    }),
    clearSelectedFood: ({ context }, enq) => {
      enq.sendTo(context.foodSearchActor, {
        type: "clearSelectedFood",
      } satisfies FoodSearchMachine.FoodSearchEvent);

      return {
        context: {
          selectedFood: null,
        },
      };
    },
    foodSearchSelected: ({ event }) => ({
      context: {
        notice: null,
        selectedFood: event.food,
      },
    }),
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
          if (event.type !== "reviseFood") {
            throw new Error("Expected food revision input.");
          }

          return {
            input: event.input,
          };
        },
        onDone: ({ context, event }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              FoodNotFound: ({ data }) => {
                enq.sendTo(context.foodSearchActor, {
                  type: "reset",
                  foods: data.foods,
                  query: "",
                  selectedFoodId: null,
                } satisfies FoodSearchMachine.FoodSearchEvent);

                return {
                  target: "Idle" as const,
                  context: {
                    foods: data.foods,
                    foodUsage: data.foodUsage,
                    notice:
                      "Could not find that food. Pick another food and try again.",
                    selectedFood: null,
                  },
                };
              },
              Revised: ({ data }) => {
                enq.sendTo(context.foodSearchActor, {
                  type: "reset",
                  foods: data.foods,
                  query: "",
                  selectedFoodId: null,
                } satisfies FoodSearchMachine.FoodSearchEvent);

                return {
                  target: "Idle" as const,
                  context: {
                    foods: data.foods,
                    foodUsage: data.foodUsage,
                    notice: "Food saved.",
                    selectedFood: null,
                  },
                };
              },
              SchemaError: () => ({
                target: "Idle" as const,
                context: {
                  notice:
                    "Check that the name is filled and every nutrient is a non-negative number.",
                },
              }),
            })
          ),
        onError: {
          target: "Idle",
          context: {
            notice: "Could not update the food. Try again.",
          },
        },
      },
    },
  },
});

const EditFoodsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const editFoodsRouteLoaderMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(EditFoodsRouteLoaderContext),
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(EditFoodsRouteLoaderInput),
  },
  states: {
    Loading: {},
    Failed: {
      schemas: {
        context: Schema.toStandardSchemaV1(EditFoodsRouteLoaderFailureContext),
      },
    },
    Ready: {
      schemas: {
        context: Schema.toStandardSchemaV1(EditFoodsRouteLoaderReadyContext),
      },
    },
    Redirected: {},
  },
  actorSources: {
    loadRouteData: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(EditFoodsRouteLoaderInput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const data = yield* _loadFoodLibraryData();

            return {
              dateKey: input.dateKey,
              ...data,
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.dateKey,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            data: event.output,
          },
        }),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load foods. Please try again.",
          },
        },
      },
    },
    Failed: {
      on: {
        retry: {
          target: "Loading",
        },
      },
    },
    Ready: {},
    Redirected: {},
  },
});

export default function EditFoodsRoute() {
  const search = useSchemaLocalSearchParams(EditFoodsSearchParams);

  if (Option.isNone(search)) {
    return <Redirect href="/" />;
  }

  return (
    <EditFoodsPanelLoader dateKey={search.value.dateKey} layout="screen" />
  );
}

export function EditFoodsPanelLoader({
  dateKey,
  layout,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly layout: EditFoodsLayout;
}) {
  const [snapshot, , actor] = useMachine(editFoodsRouteLoaderMachine, {
    input: {
      dateKey,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    const loading = (
      <View style={styles.centered}>
        <LoadingView message="Loading foods" />
      </View>
    );

    return layout === "embedded" ? (
      loading
    ) : (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading foods" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Failed")) {
    const failure = (
      <View style={styles.centered}>
        <Notice
          message={snapshot.context.message}
          title="Food library unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            actor.trigger.retry();
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </View>
    );

    return layout === "embedded" ? (
      failure
    ) : (
      <AppScreen contentStyle={styles.content}>
        <MaiHeader
          action={<BackButton dateKey={undefined} />}
          title="Edit foods"
        />
        {failure}
      </AppScreen>
    );
  }

  return <ReadyEditFoodsRoute data={snapshot.context.data} layout={layout} />;
}

function ReadyEditFoodsRoute({
  data,
  layout,
}: {
  readonly data: EditFoodsRouteData;
  readonly layout: EditFoodsLayout;
}) {
  const [snapshot, , actor] = useMachine(editFoodsRouteMachine, {
    input: data,
  });
  const { dateKey, foodSearchActor, foodUsage, notice, selectedFood } =
    snapshot.context;
  const disabled = snapshot.value === "RevisingFood";
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
  const content = (
    <>
      {layout === "screen" ? (
        <AppHeader
          embedded
          leading={<BackButton dateKey={dateKey} />}
          shadow
          style={selectedFood === null ? styles.searchHeader : undefined}
          title={selectedFood === null ? "Edit foods" : "Edit food"}
        >
          {selectedFood === null ? (
            <FoodSearchField actor={foodSearchActor} disabled={disabled} />
          ) : null}
        </AppHeader>
      ) : selectedFood === null ? (
        <View style={styles.embeddedSearchHeader}>
          <FoodSearchField actor={foodSearchActor} disabled={disabled} />
        </View>
      ) : null}

      {notice === null ? null : (
        <Notice
          message={notice}
          tone={notice === "Food saved." ? "success" : "danger"}
          style={[
            styles.notice,
            layout === "embedded" ? styles.embeddedNotice : null,
          ]}
        />
      )}

      {selectedFood === null ? (
        <View
          style={
            layout === "embedded"
              ? styles.embeddedSearchBody
              : styles.searchBody
          }
        >
          <FoodSearchResults
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
          disabled={disabled}
          layout={layout}
          onChangeFood={actor.trigger.clearSelectedFood}
          onReviseFood={actor.trigger.reviseFood}
          revisionMessage={revisionMessage}
          selectedFood={selectedFood}
          submitLabel={submitLabel}
        />
      )}
    </>
  );

  if (layout === "embedded") {
    return <View style={styles.embeddedRoot}>{content}</View>;
  }

  return (
    <AppScreen
      contentStyle={styles.content}
      safeAreaEdges={selectedFood === null ? ["top", "bottom"] : ["top"]}
    >
      {content}
    </AppScreen>
  );
}

function FoodEditForm({
  disabled,
  layout,
  onChangeFood,
  onReviseFood,
  revisionMessage,
  selectedFood,
  submitLabel,
}: {
  readonly disabled: boolean;
  readonly layout: EditFoodsLayout;
  readonly onChangeFood: () => void;
  readonly onReviseFood: (params: {
    readonly input: typeof ReviseFoodInput.Type;
  }) => void;
  readonly revisionMessage: string;
  readonly selectedFood: Domain.Food;
  readonly submitLabel: string;
}) {
  const [snapshot, , formActor] = useMachine(FoodFormMachine.foodFormMachine, {
    input: {
      initialFood: selectedFood,
      syncQuickInputFromFields: false,
    },
  });
  const { formValues, numberWarnings } = snapshot.context;
  const changeFoodButton = (
    <Button
      disabled={disabled}
      icon={Pencil}
      onPress={() => {
        onChangeFood();
      }}
      style={styles.footerButton}
      variant="secondary"
    >
      Change food
    </Button>
  );
  const saveFoodButton = (
    <Button
      disabled={disabled}
      icon={Save}
      loading={disabled}
      onPress={() => {
        onReviseFood({
          input: {
            ...FoodFormMachine.createFoodInputFromFormValues({ formValues }),
            foodId: selectedFood.id,
          },
        });
      }}
      style={styles.footerButton}
    >
      {submitLabel}
    </Button>
  );

  return (
    <View
      style={
        layout === "embedded" ? styles.embeddedFormLayout : styles.formLayout
      }
    >
      {layout === "embedded" ? (
        <View style={styles.stickyAction}>{changeFoodButton}</View>
      ) : null}

      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={spacing.lg}
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
        <FoodNutrientOverview
          brand={_optionalTrimmedText(formValues.brand)}
          name={_optionalTrimmedText(formValues.name) ?? selectedFood.name}
          nutrients={foodNutrientOverviewFromFormValues({
            values: formValues,
          })}
          primaryLabel={foodNutrientOverviewPrimaryLabel({
            values: formValues,
          })}
          secondaryLabel="per 100g"
        />
        <FoodNumberWarnings warnings={numberWarnings} />
        {layout === "embedded" ? (
          <View style={styles.inlineActions}>{saveFoodButton}</View>
        ) : null}
      </KeyboardAwareScrollView>

      {layout === "screen" ? (
        <BottomActionBar>
          {changeFoodButton}
          {saveFoodButton}
        </BottomActionBar>
      ) : null}
    </View>
  );
}

function FoodFormFields({
  actor,
  disabled,
  selectedFood,
  values,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly selectedFood: Domain.Food;
  readonly values: FoodFormMachine.FoodFormValues;
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
                type: "changeFormValue",
                name: "name",
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
                type: "changeFormValue",
                name: "brand",
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
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
  readonly selectedFood: Domain.Food;
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
            type: "changeFormValue",
            name: field.name,
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
  readonly warnings: readonly FoodFormMachine.FoodNumberWarning[];
}) {
  const generalWarnings = warnings.filter(
    (warning) => warning.field === undefined
  );

  if (!Array.isReadonlyArrayNonEmpty(generalWarnings)) {
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

function BackButton({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey | undefined;
}) {
  return (
    <IconButton
      accessibilityLabel={
        dateKey === undefined ? "Back to home" : "Back to day"
      }
      icon={ChevronLeft}
      onPress={() => {
        router.replace(
          dateKey === undefined
            ? "/"
            : {
                pathname: "/days/[dateKey]",
                params: {
                  dateKey,
                },
              }
        );
      }}
      variant="ghost"
    />
  );
}

function _loadFoodLibraryData() {
  return Effect.gen(function* () {
    const foodsService = yield* Foods.Foods;
    const mealEntriesService = yield* MealEntries.MealEntries;
    const foods = FoodSearchMachine.sortFoodsByOriginAndName({
      foods: yield* foodsService.list(),
    });
    const foodUsage = yield* mealEntriesService.listFoodUsage();

    return {
      foods,
      foodUsage,
    } satisfies FoodLibraryData;
  });
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

function _optionalTrimmedText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
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
  embeddedRoot: {
    flex: 1,
  },
  embeddedSearchHeader: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  notice: {
    marginBottom: spacing.md,
  },
  embeddedNotice: {
    marginHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  searchBody: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  embeddedSearchBody: {
    flex: 1,
  },
  formLayout: {
    flex: 1,
    marginHorizontal: -spacing.lg,
  },
  embeddedFormLayout: {
    flex: 1,
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
  inlineActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stickyAction: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  unitLabel: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  warnings: {
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
