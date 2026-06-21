import { color, radius, shadow, spacing } from "@/theme/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BottomActionBarVariant = "footer" | "floating";

type BottomActionBarProps = {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: BottomActionBarVariant;
};

export function BottomActionBar({
  children,
  style,
  variant = "footer",
}: BottomActionBarProps) {
  const insets = useSafeAreaInsets();
  const isFloating = variant === "floating";

  return (
    <View
      style={[
        isFloating ? styles.floatingRoot : styles.footerRoot,
        {
          paddingBottom: insets.bottom + (isFloating ? spacing.md : spacing.lg),
        },
        style,
      ]}
    >
      <View style={isFloating ? styles.floatingInner : styles.footerInner}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerRoot: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: color.sheet,
  },
  footerInner: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  floatingRoot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  floatingInner: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: color.actionSheetBorder,
    borderRadius: radius.lg,
    padding: 6,
    backgroundColor: color.bottomNav,
    ...shadow.bottomNav,
  },
});
