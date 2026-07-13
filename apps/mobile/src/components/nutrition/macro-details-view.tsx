import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber, mealEntryMassGrams } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import {
  DailyLogs,
  Domain,
  Foods,
  MealEntries,
  Reporting,
  Utils,
} from "@mai/nutrition";
import { EmptyEvent } from "@mai/machines";
import { useMachine } from "@xstate/react";
import { Array, Effect, Match, Order, Schema } from "effect";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const OpenedDay = Schema.TaggedStruct("OpenedDay", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const MacroDetailsScope = Schema.Union([
  Schema.TaggedStruct("Day", {}),
  Schema.TaggedStruct("Meal", {
    meal: Domain.MealId,
  }),
]);

const MacroDetailsRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  day: OpenedDay,
  foods: Schema.Array(Domain.Food),
  mealEntries: Schema.Array(Domain.MealEntry),
  scope: MacroDetailsScope,
});

type MacroDetailsRouteData = typeof MacroDetailsRouteData.Type;

const MacroDetailsRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
});

const MacroDetailsRouteContext = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
});

const MacroDetailsRouteFailureContext = Schema.Struct({
  message: Schema.String,
});

const MacroDetailsRouteReadyContext = Schema.Struct({
  data: MacroDetailsRouteData,
});

const FoodWeightMetricName = "foodWeightGrams";
const detailMetricNames = [
  ...Reporting.NutrientNames,
  FoodWeightMetricName,
] as const;
const DetailMetricName = Schema.Literals(detailMetricNames);

type NutrientUnit = "g" | "kcal";

type NutrientDetail = {
  readonly colorValue: string;
  readonly label: string;
  readonly nutrientName: Reporting.NutrientName;
  readonly trackColor: string;
  readonly unit: NutrientUnit;
};

type FoodMealEntry = {
  readonly food: Domain.Food;
  readonly mealEntry: Domain.MealEntry;
  readonly nutrients: ReturnType<typeof Utils.calculateEntryNutrients>;
};

