import { color, spacing } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
  type Edges,
} from "react-native-safe-area-context";

type AppScreenProps = {
  readonly children: ReactNode;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly safeAreaEdges?: Edges;
  readonly scroll?: boolean;
  readonly scrollProps?: Omit<ScrollViewProps, "children" | "style">;
  readonly style?: StyleProp<ViewStyle>;
  readonly topSafeAreaColor?: string;
};

export function AppScreen({
  children,
  contentStyle,
  safeAreaEdges = ["top", "bottom"],
  scroll = false,
  scrollProps,
  style,
  topSafeAreaColor,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safe, style]}>
      {topSafeAreaColor === undefined ? null : (
        <View
          pointerEvents="none"
          style={[
            styles.topSafeArea,
            {
              backgroundColor: topSafeAreaColor,
              height: insets.top,
            },
          ]}
        />
      )}
      {scroll ? (
        <ScrollView
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
          contentContainerStyle={[
            styles.content,
            scrollProps?.contentContainerStyle,
            contentStyle,
          ]}
          style={styles.scroll}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: color.bg,
  },
  topSafeArea: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
