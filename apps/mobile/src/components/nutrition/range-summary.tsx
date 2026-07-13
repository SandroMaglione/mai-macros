import { Button } from "@/components/ui/button";
import { EmptyEvent } from "@mai/machines";
import { NutritionReports, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronDown,
  ChevronUp,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { setup } from "xstate";

import { formatNumber, mealEntryMassGrams } from "@/lib/format";
import { color, radius, spacing, tokens } from "@/theme/tokens";

import {
  getNutritionReportInsights,
  type NutritionReportInsight,
} from "@/lib/nutrition-report-insights";
import {
  getNutritionTargetTrend,
  type NutritionTargetTrend,
} from "@/lib/nutrition-target-trend";

type FoodContributor = {
  readonly foodId: string;
  readonly name: string;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

const trackedNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const satisfies readonly Reporting.NutrientName[];

const nutrientLabels = {
  carbsGrams: "Carbs",
  energyKcal: "Calories",
  fatGrams: "Fat",
  fiberGrams: "Fiber",
  proteinGrams: "Protein",
  saltGrams: "Salt",
  saturatedFatGrams: "Sat fat",
  sugarGrams: "Sugar",
} satisfies Record<Reporting.NutrientName, string>;

const nutrientColors = {
  carbsGrams: color.nutritionCarbs,
  energyKcal: color.nutritionEnergy,
  fatGrams: color.nutritionFat,
  fiberGrams: color.nutritionFiber,
  proteinGrams: color.nutritionProtein,
  saltGrams: color.nutritionSalt,
  saturatedFatGrams: color.warningText,
  sugarGrams: color.nutritionSugar,
} satisfies Record<Reporting.NutrientName, string>;

const summaryInsightLimit = 5;

type TargetTrendKind = NutritionTargetTrend | "none";

const targetTrendIndicators = {
  above: {
    accessibilityLabel: "Average above target",
    color: color.primary,
    icon: TrendingUp,
  },
  below: {
    accessibilityLabel: "Average below target",
    color: color.textMuted,
    icon: TrendingDown,
  },
  inside: {
    accessibilityLabel: "Average inside target",
    color: color.successText,
    icon: Minus,
  },
  none: {
    accessibilityLabel: "No target",
    color: color.textSubtle,
    icon: Minus,
  },
} satisfies Record<
  TargetTrendKind,
  {
    readonly accessibilityLabel: string;
    readonly color: string;
    readonly icon: LucideIcon;
  }
>;

const summaryInsightsVisibilityMachine = setup({
  schemas: {
    events: {
      collapse: Schema.toStandardSchemaV1(EmptyEvent),
      expand: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Collapsed: {},
    Expanded: {},
  },
}).createMachine({
  initial: "Collapsed",
  states: {
    Collapsed: {
      on: {
        expand: {
          target: "Expanded",
        },
      },
    },
    Expanded: {
      on: {
        collapse: {
          target: "Collapsed",
        },
      },
    },
  },
});

export function RangeSummary({
  rangeDayCount,
  report,
}: {
  readonly rangeDayCount: 7 | 30 | 90;
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const entries = report.days.flatMap((day) => day.entries);
  const totalQuantityGrams = entries.reduce(
    (total, entry) =>
      total +
      (mealEntryMassGrams({
        food: entry.food,
        mealEntry: entry.mealEntry,
      }) ?? 0),
    0
  );
  const weightCoverageComplete = entries.every(
    (entry) =>
      mealEntryMassGrams({
        food: entry.food,
        mealEntry: entry.mealEntry,
      }) !== undefined
  );
  const totals = report.days.reduce<Reporting.NutrientTotals>(
    (currentTotals, day) =>
      Reporting.addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    Reporting.emptyNutrientTotals()
  );
  const averageTotals =
    dayCount === 0
      ? Reporting.emptyNutrientTotals()
      : Reporting.divideNutrientTotals({
          divisor: dayCount,
          totals,
        });
  const averageQuantityGrams =
    dayCount === 0 ? 0 : totalQuantityGrams / dayCount;
  const averageGramsPerCalorie = Reporting.calculateGramsPerCalorie({
    energyKcal: averageTotals.energyKcal,
    quantityGrams: averageQuantityGrams,
  });
  const averageGramsPerCalorieLabel =
    !weightCoverageComplete || averageGramsPerCalorie === null
      ? "- g/kcal"
      : `${formatNumber({
          maximumFractionDigits: averageGramsPerCalorie < 1 ? 2 : 1,
          value: averageGramsPerCalorie,
        })} g/kcal`;
  const averageTargetTotals = trackedNutrients.reduce<
    Record<Reporting.NutrientName, number | null>
  >(
    (targets, nutrientName) => {
      const targetAmounts = report.days.flatMap((day) => {
        const amount = Reporting.getPlanNutrientTargetAmount({
          nutrientName,
          plan: day.plan,
        });

        return amount === undefined ? [] : [amount];
      });

      return {
        ...targets,
        [nutrientName]:
          dayCount === 0 || targetAmounts.length !== dayCount
            ? null
            : targetAmounts.reduce((total, amount) => total + amount, 0) /
              dayCount,
      };
    },
    {
      carbsGrams: null,
      energyKcal: null,
      fatGrams: null,
      fiberGrams: null,
      proteinGrams: null,
      saltGrams: null,
      saturatedFatGrams: null,
      sugarGrams: null,
    }
  );
  const foodContributors = Object.values(
    entries.reduce<Record<string, FoodContributor>>((contributors, entry) => {
      const current =
        contributors[entry.food.id] ??
        ({
          foodId: entry.food.id,
          name: entry.food.name,
          quantityGrams: 0,
          totals: Reporting.emptyNutrientTotals(),
        } satisfies FoodContributor);

      return {
        ...contributors,
        [entry.food.id]: {
          ...current,
          quantityGrams:
            current.quantityGrams +
            (mealEntryMassGrams({
              food: entry.food,
              mealEntry: entry.mealEntry,
            }) ?? 0),
          totals: Reporting.addNutrientTotals({
            left: current.totals,
            right: {
              carbsGrams: entry.nutrients.carbsGrams,
              energyKcal: entry.nutrients.energyKcal,
              fatGrams: entry.nutrients.fatGrams,
              fiberGrams: entry.nutrients.fiberGrams ?? 0,
              proteinGrams: entry.nutrients.proteinGrams,
              saltGrams: entry.nutrients.saltGrams ?? 0,
              saturatedFatGrams: entry.nutrients.saturatedFatGrams ?? 0,
              sugarGrams: entry.nutrients.sugarGrams ?? 0,
            },
          }),
        },
      };
    }, {})
  );
  const defaultInsights = getNutritionReportInsights({
    limit: summaryInsightLimit,
    report,
  });
  const allInsights = getNutritionReportInsights({
    limit: Number.MAX_SAFE_INTEGER,
    report,
  });

  return (
    <View style={styles.root}>
      <SummaryInsights allInsights={allInsights} insights={defaultInsights} />

      <View style={styles.section}>
        <SectionTitle
          subtitle={`Average daily intake across ${dayCount} recorded days in the selected ${rangeDayCount}-day period, compared with daily targets when available.`}
          title="Recorded-day average"
        />
        <View style={styles.nutrientGrid}>
          {trackedNutrients.map((nutrientName) => (
            <NutrientBalanceCard
              actual={averageTotals[nutrientName]}
              key={nutrientName}
              nutrientName={nutrientName}
              target={averageTargetTotals[nutrientName]}
            />
          ))}
          <SecondaryMetricBalanceCard
            label={weightCoverageComplete ? "Food weight" : "Resolved weight"}
            value={_formatWeight({ value: averageQuantityGrams })}
          />
          <SecondaryMetricBalanceCard
            label={
              weightCoverageComplete
                ? "Weight / calorie"
                : "Resolved weight / calorie"
            }
            value={averageGramsPerCalorieLabel}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle
          subtitle="Top foods contributing to each nutrient across recorded days in this range."
          title="Food contributors"
        />
        <View style={styles.foodGroups}>
          {trackedNutrients.map((nutrientName) => {
            const foods = foodContributors
              .filter((food) => food.totals[nutrientName] > 0)
              .sort(
                (left, right) =>
                  right.totals[nutrientName] - left.totals[nutrientName]
              )
              .slice(0, 3);

            return (
              <FoodContributorGroup
                foods={foods}
                key={nutrientName}
                nutrientName={nutrientName}
              />
            );
          })}
          <FoodWeightContributorGroup
            foods={foodContributors
              .filter((food) => food.quantityGrams > 0)
              .sort((left, right) => right.quantityGrams - left.quantityGrams)
              .slice(0, 3)}
            isComplete={weightCoverageComplete}
          />
        </View>
      </View>
    </View>
  );
}

function SummaryInsights({
  allInsights,
  insights,
}: {
  readonly allInsights: readonly NutritionReportInsight[];
  readonly insights: readonly NutritionReportInsight[];
}) {
  const [snapshot, , actor] = useMachine(summaryInsightsVisibilityMachine);
  const isExpanded = snapshot.value === "Expanded";
  const visibleInsights = isExpanded ? allInsights : insights;
  const canToggle = allInsights.length > insights.length;
  const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <View style={[styles.section, styles.summarySection]}>
      <SectionTitle
        subtitle="Patterns ranked from food-specific signals to broader habits."
        title="Summary"
      />
      <View style={styles.insightList}>
        {!Array.isReadonlyArrayNonEmpty(visibleInsights) ? (
          <Text style={styles.emptyText}>
            Log more meals to surface food and meal patterns for this period.
          </Text>
        ) : (
          visibleInsights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <Text style={styles.insightText}>
                {insight.parts.map((part, index) => (
                  <Text
                    key={`${insight.id}-${index}`}
                    style={
                      part.tone === "food"
                        ? styles.insightFoodText
                        : part.tone === "meal"
                          ? styles.insightMealText
                          : undefined
                    }
                  >
                    {part.text}
                  </Text>
                ))}
              </Text>
            </View>
          ))
        )}
      </View>
      {canToggle ? (
        <Button
          icon={ToggleIcon}
          onPress={() => {
            if (isExpanded) {
              actor.trigger.collapse();
              return;
            }

            actor.trigger.expand();
          }}
          style={styles.summaryToggle}
          variant="ghost"
        >
          {isExpanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </View>
  );
}

function NutrientBalanceCard({
  actual,
  nutrientName,
  target,
}: {
  readonly actual: number;
  readonly nutrientName: Reporting.NutrientName;
  readonly target: number | null;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";
  const signedValue = target === null ? null : actual - target;
  const trend =
    target === null ? "none" : getNutritionTargetTrend({ actual, target });
  const formattedSignedValue =
    signedValue === null
      ? null
      : formatNumber({
          maximumFractionDigits:
            Math.abs(signedValue) > 0 && Math.abs(signedValue) < 10 ? 1 : 0,
          value: Math.abs(signedValue),
        });

  return (
    <View style={styles.nutrientCard}>
      <View style={styles.nutrientCardHeader}>
        <Text
          numberOfLines={1}
          style={[
            styles.nutrientCardTitle,
            { color: nutrientColors[nutrientName] },
          ]}
        >
          {nutrientLabels[nutrientName]}
        </Text>
        <TargetTrendIcon trend={trend} />
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.nutrientValue}>
        {_formatNutrient({ nutrientName, value: actual })}
      </Text>
      <Text numberOfLines={1} style={styles.nutrientDelta}>
        {signedValue === null || formattedSignedValue === null
          ? "No target"
          : signedValue === 0
            ? `0 ${unit}`
            : `${signedValue > 0 ? "+" : "-"}${formattedSignedValue} ${unit}`}
      </Text>
    </View>
  );
}

function SecondaryMetricBalanceCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.nutrientCard}>
      <Text
        numberOfLines={1}
        style={[styles.nutrientCardTitle, { color: color.secondaryMetric }]}
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.nutrientValue, { color: color.secondaryMetric }]}
      >
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.nutrientDelta}>
        No target
      </Text>
    </View>
  );
}

