import { BodyWeightPanel } from "@/components/body-weight/body-weight-panel";
import { AppHeader, AppScreen, IconButton } from "@/components/ui";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { color, spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { StyleSheet } from "react-native";

const WeightSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

export default function WeightScreen() {
  const dateKey = useSchemaLocalSearchParams(WeightSearchParams).pipe(
    Option.match({
      onNone: () => undefined,
      onSome: ({ dateKey }) => dateKey,
    })
  );

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      scrollProps={{
        showsVerticalScrollIndicator: false,
      }}
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
        title="Weight"
      />

      <BodyWeightPanel initialDateKey={dateKey} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
    backgroundColor: color.bg,
  },
  header: {
    marginBottom: spacing.lg,
  },
});
