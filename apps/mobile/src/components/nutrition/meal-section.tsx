import { OneOffIndicator } from "./one-off-indicator";
import { MealComparison } from "./meal-comparison";
import { FoodCurrentPriceIndicator } from "./food-current-price-indicator";
import { formatNutrientValue } from "@/lib/nutrient-quality";
import {
  nutrientTotalDisplay,
  formatNutrientAmount,
} from "@/lib/nutrient-total-display";
import {
  formatCurrencyMinor,
  formatLoggedFoodQuantity,
  formatNumber,
} from "@/lib/format";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import {
  Reporting,
  Utils,
  type Domain,
  type MealComparisons,
} from "@mai/nutrition";
import { Array } from "effect";
import { router } from "expo-router";
import { ChevronRight, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const macros = [
  { name: "carbsGrams", label: "Carbs" },
  { name: "proteinGrams", label: "Protein" },
  { name: "fatGrams", label: "Fat" },
] as const;
const nutrients = [
  { name: "fiberGrams", label: "Fiber" },
  { name: "saltGrams", label: "Salt" },
  { name: "saturatedFatGrams", label: "Sat fat" },
] as const;

export function MealSection({
  comparison,
  dateKey,
  foods,
  meal,
  mealEntries,
  mealLabel,
}: {
  readonly comparison: MealComparisons.Baseline | undefined;
  readonly dateKey: Domain.DateKey;
  readonly foods: readonly Domain.Food[];
  readonly meal: Domain.MealId;
  readonly mealEntries: readonly Domain.MealEntry[];
  readonly mealLabel: string;
}) {
  const nutrition = Reporting.calculateMealEntriesNutrientTotals({
    foods,
    mealEntries,
  });
  const energy = nutrientTotalDisplay({ nutrition, name: "energyKcal" });
  const weight = Reporting.calculateMealEntriesWeightTotals({
    foods,
    mealEntries,
  });
  const cost = Reporting.calculateMealEntriesCostTotals({ foods, mealEntries });
  const weightComplete = weight.resolvedEntriesCount === weight.entriesCount;
  const gramsPerCalorie = Reporting.calculateGramsPerCalorie({
    energyKcal: nutrition.totals.energyKcal,
    quantityGrams: weight.quantityGrams,
  });
  const ratio =
    !weightComplete || energy.incomplete || gramsPerCalorie === null
      ? "—"
      : `${nutrition.estimatedCoverage.energyKcal > 0 ? "≈ " : ""}${formatNumber({ maximumFractionDigits: gramsPerCalorie < 1 ? 2 : 1, value: gramsPerCalorie })}`;
  const populated = Array.isReadonlyArrayNonEmpty(mealEntries);
  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <View style={styles.headingCopy}>
          <Text style={styles.mealTitle}>{mealLabel}</Text>
          {populated ? (
            <Pressable
              accessibilityLabel={`${mealLabel} details`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/days/[dateKey]/meals/[meal]/details",
                  params: { dateKey, meal },
                })
              }
              style={styles.detailsButton}
            >
              <Text style={styles.detailsText}>Details</Text>
              <ChevronRight size={14} color={color.textMuted} />
            </Pressable>
          ) : (
            <Text style={styles.emptyText}>No food logged</Text>
          )}
        </View>
        {populated ? (
          <View style={styles.energy}>
            <Text style={styles.energyValue}>{energy.amount}</Text>
            <Text style={styles.energyUnit}>kcal</Text>
          </View>
        ) : null}
      </View>
      {populated ? (
        <>
          <View style={styles.macroGrid}>
            {macros.map(({ name, label }) => (
              <MealMetric
                key={name}
                name={name}
                label={label}
                nutrition={nutrition}
                prominent
              />
            ))}
          </View>
          <View style={styles.mealEntries}>
            {mealEntries.map((mealEntry) => (
              <MealEntryRow
                key={mealEntry.id}
                mealEntry={mealEntry}
                food={foods.find(
                  (food) =>
                    mealEntry.kind === "catalog" && food.id === mealEntry.foodId
                )}
                onPress={() => {
                  if (mealEntry.kind === "one-off") {
                    router.push({
                      pathname: "/days/[dateKey]/meals/[meal]/one-off",
                      params: { dateKey, meal, mealEntryId: mealEntry.id },
                    });
                  } else {
                    router.push({
                      pathname:
                        "/days/[dateKey]/meals/[meal]/entries/[mealEntryId]/edit",
                      params: { dateKey, meal, mealEntryId: mealEntry.id },
                    });
                  }
                }}
              />
            ))}
          </View>
          <View style={styles.nutrientGrid}>
            {nutrients.map(({ name, label }) => (
              <MealMetric
                key={name}
                name={name}
                label={label}
                nutrition={nutrition}
                prominent={false}
              />
            ))}
          </View>
          <View style={styles.metadata}>
            <View style={styles.costRow}>
              <Text style={styles.metricLabel}>
                {weightComplete ? "Food weight" : "Resolved weight"}
              </Text>
              <Text style={styles.costValue}>
                {formatNutrientAmount({ value: weight.quantityGrams })} g
              </Text>
            </View>
            <View style={styles.costRow}>
              <Text style={styles.metricLabel}>Weight / calorie</Text>
              <Text style={styles.costValue}>{ratio} g/kcal</Text>
            </View>
            <View style={styles.costRow}>
              <Text style={styles.metricLabel}>Food cost</Text>
              <Text style={styles.costValue}>
                {formatCurrencyMinor({
                  currency: "EUR",
                  minorValue: cost.costMinorByCurrency.EUR,
                })}
                {cost.resolvedEntriesCount < cost.entriesCount ? "+" : ""}
              </Text>
            </View>
          </View>
          <MealComparison
            baseline={comparison}
            foods={foods}
            mealEntries={mealEntries}
            mealLabel={mealLabel}
          />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add food to ${mealLabel}`}
        onPress={() =>
          router.push({
            pathname: "/days/[dateKey]/meals/[meal]/add",
            params: { dateKey, meal },
          })
        }
        style={({ pressed }) => [
          styles.addFoodButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Plus color={color.primary} size={18} strokeWidth={2} />
        <Text style={styles.addFoodText}>Add food</Text>
      </Pressable>
    </View>
  );
}

function MealMetric({
  name,
  label,
  nutrition,
  prominent,
}: {
  readonly name: Reporting.NutrientName;
  readonly label: string;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly prominent: boolean;
}) {
  const display = nutrientTotalDisplay({ nutrition, name });
  return (
    <View style={[styles.metric, prominent ? styles.prominentMetric : null]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[
          styles.metricValue,
          prominent ? styles.prominentValue : null,
          { color: prominent ? nutrientFieldColors[name] : color.text },
        ]}
      >
        {display.amount}
        {!display.unknown ? <Text style={styles.unit}> g</Text> : null}
      </Text>
    </View>
  );
}
function MealEntryRow({
  food,
  mealEntry,
  onPress,
}: {
  readonly food: Domain.Food | undefined;
  readonly mealEntry: Domain.MealEntry;
  readonly onPress: () => void;
}) {
  const quality = Reporting.resolveMealEntryNutrients({ food, mealEntry });
  const dominantMacros =
    food === undefined ? [] : Utils.findDominantMacronutrients({ food });
  const macroColors = {
    carbs: color.nutritionCarbs,
    protein: color.nutritionProtein,
    fat: color.nutritionFat,
  };
  const quantityLabel =
    mealEntry.kind === "one-off"
      ? mealEntry.amountDescription
      : `${mealEntry.quantityAccuracy === "estimated" ? "≈ " : ""}${formatLoggedFoodQuantity({ quantity: mealEntry.quantity })}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealEntryRow,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.entryCopy}>
        <Text numberOfLines={2} style={styles.entryName}>
          {mealEntry.kind === "one-off"
            ? mealEntry.name
            : (food?.name ?? "Unknown food")}
        </Text>
        <View style={styles.entryDetailRow}>
          {dominantMacros.map((macro) => (
            <View
              key={macro}
              accessible
              accessibilityLabel={`Mostly ${macro}`}
              style={[styles.macroDot, { backgroundColor: macroColors[macro] }]}
            />
          ))}
          {mealEntry.kind === "one-off" ? (
            <OneOffIndicator />
          ) : (
            <FoodCurrentPriceIndicator food={food} />
          )}
          <Text numberOfLines={1} style={styles.entryDetail}>
            {food?.brand === undefined
              ? quantityLabel
              : `${food.brand}, ${quantityLabel}`}
          </Text>
        </View>
      </View>
      <View style={styles.entryNumbers}>
        <Text style={styles.entryKcal}>
          {formatNutrientValue(quality.energyKcal)}
        </Text>
        {quality.carbsGrams._tag === "Unknown" &&
        quality.proteinGrams._tag === "Unknown" &&
        quality.fatGrams._tag === "Unknown" ? null : (
          <Text numberOfLines={1} style={styles.entryMacros}>
            {[
              {
                label: "C",
                nutrient: quality.carbsGrams,
                style: styles.entryCarbs,
              },
              {
                label: "P",
                nutrient: quality.proteinGrams,
                style: styles.entryProtein,
              },
              {
                label: "F",
                nutrient: quality.fatGrams,
                style: styles.entryFat,
              },
            ]
              .filter(({ nutrient }) => nutrient._tag !== "Unknown")
              .map(({ label, nutrient, style }, index) => (
                <Text key={label}>
                  <Text
                    style={style}
                  >{`${index === 0 ? "" : " "}${label}: `}</Text>
                  <Text style={style}>{formatNutrientValue(nutrient)}</Text>
                </Text>
              ))}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mealCard: {
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  mealHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.xl,
    gap: spacing.md,
  },
  headingCopy: { flex: 1, minWidth: 0 },
  mealTitle: {
    color: color.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: tokens.type.weight.semibold,
  },
  detailsButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  detailsText: { color: color.textMuted, fontSize: tokens.type.size.sm },
  energy: { alignItems: "flex-end", flexShrink: 1 },
  energyValue: {
    color: color.nutritionEnergy,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: tokens.type.weight.semibold,
    fontVariant: ["tabular-nums"],
  },
  energyUnit: { color: color.textMuted, fontSize: tokens.type.size.sm },
  emptyText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    marginTop: spacing.sm,
  },
  macroGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  metric: { flex: 1, minWidth: 0, gap: spacing.sm },
  prominentMetric: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metricLabel: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
  },
  metricValue: {
    color: color.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: tokens.type.weight.medium,
    fontVariant: ["tabular-nums"],
  },
  prominentValue: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: tokens.type.weight.semibold,
  },
  unit: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.regular,
  },
  mealEntries: { borderTopWidth: 1, borderTopColor: color.hairline },
  mealEntryRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  entryCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  entryName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    lineHeight: tokens.type.lineHeight.md,
    fontWeight: tokens.type.weight.medium,
  },
  entryDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 0,
  },
  entryDetail: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
    flexShrink: 1,
  },
  entryNumbers: { maxWidth: "48%", alignItems: "flex-end", gap: spacing.xs },
  entryKcal: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    lineHeight: tokens.type.lineHeight.lg,
    fontWeight: tokens.type.weight.medium,
    fontVariant: ["tabular-nums"],
  },
  entryMacros: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    lineHeight: tokens.type.lineHeight.xs,
    fontVariant: ["tabular-nums"],
  },
  macroDot: { width: 6, height: 6, borderRadius: radius.pill },
  entryCarbs: { color: color.nutritionCarbs },
  entryProtein: { color: color.nutritionProtein },
  entryFat: { color: color.nutritionFat },
  nutrientGrid: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  metadata: { padding: spacing.xl, gap: spacing.md },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  costValue: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontVariant: ["tabular-nums"],
  },
  addFoodButton: {
    minHeight: 56,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  addFoodText: {
    color: color.primary,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
  },
  pressed: { opacity: 0.75 },
});
