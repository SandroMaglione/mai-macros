import { estimatedNutrientOpacity, radius } from "@/theme/tokens";
import { StyleSheet, View } from "react-native";

export function NutrientProgressFill({
  colorValue,
  total,
  estimated,
  target,
}: {
  readonly colorValue: string;
  readonly total: number;
  readonly estimated: number;
  readonly target?: number;
}) {
  const scale = Math.max(target ?? 0, total);
  const recorded = Math.max(0, total - estimated);
  const width = scale > 0 ? (total / scale) * 100 : 0;
  const recordedWidth = total > 0 ? (recorded / total) * 100 : 0;
  const estimatedWidth = total > 0 ? (estimated / total) * 100 : 0;

  return (
    <View style={[styles.fill, { width: `${width}%` }]}>
      <View
        style={{ backgroundColor: colorValue, width: `${recordedWidth}%` }}
      />
      <View
        style={{
          backgroundColor: colorValue,
          opacity: estimatedNutrientOpacity,
          width: `${estimatedWidth}%`,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flexDirection: "row",
    height: "100%",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
