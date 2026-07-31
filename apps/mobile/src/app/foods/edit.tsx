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
import { formatNumber } from "@/lib/format";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { FoodSearchMachine } from "@mai/machines";
import { Domain, Foods, MealEntries } from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import { ChevronLeft, RotateCcw } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

type ManageFoodsLayout = "screen" | "embedded";

const MealFoodUsage = Schema.Struct({
  foodId: Domain.FoodId,
  latestQuantity: Domain.LoggedFoodQuantity,
  latestUsedAt: Schema.DateTimeUtc,
  meals: Schema.Array(
    Schema.Struct({
      latestQuantity: Domain.LoggedFoodQuantity,
      latestUsedAt: Schema.DateTimeUtc,
      mealId: Domain.MealId,
    })
  ),
});

const ManageFoodsData = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
  foods: Schema.Array(Domain.Food),
  foodUsage: Schema.Array(MealFoodUsage),
});

const ManageFoodsLoaderInput = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
});

class ManageFoodsRouteState extends Schema.TaggedClass<ManageFoodsRouteState>(
  "ManageFoodsRouteState"
)("ManageFoodsRouteState", {
  dateKey: Schema.UndefinedOr(Domain.DateKey),
}) {}
class ManageFoodsLoading extends Schema.TaggedClass<ManageFoodsLoading>(
  "ManageFoodsLoading"
)("ManageFoodsLoading", {}) {}
class ManageFoodsFailed extends Schema.TaggedClass<ManageFoodsFailed>(
  "ManageFoodsFailed"
)("ManageFoodsFailed", { message: Schema.String }) {}
class ManageFoodsReady extends Schema.TaggedClass<ManageFoodsReady>(
  "ManageFoodsReady"
)("ManageFoodsReady", {
  foods: ManageFoodsData.fields.foods,
  foodUsage: ManageFoodsData.fields.foodUsage,
}) {}
class RetryManageFoods extends Schema.TaggedClass<RetryManageFoods>(
  "RetryManageFoods"
)("RetryManageFoods", {}) {}
class ManageFoodsLoaded extends Schema.TaggedClass<ManageFoodsLoaded>(
  "ManageFoodsLoaded"
)("ManageFoodsLoaded", {
  foods: ManageFoodsData.fields.foods,
  foodUsage: ManageFoodsData.fields.foodUsage,
}) {}
class ManageFoodsLoadFailed extends Schema.TaggedClass<ManageFoodsLoadFailed>(
  "ManageFoodsLoadFailed"
)("ManageFoodsLoadFailed", {}) {}

const ManageFoodsStates = Machine.defineStates({
  Route: {
    schema: ManageFoodsRouteState,
    initial: "Loading",
    states: {
      Failed: ManageFoodsFailed,
      Loading: ManageFoodsLoading,
      Ready: ManageFoodsReady,
    },
  },
});

const ManageFoodsSearchChild = FoodSearchMachine.FoodSearchChild;

