import { color, spacing } from "@/theme/tokens";
import { formatNumber } from "@/lib/format";
import { nutrientLabels } from "@/lib/nutrient-quality";
import { Reporting, type Domain } from "@mai/nutrition";
import { EmptyEvent } from "@mai/machines/schemas";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import { setup } from "xstate";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

const breakdownMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        includeEstimates: Schema.Boolean,
        expanded: Schema.Boolean,
      })
    ),
    events: {
      estimates: Schema.toStandardSchemaV1(EmptyEvent),
      expand: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
}).createMachine({
  context: { includeEstimates: true, expanded: false },
  on: {
    estimates: ({ context }) => ({
      context: { includeEstimates: !context.includeEstimates },
    }),
    expand: ({ context }) => ({ context: { expanded: !context.expanded } }),
  },
});

export function NutrientBreakdown({
  includeEstimates: selectedIncludeEstimates,
  nutrition,
  plan,
  divisor = 1,
}: {
  readonly includeEstimates?: boolean;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan?: Domain.Plan;
  readonly divisor?: number;
}) {
  const [snapshot, , actor] = useMachine(breakdownMachine);
  const { expanded } = snapshot.context;
  const includeEstimates =
    selectedIncludeEstimates ?? snapshot.context.includeEstimates;
  return (
    <View style={styles.root}>
      {selectedIncludeEstimates === undefined ? (
        <View style={styles.header}>
          <Text style={styles.title}>≈</Text>
          <Switch
            accessibilityLabel="Include estimates"
            value={includeEstimates}
            onValueChange={() => actor.trigger.estimates()}
            trackColor={{ true: color.primary }}
          />
        </View>
      ) : null}
      {Reporting.NutrientNames.filter((_, index) => expanded || index < 4).map(
        (name) => {
          const recorded = nutrition.recorded[name] / Math.max(1, divisor);
          const estimated = nutrition.estimated[name] / Math.max(1, divisor);
          const value = recorded + (includeEstimates ? estimated : 0);
          const missing = nutrition.missing[name];
          const estimates = nutrition.estimatedCoverage[name];
          const target =
            plan === undefined
              ? undefined
              : Reporting.getPlanNutrientTargetAmount({
                  plan,
                  nutrientName: name,
                });
          return (
            <View key={name} style={styles.row}>
              <View style={styles.header}>
                <Text style={styles.label}>{nutrientLabels[name]}</Text>
                <Text style={styles.value}>
                  {nutrition.coverage[name] === 0 && nutrition.entriesCount > 0
                    ? "—"
                    : `${includeEstimates && estimates > 0 ? "≈ " : ""}${formatNumber({ value, maximumFractionDigits: 1 })}`}
                  {missing > 0 && nutrition.coverage[name] > 0 ? "+" : ""}
                </Text>
              </View>
              {estimates > 0 || missing > 0 ? (
                <Text style={styles.caption}>
                  {formatNumber({ value: recorded, maximumFractionDigits: 1 })}
                  {estimates > 0 ? (
                    <Text
                      style={includeEstimates ? undefined : styles.excluded}
                    >
                      {` + ≈ ${formatNumber({ value: estimated, maximumFractionDigits: 1 })}`}
                    </Text>
                  ) : null}
                  {missing > 0 ? ` · — ×${missing}` : ""}
                </Text>
              ) : null}
              {target === undefined ? null : (
                <Text style={styles.caption}>
                  Target{" "}
                  {formatNumber({ value: target, maximumFractionDigits: 1 })}
                  {missing > 0 || (!includeEstimates && estimates > 0)
                    ? " · —"
                    : ` · ${includeEstimates && estimates > 0 ? "≈ " : ""}${formatNumber({ value: Math.abs(target - value), maximumFractionDigits: 1 })} ${value > target ? "over" : "remaining"}`}
                </Text>
              )}
            </View>
          );
        }
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Show main nutrients" : "Show all nutrients"
        }
        onPress={() => actor.trigger.expand()}
      >
        <Text style={styles.link}>
          {expanded ? "Show main nutrients" : "Show all nutrients"}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: spacing.sm, paddingVertical: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { color: color.text, fontSize: 17, fontWeight: "600", flexShrink: 1 },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    gap: 4,
  },
  label: { color: color.text, fontSize: 14 },
  value: { color: color.text, fontSize: 16, fontWeight: "600" },
  excluded: { textDecorationLine: "line-through" },
  caption: { color: color.textMuted, fontSize: 12, lineHeight: 18 },
  link: { color: color.primary, paddingVertical: spacing.sm, fontSize: 14 },
});
