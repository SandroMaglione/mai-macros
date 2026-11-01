import { color, spacing } from "@/theme/tokens";
import { formatNutrientValue } from "@/lib/nutrient-quality";
import type { oneOffEntryMachine } from "@/lib/one-off-entry-machine";
import type { Domain } from "@mai/nutrition";
import { memo, type ReactElement } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import type { ActorFromLogic } from "xstate";

type OneOffEntryActor = ActorFromLogic<typeof oneOffEntryMachine>;

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

export function OneOffEntryList({
  actor,
  entries,
  empty,
}: {
  readonly actor: OneOffEntryActor;
  readonly entries: readonly Domain.OneOffMealEntry[];
  readonly empty: ReactElement;
}) {
  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.id}
      renderItem={({ item }) => <OneOffEntryRow actor={actor} entry={item} />}
      ListEmptyComponent={empty}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={styles.list}
      contentContainerStyle={styles.listContent}
    />
  );
}

const OneOffEntryRow = memo(function OneOffEntryRow({
  actor,
  entry,
}: {
  readonly actor: OneOffEntryActor;
  readonly entry: Domain.OneOffMealEntry;
}) {
  const date = `${entry.dateKey.slice(0, 4)}, ${monthFormatter.format(
    new Date(`${entry.dateKey}T00:00:00Z`)
  )} ${entry.dateKey.slice(8, 10)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Reuse ${entry.name}, ${entry.amountDescription}, ${date}`}
      style={styles.entry}
      onPress={() => actor.trigger.reuse({ mealEntryId: entry.id })}
    >
      <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
        {entry.name}
      </Text>
      <Text style={styles.caption}>
        {entry.amountDescription === "" ? "" : `${entry.amountDescription} · `}
        {date}
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
          .map(({ nutrient, prefix, suffix, color: nutrientColor }, index) => (
            <Text key={prefix}>
              {index === 0 ? "" : " · "}
              <Text style={{ color: nutrientColor }}>
                {`${prefix}${formatNutrientValue(nutrient)}${suffix}`}
              </Text>
            </Text>
          ))}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
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
