import { formatNumber } from "@/lib/format";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import type * as Domain from "@mai/nutrition/domain";
import { Reporting } from "@mai/nutrition";
import { dailySummaryNutrients } from "@/lib/daily-summary-nutrients";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { nutrientTargetLabels } from "@/lib/nutrient-target-label";
import { Circle, CircleCheck } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export function MealPlanSummaryCard({
  disabled,
  isActive,
  onPress,
  plan,
  style,
}: {
  readonly disabled: boolean;
  readonly isActive: boolean;
  readonly onPress: () => void;
  readonly plan: Domain.Plan;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const StatusIcon = isActive ? CircleCheck : Circle;
  const rows = dailySummaryNutrients.flatMap(({ name, label }) => {
    const target = Reporting.getPlanNutrientTarget({
      nutrientName: name,
      plan,
    });
    return target === undefined
      ? []
      : [
          {
            colorValue: nutrientFieldColors[name],
            label,
            value: `${nutrientTargetLabels[target.semantics].symbol} ${formatNumber({ value: target.amount, maximumFractionDigits: target.amount > 0 && target.amount < 10 ? 1 : 0 })} ${name === "energyKcal" ? "kcal" : "g"}`,
          },
        ];
  });

  return (
    <Pressable
      accessibilityLabel={`${plan.name}, ${isActive ? "active" : "inactive"} plan`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        isActive ? styles.rootActive : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.header}>
        <Text numberOfLines={2} style={styles.title}>
          {plan.name}
        </Text>
        <StatusIcon
          color={isActive ? color.primary : color.textSubtle}
          size={22}
          strokeWidth={2.4}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text numberOfLines={1} style={styles.rowLabel}>
              {row.label}
            </Text>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[styles.rowValue, { color: row.colorValue }]}
            >
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  rootActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  pressed: {
    opacity: 0.84,
  },
  header: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.lg,
  },
  divider: {
    height: 1,
    backgroundColor: color.sheetBorder,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  rowLabel: {
    minWidth: 0,
    flex: 1,
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  rowValue: {
    maxWidth: 150,
    textAlign: "right",
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
});
