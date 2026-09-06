import { NutrientProgressFill } from "./nutrient-progress-fill";
import {
  formatNutrientAmount,
  nutrientTotalDisplay,
  type NutrientDisplayMode,
} from "@/lib/nutrient-total-display";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { Reporting, type Domain } from "@mai/nutrition";
import { useRef, type ReactNode } from "react";
import PagerView from "react-native-pager-view";
import {
  dailySummaryNutrients,
  summaryPagerSelection,
} from "@/lib/daily-summary-nutrients";
import {
  Ban,
  Moon,
  CircleDashed,
  Check,
  TriangleAlert,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const mainNutrients = dailySummaryNutrients.slice(1, 4);
const secondaryNutrients = dailySummaryNutrients.slice(4);
const nutrientPages = [
  dailySummaryNutrients[7],
  ...dailySummaryNutrients,
  dailySummaryNutrients[0],
];

export function PinnedNutritionSummary({
  mode,
  onToggle,
  nutrition,
  plan,
  selectedNutrient,
  onSelectNutrient,
}: {
  readonly mode: NutrientDisplayMode;
  readonly onToggle: () => void;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan: Domain.Plan;
  readonly selectedNutrient: Reporting.NutrientName;
  readonly onSelectNutrient: (event: {
    nutrient: Reporting.NutrientName;
  }) => void;
}) {
  const pager = useRef<PagerView>(null);
  const page = useRef(
    dailySummaryNutrients.findIndex(({ name }) => name === selectedNutrient) + 1
  );
  const normalizePage = () => {
    const selection = summaryPagerSelection(page.current);
    if (selection.page !== page.current) {
      page.current = selection.page;
      pager.current?.setPageWithoutAnimation(selection.page);
    }
  };
  return (
    <PagerView
      ref={pager}
      style={styles.compactPager}
      initialPage={page.current}
      onPageSelected={({ nativeEvent }) => {
        page.current = nativeEvent.position;
        onSelectNutrient({
          nutrient: summaryPagerSelection(nativeEvent.position).nutrient.name,
        });
      }}
      onPageScrollStateChanged={({ nativeEvent }) => {
        if (nativeEvent.pageScrollState === "idle") normalizePage();
      }}
    >
      {nutrientPages.map(({ name, label }, index) => {
        const target = Reporting.getPlanNutrientTargetAmount({
          nutrientName: name,
          plan,
        });
        const display = nutrientTotalDisplay({ name, nutrition, target, mode });
        const unit = name === "energyKcal" ? "kcal" : "g";
        return (
          <View key={`${index}-${name}`} collapsable={false}>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel={`${label}, ${display.amount} ${unit}${target === undefined ? "" : `, target ${target} ${unit}`}`}
              accessibilityHint={`Showing ${mode}. Tap to show ${mode === "consumed" ? "remaining" : "consumed"}. Swipe horizontally to change nutrient.`}
              accessibilityActions={[
                { name: "increment", label: "Next nutrient" },
                { name: "decrement", label: "Previous nutrient" },
                { name: "activate", label: "Toggle consumed and remaining" },
              ]}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "activate") onToggle();
                else if (
                  nativeEvent.actionName === "increment" ||
                  nativeEvent.actionName === "decrement"
                ) {
                  normalizePage();
                  pager.current?.setPage(
                    page.current +
                      (nativeEvent.actionName === "increment" ? 1 : -1)
                  );
                }
              }}
              onPress={onToggle}
              style={({ pressed }) => [
                styles.compactRoot,
                pressed ? styles.pressed : null,
              ]}
            >
              <DailyMetric
                name={name}
                label={label}
                nutrition={nutrition}
                plan={plan}
                mode={mode}
                emphasis="compact"
                footerAccessory={
                  <View style={styles.pageDots}>
                    {dailySummaryNutrients.map((nutrient) => (
                      <View
                        key={nutrient.name}
                        style={[
                          styles.pageDot,
                          {
                            backgroundColor: nutrientFieldColors[nutrient.name],
                            opacity: nutrient.name === name ? 1 : 0.25,
                            width: nutrient.name === name ? 14 : 4,
                          },
                        ]}
                      />
                    ))}
                  </View>
                }
              />
            </Pressable>
          </View>
        );
      })}
    </PagerView>
  );
}

