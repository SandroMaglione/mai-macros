import { AppHeader, AppScreen, IconButton, PagerTabs } from "@/components/ui";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { assertEvent, assign, setup } from "xstate";

import { EditFoodsPanelLoader } from "./edit";
import { CreateFoodPanel } from "./new";

type FoodsTabIndex = 0 | 1;

type FoodsDateKeyDecodeResult =
  | {
      readonly _tag: "Valid";
      readonly dateKey: Domain.DateKey | undefined;
    }
  | {
      readonly _tag: "Invalid";
    };

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
  const dateKeyResult: FoodsDateKeyDecodeResult =
    dateKeyParam === undefined
      ? {
          _tag: "Valid",
          dateKey: undefined,
        }
      : Schema.decodeOption(Domain.DateKey)(dateKeyParam).pipe(
          Option.match({
            onNone: () => ({
              _tag: "Invalid" as const,
            }),
            onSome: (dateKey) => ({
              _tag: "Valid" as const,
              dateKey,
            }),
          })
        );
  const dateKey =
    dateKeyResult._tag === "Valid" ? dateKeyResult.dateKey : undefined;
  const panelDateKeyParam =
    dateKeyResult._tag === "Valid" ? dateKeyParam : undefined;
  const [snapshot, send] = useMachine(foodsHubMachine);
  const activeTab = snapshot.context.activeTab;
  const tabs = [
    {
      accessibilityLabel: "Create food",
      key: "create",
      label: "Create",
    },
    {
      accessibilityLabel: "Edit foods",
      key: "edit",
      label: "Edit",
    },
  ] as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.screen}>
        <AppScreen
          contentStyle={styles.content}
          safeAreaEdges={["top", "bottom"]}
        >
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
            tabBarPosition="bottom"
            tabs={[
              {
                ...tabs[0],
                content: (
                  <CreateFoodPanel
                    dateKey={dateKey}
                    initialNotice={
                      dateKeyResult._tag === "Invalid"
                        ? "The target date was not valid. Saving will return to today."
                        : null
                    }
                    mode="embedded"
                    onBack={() => {
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
                  />
                ),
              },
              {
                ...tabs[1],
                content: (
                  <EditFoodsPanelLoader
                    dateKeyParam={panelDateKeyParam}
                    layout="embedded"
                  />
                ),
              },
            ]}
          />
        </AppScreen>
      </View>
    </KeyboardAvoidingView>
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
});
