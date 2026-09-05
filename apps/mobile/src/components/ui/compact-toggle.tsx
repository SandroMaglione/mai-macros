import { color, radius, spacing } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type ToggleOption<Value extends string> = {
  readonly value: Value;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly symbol?: string;
};

export function CompactToggle<Value extends string>({
  options,
  value,
  onSelect,
}: {
  readonly options: readonly [ToggleOption<Value>, ToggleOption<Value>];
  readonly value: Value;
  readonly onSelect: (value: Value) => void;
}) {
  return (
    <View style={styles.root}>
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected ? styles.selected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {Icon === undefined ? (
              <Text
                style={[styles.symbol, selected ? styles.selectedSymbol : null]}
              >
                {option.symbol ?? option.label}
              </Text>
            ) : (
              <Icon
                color={selected ? color.white : color.textMuted}
                size={17}
                strokeWidth={2.4}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    flexShrink: 0,
    borderRadius: radius.sm,
    padding: 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  option: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xxs,
  },
  selected: { backgroundColor: color.primary },
  symbol: { color: color.textMuted, fontSize: 19, fontWeight: "600" },
  selectedSymbol: { color: color.white },
  pressed: { opacity: 0.7 },
});
