import { dailySummaryNutrients } from "@/lib/daily-summary-nutrients";
import { formatCurrencyMinor, formatNumber } from "@/lib/format";
import { color, spacing, tokens } from "@/theme/tokens";
import { useMachine } from "@/hooks/use-machine";
import {
  MealComparisonEvents,
  MealComparisonMachine,
  MealComparisonStates,
} from "@/machines/meal-comparison-machine";
import { MealComparisons, type Domain } from "@mai/nutrition";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const metrics = [
  ...dailySummaryNutrients.map((nutrient) => ({
    ...nutrient,
    unit: nutrient.name === "energyKcal" ? "kcal" : "g",
  })),
  { name: "weightGrams", label: "Food weight", unit: "g" },
  { name: "gramsPerCalorie", label: "Weight / calorie", unit: "g/kcal" },
  { name: "costEur", label: "Food cost", unit: "€" },
] as const;

export function MealComparison({
  baseline,
  foods,
  mealEntries,
  mealLabel,
}: {
  readonly baseline: MealComparisons.Baseline | undefined;
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
  readonly mealLabel: string;
}) {
  const [snapshot, send] = useMachine(() =>
    AtomMachine.make(MealComparisonMachine)
  );
  const expanded = MealComparisonStates.matches(snapshot, "Expanded");
  const values = MealComparisons.mealValues({ foods, mealEntries });
  const energy = values.find((value) => value.metric === "energyKcal");
  const energyBaseline = baseline?.metrics.find(
    (value) => value.metric === "energyKcal"
  );
  const energyDifference = MealComparisons.percentageDifference({
    value: energy?.value ?? null,
    average: energyBaseline?.average ?? null,
  });
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mealLabel} comparison with the previous ${MealComparisons.LOOKBACK_DAYS} days`}
        accessibilityState={{ expanded: expanded }}
        onPress={() => {
          send(MealComparisonEvents.Toggle());
        }}
        style={styles.toggle}
      >
        <Text style={styles.title}>Compared with usual</Text>
        <Text style={styles.preview}>
          {energyDifference === null
            ? ""
            : `${energy?.estimated || energyBaseline?.estimated ? "≈ " : ""}${_formatPercentage(energyDifference)} kcal`}
        </Text>
        <Icon size={16} color={color.textMuted} />
      </Pressable>
      {expanded ? (
        baseline === undefined ? (
          <Text style={styles.empty}>
            No matching {mealLabel.toLowerCase()} meals in the previous{" "}
            {MealComparisons.LOOKBACK_DAYS} days.
          </Text>
        ) : (
          <View style={styles.details}>
            <View style={styles.row}>
              <Text style={styles.metricLabel} />
              <Text style={[styles.caption, styles.average]}>Average</Text>
              <Text style={[styles.caption, styles.difference]}>Change</Text>
            </View>
            {metrics.map(({ name, label, unit }) => {
              const current = values.find((value) => value.metric === name);
              const previous = baseline.metrics.find(
                (value) => value.metric === name
              );
              const difference = MealComparisons.percentageDifference({
                value: current?.value ?? null,
                average: previous?.average ?? null,
              });
              const average = previous?.average;
              return (
                <View key={name} style={styles.row}>
                  <Text style={styles.metricLabel}>{label}</Text>
                  <View style={styles.average}>
                    <Text
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      style={styles.number}
                    >
                      {average === null || average === undefined
                        ? "—"
                        : `${previous?.estimated ? "≈ " : ""}${name === "costEur" ? formatCurrencyMinor({ currency: "EUR", minorValue: average * 100 }) : `${formatNumber({ value: average, maximumFractionDigits: name === "energyKcal" ? 0 : name === "gramsPerCalorie" ? 2 : 1 })} ${unit}`}`}
                    </Text>
                    {previous !== undefined &&
                    previous.meals > 0 &&
                    previous.meals !== baseline.mealCount ? (
                      <Text style={[styles.caption, styles.number]}>
                        {previous.meals} meals
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={[styles.number, styles.difference]}
                  >
                    {difference === null
                      ? "—"
                      : `${current?.estimated || previous?.estimated ? "≈ " : ""}${_formatPercentage(difference)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )
      ) : null}
    </View>
  );
}

function _formatPercentage(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${formatNumber({ value: rounded, maximumFractionDigits: 0 })}%`;
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, borderTopColor: color.hairline },
  toggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: { flex: 1, color: color.textMuted, fontSize: tokens.type.size.sm },
  preview: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontVariant: ["tabular-nums"],
  },
  details: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  caption: { color: color.textSubtle, fontSize: tokens.type.size.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metricLabel: {
    flex: 1,
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
  },
  average: { width: "31%", textAlign: "right" },
  difference: { width: "22%", textAlign: "right" },
  number: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    color: color.textSubtle,
    fontSize: tokens.type.size.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
