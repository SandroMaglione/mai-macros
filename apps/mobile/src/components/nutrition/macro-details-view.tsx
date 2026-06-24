import {
  AppHeader,
  AppScreen,
  Button,
  IconButton,
  LoadingView,
  Notice,
} from "@/components/ui";
import { formatNumber } from "@/lib/format";
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
import { useMachine } from "@xstate/react";
import { Array as EffectArray, Effect, Order } from "effect";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type MacroDetailsScope =
  | {
      readonly _tag: "Day";
    }
  | {
      readonly _tag: "Meal";
      readonly meal: Domain.Meal;
    };

type MacroDetailsRouteData = {
  readonly dateKey: Domain.DateKey;
  readonly day: DailyLogs.OpenedDay;
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
  readonly scope: MacroDetailsScope;
};

type MacroDetailsLoadResult =
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: Domain.DateKey;
    }
  | {
      readonly _tag: "Ready";
      readonly data: MacroDetailsRouteData;
    };

type MacroDetailsSelectionEvent =
  | {
      readonly nutrientName: Reporting.NutrientName;
      readonly type: "selectNutrient";
    }
  | {
      readonly type: "clearSelection";
    };

type NutrientUnit = "g" | "kcal";

type NutrientDetail = {
  readonly colorValue: string;
  readonly label: string;
  readonly nutrientName: Reporting.NutrientName;
  readonly trackColor: string;
  readonly unit: NutrientUnit;
};

type MealEntryNutrients = ReturnType<typeof Utils.calculateEntryNutrients>;

type FoodMealEntry = {
  readonly food: Domain.Food;
  readonly mealEntry: Domain.MealEntry;
  readonly nutrients: MealEntryNutrients;
};

type FoodNutrientContribution = {
  readonly entries: readonly FoodMealEntry[];
  readonly food: Domain.Food;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

const mealLabels = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
} satisfies Record<Domain.Meal, string>;

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
  types: {
    context: {} as {
      readonly data: MacroDetailsRouteData | null;
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.Meal | undefined;
      readonly message: string | null;
    },
    events: {} as {
      readonly type: "reload";
    },
    input: {} as {
      readonly dateKey: Domain.DateKey;
      readonly meal: Domain.Meal | undefined;
    },
  },
  actors: {
    loadMacroDetails: fromPromise<
      MacroDetailsLoadResult,
      {
        readonly dateKey: Domain.DateKey;
        readonly meal: Domain.Meal | undefined;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(loadMacroDetailsRouteData(input))
    ),
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
        src: "loadMacroDetails",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          meal: context.meal,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "NoMealPlans",
            target: "Redirected",
            actions: ({ event }) => {
              const output = event.output;

              if (output._tag === "NoMealPlans") {
                router.replace({
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
            actions: assign(({ event }) => {
              if (event.output._tag !== "Ready") {
                return {
                  data: null,
                  message: "Could not load nutrition details.",
                };
              }

              return {
                data: event.output.data,
                message: null,
              };
            }),
          },
        ],
        onError: {
          target: "Failed",
          actions: assign({
            message: "Could not load nutrition details.",
          }),
        },
      },
    },
    Failed: {
      on: {
        reload: {
          target: "Loading",
          actions: assign({
            data: null,
            message: null,
          }),
        },
      },
    },
    Ready: {
      on: {
        reload: {
          target: "Loading",
          actions: assign({
            data: null,
            message: null,
          }),
        },
      },
    },
    Redirected: {},
  },
});

const macroDetailsSelectionMachine = setup({
  types: {
    context: {} as {
      readonly selectedNutrientName: Reporting.NutrientName | null;
    },
    events: {} as MacroDetailsSelectionEvent,
  },
}).createMachine({
  context: {
    selectedNutrientName: null,
  },
  on: {
    clearSelection: {
      actions: assign({
        selectedNutrientName: null,
      }),
    },
    selectNutrient: {
      actions: assign(({ context, event }) => {
        assertEvent(event, "selectNutrient");

        return {
          selectedNutrientName:
            context.selectedNutrientName === event.nutrientName
              ? null
              : event.nutrientName,
        };
      }),
    },
  },
});

export function MacroDetailsRoute({
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.Meal | undefined;
}) {
  const [snapshot, send] = useMachine(macroDetailsRouteMachine, {
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
        <Notice
          message={snapshot.context.message ?? "Could not load details."}
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send({
              type: "reload",
            });
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </AppScreen>
    );
  }

  return snapshot.context.data === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading details" />
    </AppScreen>
  ) : (
    <MacroDetailsView data={snapshot.context.data} />
  );
}

function MacroDetailsView({ data }: { readonly data: MacroDetailsRouteData }) {
  const [snapshot, send] = useMachine(macroDetailsSelectionMachine);
  const meal = data.scope._tag === "Meal" ? data.scope.meal : null;
  const mealEntries =
    meal === null
      ? data.mealEntries
      : data.mealEntries.filter((mealEntry) => mealEntry.meal === meal);
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
              quantityGrams: mealEntry.quantityGrams,
            }),
          },
        ];
  });
  const title = meal === null ? "Day details" : mealLabels[meal];
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
            snapshot.context.selectedNutrientName === nutrient.nutrientName;
          const total = Reporting.getNutrientTotal({
            nutrientName: nutrient.nutrientName,
            totals,
          });

          return (
            <View key={nutrient.nutrientName} style={styles.nutrientGroup}>
              <NutrientRow
                nutrient={nutrient}
                onPress={() => {
                  send({
                    nutrientName: nutrient.nutrientName,
                    type: "selectNutrient",
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
  const contributions = EffectArray.sortBy(contributionValueOrder)(
    entries
      .reduce<readonly FoodNutrientContribution[]>((contributions, entry) => {
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
          return [
            ...contributions,
            {
              entries: [entry],
              food: entry.food,
              quantityGrams: entry.mealEntry.quantityGrams,
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
                  contribution.quantityGrams + entry.mealEntry.quantityGrams,
                totals: Reporting.addNutrientTotals({
                  left: contribution.totals,
                  right: entryTotals,
                }),
              }
            : contribution
        );
      }, [])
      .filter(
        (contribution) =>
          Reporting.getNutrientTotal({
            nutrientName: nutrient.nutrientName,
            totals: contribution.totals,
          }) > 0
      )
  );

  return (
    <View style={styles.contributors}>
      {EffectArray.isReadonlyArrayNonEmpty(contributions) ? (
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

export function loadMacroDetailsRouteData({
  dateKey,
  meal,
}: {
  readonly dateKey: Domain.DateKey;
  readonly meal: Domain.Meal | undefined;
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
    const mealEntries = yield* mealEntriesService.listForDay({
      input: {
        dateKey: day.dailyLog.dateKey,
      },
    });

    return {
      _tag: "Ready" as const,
      data: {
        dateKey: day.dailyLog.dateKey,
        day,
        foods,
        mealEntries,
        scope:
          meal === undefined
            ? {
                _tag: "Day" as const,
              }
            : {
                _tag: "Meal" as const,
                meal,
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
