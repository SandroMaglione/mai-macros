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
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { EmptyEvent, FoodSearchMachine } from "@mai/machines";
import { Domain, Foods, MealEntries } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, RotateCcw } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Actor, createAsyncLogic, setup } from "xstate";

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

type ManageFoodsData = typeof ManageFoodsData.Type;

const FoodSearchActorSchema =
  Schema.declare<FoodSearchMachine.FoodSearchActorRef>(
    (value): value is FoodSearchMachine.FoodSearchActorRef =>
      value instanceof Actor &&
      value.logic === FoodSearchMachine.foodSearchMachine,
    { expected: "FoodSearchActor" }
  );

const manageFoodsMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        foodSearchActor: FoodSearchActorSchema,
        foodUsage: Schema.Array(MealFoodUsage),
      })
    ),
    events: {
      foodSearchSelected: Schema.toStandardSchemaV1(
        Schema.Struct({
          food: Schema.NullOr(Domain.Food),
          selection: Schema.Literals(["explicit", "firstMatching"]),
        })
      ),
    },
    input: Schema.toStandardSchemaV1(ManageFoodsData),
  },
  actorSources: {
    foodSearch: FoodSearchMachine.foodSearchMachine,
  },
  actions: {
    openFood: ({
      dateKey,
      foodId,
    }: {
      readonly dateKey: Domain.DateKey | undefined;
      readonly foodId: Domain.FoodId;
    }) => {
      router.push({
        pathname: "/foods/[id]",
        params: {
          id: foodId,
          ...(dateKey === undefined ? {} : { dateKey }),
        },
      });
    },
  },
}).createMachine({
  context: ({ actorSources, input, spawn }) => ({
    dateKey: input.dateKey,
    foodSearchActor: spawn(actorSources.foodSearch, {
      id: "manageFoodsSearch",
      input: { foods: input.foods },
    }),
    foodUsage: input.foodUsage,
  }),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        foodSearchSelected: ({ actions, context, event }, enq) => {
          if (event.food === null) {
            return;
          }

          enq(actions.openFood, {
            dateKey: context.dateKey,
            foodId: event.food.id,
          });
          enq.sendTo(context.foodSearchActor, {
            type: "clearSelectedFood",
          } satisfies FoodSearchMachine.FoodSearchEvent);
        },
      },
    },
  },
});

const ManageFoodsLoaderInput = Schema.Struct({
  dateKey: Schema.UndefinedOr(Domain.DateKey),
});

const manageFoodsLoaderMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({ dateKey: Schema.UndefinedOr(Domain.DateKey) })
    ),
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(ManageFoodsLoaderInput),
  },
  actorSources: {
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ManageFoodsLoaderInput),
        output: Schema.toStandardSchemaV1(ManageFoodsData),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const mealEntries = yield* MealEntries.MealEntries;

            return {
              dateKey: input.dateKey,
              foods: [...(yield* foods.list())],
              foodUsage: yield* mealEntries.listFoodUsage(),
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({ dateKey: input.dateKey }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ dateKey: context.dateKey }),
        onDone: ({ event }) => ({
          target: "Ready",
          context: { data: event.output },
        }),
        onError: {
          target: "Failed",
          context: { message: "Could not load foods. Please try again." },
        },
      },
    },
    Failed: {
      on: { retry: { target: "Loading" } },
    },
    Ready: {},
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
  const [snapshot, , actor] = useMachine(manageFoodsLoaderMachine, {
    input: { dateKey },
  });

  if (snapshot.matches("Loading")) {
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

  if (snapshot.matches("Failed")) {
    const failure = (
      <View style={styles.centered}>
        <Notice
          message={snapshot.context.message}
          title="Food library unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={actor.trigger.retry}
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

  return <ManageFoodsPanel data={snapshot.context.data} layout={layout} />;
}

function ManageFoodsPanel({
  data,
  layout,
}: {
  readonly data: ManageFoodsData;
  readonly layout: ManageFoodsLayout;
}) {
  const [snapshot] = useMachine(manageFoodsMachine, { input: data });
  const { foodSearchActor, foodUsage } = snapshot.context;
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
          <FoodSearchField actor={foodSearchActor} disabled={false} />
        </AppHeader>
      ) : (
        <View style={styles.embeddedSearchHeader}>
          <FoodSearchField actor={foodSearchActor} disabled={false} />
        </View>
      )}
      <View
        style={layout === "embedded" ? styles.embeddedBody : styles.searchBody}
      >
        <FoodSearchResults
          actor={foodSearchActor}
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
