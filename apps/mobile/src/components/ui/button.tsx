import { color, radius, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: ButtonVariant;
};

export function Button({
  children,
  disabled,
  loading = false,
  style,
  variant = "primary",
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...pressableProps}
      style={({ pressed }) => [
        styles.root,
        variantStyles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={textColor[variant]} size="small" />
        ) : null}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.label, { color: textColor[variant] }]}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const textColor: Record<ButtonVariant, string> = {
  danger: color.dangerText,
  ghost: color.textMuted,
  primary: color.white,
  secondary: color.text,
};

const styles = StyleSheet.create({
  root: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  content: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  label: {
    flexShrink: 1,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.58,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    borderColor: color.primary,
    backgroundColor: color.primary,
  },
  secondary: {
    borderColor: color.divider,
    backgroundColor: color.surfaceRaised,
  },
  danger: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  ghost: {
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
});
