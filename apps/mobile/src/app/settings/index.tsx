import { AppScreen } from "@/components/ui/app-screen";
import { NavigationRow } from "@/components/ui/navigation-row";
import { IconButton } from "@/components/ui/icon-button";
import { AppHeader } from "@/components/ui/mai-header";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, ClipboardList, Database } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

const SettingsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

export default function SettingsScreen() {
  const search = useSchemaLocalSearchParams(SettingsSearchParams);

  if (Option.isNone(search)) {
    return <Redirect href="/" />;
  }

  const dateKey = search.value.dateKey;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
        scroll
        topSafeAreaColor={color.header}
      >
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel="Back to day"
              icon={ChevronLeft}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }

                if (dateKey === undefined) {
                  router.replace("/");
                  return;
                }

                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey },
                });
              }}
              variant="ghost"
            />
          }
          shadow
          subtitle={dateKey}
          title="Settings"
        />

        <View style={styles.sections}>
          <NavigationRow
            title="Meal plans"
            description="Daily targets and meal structure"
            icon={ClipboardList}
            onPress={() => {
              if (dateKey === undefined) {
                router.push({
                  pathname: "/plans",
                  params: { source: "settings" },
                });
                return;
              }

              router.push({
                pathname: "/plans",
                params: { dateKey, source: "settings" },
              });
            }}
          />

          <NavigationRow
            title="Data & backup"
            description="Import, export and manage local data"
            icon={Database}
            onPress={() => {
              router.push("/backup");
            }}
          />
        </View>
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
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  sections: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
