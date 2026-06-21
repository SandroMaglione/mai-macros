import { color, radius, type } from "@/theme/tokens";
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type IconButtonVariant = "primary" | "secondary" | "ghost";

type IconButtonProps = Omit<PressableProps, "children" | "style"> & {
  readonly accessibilityLabel: string;
  readonly glyph: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: IconButtonVariant;
};

export function IconButton({
  disabled,
  glyph,
  style,
  variant = "secondary",
  ...pressableProps
}: IconButtonProps) {
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
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.glyph, { color: textColor[variant] }]}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

const textColor: Record<IconButtonVariant, string> = {
  ghost: color.textMuted,
  primary: color.white,
  secondary: color.text,
};

const styles = StyleSheet.create({
  root: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  glyph: {
    maxWidth: 24,
    textAlign: "center",
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
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