function TargetTrendIcon({ trend }: { readonly trend: TargetTrendKind }) {
  const indicator = targetTrendIndicators[trend];
  const Icon = indicator.icon;

  return (
    <View
      accessibilityLabel={indicator.accessibilityLabel}
      accessible
      style={styles.targetTrendIcon}
    >
      <Icon color={indicator.color} size={17} strokeWidth={3} />
    </View>
  );
}

function FoodWeightContributorGroup({
  foods,
  isComplete,
}: {
  readonly foods: readonly FoodContributor[];
  readonly isComplete: boolean;
}) {
  return (
    <View style={styles.foodGroup}>
      <Text style={[styles.foodGroupTitle, { color: color.secondaryMetric }]}>
        {isComplete ? "Food weight" : "Resolved food weight"}
      </Text>
      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <Text style={styles.emptyText}>No tracked foods.</Text>
      ) : (
        <View style={styles.foodRows}>
          {foods.map((food, index) => (
            <Fragment key={`food-weight-${food.foodId}`}>
              {index === 0 ? null : <View style={styles.divider} />}
              <View style={styles.foodRow}>
                <Text numberOfLines={1} style={styles.foodName}>
                  {food.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.foodAmount, { color: color.secondaryMetric }]}
                >
                  {_formatWeight({ value: food.quantityGrams })}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

function FoodContributorGroup({
  foods,
  nutrientName,
}: {
  readonly foods: readonly FoodContributor[];
  readonly nutrientName: Reporting.NutrientName;
}) {
  return (
    <View style={styles.foodGroup}>
      <Text
        style={[styles.foodGroupTitle, { color: nutrientColors[nutrientName] }]}
      >
        {nutrientLabels[nutrientName]}
      </Text>
      {!Array.isReadonlyArrayNonEmpty(foods) ? (
        <Text style={styles.emptyText}>No tracked foods.</Text>
      ) : (
        <View style={styles.foodRows}>
          {foods.map((food, index) => (
            <Fragment key={`${nutrientName}-${food.foodId}`}>
              {index === 0 ? null : <View style={styles.divider} />}
              <View style={styles.foodRow}>
                <Text numberOfLines={1} style={styles.foodName}>
                  {food.name}
                </Text>
                <Text numberOfLines={1} style={styles.foodAmount}>
                  {_formatNutrient({
                    nutrientName,
                    value: food.totals[nutrientName],
                  })}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

function SectionTitle({
  subtitle,
  title,
}: {
  readonly subtitle: string;
  readonly title: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function _formatWeight({ value }: { readonly value: number }) {
  return `${formatNumber({
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    value,
  })}g`;
}

function _formatNutrient({
  nutrientName,
  value,
}: {
  readonly nutrientName: Reporting.NutrientName;
  readonly value: number;
}) {
  if (nutrientName === "energyKcal") {
    return `${formatNumber({
      maximumFractionDigits: 0,
      value,
    })} kcal`;
  }

  return `${formatNumber({ value })}g`;
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxxl,
  },
  section: {
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingTop: spacing.xxl,
  },
  summarySection: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  sectionTitle: {
    gap: spacing.xs,
  },
  sectionHeading: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
  sectionSubtitle: {
    color: color.textSubtle,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.lg,
  },
  insightList: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
  },
  insightCard: {
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingVertical: spacing.sm,
  },
  insightText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  insightFoodText: {
    color: color.warningText,
    fontWeight: tokens.type.weight.black,
  },
  insightMealText: {
    color: color.nutritionProtein,
    fontWeight: tokens.type.weight.black,
  },
  summaryToggle: {
    minHeight: 32,
    minWidth: 0,
    alignSelf: "flex-start",
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  emptyText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  nutrientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  nutrientCard: {
    minWidth: 150,
    flexBasis: "48%",
    flexGrow: 1,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
    backgroundColor: color.sheet,
    padding: spacing.lg,
  },
  nutrientCardHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  nutrientCardTitle: {
    minWidth: 0,
    flex: 1,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  targetTrendIcon: {
    width: 18,
    height: 18,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  nutrientDelta: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  nutrientValue: {
    color: color.text,
    fontSize: tokens.type.size.xxl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xxl,
  },
  foodGroups: {
    gap: spacing.lg,
  },
  foodGroup: {
    gap: spacing.sm,
  },
  foodGroupTitle: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  foodRows: {
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
    backgroundColor: color.sheet,
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: color.sheetBorder,
  },
  foodRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  foodName: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  foodAmount: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
});
