import { AppScreen } from "@/components/ui/app-screen";
import { IconButton } from "@/components/ui/icon-button";
import { AppHeader } from "@/components/ui/mai-header";
import { PagerTabs } from "@/components/ui/pager-tabs";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { color, spacing } from "@/theme/tokens";
import { useAtom } from "@effect/atom-react";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ManageFoodsPanelLoader } from "./edit";
import { CreateFoodPanel } from "./new";

const FoodsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  tab: Schema.optionalKey(Schema.Literals(["create", "manage"])),
});

export default function FoodsScreen() {
  const dateKeyResult = useSchemaLocalSearchParams(FoodsSearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: ({ dateKey, tab }) => ({
        _tag: "Valid" as const,
        dateKey,
        tab,
      }),
    })
  ) satisfies
    | {
        readonly _tag: "Valid";
        readonly dateKey: Domain.DateKey | undefined;
        readonly tab: "create" | "manage" | undefined;
      }
    | {
        readonly _tag: "Invalid";
      };
  const dateKey =
    dateKeyResult._tag === "Valid" ? dateKeyResult.dateKey : undefined;
  const panelDateKeyParam =
    dateKeyResult._tag === "Valid" ? dateKey : undefined;
  const initialTab =
    dateKeyResult._tag === "Valid" && dateKeyResult.tab === "manage" ? 1 : 0;
  const activeTabAtom = useMemo(
    () => Atom.make<0 | 1>(initialTab),
    [initialTab]
  );
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const tabs = [
    {
      accessibilityLabel: "Create food",
      key: "create",
      label: "Create",
    },
    {
      accessibilityLabel: "Manage foods",
      key: "edit",
      label: "Manage",
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
          style={styles.header}
          title="Foods"
        />

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={(index) => {
            setActiveTab(index === 0 ? 0 : 1);
          }}
          tabBarPosition="bottom"
          tabBarStyle={styles.tabBar}
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
                <ManageFoodsPanelLoader
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
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  header: {
    marginHorizontal: 0,
  },
  tabBar: {
    marginHorizontal: spacing.lg,
  },
});
