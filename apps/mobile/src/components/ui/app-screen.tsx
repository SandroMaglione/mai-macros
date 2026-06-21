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
import { SafeAreaView, type Edges } from "react-native-safe-area-context";

type AppScreenProps = {
  readonly children: ReactNode;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly safeAreaEdges?: Edges;
  readonly scroll?: boolean;
  readonly scrollProps?: Omit<ScrollViewProps, "children" | "style">;
  readonly style?: StyleProp<ViewStyle>;
};

export function AppScreen({
  children,
  contentStyle,
  safeAreaEdges = ["top", "bottom"],
  scroll = false,
  scrollProps,
  style,
}: AppScreenProps) {
  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safe, style]}>
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
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
