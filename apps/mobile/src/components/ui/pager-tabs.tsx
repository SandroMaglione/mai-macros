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

export function PagerTabs({
  activeIndex,
  onActiveIndexChange,
  tabs,
}: {
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly tabs: readonly PagerTab[];
}) {
  const pagerRef = useRef<PagerView>(null);

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {tabs.map((tab, index) => {
          const isActive = index === activeIndex;

          return (
            <Pressable
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={tab.key}
              onPress={() => {
                pagerRef.current?.setPage(index);
                onActiveIndexChange(index);
              }}
              style={({ pressed }) => [
                styles.tab,
                isActive ? styles.tabActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  isActive ? styles.tabTextActive : styles.tabTextInactive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
