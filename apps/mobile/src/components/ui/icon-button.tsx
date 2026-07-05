import { color, radius } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type IconButtonVariant = "primary" | "secondary" | "ghost";

export function IconButton({
  disabled,
  icon: Icon,
  iconColor,
  iconSize = 22,
  style,
  strokeWidth = 2.8,
  variant = "secondary",
  ...pressableProps
}: Omit<PressableProps, "children" | "style"> & {
  readonly accessibilityLabel: string;
  readonly icon: LucideIcon;
  readonly iconColor?: string;
  readonly iconSize?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly strokeWidth?: number;
  readonly variant?: IconButtonVariant;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      {...pressableProps}
      style={({ pressed }) => [
        styles.root,
        variantStyles[variant],
        pressed && disabled !== true ? styles.pressed : null,
        disabled === true ? styles.disabled : null,
        style,
      ]}
    >
      <Icon
        color={iconColor ?? textColor[variant]}
        size={iconSize}
        strokeWidth={strokeWidth}
      />
    </Pressable>
  );
}

const textColor: Record<IconButtonVariant, string> = {
  ghost: color.white,
  primary: color.white,
  secondary: color.text,
};

const styles = StyleSheet.create({
  root: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.5,
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
  ghost: {
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
});
