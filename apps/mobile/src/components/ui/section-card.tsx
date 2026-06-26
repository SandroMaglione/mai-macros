import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export function SectionCard({
  children,
  footer,
  style,
  subtitle,
  title,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly subtitle?: string;
  readonly title?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const hasHeader = title !== undefined || subtitle !== undefined;

  return (
    <View style={[styles.root, style]}>
      {hasHeader ? (
        <View style={styles.header}>
          {title === undefined ? null : (
            <Text style={styles.title}>{title}</Text>
          )}
          {subtitle === undefined ? null : (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
      {footer === undefined ? null : (
        <View style={styles.footer}>{footer}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  subtitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  body: {
    padding: spacing.lg,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    padding: spacing.lg,
  },
});
