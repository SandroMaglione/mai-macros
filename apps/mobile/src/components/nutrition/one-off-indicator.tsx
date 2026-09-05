import { color } from "@/theme/tokens";
import { StyleSheet, Text } from "react-native";

export function OneOffIndicator() {
  return (
    <Text accessibilityLabel="One-off food" style={styles.label}>
      One-off
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    color: color.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
