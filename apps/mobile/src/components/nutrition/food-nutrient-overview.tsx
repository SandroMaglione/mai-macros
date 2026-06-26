import { formatNumber } from "@/lib/format";
import { color, spacing, tokens } from "@/theme/tokens";
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

type NutrientRowEmphasis = "primary" | "secondary";

const defaultNutrientOrder = [
  "energyKcal",
  "fatGrams",
  "saturatedFatGrams",
  "carbsGrams",
  "sugarGrams",
  "fiberGrams",
  "proteinGrams",
  "saltGrams",
] as const satisfies readonly FoodNutrientOverviewNutrientName[];

const nutrientRows = {
  carbsGrams: {
    color: color.nutritionCarbs,
    emphasis: "primary",
    label: "Carbs",
    unit: "g",
  },
  energyKcal: {
    color: color.nutritionEnergy,
    emphasis: "primary",
    label: "Calories",
    unit: "",
  },
  fatGrams: {
    color: color.nutritionFat,
    emphasis: "primary",
    label: "Fat",
    unit: "g",
  },
  fiberGrams: {
    color: color.nutritionCarbs,
    emphasis: "secondary",
    label: "Fiber",
    unit: "g",
  },
  proteinGrams: {
    color: color.nutritionEnergy,
    emphasis: "primary",
    label: "Protein",
    unit: "g",
  },
  saltGrams: {
    color: color.nutritionSalt,
    emphasis: "primary",
    label: "Salt",
    unit: "g",
  },
  saturatedFatGrams: {
    color: color.nutritionFat,
    emphasis: "secondary",
    label: "Sat fat",
    unit: "g",
  },
  sugarGrams: {
    color: color.nutritionCarbs,
    emphasis: "secondary",
    label: "Sugar",
    unit: "g",
  },
} satisfies Record<
  FoodNutrientOverviewNutrientName,
  {
    readonly color: string;
    readonly emphasis: NutrientRowEmphasis;
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
}: {
  readonly brand?: string;
  readonly name: string;
  readonly namePrefix?: ReactNode;
  readonly nutrients?: FoodNutrientOverviewNutrients;
  readonly nutrientOrder?: readonly FoodNutrientOverviewNutrientName[];
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
}) {
  const displayedBrand =
    brand === undefined || brand.trim() === "" ? undefined : brand;
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
          <Text
            accessible={displayedBrand !== undefined}
            numberOfLines={1}
            style={styles.subtitle}
          >
            {displayedBrand}
          </Text>
        </View>
        <View style={styles.headerNumbers}>
          <Text numberOfLines={1} style={styles.primaryLabel}>
            {displayedPrimaryLabel}
          </Text>
          <Text
            accessible={secondaryLabel !== undefined}
            numberOfLines={1}
            style={styles.secondary}
          >
            {secondaryLabel}
          </Text>
        </View>
      </View>

      {nutrients === undefined ? null : (
        <View>
          {nutrientOrder.map((nutrientName) => {
            const row = nutrientRows[nutrientName];

            return (
              <NutrientRow
                colorValue={row.color}
                emphasis={row.emphasis}
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
  emphasis,
  label,
  unit,
  value,
}: {
  readonly colorValue: string;
  readonly emphasis: NutrientRowEmphasis;
  readonly label: string;
  readonly unit: string;
  readonly value: number | undefined;
}) {
  const isSecondary = emphasis === "secondary";

  return (
    <View
      style={[
        styles.nutrientRow,
        isSecondary ? styles.nutrientRowSecondary : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.rowText,
          isSecondary ? styles.rowTextSecondary : null,
          { color: colorValue },
        ]}
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[
          styles.rowValue,
          isSecondary ? styles.rowValueSecondary : null,
          { color: colorValue },
        ]}
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
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  subtitle: {
    minHeight: tokens.type.lineHeight.md,
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  headerNumbers: {
    minWidth: 112,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  primaryLabel: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
  secondary: {
    minHeight: tokens.type.lineHeight.md,
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
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
  nutrientRowSecondary: {
    minHeight: 42,
    paddingLeft: spacing.md,
  },
  rowText: {
    minWidth: 0,
    flex: 1,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  rowTextSecondary: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  rowValue: {
    maxWidth: 140,
    textAlign: "right",
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  rowValueSecondary: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
});