export function DailyNutritionSummary({
  dayMode,
  mode,
  onToggle,
  nutrition,
  plan,
}: {
  readonly mode: NutrientDisplayMode;
  readonly onToggle: () => void;
  readonly dayMode: Domain.DailyLogMode;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan: Domain.Plan;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={`Showing ${mode}. Show ${mode === "consumed" ? "remaining" : "consumed"} nutrients`}
      accessibilityState={{ selected: mode === "remaining" }}
      onPress={onToggle}
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
  footerAccessory,
  headingAccessory,
  name,
  label,
  nutrition,
  plan,
  mode,
  emphasis,
}: {
  readonly footerAccessory?: ReactNode;
  readonly headingAccessory?: ReactNode;
  readonly name: Reporting.NutrientName;
  readonly label: string;
  readonly nutrition: Reporting.MealEntriesNutrientTotals;
  readonly plan: Domain.Plan;
  readonly mode: NutrientDisplayMode;
  readonly emphasis: "energy" | "macro" | "secondary" | "compact";
}) {
  const target = Reporting.getPlanNutrientTargetAmount({
    nutrientName: name,
    plan,
  });
  const display = nutrientTotalDisplay({ name, nutrition, target, mode });
  const unit = name === "energyKcal" ? "kcal" : "g";
  const accent =
    display.targetState === "over"
      ? color.targetExceeded
      : display.targetState === "reached"
        ? color.targetReached
        : nutrientFieldColors[name];
  const TargetIcon =
    display.targetState === "over"
      ? TriangleAlert
      : display.targetState === "reached"
        ? Check
        : CircleDashed;
  const compact = emphasis === "compact";
  const hero = emphasis === "energy";
  return (
    <View
      style={[
        styles.metric,
        compact ? styles.compactMetric : null,
        emphasis === "macro"
          ? styles.macro
          : emphasis === "secondary"
            ? styles.secondaryMetric
            : null,
      ]}
    >
      {compact ? null : (
        <View style={[styles.labelRow, hero ? styles.energyLabelRow : null]}>
          <Text style={styles.label}>{label}</Text>
          {headingAccessory}
        </View>
      )}
      <View style={styles.valueRow}>
        <Text
          numberOfLines={compact ? 1 : undefined}
          adjustsFontSizeToFit={compact}
          minimumFontScale={0.75}
          style={[
            styles.value,
            compact ? styles.compactValue : null,
            {
              color:
                hero &&
                display.targetState !== "over" &&
                display.targetState !== "reached"
                  ? color.text
                  : accent,
            },
            hero
              ? styles.energyValue
              : emphasis === "macro"
                ? styles.macroValue
                : null,
          ]}
        >
          {display.amount}
        </Text>
        {!compact && !display.unknown ? (
          <Text style={styles.unit}>{unit}</Text>
        ) : null}
      </View>
      <View style={styles.progressGroup}>
        <View style={[styles.track, compact ? styles.compactTrack : null]}>
          <NutrientProgressFill
            colorValue={accent}
            total={display.value}
            estimated={display.estimatedAmount}
            target={target}
          />
        </View>
        <View style={styles.metricFooter}>
          {target === undefined ? null : (
            <View
              accessibilityLabel={`${display.targetState === "over" ? "Over target tolerance" : display.targetState === "reached" ? "Target reached" : display.targetState === "unavailable" ? "Target" : "Below target"}, ${target} ${unit}`}
              style={styles.targetRow}
            >
              <TargetIcon size={12} color={accent} strokeWidth={2} />
              <Text
                numberOfLines={compact ? 1 : undefined}
                adjustsFontSizeToFit={compact}
                style={[styles.target, compact ? styles.compactTarget : null]}
              >
                {formatNutrientAmount({
                  value: target,
                  maximumFractionDigits: name === "energyKcal" ? 0 : 1,
                })}{" "}
                {unit}
              </Text>
            </View>
          )}
          {footerAccessory}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  compactPager: { height: 88 },
  compactRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  compactMetric: { gap: spacing.xs },
  compactValue: { fontSize: 24, lineHeight: 30, flex: 1 },
  compactTrack: { height: 4 },
  compactTarget: { fontSize: 11, lineHeight: 14 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metricFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  pageDots: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  pageDot: { height: 4, borderRadius: radius.pill },
  progressGroup: { gap: spacing.sm },
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
    color: color.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
});
