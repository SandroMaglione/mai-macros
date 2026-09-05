import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyEvent } from "@mai/machines/schemas";
import * as Reporting from "@mai/nutrition/reporting";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { useMachine } from "@xstate/react";
import { Array, Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Minus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react-native";
import { Fragment } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { setup } from "xstate";

import {
  formatCurrencyMinor,
  formatNumber,
  mealEntryMassGrams,
} from "@/lib/format";
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
  readonly costMinor: number;
  readonly foodId: string;
  readonly name: string;
  readonly quantityGrams: number;
  readonly totals: Reporting.NutrientTotals;
};

type MutableFoodContributor = {
  -readonly [Key in keyof FoodContributor]: FoodContributor[Key];
};

type UnresolvedFoodCost = {
  readonly brand: string | undefined;
  readonly entryCount: number;
  readonly foodId: string;
  readonly name: string;
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
const foodContributorPreviewLimit = 3;

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

const listVisibilityMachine = setup({
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

const costCoverageDialogMachine = setup({
  schemas: {
    events: {
      close: Schema.toStandardSchemaV1(EmptyEvent),
      open: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
}).createMachine({
  initial: "Closed",
  states: {
    Closed: { on: { open: { target: "Open" } } },
    Open: { on: { close: { target: "Closed" } } },
  },
});

export function RangeSummary({
  includeEstimates = true,
  rangeDayCount,
  report,
}: {
  readonly includeEstimates?: boolean;
  readonly rangeDayCount: number;
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const [costCoverageSnapshot, , costCoverageActor] = useMachine(
    costCoverageDialogMachine
  );
  const countedDays = NutritionReports.countedNutritionDays({ report });
  const dayCount = countedDays.length;
  const allEntries = countedDays.flatMap((day) => day.entries);
  const entries = allEntries.filter(NutritionReports.isCatalogReportEntry);
  const nutrition = Reporting.calculateNutrientBreakdown(
    allEntries.map((entry) =>
      Reporting.resolveMealEntryNutrients({
        food: entry.food ?? undefined,
        mealEntry: entry.mealEntry,
      })
    )
  );

  const totalQuantityGrams = entries.reduce(
    (total, entry) =>
      total +
      (mealEntryMassGrams({
        food: entry.food,
        mealEntry: entry.mealEntry,
      }) ?? 0),
    0
  );
  const weightCoverageComplete =
    entries.length === allEntries.length &&
    entries.every(
      (entry) =>
        mealEntryMassGrams({
          food: entry.food,
          mealEntry: entry.mealEntry,
        }) !== undefined
    );
  const totalCostMinor = countedDays.reduce(
    (total, day) => total + day.costTotals.costMinorByCurrency.EUR,
    0
  );
  const pricedEntryCount = countedDays.reduce(
    (total, day) => total + day.costTotals.resolvedEntriesCount,
    0
  );
  const costCoverageComplete = pricedEntryCount === allEntries.length;
  const totals = countedDays.reduce<Reporting.NutrientTotals>(
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
          totals: includeEstimates ? totals : nutrition.recorded,
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
      const targetAmounts = countedDays.flatMap((day) => {
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
  const foodContributorsById: Record<string, MutableFoodContributor> = {};

  for (const entry of entries) {
    const current =
      foodContributorsById[entry.food.id] ??
      ({
        foodId: entry.food.id,
        costMinor: 0,
        name: entry.food.name,
        quantityGrams: 0,
        totals: Reporting.emptyNutrientTotals(),
      } satisfies MutableFoodContributor);
    foodContributorsById[entry.food.id] = current;
    current.costMinor +=
      entry.cost?.currency === "EUR" ? entry.cost.costMinor : 0;
    current.quantityGrams +=
      mealEntryMassGrams({
        food: entry.food,
        mealEntry: entry.mealEntry,
      }) ?? 0;
    current.totals = Reporting.addNutrientTotals({
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
    });
  }

  const foodContributors: readonly FoodContributor[] =
    Object.values(foodContributorsById);
  const unresolvedFoodCosts = Object.values(
    entries.reduce<Record<string, UnresolvedFoodCost>>(
      (unresolvedFoods, entry) => {
        if (entry.cost !== null) {
          return unresolvedFoods;
        }

        const previous = unresolvedFoods[entry.food.id];

        return {
          ...unresolvedFoods,
          [entry.food.id]: {
            brand: entry.food.brand,
            entryCount: (previous?.entryCount ?? 0) + 1,
            foodId: entry.food.id,
            name: entry.food.name,
          },
        };
      },
      {}
    )
  ).sort(
    (left, right) =>
      right.entryCount - left.entryCount || left.name.localeCompare(right.name)
  );
  const allInsights = getNutritionReportInsights({
    limit: Number.MAX_SAFE_INTEGER,
    report,
  });
  const defaultInsights = allInsights.slice(0, summaryInsightLimit);

  return (
    <View style={styles.root}>
      <SummaryInsights allInsights={allInsights} insights={defaultInsights} />

      <View style={styles.section}>
        <SectionTitle
          subtitle={`${dayCount} / ${rangeDayCount} days`}
          title="Counted-day average"
        />
        <View style={styles.nutrientGrid}>
          {trackedNutrients.map((nutrientName) => (
            <NutrientBalanceCard
              actual={averageTotals[nutrientName]}
              estimated={
                includeEstimates &&
                nutrition.estimatedCoverage[nutrientName] > 0
              }
              incomplete={nutrition.missing[nutrientName] > 0}
              unknown={
                nutrition.entriesCount > 0 &&
                nutrition.coverage[nutrientName] === 0
              }
              comparisonAvailable={
                nutrition.missing[nutrientName] === 0 &&
                (includeEstimates ||
                  nutrition.estimatedCoverage[nutrientName] === 0)
              }
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
          subtitle="Estimated from current prices. Unpriced foods are excluded."
          title="Food spending"
        />
        <View style={styles.nutrientGrid}>
          <SecondaryMetricBalanceCard
            label={costCoverageComplete ? "Total" : "Resolved total"}
            showTargetStatus={false}
            value={formatCurrencyMinor({
              currency: "EUR",
              minorValue: totalCostMinor,
            })}
          />
          <SecondaryMetricBalanceCard
            label="Daily average"
            showTargetStatus={false}
            value={formatCurrencyMinor({
              currency: "EUR",
              minorValue: dayCount === 0 ? 0 : totalCostMinor / dayCount,
            })}
          />
          <SecondaryMetricBalanceCard
            label="Costs recorded"
            onPress={costCoverageActor.trigger.open}
            showTargetStatus={false}
            value={`${pricedEntryCount} / ${allEntries.length}`}
          />
          <SecondaryMetricBalanceCard
            label="Most expensive"
            showTargetStatus={false}
            value={
              foodContributors
                .filter((food) => food.costMinor > 0)
                .sort((left, right) => right.costMinor - left.costMinor)[0]
                ?.name ?? "–"
            }
          />
        </View>
      </View>

      <CostCoverageDialog
        foods={unresolvedFoodCosts}
        onClose={costCoverageActor.trigger.close}
        pricedEntryCount={pricedEntryCount}
        totalEntryCount={allEntries.length}
        visible={costCoverageSnapshot.matches("Open")}
      />

      <View style={styles.section}>
        <SectionTitle title="Food contributors" />
        <View style={styles.foodGroups}>
          {trackedNutrients.map((nutrientName) => {
            const foods = foodContributors
              .filter((food) => food.totals[nutrientName] > 0)
              .sort(
                (left, right) =>
                  right.totals[nutrientName] - left.totals[nutrientName]
              );

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
              .sort((left, right) => right.quantityGrams - left.quantityGrams)}
            isComplete={weightCoverageComplete}
          />
        </View>
      </View>
    </View>
  );
}

function CostCoverageDialog({
  foods,
  onClose,
  pricedEntryCount,
  totalEntryCount,
  visible,
}: {
  readonly foods: readonly UnresolvedFoodCost[];
  readonly onClose: () => void;
  readonly pricedEntryCount: number;
  readonly totalEntryCount: number;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable
        accessibilityLabel="Close cost coverage"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.dialogBackdrop}
      >
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.dialogHeader}>
            <View style={styles.dialogHeading}>
              <Text style={styles.dialogTitle}>Costs recorded</Text>
              <Text style={styles.dialogSubtitle}>
                {pricedEntryCount} of {totalEntryCount} food entries are
                included in spending.
              </Text>
            </View>
            <IconButton
              accessibilityLabel="Close cost coverage"
              icon={X}
              iconColor={color.textMuted}
              iconSize={20}
              onPress={onClose}
              variant="ghost"
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.dialogList}
            showsVerticalScrollIndicator={false}
            style={styles.dialogScroll}
          >
            {!Array.isReadonlyArrayNonEmpty(foods) ? (
              <Text style={styles.emptyText}>
                Every logged food has a compatible current price.
              </Text>
            ) : (
              foods.map((food) => (
                <View key={food.foodId} style={styles.dialogFoodRow}>
                  <View style={styles.dialogFoodCopy}>
                    <Text numberOfLines={1} style={styles.foodName}>
                      {food.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.dialogFoodBrand,
                        food.brand === undefined
                          ? styles.dialogFoodBrandMissing
                          : null,
                      ]}
                    >
                      {food.brand ?? "No brand"}
                    </Text>
                  </View>
                  <Text
                    accessibilityLabel={`${food.entryCount} ${food.entryCount === 1 ? "entry" : "entries"}`}
                    style={styles.dialogFoodCount}
                  >
                    {food.entryCount}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

function SummaryInsights({
  allInsights,
  insights,
}: {
  readonly allInsights: readonly NutritionReportInsight[];
  readonly insights: readonly NutritionReportInsight[];
}) {
  const [snapshot, , actor] = useMachine(listVisibilityMachine);
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
  estimated,
  incomplete,
  unknown,
  comparisonAvailable,
  actual,
  nutrientName,
  target,
}: {
  readonly estimated: boolean;
  readonly incomplete: boolean;
  readonly unknown: boolean;
  readonly comparisonAvailable: boolean;
  readonly actual: number;
  readonly nutrientName: Reporting.NutrientName;
  readonly target: number | null;
}) {
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";
  const signedValue =
    target === null || !comparisonAvailable ? null : actual - target;
  const trend =
    target === null || !comparisonAvailable
      ? "none"
      : getNutritionTargetTrend({ actual, target });
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
        {unknown
          ? "—"
          : `${estimated ? "≈ " : ""}${_formatNutrient({ nutrientName, value: actual })}${incomplete ? "+" : ""}`}
      </Text>
      <Text numberOfLines={1} style={styles.nutrientDelta}>
        {signedValue === null || formattedSignedValue === null
          ? target === null
            ? "No target"
            : "—"
          : signedValue === 0
            ? `0 ${unit}`
            : `${signedValue > 0 ? "+" : "-"}${formattedSignedValue} ${unit}`}
      </Text>
    </View>
  );
}

function SecondaryMetricBalanceCard({
  label,
  onPress,
  showTargetStatus = true,
  value,
}: {
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly showTargetStatus?: boolean | undefined;
  readonly value: string;
}) {
  const title = (
    <View style={styles.nutrientCardHeader}>
      <Text
        numberOfLines={1}
        style={[styles.nutrientCardTitle, { color: color.secondaryMetric }]}
      >
        {label}
      </Text>
      {onPress === undefined ? null : (
        <ChevronRight color={color.textMuted} size={18} strokeWidth={3} />
      )}
    </View>
  );
  const content = (
    <>
      {title}
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.nutrientValue, { color: color.secondaryMetric }]}
      >
        {value}
      </Text>
      {showTargetStatus ? (
        <Text numberOfLines={1} style={styles.nutrientDelta}>
          No target
        </Text>
      ) : null}
    </>
  );

  return onPress === undefined ? (
    <View style={styles.nutrientCard}>{content}</View>
  ) : (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.nutrientCard,
        pressed ? styles.nutrientCardPressed : null,
      ]}
    >
      {content}
    </Pressable>
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
        <FoodContributorRows
          amountColor={color.secondaryMetric}
          accessibilityGroupLabel="food weight"
          foods={foods}
          formatValue={(food) => _formatWeight({ value: food.quantityGrams })}
          getValue={(food) => food.quantityGrams}
          rowKeyPrefix="food-weight"
        />
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
        <FoodContributorRows
          amountColor={color.textMuted}
          accessibilityGroupLabel={nutrientLabels[nutrientName]}
          foods={foods}
          formatValue={(food) =>
            _formatNutrient({
              nutrientName,
              value: food.totals[nutrientName],
            })
          }
          getValue={(food) => food.totals[nutrientName]}
          rowKeyPrefix={nutrientName}
        />
      )}
    </View>
  );
}

function FoodContributorRows({
  amountColor,
  accessibilityGroupLabel,
  foods,
  formatValue,
  getValue,
  rowKeyPrefix,
}: {
  readonly amountColor: string;
  readonly accessibilityGroupLabel: string;
  readonly foods: readonly FoodContributor[];
  readonly formatValue: (food: FoodContributor) => string;
  readonly getValue: (food: FoodContributor) => number;
  readonly rowKeyPrefix: string;
}) {
  const [snapshot, , actor] = useMachine(listVisibilityMachine);
  const isExpanded = snapshot.value === "Expanded";
  const canToggle = foods.length > foodContributorPreviewLimit;
  const visibleFoods = isExpanded
    ? foods
    : foods.slice(0, foodContributorPreviewLimit);
  const total = foods.reduce((sum, food) => sum + getValue(food), 0);
  const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <View style={styles.foodRows}>
      {visibleFoods.map((food, index) => {
        const percentage = (getValue(food) / total) * 100;
        const percentageFractionDigits = percentage < 1 ? 2 : 0;

        return (
          <Fragment key={`${rowKeyPrefix}-${food.foodId}`}>
            {index === 0 ? null : <View style={styles.divider} />}
            <View style={styles.foodRow}>
              <Text numberOfLines={1} style={styles.foodName}>
                {food.name}
              </Text>
              <View style={styles.foodContributionValues}>
                <Text numberOfLines={1} style={styles.foodPercentage}>
                  {`${formatNumber({
                    maximumFractionDigits: percentageFractionDigits,
                    minimumFractionDigits: percentageFractionDigits,
                    value: percentage,
                  })}%`}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.foodAmount, { color: amountColor }]}
                >
                  {formatValue(food)}
                </Text>
              </View>
            </View>
          </Fragment>
        );
      })}
      {canToggle ? (
        <>
          <View style={styles.divider} />
          <Pressable
            accessibilityLabel={`${isExpanded ? "View less" : "View more"} ${accessibilityGroupLabel.toLocaleLowerCase()} food contributors`}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            onPress={() => {
              if (isExpanded) {
                actor.trigger.collapse();
                return;
              }

              actor.trigger.expand();
            }}
            style={({ pressed }) => [
              styles.foodContributorToggle,
              pressed ? styles.foodContributorTogglePressed : null,
            ]}
          >
            <View style={styles.foodContributorToggleContent}>
              <Text numberOfLines={1} style={styles.foodContributorToggleText}>
                {isExpanded ? "View less" : "View more"}
              </Text>
              <ToggleIcon color={color.textMuted} size={16} strokeWidth={3} />
            </View>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function SectionTitle({
  subtitle,
  title,
}: {
  readonly subtitle?: string;
  readonly title: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {subtitle === undefined ? null : (
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      )}
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
  nutrientCardPressed: {
    opacity: 0.84,
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
  dialogBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  dialog: {
    width: "100%",
    maxHeight: "80%",
    maxWidth: 480,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: color.sheet,
  },
  dialogHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dialogHeading: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  dialogTitle: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogSubtitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  dialogScroll: {
    flexShrink: 1,
  },
  dialogList: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
  },
  dialogFoodRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  dialogFoodCopy: {
    minWidth: 0,
    flex: 1,
    justifyContent: "center",
    gap: spacing.xxs,
  },
  dialogFoodBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  dialogFoodBrandMissing: {
    opacity: 0.55,
    fontStyle: "italic",
  },
  dialogFoodCount: {
    minWidth: 32,
    flexShrink: 0,
    color: color.text,
    textAlign: "right",
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
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
  foodContributionValues: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
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
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  foodPercentage: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  foodContributorToggle: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  foodContributorToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  foodContributorTogglePressed: {
    opacity: 0.7,
  },
  foodContributorToggleText: {
    flexShrink: 0,
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
});
