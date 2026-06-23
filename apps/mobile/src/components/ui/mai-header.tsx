import { color, shadow, spacing, tokens } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AppHeaderProps = {
  readonly children?: ReactNode;
  readonly center?: ReactNode;
  readonly embedded?: boolean;
  readonly eyebrow?: string;
  readonly leading?: ReactNode;
  readonly safeAreaTop?: boolean;
  readonly shadow?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly subtitle?: string;
  readonly title?: string;
  readonly trailing?: ReactNode;
};

export function AppHeader({
  children,
  center,
  embedded = false,
  eyebrow,
  leading,
  safeAreaTop = true,
  shadow: hasShadow = false,
  style,
  subtitle,
  title,
  trailing,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        embedded
          ? [
              styles.embedded,
              {
                marginTop: -spacing.lg - (safeAreaTop ? insets.top : 0),
              },
            ]
          : null,
        {
          paddingTop:
            (safeAreaTop ? insets.top : 0) + Math.round(spacing.sm * 0.9),
        },
        hasShadow ? shadow.header : null,
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.slot, styles.leading]}>{leading}</View>
        <View style={styles.center}>
          {center ?? (
            <View style={styles.titleGroup}>
              {eyebrow === undefined ? null : (
                <Text numberOfLines={1} style={styles.eyebrow}>
                  {eyebrow}
                </Text>
              )}
              {title === undefined ? null : (
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={styles.title}
                >
                  {title}
                </Text>
              )}
              {subtitle === undefined ? null : (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {subtitle}
                </Text>
              )}
            </View>
          )}
        </View>
        <View style={[styles.slot, styles.trailing]}>{trailing}</View>
      </View>
      {children === undefined || children === null ? null : (
        <View style={styles.children}>{children}</View>
      )}
    </View>
  );
}

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
    <AppHeader
      embedded
      eyebrow={eyebrow}
      leading={action}
      shadow={true}
      subtitle={subtitle}
      title={title}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Math.round(spacing.sm * 0.9),
    backgroundColor: color.primary,
  },
  embedded: {
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  slot: {
    minWidth: 0,
    flex: 1,
  },
  leading: {
    alignItems: "flex-start",
  },
  trailing: {
    alignItems: "flex-end",
  },
  center: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleGroup: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  title: {
    maxWidth: 220,
    color: color.white,
    textAlign: "center",
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
  subtitle: {
    maxWidth: 220,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  children: {
    marginTop: spacing.md,
  },
});
