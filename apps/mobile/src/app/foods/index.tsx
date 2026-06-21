import {
  AppHeader,
  AppScreen,
  BottomActionBar,
  Button,
  IconButton,
  PagerTabs,
  SectionCard,
} from "@/components/ui";
import { color, spacing, type } from "@/theme/tokens";
import { DateKey as DateKeySchema } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";
import { router, useLocalSearchParams } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { ChevronLeft, Pencil, Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { assertEvent, assign, setup } from "xstate";

type FoodsTabIndex = 0 | 1;

const foodsHubMachine = setup({
  types: {
    context: {} as {
      readonly activeTab: FoodsTabIndex;
    },
    events: {} as {
      readonly index: FoodsTabIndex;
      readonly type: "selectTab";
    },
  },
}).createMachine({
  context: {
    activeTab: 0,
  },
  on: {
    selectTab: {
      actions: assign(({ event }) => {
        assertEvent(event, "selectTab");

        return {
          activeTab: event.index,
        };
      }),
    },
  },
});

export default function FoodsScreen() {
  const params = useLocalSearchParams<{
    readonly dateKey?: string | string[];
  }>();
  const dateKeyParam = globalThis.Array.isArray(params.dateKey)
    ? params.dateKey[0]
    : params.dateKey;
  const dateKey =
    dateKeyParam === undefined
      ? undefined
      : Schema.decodeOption(DateKeySchema)(dateKeyParam).pipe(
          Option.getOrUndefined
        );
  const [snapshot, send] = useMachine(foodsHubMachine);
  const activeTab = snapshot.context.activeTab;
  const isCreateTab = activeTab === 0;

  return (
    <View style={styles.screen}>
      <AppScreen contentStyle={styles.content} safeAreaEdges={["top"]}>
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel="Back to day"
              icon={ChevronLeft}
              onPress={() => {
                if (dateKey === undefined) {
                  router.replace("/");
                  return;
                }

                router.replace({
                  pathname: "/days/[dateKey]",
                  params: {
                    dateKey,
                  },
                });
              }}
              variant="ghost"
            />
          }
          shadow
          title="Foods"
        />

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={(index) => {
            send({
              index: index === 0 ? 0 : 1,
              type: "selectTab",
            });
          }}
          tabs={[
            {
              accessibilityLabel: "Create food",
              content: (
                <FoodHubPanel
                  icon={Plus}
                  label="Create food"
                  subtitle="New library item"
                />
              ),
              key: "create",
              label: "Create",
            },
            {
              accessibilityLabel: "Edit foods",
              content: (
                <FoodHubPanel
                  icon={Pencil}
                  label="Edit foods"
                  subtitle="Food library"
                />
              ),
              key: "edit",
              label: "Edit",
            },
          ]}
        />
      </AppScreen>

      <BottomActionBar>
        <Button
          icon={isCreateTab ? Plus : Pencil}
          onPress={() => {
            router.push({
              pathname: isCreateTab ? "/foods/new" : "/foods/edit",
              params: dateKey === undefined ? {} : { dateKey },
            });
          }}
          style={styles.footerButton}
        >
          {isCreateTab ? "Create food" : "Edit foods"}
        </Button>
      </BottomActionBar>
    </View>
  );
}

function FoodHubPanel({
  icon: Icon,
  label,
  subtitle,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly subtitle: string;
}) {
  return (
    <View style={styles.panelWrap}>
      <SectionCard style={styles.panel}>
        <View style={styles.panelBody}>
          <View style={styles.panelIcon}>
            <Icon color={color.primary} size={26} strokeWidth={3} />
          </View>
          <View style={styles.panelCopy}>
            <Text numberOfLines={1} style={styles.panelTitle}>
              {label}
            </Text>
            <Text numberOfLines={1} style={styles.panelSubtitle}>
              {subtitle}
            </Text>
          </View>
        </View>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  panelWrap: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing.xxl,
  },
  panel: {
    backgroundColor: color.surface,
  },
  panelBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  panelIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: color.primarySoft,
  },
  panelCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  panelTitle: {
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  panelSubtitle: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  footerButton: {
    flex: 1,
  },
});
