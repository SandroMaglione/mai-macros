import { formatNumber } from "@/lib/format";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import { Utils, type Domain } from "@mai/nutrition";
import { Circle, CircleCheck } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type MealPlanSummaryCardProps = {
  readonly disabled: boolean;
  readonly isActive: boolean;
  readonly onPress: () => void;
  readonly plan: Domain.Plan;
  readonly style?: StyleProp<ViewStyle>;
};

type MealPlanSummaryRow = {
  readonly colorValue: string;
  readonly label: string;
  readonly value: string;
};

export function MealPlanSummaryCard({
  disabled,
  isActive,
  onPress,
  plan,
  style,
}: MealPlanSummaryCardProps) {
  const StatusIcon = isActive ? CircleCheck : Circle;
  const rows: readonly MealPlanSummaryRow[] = [
    {
      colorValue: color.nutritionEnergy,
      label: "Calories",
      value: `${_formatPlanNumber({
        value: Utils.calculatePlanEnergyKcal({ plan }),
      })} kcal`,
    },
    {
      colorValue: color.nutritionCarbs,
      label: "Carbs",
      value: `${_formatPlanNumber({ value: plan.carbsTargetGrams })} g`,
    },
    {
      colorValue: color.nutritionProtein,
      label: "Protein",
      value: `${_formatPlanNumber({ value: plan.proteinTargetGrams })} g`,
    },
    {
      colorValue: color.nutritionFat,
      label: "Fat",
      value: `${_formatPlanNumber({ value: plan.fatTargetGrams })} g`,
    },
    ..._optionalSummaryRow({
      colorValue: color.nutritionFiber,
      label: "Fiber",
      value: plan.fiberTargetGrams,
    }),
    ..._optionalSummaryRow({
      colorValue: color.nutritionSugar,
      label: "Sugar",
      value: plan.sugarTargetGrams,
    }),
    ..._optionalSummaryRow({
      colorValue: color.warningText,
      label: "Sat fat",
      value: plan.saturatedFatTargetGrams,
    }),
    ..._optionalSummaryRow({
      colorValue: color.nutritionSalt,
      label: "Salt",
      value: plan.saltTargetGrams,
    }),
  ];

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

function _optionalSummaryRow({
  colorValue,
  label,
  value,
}: {
  readonly colorValue: string;
  readonly label: string;
  readonly value: number | undefined;
}): readonly MealPlanSummaryRow[] {
  return value === undefined
    ? []
    : [
        {
          colorValue,
          label,
          value: `${_formatPlanNumber({ value })} g`,
        },
      ];
}

function _formatPlanNumber({ value }: { readonly value: number }) {
  return formatNumber({
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    value,
  });
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
    fontWeight: tokens.type.weight.black,
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
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
});
