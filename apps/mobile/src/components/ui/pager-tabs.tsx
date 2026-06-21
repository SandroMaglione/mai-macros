import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PagerView from "react-native-pager-view";

export type PagerTab = {
  readonly accessibilityLabel: string;
  readonly content: ReactNode;
  readonly key: string;
  readonly label: string;
};

type PagerTabBarVariant = "surface" | "header";
type PagerTabBarPosition = "top" | "bottom";

export function PagerTabBar({
  activeIndex,
  onActiveIndexChange,
  onTabPress,
  tabs,
  variant = "surface",
}: {
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onTabPress?: (index: number) => void;
  readonly tabs: readonly Pick<
    PagerTab,
    "accessibilityLabel" | "key" | "label"
  >[];
  readonly variant?: PagerTabBarVariant;
}) {
  const isHeader = variant === "header";

  return (
    <View style={[styles.tabs, isHeader ? styles.headerTabs : null]}>
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
  tabBarPosition = "top",
  tabBarVariant = "surface",
  tabs,
}: {
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly tabBarPosition?: PagerTabBarPosition;
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
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
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
