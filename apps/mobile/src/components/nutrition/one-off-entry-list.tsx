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
          accessibilityLabel={`Reuse ${entry.name}, ${entry.amountDescription}, ${_formatEntryDate(entry.dateKey)}`}
          style={styles.entry}
          onPress={() => onSelect(entry)}
        >
          <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
            {entry.name}
          </Text>
          <Text style={styles.caption}>
            {entry.amountDescription === ""
              ? ""
              : `${entry.amountDescription} · `}
            {_formatEntryDate(entry.dateKey)}
          </Text>
          <Text style={styles.values}>
            {[
              {
                nutrient: entry.nutrients.energyKcal,
                suffix: " kcal",
                prefix: "",
                color: color.text,
              },
              {
                nutrient: entry.nutrients.proteinGrams,
                suffix: "",
                prefix: "P ",
                color: color.nutritionProtein,
              },
              {
                nutrient: entry.nutrients.carbsGrams,
                suffix: "",
                prefix: "C ",
                color: color.nutritionCarbs,
              },
              {
                nutrient: entry.nutrients.fatGrams,
                suffix: "",
                prefix: "F ",
                color: color.nutritionFat,
              },
            ]
              .filter(({ nutrient }) => nutrient._tag !== "Unknown")
              .map(
                ({ nutrient, prefix, suffix, color: nutrientColor }, index) => (
                  <Text key={prefix}>
                    {index === 0 ? "" : " · "}
                    <Text style={{ color: nutrientColor }}>
                      {`${prefix}${formatNutrientValue(nutrient)}${suffix}`}
                    </Text>
                  </Text>
                )
              )}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function _formatEntryDate(dateKey: Domain.DateKey) {
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
  return `${dateKey.slice(0, 4)}, ${month} ${dateKey.slice(8, 10)}`;
}

const styles = StyleSheet.create({
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
