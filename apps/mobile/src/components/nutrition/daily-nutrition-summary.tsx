import { NutrientProgressFill } from "./nutrient-progress-fill";
import {
  formatNutrientAmount,
  nutrientTotalDisplay,
  type NutrientDisplayMode,
} from "@/lib/nutrient-total-display";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines/schemas";
import { Reporting, type Domain } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { Ban, Moon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { setup } from "xstate";

const displayMachine = setup({
  schemas: { events: { toggle: Schema.toStandardSchemaV1(EmptyEvent) } },
  states: { consumed: {}, remaining: {} },
}).createMachine({
  initial: "consumed",
  states: {
    consumed: { on: { toggle: { target: "remaining" } } },
    remaining: { on: { toggle: { target: "consumed" } } },
  },
});

const mainNutrients = [
  { name: "carbsGrams", label: "Carbs" },
  { name: "proteinGrams", label: "Protein" },
  { name: "fatGrams", label: "Fat" },
] as const;
const secondaryNutrients = [
  { name: "fiberGrams", label: "Fiber" },
  { name: "sugarGrams", label: "Sugar" },
  { name: "saturatedFatGrams", label: "Sat fat" },
  { name: "saltGrams", label: "Salt" },
] as const;

export function DailyNutritionSummary({
  dayMode,
  nutrition,
  plan,
}: {
  readonly dayMode: Domain.DailyLogMode;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan: Domain.Plan;
}) {
  const [snapshot, , actor] = useMachine(displayMachine);
  const mode = snapshot.value;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={`Showing ${mode}. Show ${mode === "consumed" ? "remaining" : "consumed"} nutrients`}
      accessibilityState={{ selected: mode === "remaining" }}
      onPress={actor.trigger.toggle}
      style={({ pressed }) => [styles.root, pressed ? styles.pressed : null]}
    >
      <DailyMetric
        name="energyKcal"
        label="Calories"
        headingAccessory={<DayModeChip mode={dayMode} />}
        nutrition={nutrition}
        plan={plan}
        mode={mode}
        emphasis="energy"
      />
      <View style={styles.macros}>
        {mainNutrients.map((nutrient) => (
          <DailyMetric
            key={nutrient.name}
            {...nutrient}
            nutrition={nutrition}
            plan={plan}
            mode={mode}
            emphasis="macro"
          />
        ))}
      </View>
      <View style={styles.secondary}>
        {secondaryNutrients.map((nutrient) => (
          <DailyMetric
            key={nutrient.name}
            {...nutrient}
            nutrition={nutrition}
            plan={plan}
            mode={mode}
            emphasis="secondary"
          />
        ))}
      </View>
    </Pressable>
  );
}

function DayModeChip({ mode }: { readonly mode: Domain.DailyLogMode }) {
  if (mode === "eating") return null;
  const fasting = mode === "fasting";
  const Icon = fasting ? Moon : Ban;
  const accent = fasting ? color.safeText : color.notRecordedText;
  return (
    <View
      style={[
        styles.modeChip,
        {
          backgroundColor: fasting ? color.safeBg : color.notRecordedBg,
          borderColor: accent,
        },
      ]}
    >
      <Icon size={13} color={accent} strokeWidth={2} />
      <Text style={[styles.modeChipLabel, { color: accent }]}>
        {fasting ? "Fasting" : "Not recorded"}
      </Text>
    </View>
  );
}

function DailyMetric({
  headingAccessory,
  name,
  label,
  nutrition,
  plan,
  mode,
  emphasis,
}: {
  readonly headingAccessory?: ReactNode;
  readonly name: Reporting.NutrientName;
  readonly label: string;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan: Domain.Plan;
  readonly mode: NutrientDisplayMode;
  readonly emphasis: "energy" | "macro" | "secondary";
}) {
  const target = Reporting.getPlanNutrientTargetAmount({
    nutrientName: name,
    plan,
  });
  const display = nutrientTotalDisplay({ name, nutrition, target, mode });
  const unit = name === "energyKcal" ? "kcal" : "g";
  const accent = nutrientFieldColors[name];
  const hero = emphasis === "energy";
  return (
    <View
      style={[
        styles.metric,
        emphasis === "macro"
          ? styles.macro
          : emphasis === "secondary"
            ? styles.secondaryMetric
            : null,
      ]}
    >
      <View style={[styles.labelRow, hero ? styles.energyLabelRow : null]}>
        <Text style={styles.label}>{label}</Text>
        {headingAccessory}
      </View>
      <View style={styles.valueRow}>
        <Text
          style={[
            styles.value,
            { color: hero ? color.text : accent },
            hero
              ? styles.energyValue
              : emphasis === "macro"
                ? styles.macroValue
                : null,
          ]}
        >
          {display.amount}
        </Text>
        {!display.unknown ? (
          <Text style={styles.unit}>
            {unit}
            {mode === "remaining" &&
            target !== undefined &&
            !display.incomplete &&
            display.value <= target
              ? " left"
              : ""}
          </Text>
        ) : null}
      </View>
      <View style={styles.track}>
        <NutrientProgressFill
          colorValue={accent}
          total={display.value}
          estimated={display.estimatedAmount}
          target={target}
        />
      </View>
      <Text style={styles.target}>
        {target === undefined
          ? "No target"
          : `Target ${formatNutrientAmount(target)} ${unit}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  pressed: { opacity: 0.75 },
  metric: { minWidth: 0, gap: spacing.md },
  macros: { flexDirection: "row", gap: spacing.lg },
  macro: { flex: 1 },
  secondary: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.xxl,
    rowGap: spacing.xxxl,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingTop: spacing.xxxl,
  },
  secondaryMetric: { flexBasis: "44%", flexGrow: 1 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  energyLabelRow: { minHeight: 28 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  modeChipLabel: {
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
    fontWeight: tokens.type.weight.medium,
  },
  label: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.medium,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: spacing.xs,
  },
  value: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: tokens.type.weight.semibold,
    fontVariant: ["tabular-nums"],
  },
  macroValue: { fontSize: 26, lineHeight: 32 },
  energyValue: { fontSize: 44, lineHeight: 52, letterSpacing: -1.5 },
  unit: { color: color.textMuted, fontSize: tokens.type.size.sm },
  track: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: color.progressTrack,
    overflow: "hidden",
  },
  target: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
    fontVariant: ["tabular-nums"],
  },
});
