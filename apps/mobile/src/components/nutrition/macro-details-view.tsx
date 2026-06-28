import {
  AppHeader,
  AppScreen,
  Button,
  IconButton,
  LoadingView,
  Notice,
} from "@/components/ui";
import { todayDateKey } from "@/lib/date-keys";
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

const MacroDetailsRouteResult = Schema.Union([
  Schema.TaggedStruct("InvalidRoute", {}),
  Schema.TaggedStruct("NoMealPlans", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("UnrecordedDay", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("Ready", {
    data: MacroDetailsRouteData,
  }),
]);

const MacroDetailsRouteContext = Schema.Struct({
  data: Schema.NullOr(MacroDetailsRouteData),
  dateKey: Domain.DateKey,
  meal: Schema.UndefinedOr(Domain.MealId),
  message: Schema.NullOr(Schema.String),
});

const NutrientName = Schema.Literals(Reporting.NutrientNames);

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
    Failed: {},
    Ready: {},
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
        output: Schema.toStandardSchemaV1(MacroDetailsRouteResult),
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
        onDone: ({ event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              InvalidRoute: () => ({
                target: "Failed",
                context: {
                  message: "Could not find this meal.",
                },
              }),
              NoMealPlans: ({ dateKey }) => {
                enq(actions.redirectToNewPlan, { dateKey });

                return { target: "Redirected" };
              },
              Ready: ({ data }) => ({
                target: "Ready",
                context: {
                  data,
                  message: null,
                },
              }),
              UnrecordedDay: () => ({
                target: "Failed",
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
          context: {
            data: null,
            message: null,
          },
        },
      },
    },
    Ready: {
      on: {
        reload: {
          target: "Loading",
          context: {
            data: null,
            message: null,
          },
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
        selectedNutrientName: Schema.NullOr(NutrientName),
      })
    ),
    events: {
      clearSelection: Schema.toStandardSchemaV1(EmptyEvent),
      selectNutrient: Schema.toStandardSchemaV1(
        Schema.Struct({
          nutrientName: NutrientName,
        })
      ),
    },
  },
  states: {
    Selected: {},
  },
}).createMachine({
  context: {
    selectedNutrientName: null,
  },
  initial: "Selected",
  states: {
    Selected: {},
  },
  on: {
    clearSelection: {
      context: {
        selectedNutrientName: null,
      },
    },
    selectNutrient: ({ context, event }) => ({
      context: {
        selectedNutrientName:
          context.selectedNutrientName === event.nutrientName
            ? null
            : event.nutrientName,
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
  const routeState = snapshot.value;

  if (routeState === "Loading" || routeState === "Redirected") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading details" />
      </AppScreen>
    );
  }

  if (routeState === "Failed") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load details."}
          tone="danger"
        />
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

  return snapshot.context.data === null ? (
    <AppScreen contentStyle={styles.centered}>
      <LoadingView message="Loading details" />
    </AppScreen>
  ) : (
    <MacroDetailsView data={snapshot.context.data} />
  );
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
              quantityGrams: mealEntry.quantityGrams,
            }),
          },
        ];
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
                  actor.trigger.selectNutrient({
                    nutrientName: nutrient.nutrientName,
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
  const contributions = Array.sortBy(contributionValueOrder)(
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
