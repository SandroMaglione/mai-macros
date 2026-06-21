import {
  addNutrientTotals,
  divideNutrientTotals,
  emptyNutrientTotals,
  getPlanNutrientTargetAmount,
  type NutrientName,
  type NutrientTotals,
} from "@mai/nutrition";
import type { NutritionReportRange } from "@mai/nutrition/services/nutrition-reports";
import { Array as EffectArray } from "effect";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SectionCard } from "@/components/ui";
import { formatDateTitle, formatNumber } from "@/lib/format";
import { color, radius, spacing, type } from "@/theme/tokens";

import {
  getNutritionReportInsights,
  type NutritionReportInsight,
} from "./nutrition-report-insights.ts";

type RangeSummaryProps = {
  readonly report: NutritionReportRange;
};

type FoodContributor = {
  readonly foodId: string;
  readonly name: string;
  readonly totals: NutrientTotals;
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
] as const satisfies readonly NutrientName[];

const macroNutrients = [
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
] as const satisfies readonly NutrientName[];

const nutrientLabels = {
  carbsGrams: "Carbs",
  energyKcal: "Calories",
  fatGrams: "Fat",
  fiberGrams: "Fiber",
  proteinGrams: "Protein",
  saltGrams: "Salt",
  saturatedFatGrams: "Sat fat",
  sugarGrams: "Sugar",
} satisfies Record<NutrientName, string>;

const nutrientColors = {
  carbsGrams: color.nutritionCarbs,
  energyKcal: color.nutritionEnergy,
  fatGrams: color.nutritionFat,
  fiberGrams: color.nutritionFiber,
  proteinGrams: color.nutritionProtein,
  saltGrams: color.nutritionSalt,
  saturatedFatGrams: color.warningText,
  sugarGrams: color.nutritionSugar,
} satisfies Record<NutrientName, string>;