type FoodNutrientContribution = {
  readonly entries: readonly FoodMealEntry[];
  readonly food: Domain.Food;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

const nutrientDetails = [
  {
    colorValue: color.nutritionEnergy,
    label: "Calories",
    nutrientName: "energyKcal",
    trackColor: "#233059",
    unit: "kcal",
  },
  {
    colorValue: color.nutritionFat,
    label: "Fat",
    nutrientName: "fatGrams",
    trackColor: "#443719",
    unit: "g",
  },
  {
    colorValue: color.nutritionFat,
    label: "Sat fat",
    nutrientName: "saturatedFatGrams",
    trackColor: "#443719",
    unit: "g",
  },
  {
    colorValue: color.nutritionCarbs,
    label: "Carbs",
    nutrientName: "carbsGrams",
    trackColor: "#4a2031",
    unit: "g",
  },
  {
    colorValue: color.nutritionSugar,
    label: "Sugar",
    nutrientName: "sugarGrams",
    trackColor: "#4a2031",
    unit: "g",
  },
  {
    colorValue: color.nutritionFiber,
    label: "Fiber",
    nutrientName: "fiberGrams",
    trackColor: "#1d3a29",
    unit: "g",
  },
  {
    colorValue: color.nutritionProtein,
    label: "Protein",
    nutrientName: "proteinGrams",
    trackColor: "#233059",
    unit: "g",
  },
  {
    colorValue: color.nutritionSalt,
    label: "Salt",
    nutrientName: "saltGrams",
    trackColor: "#303034",
    unit: "g",
  },
] as const satisfies readonly NutrientDetail[];

const macroDetailsRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(MacroDetailsRouteContext),
    events: {
      reload: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(MacroDetailsRouteInput),
  },
  states: {
    Loading: {},
    Failed: {
      schemas: {
        context: Schema.toStandardSchemaV1(MacroDetailsRouteFailureContext),
      },
    },
    Ready: {
      schemas: {
        context: Schema.toStandardSchemaV1(MacroDetailsRouteReadyContext),
      },
    },
    Redirected: {},
  },
  actions: {
    redirectToNewPlan: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/plans/new",
        params,
      });
    },
  },
  actorSources: {
    loadMacroDetails: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(MacroDetailsRouteInput),
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
            const mealEntries = yield* mealEntriesService.listForDay({
              input: {
                dateKey: day.dailyLog.dateKey,
              },
            });
            const selectedMeal =
              input.meal === undefined
                ? undefined
                : day.selectedPlan.meals.find(
                    (planMeal) => planMeal.id === input.meal
                  );

            if (input.meal !== undefined && selectedMeal === undefined) {
              return {
                _tag: "InvalidRoute" as const,
              };
            }

            return {
              _tag: "Ready" as const,
              data: {
                dateKey: day.dailyLog.dateKey,
                day,
                foods,
                mealEntries,
                scope:
                  input.meal === undefined
                    ? {
                        _tag: "Day" as const,
                      }
                    : {
                        _tag: "Meal" as const,
                        meal: input.meal,
                      },
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
    dateKey: input.dateKey,
    meal: input.meal,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadMacroDetails",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          meal: context.meal,
        }),
        onDone: ({ event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              InvalidRoute: () => ({
                target: "Failed" as const,
                context: {
                  message: "Could not find this meal.",
                },
              }),
              NoMealPlans: ({ dateKey }) => {
                enq(actions.redirectToNewPlan, { dateKey });

                return { target: "Redirected" as const };
              },
              Ready: ({ data }) => ({
                target: "Ready" as const,
                context: {
                  data,
                },
              }),
              UnrecordedDay: () => ({
                target: "Failed" as const,
                context: {
                  message: "Create this day before viewing details.",
                },
              }),
            })
          ),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load nutrition details.",
          },
        },
      },
    },
    Failed: {
      on: {
        reload: {
          target: "Loading",
        },
      },
    },
    Ready: {
      on: {
        reload: {
          target: "Loading",
        },
      },
    },
    Redirected: {},
  },
});

const macroDetailsSelectionMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        selectedMetricName: Schema.NullOr(DetailMetricName),
      })
    ),
    events: {
      clearSelection: Schema.toStandardSchemaV1(EmptyEvent),
      selectMetric: Schema.toStandardSchemaV1(
        Schema.Struct({
          metricName: DetailMetricName,
        })
      ),
    },
  },
  states: {
    Selected: {},
  },
}).createMachine({
  context: {
    selectedMetricName: null,
  },
  initial: "Selected",
  states: {
    Selected: {},
  },
  on: {
    clearSelection: {
      context: {
        selectedMetricName: null,
      },
    },
    selectMetric: ({ context, event }) => ({
      context: {
        selectedMetricName:
          context.selectedMetricName === event.metricName
            ? null
            : event.metricName,
      },
    }),
  },
});

