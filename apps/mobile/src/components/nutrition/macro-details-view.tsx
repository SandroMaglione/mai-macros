import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { todayDateKey } from "@/lib/date-keys";
import {
  formatCurrencyMinor,
  formatNumber,
  mealEntryMassGrams,
} from "@/lib/format";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import {
  DailyLogs,
  Domain,
  Foods,
  MealEntries,
  Reporting,
  Utils,
} from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Array, Effect, Order, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

class MacroDetailsLoading extends Schema.TaggedClass<MacroDetailsLoading>(
  "MacroDetailsLoading"
)("MacroDetailsLoading", {
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
}) {}

class MacroDetailsFailed extends Schema.TaggedClass<MacroDetailsFailed>(
  "MacroDetailsFailed"
)("MacroDetailsFailed", {
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
  message: Schema.String,
}) {}

class MacroDetailsReady extends Schema.TaggedClass<MacroDetailsReady>(
  "MacroDetailsReady"
)("MacroDetailsReady", {
  data: MacroDetailsRouteData,
}) {}

class MacroDetailsRedirected extends Schema.TaggedClass<MacroDetailsRedirected>(
  "MacroDetailsRedirected"
)("MacroDetailsRedirected", {}) {}

class ReloadMacroDetails extends Schema.TaggedClass<ReloadMacroDetails>(
  "ReloadMacroDetails"
)("ReloadMacroDetails", {}) {}

class MacroDetailsLoaded extends Schema.TaggedClass<MacroDetailsLoaded>(
  "MacroDetailsLoaded"
)("MacroDetailsLoaded", {
  data: MacroDetailsRouteData,
}) {}

class MacroDetailsLoadFailed extends Schema.TaggedClass<MacroDetailsLoadFailed>(
  "MacroDetailsLoadFailed"
)("MacroDetailsLoadFailed", {
  message: Schema.String,
}) {}

class MacroDetailsWasRedirected extends Schema.TaggedClass<MacroDetailsWasRedirected>(
  "MacroDetailsWasRedirected"
)("MacroDetailsWasRedirected", {}) {}

const FoodWeightMetricName = "foodWeightGrams";
const FoodCostMetricName = "foodCostEur";
const detailMetricNames = [
  ...Reporting.NutrientNames,
  FoodWeightMetricName,
  FoodCostMetricName,
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
  readonly cost: Reporting.EntryCost | null;
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

const MacroDetailsRouteStates = Machine.defineStates({
  MacroDetailsLoading,
  MacroDetailsFailed,
  MacroDetailsReady,
  MacroDetailsRedirected,
});

const macroDetailsRouteMachine = Machine.make({
  states: MacroDetailsRouteStates.states,
  events: [
    ReloadMacroDetails,
    MacroDetailsLoaded,
    MacroDetailsLoadFailed,
    MacroDetailsWasRedirected,
  ],
  input: MacroDetailsRouteInput,
  initial: (input) =>
    MacroDetailsRouteStates.initial.MacroDetailsLoading(
      new MacroDetailsLoading(input)
    ),
}).handle({
  MacroDetailsLoading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "loadMacroDetails",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const dailyLogs = yield* DailyLogs.DailyLogs;
              const foodsService = yield* Foods.Foods;
              const mealEntriesService = yield* MealEntries.MealEntries;
              const day = yield* state.dateKey === todayDateKey()
                ? dailyLogs.openOrCreate({
                    input: { dateKey: state.dateKey },
                  })
                : dailyLogs.open({ input: { dateKey: state.dateKey } });

              if (day._tag === "UnrecordedDay") {
                return new MacroDetailsLoadFailed({
                  message: "Create this day before viewing details.",
                });
              }

              const foods = yield* foodsService.list();
              const mealEntries = yield* mealEntriesService.listForDay({
                input: { dateKey: day.dailyLog.dateKey },
              });
              const selectedMeal =
                state.meal === undefined
                  ? undefined
                  : day.selectedPlan.meals.find(
                      (planMeal) => planMeal.id === state.meal
                    );

              if (state.meal !== undefined && selectedMeal === undefined) {
                return new MacroDetailsLoadFailed({
                  message: "Could not find this meal.",
                });
              }

              return new MacroDetailsLoaded({
                data: {
                  dateKey: day.dailyLog.dateKey,
                  day,
                  foods,
                  mealEntries,
                  scope:
                    state.meal === undefined
                      ? { _tag: "Day" as const }
                      : { _tag: "Meal" as const, meal: state.meal },
                },
              });
            }).pipe(
              Effect.catchTag(
                "NoMealPlans",
                ({ dateKey: missingPlanDateKey }) =>
                  Effect.sync(() => {
                    router.replace({
                      pathname: "/plans/new",
                      params: { dateKey: missingPlanDateKey },
                    });
                    return new MacroDetailsWasRedirected();
                  })
              ),
              Effect.catch(() =>
                Effect.succeed(
                  new MacroDetailsLoadFailed({
                    message: "Could not load nutrition details.",
                  })
                )
              )
            )
          ),
      }),
    on: {
      MacroDetailsLoaded: ({ event, target }) =>
        target.full.MacroDetailsReady(
          new MacroDetailsReady({ data: event.data })
        ),
      MacroDetailsLoadFailed: ({ event, state, target }) =>
        target.full.MacroDetailsFailed(
          new MacroDetailsFailed({
            dateKey: state.dateKey,
            meal: state.meal,
            message: event.message,
          })
        ),
      MacroDetailsWasRedirected: ({ target }) =>
        target.full.MacroDetailsRedirected(new MacroDetailsRedirected()),
    },
  },
  MacroDetailsFailed: {
    on: {
      ReloadMacroDetails: ({ state, target }) =>
        target.full.MacroDetailsLoading(
          new MacroDetailsLoading({
            dateKey: state.dateKey,
            meal: state.meal,
          })
        ),
    },
  },
  MacroDetailsReady: {},
  MacroDetailsRedirected: {},
});

