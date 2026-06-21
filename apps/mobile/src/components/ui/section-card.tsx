import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type SectionCardProps = {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly subtitle?: string;
  readonly title?: string;
  readonly style?: StyleProp<ViewStyle>;
};

export function SectionCard({
  children,
  footer,
  style,
  subtitle,
  title,
}: SectionCardProps) {
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
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  subtitle: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
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
