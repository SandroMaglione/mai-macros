import { AppScreen } from "@/components/ui/app-screen";
import { IconButton } from "@/components/ui/icon-button";
import { AppHeader } from "@/components/ui/mai-header";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { router } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { ManageFoodsPanelLoader } from "./edit";

const FoodsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
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
  const panelDateKey = dateKeyResult._tag === "Valid" ? dateKey : undefined;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
        topSafeAreaColor={color.primary}
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
          trailing={
            <IconButton
              accessibilityLabel="Create food"
              icon={Plus}
              onPress={() => {
                router.push({
                  pathname: "/foods/new",
                  params: {
                    source: "foods",
                    ...(dateKey === undefined ? {} : { dateKey }),
                  },
                });
              }}
              variant="ghost"
            />
          }
        />

        <ManageFoodsPanelLoader dateKey={panelDateKey} layout="embedded" />
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
});