export function MacroDetailsRoute({
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.MealId | undefined;
}) {
  const machineAtom = useMemo(
    () =>
      AtomMachine.make(MobileAtomRuntime, macroDetailsRouteMachine, {
        dateKey,
        meal,
      }),
    [dateKey, meal]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    AsyncResult.isFailure(stateResult) ||
    MacroDetailsRouteStates.matches(stateResult.value, "MacroDetailsLoading") ||
    MacroDetailsRouteStates.matches(stateResult.value, "MacroDetailsRedirected")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading details" />
      </AppScreen>
    );
  }

  const failed = MacroDetailsRouteStates.get(
    stateResult.value,
    "MacroDetailsFailed"
  );
  if (failed._tag === "Some") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={failed.value.message} tone="danger" />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(new ReloadMacroDetails());
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </AppScreen>
    );
  }

  const ready = MacroDetailsRouteStates.get(
    stateResult.value,
    "MacroDetailsReady"
  );

  return ready._tag === "Some" ? (
    <MacroDetailsView data={ready.value.data} />
  ) : (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading details" />
    </AppScreen>
  );
}

function MacroDetailsView({ data }: { readonly data: MacroDetailsRouteData }) {
  const selectedMetricAtom = useMemo(
    () => Atom.make<null | typeof DetailMetricName.Type>(null),
    []
  );
  const selectedMetricName = useAtomValue(selectedMetricAtom);
  const setSelectedMetric = useAtomSet(selectedMetricAtom);
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
            cost: Reporting.calculateEntryCost({
              food,
              quantity: mealEntry.quantity,
            }),
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
  const costTotals = Reporting.calculateMealEntriesCostTotals({
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
          const selected = selectedMetricName === nutrient.nutrientName;
          const total = Reporting.getNutrientTotal({
            nutrientName: nutrient.nutrientName,
            totals,
          });

          return (
            <View key={nutrient.nutrientName} style={styles.nutrientGroup}>
              <NutrientRow
                nutrient={nutrient}
                onPress={() => {
                  setSelectedMetric((current) =>
                    current === nutrient.nutrientName
                      ? null
                      : nutrient.nutrientName
                  );
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
              setSelectedMetric((current) =>
                current === FoodWeightMetricName ? null : FoodWeightMetricName
              );
            }}
            selected={selectedMetricName === FoodWeightMetricName}
            total={weightTotals.quantityGrams}
          />
          {selectedMetricName === FoodWeightMetricName ? (
            <WeightContributors
              entries={entries}
              total={weightTotals.quantityGrams}
            />
          ) : null}
        </View>
        <View style={styles.nutrientGroup}>
          <CostRow
            isComplete={
              costTotals.resolvedEntriesCount === costTotals.entriesCount
            }
            onPress={() => {
              setSelectedMetric((current) =>
                current === FoodCostMetricName ? null : FoodCostMetricName
              );
            }}
            selected={selectedMetricName === FoodCostMetricName}
            totalMinor={costTotals.costMinorByCurrency.EUR}
          />
          {selectedMetricName === FoodCostMetricName ? (
            <CostContributors
              entries={entries}
              totalMinor={costTotals.costMinorByCurrency.EUR}
            />
          ) : null}
        </View>
      </View>
    </AppScreen>
  );
}

function CostRow({
  isComplete,
  onPress,
  selected,
  totalMinor,
}: {
  readonly isComplete: boolean;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly totalMinor: number;
}) {
  return (
    <Pressable
      accessibilityLabel={`${isComplete ? "Food" : "Resolved food"} cost details`}
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
            style={[styles.nutrientLabel, { color: color.safeText }]}
          >
            {isComplete ? "Food cost" : "Resolved cost"}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.nutrientValue, { color: color.safeText }]}
        >
          {formatCurrencyMinor({ currency: "EUR", minorValue: totalMinor })}
          {isComplete ? "" : "+"}
        </Text>
      </View>
      <View style={styles.nutrientTrack}>
        <View
          style={[
            styles.nutrientFill,
            {
              backgroundColor: color.safeText,
              width: totalMinor <= 0 ? "0%" : "100%",
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function CostContributors({
  entries,
  totalMinor,
}: {
  readonly entries: readonly FoodMealEntry[];
  readonly totalMinor: number;
}) {
  const contributions = Object.values(
    entries.reduce<
      Record<
        string,
        {
          readonly costMinor: number;
          readonly food: Domain.Food;
        }
      >
    >((costByFood, entry) => {
      if (entry.cost?.currency !== "EUR") {
        return costByFood;
      }

      const previous = costByFood[entry.food.id];
      return {
        ...costByFood,
        [entry.food.id]: {
          costMinor: (previous?.costMinor ?? 0) + entry.cost.costMinor,
          food: entry.food,
        },
      };
    }, {})
  ).sort((left, right) => right.costMinor - left.costMinor);

  return (
    <View style={styles.contributors}>
      {!Array.isReadonlyArrayNonEmpty(contributions) ? (
        <View style={styles.emptyContributors}>
          <Text style={styles.emptyContributorsText}>
            No logged foods have a compatible current price.
          </Text>
        </View>
      ) : (
        contributions.map((contribution) => {
          const share =
            totalMinor <= 0 ? 0 : contribution.costMinor / totalMinor;
          const clampedShare = Math.max(0, Math.min(1, share));
          const percentLabel = formatNumber({
            maximumFractionDigits: 0,
            value: clampedShare * 100,
          });

          return (
            <View key={contribution.food.id} style={styles.contributionRow}>
              <View style={styles.contributionCopy}>
                <Text numberOfLines={1} style={styles.contributionName}>
                  {contribution.food.name}
                </Text>
                {contribution.food.brand === undefined ? null : (
                  <Text numberOfLines={1} style={styles.contributionDetail}>
                    {contribution.food.brand}
                  </Text>
                )}
              </View>
              <View style={styles.contributionImpact}>
                <View style={styles.contributionValueRow}>
                  <Text
                    style={[
                      styles.contributionPercent,
                      { color: color.safeText },
                    ]}
                  >
                    ({percentLabel}%)
                  </Text>
                  <Text
                    style={[
                      styles.contributionValue,
                      { color: color.safeText },
                    ]}
                  >
                    {formatCurrencyMinor({
                      currency: "EUR",
                      minorValue: contribution.costMinor,
                    })}
                  </Text>
                </View>
                <View style={styles.contributionTrack}>
                  <View
                    style={[
                      styles.contributionFill,
                      {
                        backgroundColor: color.safeText,
                        width: `${clampedShare * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
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
