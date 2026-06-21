import { formatNumber } from "@/lib/format";
import { color, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

export type FoodNutrientOverviewNutrients = {
  readonly carbsGrams?: number | undefined;
  readonly energyKcal?: number | undefined;
  readonly fatGrams?: number | undefined;
  readonly fiberGrams?: number | undefined;
  readonly proteinGrams?: number | undefined;
  readonly saltGrams?: number | undefined;
  readonly saturatedFatGrams?: number | undefined;
  readonly sugarGrams?: number | undefined;
};

type FoodNutrientOverviewNutrientName =
  | "carbsGrams"
  | "energyKcal"
  | "fatGrams"
  | "fiberGrams"
  | "proteinGrams"
  | "saltGrams"
  | "saturatedFatGrams"
  | "sugarGrams";

type FoodNutrientOverviewProps = {
  readonly brand?: string;
  readonly name: string;
  readonly namePrefix?: ReactNode;
  readonly nutrients?: FoodNutrientOverviewNutrients;
  readonly nutrientOrder?: readonly FoodNutrientOverviewNutrientName[];
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
};

const defaultNutrientOrder = [
  "carbsGrams",
  "proteinGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
  "energyKcal",
] as const satisfies readonly FoodNutrientOverviewNutrientName[];

const nutrientRows = {
  carbsGrams: {
    color: color.nutritionCarbs,
    label: "Carbs",
    unit: "g",
  },
  energyKcal: {
    color: color.nutritionEnergy,
    label: "Calories",
    unit: "",
  },
  fatGrams: {
    color: color.nutritionFat,
    label: "Fat",
    unit: "g",
  },
  fiberGrams: {
    color: color.nutritionCarbs,
    label: "Fiber",
    unit: "g",
  },
  proteinGrams: {
    color: color.nutritionEnergy,
    label: "Protein",
    unit: "g",
  },
  saltGrams: {
    color: color.nutritionSalt,
    label: "Salt",
    unit: "g",
  },
  saturatedFatGrams: {
    color: color.nutritionFat,
    label: "Sat fat",
    unit: "g",
  },
  sugarGrams: {
    color: color.nutritionCarbs,
    label: "Sugar",
    unit: "g",
  },
} satisfies Record<
  FoodNutrientOverviewNutrientName,
  {
    readonly color: string;
    readonly label: string;
    readonly unit: "" | "g";
  }
>;

export function FoodNutrientOverview({
  brand,
  name,
  namePrefix,
  nutrients,
  nutrientOrder = defaultNutrientOrder,
  primaryLabel,
  secondaryLabel,
}: FoodNutrientOverviewProps) {
  const displayedBrand =
    brand === undefined || brand.trim() === "" ? "/" : brand;
  const displayedPrimaryLabel =
    primaryLabel ??
    (nutrients?.energyKcal === undefined
      ? "New"
      : `${formatFoodNutrientNumber({ value: nutrients.energyKcal })} kcal`);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={styles.titleRow}>
            {namePrefix}
            <Text numberOfLines={2} style={styles.title}>
              {name}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.subtitle}>
            {displayedBrand}
          </Text>
        </View>
        <View style={styles.headerNumbers}>
          <Text numberOfLines={1} style={styles.primaryLabel}>
            {displayedPrimaryLabel}
          </Text>
          {secondaryLabel === undefined ? null : (
            <Text numberOfLines={1} style={styles.secondary}>
              {secondaryLabel}
            </Text>
          )}
        </View>
      </View>

      {nutrients === undefined ? null : (
        <View>
          {nutrientOrder.map((nutrientName) => {
            const row = nutrientRows[nutrientName];

            return (
              <NutrientRow
                colorValue={row.color}
                key={nutrientName}
                label={row.label}
                unit={row.unit}
                value={nutrients[nutrientName]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function NutrientRow({
  colorValue,
  label,
  unit,
  value,
}: {
  readonly colorValue: string;
  readonly label: string;
  readonly unit: string;
  readonly value: number | undefined;
}) {
  return (
    <View style={styles.nutrientRow}>
      <Text numberOfLines={1} style={[styles.rowText, { color: colorValue }]}>
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.rowValue, { color: colorValue }]}
      >
        {value === undefined
          ? "n/a"
          : `${formatFoodNutrientNumber({ value })}${unit}`}
      </Text>
    </View>
  );
}

export function foodQuickInputNutrients({
  food,
}: {
  readonly food: {
    readonly carbsGramsPer100g?: number | undefined;
    readonly energyKcalPer100g?: number | undefined;
    readonly fatGramsPer100g?: number | undefined;
    readonly fiberGramsPer100g?: number | undefined;
    readonly proteinGramsPer100g?: number | undefined;
    readonly saltGramsPer100g?: number | undefined;
    readonly saturatedFatGramsPer100g?: number | undefined;
    readonly sugarGramsPer100g?: number | undefined;
  };
}): FoodNutrientOverviewNutrients {
  return {
    carbsGrams: food.carbsGramsPer100g,
    energyKcal: food.energyKcalPer100g,
    fatGrams: food.fatGramsPer100g,
    fiberGrams: food.fiberGramsPer100g,
    proteinGrams: food.proteinGramsPer100g,
    saltGrams: food.saltGramsPer100g,
    saturatedFatGrams: food.saturatedFatGramsPer100g,
    sugarGrams: food.sugarGramsPer100g,
  };
}

export function formatFoodNutrientNumber({
  value,
}: {
  readonly value: number;
}) {
  return formatNumber({
    maximumFractionDigits: 2,
    value,
  });
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: spacing.lg,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  titleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  identity: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
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
    fontSize: type.size.md,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  headerNumbers: {
    minWidth: 112,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  primaryLabel: {
    color: color.nutritionEnergy,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  secondary: {
    color: color.textMuted,
    fontSize: type.size.md,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  nutrientRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
  },
  rowText: {
    minWidth: 0,
    flex: 1,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  rowValue: {
    maxWidth: 140,
    textAlign: "right",
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
});
