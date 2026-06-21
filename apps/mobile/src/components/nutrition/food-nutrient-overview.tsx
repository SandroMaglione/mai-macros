import { formatNumber } from "@/lib/format";
import { color, radius, spacing, type } from "@/theme/tokens";
import type { calculateEntryNutrients } from "@mai/nutrition";
import { Array as EffectArray } from "effect";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type Nutrients = ReturnType<typeof calculateEntryNutrients>;

type FoodNutrientOverviewProps = {
  readonly brand?: string;
  readonly name: string;
  readonly namePrefix?: ReactNode;
  readonly nutrients?: Nutrients;
  readonly secondaryLabel?: string;
};

export function FoodNutrientOverview({
  brand,
  name,
  namePrefix,
  nutrients,
  secondaryLabel,
}: FoodNutrientOverviewProps) {
  const macroRows =
    nutrients === undefined
      ? []
      : [
          {
            color: color.nutritionEnergy,
            label: "Kcal",
            unit: "",
            value: nutrients.energyKcal,
          },
          {
            color: color.nutritionProtein,
            label: "Protein",
            unit: "g",
            value: nutrients.proteinGrams,
          },
          {
            color: color.nutritionCarbs,
            label: "Carbs",
            unit: "g",
            value: nutrients.carbsGrams,
          },
          {
            color: color.nutritionFat,
            label: "Fat",
            unit: "g",
            value: nutrients.fatGrams,
          },
        ];
  const extraRows =
    nutrients === undefined
      ? []
      : [
          {
            color: color.nutritionFiber,
            label: "Fiber",
            unit: "g",
            value: nutrients.fiberGrams,
          },
          {
            color: color.nutritionSugar,
            label: "Sugar",
            unit: "g",
            value: nutrients.sugarGrams,
          },
          {
            color: color.nutritionFat,
            label: "Sat fat",
            unit: "g",
            value: nutrients.saturatedFatGrams,
          },
          {
            color: color.nutritionSalt,
            label: "Salt",
            unit: "g",
            value: nutrients.saltGrams,
          },
        ].filter(
          (
            row
          ): row is Omit<typeof row, "value"> & { readonly value: number } =>
            row.value !== undefined
        );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {namePrefix}
          <Text numberOfLines={2} style={styles.title}>
            {name}
          </Text>
        </View>
        {brand === undefined ? null : (
          <Text numberOfLines={1} style={styles.subtitle}>
            {brand}
          </Text>
        )}
        {secondaryLabel === undefined ? null : (
          <Text numberOfLines={1} style={styles.secondary}>
            {secondaryLabel}
          </Text>
        )}
      </View>
      {nutrients === undefined ? (
        <Text style={styles.pendingText}>
          Enter a positive quantity to preview nutrients.
        </Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.macroGrid}>
            {macroRows.map((row) => (
              <NutrientMetric key={row.label} {...row} />
            ))}
          </View>
          {!EffectArray.isReadonlyArrayNonEmpty(extraRows) ? null : (
            <View style={styles.extraGrid}>
              {extraRows.map((row) => (
                <NutrientMetric key={row.label} compact {...row} />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function NutrientMetric({
  color: accentColor,
  compact = false,
  label,
  unit,
  value,
}: {
  readonly color: string;
  readonly compact?: boolean;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
}) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricAccent, { backgroundColor: accentColor }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={compact ? styles.compactValue : styles.metricValue}
      >
        {formatNumber({
          maximumFractionDigits: unit === "" ? 0 : 1,
          value,
        })}
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  header: {
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    padding: spacing.lg,
  },
  titleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  subtitle: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  secondary: {
    color: color.textSubtle,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  pendingText: {
    padding: spacing.lg,
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  body: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  extraGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metric: {
    minWidth: 116,
    flex: 1,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  metricAccent: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
  },
  metricLabel: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  metricValue: {
    color: color.text,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  compactValue: {
    color: color.text,
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
});
