import { color } from "@/theme/tokens";
import type * as Domain from "@mai/nutrition/domain";
import { BadgeEuro } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export function FoodCurrentPriceIndicator({
  food,
}: {
  readonly food: Domain.Food | undefined;
}) {
  if (food?.prices.some((price) => price.isCurrent) !== true) {
    return null;
  }

  return (
    <View
      accessibilityLabel="Current price selected"
      accessible
      style={styles.root}
    >
      <BadgeEuro color={color.textMuted} size={10} strokeWidth={2.2} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
  },
});
