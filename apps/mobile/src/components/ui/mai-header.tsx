import { color, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

type MaiHeaderProps = {
  readonly action?: ReactNode;
  readonly eyebrow?: string;
  readonly subtitle?: string;
  readonly title: string;
};

export function MaiHeader({
  action,
  eyebrow,
  subtitle,
  title,
}: MaiHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        {eyebrow === undefined ? null : (
          <Text numberOfLines={1} style={styles.eyebrow}>
            {eyebrow}
          </Text>
        )}
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <View style={styles.action}>{action}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: color.textSubtle,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  title: {
    color: color.text,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  subtitle: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  action: {
    flexShrink: 0,
  },
});
