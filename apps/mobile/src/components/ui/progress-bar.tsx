import { color, radius } from "@/theme/tokens";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export function ProgressBar({
  accessibilityLabel,
  progress,
  style,
}: {
  readonly accessibilityLabel?: string;
  readonly progress: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: 100,
        min: 0,
        now: Math.round(clampedProgress * 100),
      }}
      style={[styles.track, style]}
    >
      <View style={[styles.fill, { width: `${clampedProgress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.progressTrack,
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: color.progressFill,
  },
});
