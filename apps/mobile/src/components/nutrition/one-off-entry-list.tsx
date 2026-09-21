import { OneOffIndicator } from "@/components/nutrition/one-off-indicator";
import { color, spacing } from "@/theme/tokens";
import { formatNutrientValue } from "@/lib/nutrient-quality";
import type { Domain } from "@mai/nutrition";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function OneOffEntryList({
  entries,
  onSelect,
}: {
  readonly entries: readonly Domain.OneOffMealEntry[];
  readonly onSelect: (entry: Domain.OneOffMealEntry) => void;
}) {
  return (
    <View style={styles.list}>
      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          accessibilityLabel={`Reuse ${entry.name}, ${entry.amountDescription}, ${entry.dateKey}`}
          style={styles.entry}
          onPress={() => onSelect(entry)}
        >
          <View style={styles.heading}>
            <OneOffIndicator />
            <Text style={styles.name}>{entry.name}</Text>
          </View>
          <Text style={styles.caption}>
            {entry.amountDescription === ""
              ? ""
              : `${entry.amountDescription} · `}
            {entry.dateKey}
          </Text>
          <Text style={styles.values}>
            {[
              {
                nutrient: entry.nutrients.energyKcal,
                suffix: " kcal",
                prefix: "",
              },
              {
                nutrient: entry.nutrients.proteinGrams,
                suffix: "",
                prefix: "P ",
              },
              {
                nutrient: entry.nutrients.carbsGrams,
                suffix: "",
                prefix: "C ",
              },
              { nutrient: entry.nutrients.fatGrams, suffix: "", prefix: "F " },
            ]
              .filter(({ nutrient }) => nutrient._tag !== "Unknown")
              .map(
                ({ nutrient, prefix, suffix }) =>
                  `${prefix}${formatNutrientValue(nutrient)}${suffix}`
              )
              .join(" · ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  list: { gap: spacing.sm },
  entry: {
    paddingVertical: spacing.md,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  name: { color: color.text, fontSize: 15, fontWeight: "600" },
  caption: { color: color.textMuted, fontSize: 12 },
  values: { color: color.text, fontSize: 13 },
});