export function RangeSummary({ report }: RangeSummaryProps) {
  const dayCount = report.days.length;
  const entries = report.days.flatMap((day) => day.entries);
  const loggedMealCount = entries.length;
  const totals = report.days.reduce<NutrientTotals>(
    (currentTotals, day) =>
      addNutrientTotals({
        left: currentTotals,
        right: day.totals,
      }),
    emptyNutrientTotals()
  );
  const averageTotals =
    dayCount === 0
      ? emptyNutrientTotals()
      : divideNutrientTotals({
          divisor: dayCount,
          totals,
        });
  const averageTargetTotals = trackedNutrients.reduce<
    Record<NutrientName, number | null>
  >(
    (targets, nutrientName) => ({
      ...targets,
      [nutrientName]: getAverageTargetAmount({
        nutrientName,
        report,
      }),
    }),
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
          totals: emptyNutrientTotals(),
        } satisfies FoodContributor);

      return {
        ...contributors,
        [entry.food.id]: {
          ...current,
          totals: addNutrientTotals({
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
  const insights = getNutritionReportInsights({
    limit: 5,
    report,
  });
  const inRangeDays = report.days.filter(
    (day) => day.isInsideExpectedPlanRange
  ).length;

  return (
    <View style={styles.root}>
      <SummaryInsights insights={insights} />

      <SectionCard style={styles.overviewPanel}>
        <View style={styles.overviewContent}>
          <Text style={styles.dateRange}>
            {formatDateTitle({ dateKey: report.startDateKey })} -{" "}
            {formatDateTitle({ dateKey: report.endDateKey })}
          </Text>
          <View style={styles.overviewGrid}>
            <OverviewMetric
              label="Avg calories"
              tone={color.nutritionEnergy}
              value={_formatNutrient({
                nutrientName: "energyKcal",
                value: averageTotals.energyKcal,
              })}
            />
            <OverviewMetric
              label="Logged meals"
              tone={color.primary}
              value={formatNumber({
                maximumFractionDigits: 0,
                value: loggedMealCount,
              })}
            />
            <OverviewMetric
              label="In range"
              tone={color.successText}
              value={`${inRangeDays}/${dayCount}`}
            />
          </View>

          <View style={styles.macroRow}>
            {macroNutrients.map((nutrientName) => (
              <MacroPill
                key={nutrientName}
                nutrientName={nutrientName}
                value={averageTotals[nutrientName]}
              />
            ))}
          </View>
        </View>
      </SectionCard>

      <View style={styles.section}>
        <SectionTitle
          subtitle="Average daily intake compared with daily targets when available."
          title="7-day average"
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
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle
          subtitle="Top foods contributing to each nutrient across this range."
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
        </View>
      </View>
    </View>
  );
}

function SummaryInsights({
  insights,
}: {
  readonly insights: readonly NutritionReportInsight[];
}) {
  return (
    <View style={[styles.section, styles.summarySection]}>
      <SectionTitle
        subtitle="Patterns ranked from food-specific signals to broader habits."
        title="Summary"
      />
      <View style={styles.insightList}>
        {!EffectArray.isReadonlyArrayNonEmpty(insights) ? (
          <Text style={styles.emptyText}>
            Log more meals to surface weekly food and meal patterns.
          </Text>
        ) : (
          insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <Text style={styles.insightText}>
                {insight.parts.map((part, index) => (
                  <Text
                    key={`${insight.id}-${index}`}
                    style={
                      part.tone === "food" ? styles.insightFoodText : undefined
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
    </View>
  );
}

function OverviewMetric({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone: string;
  readonly value: string;
}) {
  return (
    <View style={styles.overviewMetric}>
      <View style={[styles.metricAccent, { backgroundColor: tone }]} />
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function MacroPill({
  nutrientName,
  value,
}: {
  readonly nutrientName: NutrientName;
  readonly value: number;
}) {
  return (
    <View style={styles.macroPill}>
      <View
        style={[
          styles.macroDot,
          { backgroundColor: nutrientColors[nutrientName] },
        ]}
      />
      <Text numberOfLines={1} style={styles.macroLabel}>
        {nutrientLabels[nutrientName]}
      </Text>
      <Text numberOfLines={1} style={styles.macroValue}>
        {_formatNutrient({ nutrientName, value })}
      </Text>
    </View>
  );
}

function NutrientBalanceCard({
  actual,
  nutrientName,
  target,
}: {
  readonly actual: number;
  readonly nutrientName: NutrientName;
  readonly target: number | null;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";
  const progress = target === null || target <= 0 ? 0 : actual / target;

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
        <Text numberOfLines={1} style={styles.nutrientDelta}>
          {target === null
            ? "No target"
            : formatSignedNumber({
                unit,
                value: actual - target,
              })}
        </Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.nutrientValue}>
        {_formatNutrient({ nutrientName, value: actual })}
      </Text>
      <View style={styles.nutrientTrack}>
        <View
          style={[
            styles.nutrientFill,
            {
              backgroundColor: nutrientColors[nutrientName],
              width: `${Math.min(progress, 1) * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

function FoodContributorGroup({
  foods,
  nutrientName,
}: {
  readonly foods: readonly FoodContributor[];
  readonly nutrientName: NutrientName;
}) {
  return (
    <View style={styles.foodGroup}>
      <Text
        style={[styles.foodGroupTitle, { color: nutrientColors[nutrientName] }]}
      >
        {nutrientLabels[nutrientName]}
      </Text>
      {!EffectArray.isReadonlyArrayNonEmpty(foods) ? (
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

export function getAverageTargetAmount({
  nutrientName,
  report,
}: {
  readonly nutrientName: NutrientName;
  readonly report: NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const targetAmounts = report.days.flatMap((day) => {
    const amount = getPlanNutrientTargetAmount({
      nutrientName,
      plan: day.plan,
    });

    return amount === undefined ? [] : [amount];
  });

  if (dayCount === 0 || targetAmounts.length !== dayCount) {
    return null;
  }

  return targetAmounts.reduce((total, amount) => total + amount, 0) / dayCount;
}

function _formatNutrient({
  nutrientName,
  value,
}: {
  readonly nutrientName: NutrientName;
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

export function formatSignedNumber({
  unit,
  value,
}: {
  readonly unit: string;
  readonly value: number;
}) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatNumber({ value })}${unit}`;
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxxl,
  },
  dateRange: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  overviewPanel: {
    borderColor: color.sheetBorder,
    backgroundColor: color.sheet,
  },
  overviewContent: {
    gap: spacing.md,
  },
  overviewGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  overviewMetric: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  metricAccent: {
    height: 3,
    width: 34,
    borderRadius: radius.pill,
  },
  metricValue: {
    color: color.text,
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  metricLabel: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  macroPill: {
    minWidth: 96,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  macroDot: {
    height: 8,
    width: 8,
    borderRadius: radius.pill,
  },
  macroLabel: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
  macroValue: {
    marginLeft: "auto",
    color: color.text,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  section: {
    gap: spacing.md,
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
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  sectionSubtitle: {
    color: color.textSubtle,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
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
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  insightFoodText: {
    color: color.warningText,
    fontWeight: type.weight.black,
  },
  emptyText: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
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
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
    backgroundColor: color.sheet,
    padding: spacing.md,
  },
  nutrientCardHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nutrientCardTitle: {
    minWidth: 0,
    flex: 1,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  nutrientDelta: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  nutrientValue: {
    color: color.text,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  nutrientTrack: {
    height: 5,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.progressTrack,
  },
  nutrientFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  foodGroups: {
    gap: spacing.lg,
  },
  foodGroup: {
    gap: spacing.sm,
  },
  foodGroupTitle: {
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
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
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  foodAmount: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
});
