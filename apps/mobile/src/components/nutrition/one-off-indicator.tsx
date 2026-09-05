import { color } from "@/theme/tokens";
import { StyleSheet, View } from "react-native";

export function OneOffIndicator() {
  return (
    <View accessible accessibilityLabel="One-off food" style={styles.diamond} />
  );
}

const styles = StyleSheet.create({
  diamond: {
    width: 7,
    height: 7,
    marginHorizontal: 2,
    borderWidth: 1.5,
    borderColor: color.textMuted,
    transform: [{ rotate: "45deg" }],
  },
});
