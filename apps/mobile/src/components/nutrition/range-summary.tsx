import { NutritionReports, Reporting } from "@mai/nutrition";
import { Array as EffectArray } from "effect";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatNumber } from "@/lib/format";
import { color, radius, spacing, tokens } from "@/theme/tokens";

import {
  getNutritionReportInsights,
  type NutritionReportInsight,
} from "./nutrition-report-insights.ts";

type RangeSummaryProps = {
  readonly report: NutritionReports.NutritionReportRange;
};

type FoodContributor = {
  readonly foodId: string;
  readonly name: string;
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

export function RangeSummary({ report }: RangeSummaryProps) {
  const dayCount = report.days.length;
  const entries = report.days.flatMap((day) => day.entries);
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
  const averageTargetTotals = trackedNutrients.reduce<
    Record<Reporting.NutrientName, number | null>
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
          totals: Reporting.emptyNutrientTotals(),
        } satisfies FoodContributor);

      return {
        ...contributors,
        [entry.food.id]: {
          ...current,
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
  const insights = getNutritionReportInsights({
    limit: 5,
    report,
  });

  return (
    <View style={styles.root}>
      <SummaryInsights insights={insights} />

      <View style={styles.section}>
        <SectionTitle
          subtitle="Average daily intake across recorded days in the last 7 days, compared with daily targets when available."
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

  return (
    <View style={styles.nutrientCard}>
      <Text
        numberOfLines={1}
        style={[
          styles.nutrientCardTitle,
          { color: nutrientColors[nutrientName] },
        ]}
      >
        {nutrientLabels[nutrientName]}
      </Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.nutrientValue}>
        {_formatNutrient({ nutrientName, value: actual })}
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
  readonly nutrientName: Reporting.NutrientName;
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const dayCount = report.days.length;
  const targetAmounts = report.days.flatMap((day) => {
    const amount = Reporting.getPlanNutrientTargetAmount({
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

export function formatSignedNumber({
  unit,
  value,
}: {
  readonly unit: string;
  readonly value: number;
}) {
  const formatted = formatNumber({
    maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 10 ? 1 : 0,
    value: Math.abs(value),
  });

  if (value === 0) {
    return `0 ${unit}`;
  }

  return `${value > 0 ? "+" : "-"}${formatted} ${unit}`;
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
  nutrientCardTitle: {
    minWidth: 0,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
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