const manageFoodsMachine = Machine.make({
  states: ManageFoodsStates.states,
  events: [
    RetryManageFoods,
    ManageFoodsLoaded,
    ManageFoodsLoadFailed,
    ...FoodSearchMachine.foodSearchMachine.emits,
  ],
  input: ManageFoodsLoaderInput,
  initial: ({ dateKey }) =>
    ManageFoodsStates.initial.Route(
      new ManageFoodsRouteState({ dateKey }),
      (route) => route.Loading(new ManageFoodsLoading())
    ),
}).handle({
  Route: {
    states: {
      Loading: {
        invoke: () =>
          Machine.invoke({
            id: "loadFoods",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const foods = yield* Foods.Foods;
                  const mealEntries = yield* MealEntries.MealEntries;
                  return new ManageFoodsLoaded({
                    foods: [...(yield* foods.list())],
                    foodUsage: yield* mealEntries.listFoodUsage(),
                  });
                }).pipe(
                  Effect.catch(() =>
                    Effect.succeed(new ManageFoodsLoadFailed())
                  )
                )
              ),
          }),
        on: {
          ManageFoodsLoaded: ({ event, parents, target }) =>
            target.full.Route(
              new ManageFoodsRouteState({ ...parents.Route }),
              (route) =>
                route.Ready(
                  new ManageFoodsReady({
                    foods: event.foods,
                    foodUsage: event.foodUsage,
                  })
                )
            ),
          ManageFoodsLoadFailed: ({ parents, target }) =>
            target.full.Route(
              new ManageFoodsRouteState({ ...parents.Route }),
              (route) =>
                route.Failed(
                  new ManageFoodsFailed({
                    message: "Could not load foods. Please try again.",
                  })
                )
            ),
        },
      },
      Failed: {
        on: {
          RetryManageFoods: ({ parents, target }) =>
            target.full.Route(
              new ManageFoodsRouteState({ ...parents.Route }),
              (route) => route.Loading(new ManageFoodsLoading())
            ),
        },
      },
      Ready: {
        invoke: ({ state }) =>
          Machine.invokeMachine({
            child: ManageFoodsSearchChild,
            input: { foods: state.foods },
          }),
        on: {
          FoodSearchSelected: ({ event, parents }) => {
            if (event.food === null) {
              return;
            }

            const foodId = event.food.id;
            return Machine.action(
              Effect.sync(() => {
                router.push({
                  pathname: "/foods/[id]",
                  params: {
                    id: foodId,
                    ...(parents.Route.dateKey === undefined
                      ? {}
                      : { dateKey: parents.Route.dateKey }),
                  },
                });
              })
            );
          },
        },
      },
    },
  },
});

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
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, manageFoodsMachine, { dateKey }),
    [dateKey]
  );
  const foodSearchAtom = useMemo(
    () => machineAtom.child(ManageFoodsSearchChild),
    [machineAtom]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    (AsyncResult.isSuccess(stateResult) &&
      ManageFoodsStates.matches(stateResult.value, "Route.Loading"))
  ) {
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

  if (AsyncResult.isFailure(stateResult)) {
    return (
      <View style={styles.centered}>
        <Notice
          message="Could not start the food library."
          title="Food library unavailable"
          tone="danger"
        />
      </View>
    );
  }

  const state = stateResult.value;
  const failed = ManageFoodsStates.get(state, "Route.Failed").pipe(
    Option.getOrNull
  );

  if (failed !== null) {
    const failure = (
      <View style={styles.centered}>
        <Notice
          message={failed.message}
          title="Food library unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => send(new RetryManageFoods())}
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

  const ready = ManageFoodsStates.get(state, "Route.Ready").pipe(
    Option.getOrNull
  );

  return ready === null ? null : (
    <ManageFoodsPanel
      actor={foodSearchAtom}
      data={ready}
      dateKey={dateKey}
      layout={layout}
    />
  );
}

function ManageFoodsPanel({
  actor,
  data,
  dateKey,
  layout,
}: {
  readonly actor: AtomMachine.ChildMachineAtom<
    typeof ManageFoodsSearchChild,
    unknown
  >;
  readonly data: ManageFoodsReady;
  readonly dateKey: Domain.DateKey | undefined;
  readonly layout: ManageFoodsLayout;
}) {
  const { foodUsage } = data;
  const body = (
    <>
      {layout === "screen" ? (
        <AppHeader
          embedded
          leading={<BackButton dateKey={dateKey} />}
          shadow
          style={styles.searchHeader}
          title="Manage foods"
        >
          <FoodSearchField actor={actor} disabled={false} />
        </AppHeader>
      ) : (
        <View style={styles.embeddedSearchHeader}>
          <FoodSearchField actor={actor} disabled={false} />
        </View>
      )}
      <View
        style={layout === "embedded" ? styles.embeddedBody : styles.searchBody}
      >
        <FoodSearchResults
          actor={actor}
          disabled={false}
          emptyFoodsText="Create a food before managing it."
          emptySearchText="No foods found."
          getPrimaryLabel={(food) =>
            `${formatNumber({
              maximumFractionDigits: 0,
              value: food.energyKcal,
            })} kcal`
          }
          getSecondaryLabel={(food) =>
            foodUsage.some((usage) => usage.foodId === food.id)
              ? "Used"
              : "Unused"
          }
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