export function MacroDetailsRoute({
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.MealId | undefined;
}) {
  const [snapshot, , actor] = useMachine(macroDetailsRouteMachine, {
    input: {
      dateKey,
      meal,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading details" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={snapshot.context.message} tone="danger" />
        <Button
          icon={RotateCcw}
          onPress={() => {
            actor.trigger.reload();
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </AppScreen>
    );
  }

  return <MacroDetailsView data={snapshot.context.data} />;
}

function MacroDetailsView({ data }: { readonly data: MacroDetailsRouteData }) {
  const [snapshot, , actor] = useMachine(macroDetailsSelectionMachine);
  const meal = data.scope._tag === "Meal" ? data.scope.meal : null;
  const mealEntries =
    meal === null
      ? data.mealEntries
      : data.mealEntries.filter((mealEntry) => mealEntry.mealId === meal);
  const totals = Reporting.calculateMealEntriesNutrientTotals({
    foods: data.foods,
    mealEntries,
  }).totals;
  const entries = mealEntries.flatMap((mealEntry) => {
    const food = data.foods.find(
      (candidate) => candidate.id === mealEntry.foodId
    );

    return food === undefined
      ? []
      : [
          {
            food,
            mealEntry,
            nutrients: Utils.calculateEntryNutrients({
              food,
              nutritionMultiplier: mealEntry.nutritionMultiplier,
            }),
          },
        ];
  });
  const weightTotals = Reporting.calculateMealEntriesWeightTotals({
    foods: data.foods,
    mealEntries,
  });
  const title =
    meal === null
      ? "Day details"
      : (data.day.selectedPlan.meals.find((planMeal) => planMeal.id === meal)
          ?.name ?? "Meal details");
  const subtitle = data.dateKey;

  return (
    <AppScreen
      contentStyle={styles.content}
      safeAreaEdges={["top"]}
      scroll
      style={styles.headerSafeArea}
    >
      <AppHeader
        embedded
        leading={
          <IconButton
            accessibilityLabel="Back to day"
            icon={ChevronLeft}
            onPress={() => {
              router.replace({
                pathname: "/days/[dateKey]",
                params: {
                  dateKey: data.dateKey,
                },
              });
            }}
            variant="ghost"
          />
        }
        shadow
        style={styles.detailsHeader}
        subtitle={subtitle}
        title={title}
      />

      <View style={styles.nutrientList}>
        {nutrientDetails.map((nutrient) => {
          const selected =
            snapshot.context.selectedMetricName === nutrient.nutrientName;
          const total = Reporting.getNutrientTotal({
            nutrientName: nutrient.nutrientName,
            totals,
          });

          return (
            <View key={nutrient.nutrientName} style={styles.nutrientGroup}>
              <NutrientRow
                nutrient={nutrient}
                onPress={() => {
                  actor.trigger.selectMetric({
                    metricName: nutrient.nutrientName,
                  });
                }}
                selected={selected}
                target={Reporting.getPlanNutrientTargetAmount({
                  nutrientName: nutrient.nutrientName,
                  plan: data.day.selectedPlan,
                })}
                total={total}
                withTarget={data.scope._tag === "Day"}
              />
              {selected ? (
                <NutrientContributors
                  entries={entries}
                  nutrient={nutrient}
                  total={total}
                />
              ) : null}
            </View>
          );
        })}

        <View style={styles.secondaryMetricDivider}>
          <View style={styles.secondaryMetricDividerLine} />
          <Text style={styles.secondaryMetricDividerLabel}>
            Secondary metrics
          </Text>
          <View style={styles.secondaryMetricDividerLine} />
        </View>

        <View style={styles.nutrientGroup}>
          <WeightRow
            isComplete={
              weightTotals.resolvedEntriesCount === weightTotals.entriesCount
            }
            onPress={() => {
              actor.trigger.selectMetric({
                metricName: FoodWeightMetricName,
              });
            }}
            selected={
              snapshot.context.selectedMetricName === FoodWeightMetricName
            }
            total={weightTotals.quantityGrams}
          />
          {snapshot.context.selectedMetricName === FoodWeightMetricName ? (
            <WeightContributors
              entries={entries}
              total={weightTotals.quantityGrams}
            />
          ) : null}
        </View>
      </View>
    </AppScreen>
  );
}

function NutrientRow({
  nutrient,
  onPress,
  selected,
  target,
  total,
  withTarget,
}: {
  readonly nutrient: NutrientDetail;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly target: number | undefined;
  readonly total: number;
  readonly withTarget: boolean;
}) {
  const hasTarget = withTarget && target !== undefined;
  const progress =
    target === undefined || target <= 0 ? (total > 0 ? 1 : 0) : total / target;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const valueLabel = hasTarget
    ? `${_formatNutrientValue({
        unit: nutrient.unit,
        value: total,
      })} / ${_formatNutrientValue({
        unit: nutrient.unit,
        value: target,
      })}`
    : _formatNutrientValue({
        unit: nutrient.unit,
        value: total,
      });

  return (
    <Pressable
      accessibilityLabel={`${nutrient.label} details`}
      accessibilityRole="button"
      accessibilityState={{ expanded: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.nutrientRow,
        selected ? styles.nutrientRowSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.nutrientTopRow}>
        {selected ? (
          <ChevronDown color={color.textMuted} size={18} strokeWidth={2.8} />
        ) : (
          <ChevronRight color={color.textMuted} size={18} strokeWidth={2.8} />
        )}
        <View style={styles.nutrientCopy}>
          <Text
            numberOfLines={1}
            style={[styles.nutrientLabel, { color: nutrient.colorValue }]}
          >
            {nutrient.label}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.nutrientValue, { color: nutrient.colorValue }]}
        >
          {valueLabel}
        </Text>
      </View>
      <View
        style={[
          styles.nutrientTrack,
          {
            backgroundColor: nutrient.trackColor,
          },
        ]}
      >
        <View
          style={[
            styles.nutrientFill,
            {
              backgroundColor: nutrient.colorValue,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function WeightRow({
  isComplete,
  onPress,
  selected,
  total,
}: {
  readonly isComplete: boolean;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly total: number;
}) {
  const clampedProgress = total <= 0 ? 0 : 1;

  return (
    <Pressable
      accessibilityLabel={`${isComplete ? "Food" : "Resolved food"} weight details`}
      accessibilityRole="button"
      accessibilityState={{ expanded: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.nutrientRow,
        selected ? styles.nutrientRowSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.nutrientTopRow}>
        {selected ? (
          <ChevronDown color={color.textMuted} size={18} strokeWidth={2.8} />
        ) : (
          <ChevronRight color={color.textMuted} size={18} strokeWidth={2.8} />
        )}
        <View style={styles.nutrientCopy}>
          <Text
            numberOfLines={1}
            style={[styles.nutrientLabel, { color: color.secondaryMetric }]}
          >
            {isComplete ? "Food weight" : "Resolved weight"}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.nutrientValue, { color: color.secondaryMetric }]}
        >
          {_formatWeightValue({ value: total })}
        </Text>
      </View>
      <View
        style={[
          styles.nutrientTrack,
          {
            backgroundColor: color.progressTrack,
          },
        ]}
      >
        <View
          style={[
            styles.nutrientFill,
            {
              backgroundColor: color.secondaryMetric,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function NutrientContributors({
  entries,
  nutrient,
  total,
}: {
  readonly entries: readonly FoodMealEntry[];
  readonly nutrient: NutrientDetail;
  readonly total: number;
}) {
  const contributionValueOrder = Order.mapInput(
    Order.flip(Order.Number),
    (contribution: FoodNutrientContribution) =>
      Reporting.getNutrientTotal({
        nutrientName: nutrient.nutrientName,
        totals: contribution.totals,
      })
  );
  const contributions = Array.sortBy(contributionValueOrder)(
    _calculateFoodNutrientContributions({ entries }).filter(
      (contribution) =>
        Reporting.getNutrientTotal({
          nutrientName: nutrient.nutrientName,
          totals: contribution.totals,
        }) > 0
    )
  );

  return (
    <View style={styles.contributors}>
      {Array.isReadonlyArrayNonEmpty(contributions) ? (
        contributions.map((contribution) => (
          <ContributionRow
            contribution={contribution}
            key={contribution.food.id}
            nutrient={nutrient}
            total={total}
          />
        ))
      ) : (
        <View style={styles.emptyContributors}>
          <Text style={styles.emptyContributorsText}>
            No foods contribute to this macro.
          </Text>
        </View>
      )}
    </View>
  );
}

function WeightContributors({
  entries,
  total,
}: {
  readonly entries: readonly FoodMealEntry[];
  readonly total: number;
}) {
  const contributionValueOrder = Order.mapInput(
    Order.flip(Order.Number),
    (contribution: FoodNutrientContribution) => contribution.quantityGrams
  );
  const contributions = Array.sortBy(contributionValueOrder)(
    _calculateFoodNutrientContributions({ entries }).filter(
      (contribution) => contribution.quantityGrams > 0
    )
  );

  return (
    <View style={styles.contributors}>
      {Array.isReadonlyArrayNonEmpty(contributions) ? (
        contributions.map((contribution) => (
          <WeightContributionRow
            contribution={contribution}
            key={contribution.food.id}
            total={total}
          />
        ))
      ) : (
        <View style={styles.emptyContributors}>
          <Text style={styles.emptyContributorsText}>
            No foods contribute to this weight.
          </Text>
        </View>
      )}
    </View>
  );
}

function ContributionRow({
  contribution,
  nutrient,
  total,
}: {
  readonly contribution: FoodNutrientContribution;
  readonly nutrient: NutrientDetail;
  readonly total: number;
}) {
  const value = Reporting.getNutrientTotal({
    nutrientName: nutrient.nutrientName,
    totals: contribution.totals,
  });
  const percent = total <= 0 ? 0 : value / total;
  const clampedPercent = Math.max(0, Math.min(1, percent));
  const percentLabel = formatNumber({
    maximumFractionDigits: 0,
    value: clampedPercent * 100,
  });
  const quantityLabel = `${formatNumber({
    maximumFractionDigits: contribution.quantityGrams < 10 ? 1 : 0,
    value: contribution.quantityGrams,
  })} g`;

  return (
    <View style={styles.contributionRow}>
      <View style={styles.contributionCopy}>
        <Text numberOfLines={1} style={styles.contributionName}>
          {contribution.food.name}
        </Text>
        <Text numberOfLines={1} style={styles.contributionDetail}>
          {contribution.food.brand === undefined
            ? quantityLabel
            : `${contribution.food.brand}, ${quantityLabel}`}
        </Text>
      </View>
      <View style={styles.contributionImpact}>
        <View style={styles.contributionValueRow}>
          <Text
            style={[styles.contributionPercent, { color: nutrient.colorValue }]}
          >
            ({percentLabel}%)
          </Text>
          <Text
            style={[styles.contributionValue, { color: nutrient.colorValue }]}
          >
            {_formatNutrientValue({
              unit: nutrient.unit,
              value,
            })}
          </Text>
        </View>
        <View style={styles.contributionTrack}>
          <View
            style={[
              styles.contributionFill,
              {
                backgroundColor: nutrient.colorValue,
                width: `${clampedPercent * 100}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function WeightContributionRow({
  contribution,
  total,
}: {
  readonly contribution: FoodNutrientContribution;
  readonly total: number;
}) {
  const percent = total <= 0 ? 0 : contribution.quantityGrams / total;
  const clampedPercent = Math.max(0, Math.min(1, percent));
  const percentLabel = formatNumber({
    maximumFractionDigits: 0,
    value: clampedPercent * 100,
  });
  const quantityLabel = _formatWeightValue({
    value: contribution.quantityGrams,
  });

  return (
    <View style={styles.contributionRow}>
      <View style={styles.contributionCopy}>
        <Text numberOfLines={1} style={styles.contributionName}>
          {contribution.food.name}
        </Text>
        <Text numberOfLines={1} style={styles.contributionDetail}>
          {contribution.food.brand === undefined
            ? `${contribution.entries.length} entries`
            : contribution.food.brand}
        </Text>
      </View>
      <View style={styles.contributionImpact}>
        <View style={styles.contributionValueRow}>
          <Text
            style={[
              styles.contributionPercent,
              { color: color.secondaryMetric },
            ]}
          >
            ({percentLabel}%)
          </Text>
          <Text
            style={[styles.contributionValue, { color: color.secondaryMetric }]}
          >
            {quantityLabel}
          </Text>
        </View>
        <View style={styles.contributionTrack}>
          <View
            style={[
              styles.contributionFill,
              {
                backgroundColor: color.secondaryMetric,
                width: `${clampedPercent * 100}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function _formatNutrientValue({
  unit,
  value,
}: {
  readonly unit: NutrientUnit;
  readonly value: number;
}) {
  return `${formatNumber({
    maximumFractionDigits: value < 10 ? 1 : 0,
    value,
  })}${unit}`;
}

function _formatWeightValue({ value }: { readonly value: number }) {
  return `${formatNumber({
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    value,
  })}g`;
}

function _calculateFoodNutrientContributions({
  entries,
}: {
  readonly entries: readonly FoodMealEntry[];
}): readonly FoodNutrientContribution[] {
  return entries.reduce<readonly FoodNutrientContribution[]>(
    (contributions, entry) => {
      const entryTotals: Reporting.NutrientTotals = {
        carbsGrams: entry.nutrients.carbsGrams,
        energyKcal: entry.nutrients.energyKcal,
        fatGrams: entry.nutrients.fatGrams,
        fiberGrams: entry.nutrients.fiberGrams ?? 0,
        proteinGrams: entry.nutrients.proteinGrams,
        saltGrams: entry.nutrients.saltGrams ?? 0,
        saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
        sugarGrams: entry.nutrients.sugarGrams ?? 0,
      };
      const previousContribution = contributions.find(
        (contribution) => contribution.food.id === entry.food.id
      );

      if (previousContribution === undefined) {
        const quantityGrams =
          mealEntryMassGrams({
            food: entry.food,
            mealEntry: entry.mealEntry,
          }) ?? 0;

        return [
          ...contributions,
          {
            entries: [entry],
            food: entry.food,
            quantityGrams,
            totals: entryTotals,
          },
        ];
      }

      return contributions.map((contribution) =>
        contribution.food.id === entry.food.id
          ? {
              ...contribution,
              entries: [...contribution.entries, entry],
              quantityGrams:
                contribution.quantityGrams +
                (mealEntryMassGrams({
                  food: entry.food,
                  mealEntry: entry.mealEntry,
                }) ?? 0),
              totals: Reporting.addNutrientTotals({
                left: contribution.totals,
                right: entryTotals,
              }),
            }
          : contribution
      );
    },
    []
  );
}

const styles = StyleSheet.create({
  headerSafeArea: {
    backgroundColor: color.primary,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: color.bg,
  },
  content: {
    gap: 0,
    paddingBottom: spacing.xxl,
    backgroundColor: color.bg,
  },
  detailsHeader: {
    marginBottom: 0,
  },
  nutrientList: {
    overflow: "hidden",
    marginHorizontal: -spacing.lg,
    backgroundColor: color.surface,
  },
  nutrientGroup: {
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
  },
  secondaryMetricDivider: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: color.bg,
  },
  secondaryMetricDividerLine: {
    height: 1,
    flex: 1,
    backgroundColor: color.sheetBorder,
  },
  secondaryMetricDividerLabel: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  nutrientRow: {
    minHeight: 76,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: color.surface,
  },
  nutrientRowSelected: {
    backgroundColor: color.primarySoft,
  },
  pressed: {
    opacity: 0.84,
  },
  nutrientTopRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nutrientCopy: {
    minWidth: 0,
    flex: 1,
  },
  nutrientLabel: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  nutrientValue: {
    maxWidth: 176,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  nutrientTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: radius.pill,
  },
  nutrientFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  contributors: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    backgroundColor: color.field,
  },
  contributionRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  contributionCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  contributionName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  contributionDetail: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  contributionImpact: {
    width: 136,
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  contributionValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  contributionValue: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  contributionTrack: {
    width: "100%",
    height: 5,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.progressTrack,
  },
  contributionFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  contributionPercent: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.regular,
    lineHeight: tokens.type.lineHeight.xs,
  },
  emptyContributors: {
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyContributorsText: {
    color: color.textMuted,
    textAlign: "center",
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
});
