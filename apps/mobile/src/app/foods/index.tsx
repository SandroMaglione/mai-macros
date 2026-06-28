import { AppHeader, AppScreen, IconButton, PagerTabs } from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { setup } from "xstate";

import { EditFoodsPanelLoader } from "./edit";
import { CreateFoodPanel } from "./new";

const FoodsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const foodsHubMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        activeTab: Schema.Literals([0, 1]),
      })
    ),
    events: {
      selectTab: Schema.toStandardSchemaV1(
        Schema.Struct({
          index: Schema.Literals([0, 1]),
        })
      ),
    },
  },
}).createMachine({
  context: {
    activeTab: 0,
  },
  on: {
    selectTab: ({ event }) => ({
      context: {
        activeTab: event.index,
      },
    }),
  },
});

export default function FoodsScreen() {
  const dateKeyResult = useSchemaLocalSearchParams(FoodsSearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: ({ dateKey }) => ({
        _tag: "Valid" as const,
        dateKey,
      }),
    })
  ) satisfies
    | {
        readonly _tag: "Valid";
        readonly dateKey: Domain.DateKey | undefined;
      }
    | {
        readonly _tag: "Invalid";
      };
  const dateKey =
    dateKeyResult._tag === "Valid" ? dateKeyResult.dateKey : undefined;
  const panelDateKeyParam =
    dateKeyResult._tag === "Valid" ? dateKey : undefined;
  const [snapshot, , actor] = useMachine(foodsHubMachine);
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
            actor.trigger.selectTab({
              index: index === 0 ? 0 : 1,
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
                  dateKey={panelDateKeyParam}
                  layout="embedded"
                />
              ),
            },
          ]}
        />
      </AppScreen>
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
});
