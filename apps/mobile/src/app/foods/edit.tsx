import {
  FoodSearchField,
  FoodSearchResults,
} from "@/components/nutrition/food-search";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader, MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { useMachine } from "@/hooks/use-machine";
import { formatNumber } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  ManageFoodsLoaderEvents,
  ManageFoodsLoaderMachine,
  ManageFoodsMachine,
  type ManageFoodsData,
} from "@/machines/manage-foods-machine";
import { color, spacing } from "@/theme/tokens";
import { FoodSearchMachine } from "@mai/machines";
import { Utils, Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect, router, useFocusEffect } from "expo-router";
import { ChevronLeft, RotateCcw } from "lucide-react-native";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

type ManageFoodsLayout = "screen" | "embedded";

const ManageFoodsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

export default function ManageFoodsRoute() {
  const search = useSchemaLocalSearchParams(ManageFoodsSearchParams);

  return Option.isNone(search) ? (
    <Redirect href="/" />
  ) : (
    <ManageFoodsPanelLoader dateKey={search.value.dateKey} layout="screen" />
  );
}

export function ManageFoodsPanelLoader({
  dateKey,
  layout,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly layout: ManageFoodsLayout;
}) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(ManageFoodsLoaderMachine, { dateKey })
  );
  useFocusEffect(
    useCallback(() => {
      send(ManageFoodsLoaderEvents.Refresh());
    }, [send])
  );
  const state = snapshot.state;

  if (state.path === "Loading") {
    return layout === "embedded" ? (
      <View style={styles.centered}>
        <LoadingView message="Loading foods" />
      </View>
    ) : (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading foods" />
      </AppScreen>
    );
  }

  if (state.path === "Failed") {
    const failure = (
      <View style={styles.centered}>
        <Notice
          message={state.value.message}
          title="Food library unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(ManageFoodsLoaderEvents.Retry());
          }}
          variant="secondary"
        >
          Try again
        </Button>
      </View>
    );

    return layout === "embedded" ? (
      failure
    ) : (
      <AppScreen contentStyle={styles.content}>
        <MaiHeader
          action={<BackButton dateKey={dateKey} />}
          title="Manage foods"
        />
        {failure}
      </AppScreen>
    );
  }

  return <ManageFoodsPanel data={state.value.data} layout={layout} />;
}

function ManageFoodsPanel({
  data,
  layout,
}: {
  readonly data: ManageFoodsData;
  readonly layout: ManageFoodsLayout;
}) {
  const [snapshot, , machine] = useMachine(() =>
    MachineAtoms.make(ManageFoodsMachine, data)
  );
  const { foodUsage } = snapshot.value;
  const foodSearch = machine.child(FoodSearchMachine.FoodSearchChild);
  const body = (
    <>
      {layout === "screen" ? (
        <AppHeader
          embedded
          leading={<BackButton dateKey={data.dateKey} />}
          shadow
          style={styles.searchHeader}
          title="Manage foods"
        >
          <FoodSearchField disabled={false} foodSearch={foodSearch} />
        </AppHeader>
      ) : (
        <View style={styles.embeddedSearchHeader}>
          <FoodSearchField disabled={false} foodSearch={foodSearch} />
        </View>
      )}
      <View
        style={layout === "embedded" ? styles.embeddedBody : styles.searchBody}
      >
        <FoodSearchResults
          foodSearch={foodSearch}
          disabled={false}
          emptyFoodsText="Create a food before managing it."
          emptySearchText="No foods found."
          getPrimaryLabel={(food) =>
            `${formatNumber({
              maximumFractionDigits: 0,
              value: Utils.foodNutrition(food).energyKcal,
            })} kcal`
          }
          getSecondaryLabel={(food) => {
            const usageLabel = foodUsage.some(
              (usage) => usage.foodId === food.id
            )
              ? "Used"
              : "Unused";

            return food.prices.some((price) => price.isCurrent)
              ? usageLabel
              : `${usageLabel} · No price`;
          }}
        />
      </View>
    </>
  );

  return layout === "embedded" ? (
    <View style={styles.embeddedRoot}>{body}</View>
  ) : (
    <AppScreen contentStyle={styles.content}>{body}</AppScreen>
  );
}

function BackButton({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey | undefined;
}) {
  return (
    <IconButton
      accessibilityLabel="Back to day"
      icon={ChevronLeft}
      onPress={() => {
        if (dateKey === undefined) {
          router.replace("/");
        } else {
          router.replace({
            pathname: "/days/[dateKey]",
            params: { dateKey },
          });
        }
      }}
      variant="ghost"
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  searchHeader: {
    marginHorizontal: 0,
  },
  searchBody: {
    flex: 1,
    paddingTop: spacing.md,
  },
  embeddedRoot: {
    flex: 1,
    backgroundColor: color.bg,
  },
  embeddedSearchHeader: {
    paddingHorizontal: spacing.lg,
  },
  embeddedBody: {
    flex: 1,
    paddingTop: spacing.md,
  },
});
