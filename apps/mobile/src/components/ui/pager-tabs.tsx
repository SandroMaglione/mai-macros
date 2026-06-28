import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import type { ReactNode } from "react";
import { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import PagerView from "react-native-pager-view";

export type PagerTab = {
  readonly accessibilityLabel: string;
  readonly content: ReactNode;
  readonly key: string;
  readonly label: string;
};

type PagerTabBarVariant = "surface" | "header";

export function PagerTabBar({
  activeIndex,
  onActiveIndexChange,
  onTabPress,
  style,
  tabs,
  variant = "surface",
}: {
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onTabPress?: (index: number) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly tabs: readonly Pick<
    PagerTab,
    "accessibilityLabel" | "key" | "label"
  >[];
  readonly variant?: PagerTabBarVariant;
}) {
  const isHeader = variant === "header";

  return (
    <View style={[styles.tabs, isHeader ? styles.headerTabs : null, style]}>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;

        return (
          <Pressable
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={tab.key}
            onPress={() => {
              onTabPress?.(index);
              onActiveIndexChange(index);
            }}
            style={({ pressed }) => [
              styles.tab,
              isActive
                ? isHeader
                  ? styles.headerTabActive
                  : styles.tabActive
                : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.tabText,
                isActive
                  ? isHeader
                    ? styles.headerTabTextActive
                    : styles.tabTextActive
                  : isHeader
                    ? styles.headerTabTextInactive
                    : styles.tabTextInactive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PagerTabs({
  activeIndex,
  onActiveIndexChange,
  tabBarStyle,
  tabBarPosition = "top",
  tabBarVariant = "surface",
  tabs,
}: {
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly tabBarStyle?: StyleProp<ViewStyle>;
  readonly tabBarPosition?: "top" | "bottom";
  readonly tabBarVariant?: PagerTabBarVariant;
  readonly tabs: readonly PagerTab[];
}) {
  const pagerRef = useRef<PagerView>(null);
  const tabBar = (
    <PagerTabBar
      activeIndex={activeIndex}
      onActiveIndexChange={onActiveIndexChange}
      onTabPress={(index) => {
        pagerRef.current?.setPage(index);
      }}
      style={tabBarStyle}
      tabs={tabs}
      variant={tabBarVariant}
    />
  );

  return (
    <View style={styles.root}>
      {tabBarPosition === "top" ? tabBar : null}

      <PagerView
        initialPage={activeIndex}
        onPageSelected={(event) => {
          onActiveIndexChange(event.nativeEvent.position);
        }}
        ref={pagerRef}
        style={styles.pager}
      >
        {tabs.map((tab) => (
          <View key={tab.key} style={styles.page}>
            {tab.content}
          </View>
        ))}
      </PagerView>

      {tabBarPosition === "bottom" ? tabBar : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.lg,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.xs,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  headerTabs: {
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.14)",
    shadowOpacity: 0,
    elevation: 0,
  },
  tab: {
    minHeight: 42,
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  tabActive: {
    backgroundColor: color.primary,
  },
  headerTabActive: {
    backgroundColor: color.white,
  },
  pressed: {
    opacity: 0.86,
  },
  tabText: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  tabTextActive: {
    color: color.white,
  },
  tabTextInactive: {
    color: color.textMuted,
  },
  headerTabTextActive: {
    color: color.primary,
  },
  headerTabTextInactive: {
    color: color.white,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
