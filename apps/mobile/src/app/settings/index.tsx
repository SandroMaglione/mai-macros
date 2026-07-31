import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { AppHeader } from "@/components/ui/mai-header";
import { SectionCard } from "@/components/ui/section-card";
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
          <SectionCard
            subtitle="Select the plan for this day, or create and edit meal plans."
            title="Meal plans"
          >
            <Button
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
              variant="secondary"
            >
              Open meal plans
            </Button>
          </SectionCard>

          <SectionCard
            subtitle="Import or export backups and food catalogs, or reset local data."
            title="Data & backup"
          >
            <Button
              icon={Database}
              onPress={() => {
                router.push("/backup");
              }}
              variant="secondary"
            >
              Open data & backup
            </Button>
          </SectionCard>
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
