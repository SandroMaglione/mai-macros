import { InputSelect } from "@/components/ui/input-select";
import { color, spacing } from "@/theme/tokens";
import type { Domain } from "@mai/nutrition";
import { StyleSheet, Text, View } from "react-native";

export function QuantityAccuracySelect({
  accuracy,
  disabled,
  change,
}: {
  readonly accuracy: Domain.QuantityAccuracy;
  readonly disabled: boolean;
  readonly change: (accuracy: Domain.QuantityAccuracy) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Amount accuracy</Text>
      <InputSelect
        title="Amount accuracy"
        disabled={disabled}
        selectedValue={accuracy}
        options={[
          { value: "unspecified", label: "Not specified" },
          { value: "measured", label: "Measured" },
          { value: "estimated", label: "Estimated" },
        ]}
        onSelect={(value) => {
          if (
            value === "unspecified" ||
            value === "measured" ||
            value === "estimated"
          )
            change(value);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: { color: color.textMuted, fontSize: 14 },
});
