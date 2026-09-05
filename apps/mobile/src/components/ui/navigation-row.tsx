import { color, radius, spacing, tokens } from "@/theme/tokens";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function NavigationRow({
  title,
  description,
  icon: Icon,
  onPress,
}: {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed ? styles.pressed : null]}
    >
      <View style={styles.icon}>
        <Icon size={22} color={color.primary} strokeWidth={1.8} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <ChevronRight size={18} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    minHeight: 92,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.medium,
  },
  description: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
  },
  pressed: { opacity: 0.75 },
});
