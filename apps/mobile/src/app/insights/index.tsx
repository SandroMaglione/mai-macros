import { BodyWeightPanel } from "@/components/body-weight/body-weight-panel";
import { NutritionTrends } from "@/components/nutrition/nutrition-trends";
import { RangeSummary } from "@/components/nutrition/range-summary";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { InputSelect } from "@/components/ui/input-select";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { dateKeyFromDate, shiftDateKey } from "@/lib/date-keys";
import { MobileMachine } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Domain, NutritionReports, Reporting } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { DateTime, Effect, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { router, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Activity, ChevronLeft, Plus, Scale } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const InsightTab = Schema.Literals(["nutrition", "weight"]);

const InsightRangeDayCount = Schema.Literals([7, 30, 90]);
type InsightRangeDayCount = typeof InsightRangeDayCount.Type;

const InsightsSearchParams = Schema.Struct({
  tab: Schema.optionalKey(InsightTab),
});

const InsightsView = Schema.Struct({
  activeTab: InsightTab,
  rangeDayCount: InsightRangeDayCount,
});
type InsightsView = typeof InsightsView.Type;

const NutrientName = Schema.Literals(Reporting.NutrientNames);

const NutrientTotals = Schema.Struct({
  carbsGrams: Schema.Number,
  energyKcal: Schema.Number,
  fatGrams: Schema.Number,
  fiberGrams: Schema.Number,
  proteinGrams: Schema.Number,
  saltGrams: Schema.Number,
  saturatedFatGrams: Schema.Number,
  sugarGrams: Schema.Number,
});

const NutrientTargetStatus = Schema.Struct({
  amount: Schema.Number,
  deltaFromTarget: Schema.Number,
  lowerBound: Schema.UndefinedOr(Schema.Number),
  nutrientName: NutrientName,
  percentOfTarget: Schema.NullOr(Schema.Number),
  semantics: Schema.Literals(["maximum", "minimum", "range"]),
  status: Schema.Literals(["above", "below", "inside"]),
  upperBound: Schema.UndefinedOr(Schema.Number),
  value: Schema.Number,
});

const NutritionReportEntry = Schema.Struct({
  cost: Schema.NullOr(
    Schema.Struct({
      costMinor: Schema.Number,
      currency: Domain.CurrencyCode,
    })
  ),
  food: Domain.Food,
  mealEntry: Domain.MealEntry,
  nutrients: Domain.EntryNutrients,
});

const NutritionReportDay = Schema.Struct({
  costTotals: Schema.Struct({
    costMinorByCurrency: Schema.Struct({
      EUR: Schema.Number,
      JPY: Schema.Number,
      NZD: Schema.Number,
      USD: Schema.Number,
    }),
    entriesCount: Schema.Number,
    resolvedEntriesCount: Schema.Number,
  }),
  coverage: NutrientTotals,
  dailyLog: Domain.DailyLog,
  dateKey: Domain.DateKey,
  entries: Schema.Array(NutritionReportEntry),
  isInsideExpectedPlanRange: Schema.Boolean,
  mealEntries: Schema.Array(Domain.MealEntry),
  plan: Domain.Plan,
  targetStatuses: Schema.Array(NutrientTargetStatus),
  totals: NutrientTotals,
});

const NutritionReportRange = Schema.Struct({
  activePlan: Domain.Plan,
  days: Schema.Array(NutritionReportDay),
  endDateKey: Domain.DateKey,
  startDateKey: Domain.DateKey,
});

const NutritionInsightsInput = Schema.Struct({
  rangeDayCount: InsightRangeDayCount,
});

class NutritionInsightsLoading extends Schema.TaggedClass<NutritionInsightsLoading>(
  "NutritionInsightsLoading"
)("NutritionInsightsLoading", {
  rangeDayCount: InsightRangeDayCount,
}) {}

class NutritionInsightsFailure extends Schema.TaggedClass<NutritionInsightsFailure>(
  "NutritionInsightsFailure"
)("NutritionInsightsFailure", {
  message: Schema.String,
  rangeDayCount: InsightRangeDayCount,
}) {}

class NutritionInsightsLoaded extends Schema.TaggedClass<NutritionInsightsLoaded>(
  "NutritionInsightsLoaded"
)("NutritionInsightsLoaded", {
  currentReport: NutritionReportRange,
  rangeDayCount: InsightRangeDayCount,
}) {}

class NutritionInsightsNoPlans extends Schema.TaggedClass<NutritionInsightsNoPlans>(
  "NutritionInsightsNoPlans"
)("NutritionInsightsNoPlans", {
  dateKey: Domain.DateKey,
  message: Schema.String,
  rangeDayCount: InsightRangeDayCount,
}) {}

class RetryNutritionInsights extends Schema.TaggedClass<RetryNutritionInsights>(
  "RetryNutritionInsights"
)("RetryNutritionInsights", {}) {}

class NutritionInsightsLoadedEvent extends Schema.TaggedClass<NutritionInsightsLoadedEvent>(
  "NutritionInsightsLoadedEvent"
)("NutritionInsightsLoadedEvent", {
  currentReport: NutritionReportRange,
}) {}

class NutritionInsightsNoPlansEvent extends Schema.TaggedClass<NutritionInsightsNoPlansEvent>(
  "NutritionInsightsNoPlansEvent"
)("NutritionInsightsNoPlansEvent", {
  dateKey: Domain.DateKey,
}) {}

class NutritionInsightsFailedEvent extends Schema.TaggedClass<NutritionInsightsFailedEvent>(
  "NutritionInsightsFailedEvent"
)("NutritionInsightsFailedEvent", {
  message: Schema.String,
}) {}

const NutritionInsightsStates = Machine.defineStates({
  Loading: NutritionInsightsLoading,
  Loaded: NutritionInsightsLoaded,
  NoPlans: NutritionInsightsNoPlans,
  Failure: NutritionInsightsFailure,
});

const nutritionInsightsOperations = {
  load: (rangeDayCount: InsightRangeDayCount) =>
    Effect.gen(function* () {
      const today = yield* Schema.decodeEffect(Domain.DateKey)(
        dateKeyFromDate({ date: yield* DateTime.nowAsDate })
      );
      const currentStartDateKey = yield* Schema.decodeEffect(Domain.DateKey)(
        shiftDateKey({
          dateKey: today,
          days: -(rangeDayCount - 1),
        })
      );
      const reports = yield* NutritionReports.NutritionReports;
      const currentReport = yield* reports.getRange({
        input: {
          endDateKey: today,
          startDateKey: currentStartDateKey,
        },
      });

      return new NutritionInsightsLoadedEvent({ currentReport });
    }).pipe(
      Effect.catchTag("NoNutritionReportPlans", () =>
        Effect.gen(function* () {
          const today = yield* Schema.decodeEffect(Domain.DateKey)(
            dateKeyFromDate({ date: yield* DateTime.nowAsDate })
          );
          return new NutritionInsightsNoPlansEvent({ dateKey: today });
        })
      ),
      Effect.catchTags({
        InvalidNutritionReportRange: () =>
          Effect.succeed(
            new NutritionInsightsFailedEvent({
              message: "The selected nutrition range is invalid.",
            })
          ),
        SchemaError: () =>
          Effect.succeed(
            new NutritionInsightsFailedEvent({
              message: "The selected date range could not be validated.",
            })
          ),
      }),
      Effect.catch(() =>
        Effect.succeed(
          new NutritionInsightsFailedEvent({
            message: "Something went wrong while loading nutrition insights.",
          })
        )
      )
    ),
};

const nutritionInsightsRouteMachine = Machine.make({
  states: NutritionInsightsStates.states,
  events: [RetryNutritionInsights],
  internalEvents: [
    NutritionInsightsLoadedEvent,
    NutritionInsightsNoPlansEvent,
    NutritionInsightsFailedEvent,
  ],
  input: NutritionInsightsInput,
  initial: ({ rangeDayCount }) =>
    NutritionInsightsStates.initial.Loading(
      new NutritionInsightsLoading({ rangeDayCount })
    ),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "load-nutrition-insights",
        src: () =>
          Machine.effect(nutritionInsightsOperations.load(state.rangeDayCount)),
      }),
    on: {
      NutritionInsightsLoadedEvent: ({ event, state, target }) =>
        target.full.Loaded(
          new NutritionInsightsLoaded({
            currentReport: event.currentReport,
            rangeDayCount: state.rangeDayCount,
          })
        ),
      NutritionInsightsNoPlansEvent: ({ event, state, target }) =>
        target.full.NoPlans(
          new NutritionInsightsNoPlans({
            dateKey: event.dateKey,
            message: "Create a meal plan to unlock nutrition insights.",
            rangeDayCount: state.rangeDayCount,
          })
        ),
      NutritionInsightsFailedEvent: ({ event, state, target }) =>
        target.full.Failure(
          new NutritionInsightsFailure({
            message: event.message,
            rangeDayCount: state.rangeDayCount,
          })
        ),
    },
  },
  Failure: {
    on: {
      RetryNutritionInsights: ({ state, target }) =>
        target.full.Loading(
          new NutritionInsightsLoading({
            rangeDayCount: state.rangeDayCount,
          })
        ),
    },
  },
  Loaded: {},
  NoPlans: {},
});

const rangeSelectOptions = [
  {
    label: "7 days",
    value: "7",
  },
  {
    label: "30 days",
    value: "30",
  },
  {
    label: "90 days",
    value: "90",
  },
] as const;

export default function InsightsScreen() {
  const initialTab = useSchemaLocalSearchParams(InsightsSearchParams).pipe(
    Option.match({
      onNone: () => "nutrition" as const,
      onSome: ({ tab }) => tab ?? "nutrition",
    })
  );
  const viewAtom = useMemo(
    () =>
      Atom.make<InsightsView>({
        activeTab: initialTab,
        rangeDayCount: 30,
      }),
    [initialTab]
  );
  const [view, setView] = useAtom(viewAtom);
  const appRouter = useRouter();

  return (
    <View style={styles.screen}>
      <AppScreen
        scroll
        contentStyle={styles.content}
        safeAreaEdges={["top"]}
        scrollProps={{
          showsVerticalScrollIndicator: false,
        }}
        topSafeAreaColor={color.primary}
      >
        <InsightsHeader
          activeRange={view.rangeDayCount}
          onBackToToday={() => {
            appRouter.replace("/");
          }}
          onSelectRange={(rangeDayCount) => {
            setView((current) => ({ ...current, rangeDayCount }));
          }}
        />
        {view.activeTab === "nutrition" ? (
          <NutritionInsightsPanel
            key={`nutrition-${view.rangeDayCount}`}
            rangeDayCount={view.rangeDayCount}
          />
        ) : (
          <BodyWeightPanel
            calendarPosition="bottom"
            key={`weight-${view.rangeDayCount}`}
            reportDayCount={view.rangeDayCount}
            showImport
          />
        )}
      </AppScreen>
      <BottomActionBar variant="tab">
        <InsightsBottomTab
          active={view.activeTab === "nutrition"}
          icon={Activity}
          label="Nutrition"
          onPress={() => {
            setView((current) => ({ ...current, activeTab: "nutrition" }));
          }}
        />
        <InsightsBottomTab
          active={view.activeTab === "weight"}
          icon={Scale}
          label="Weight"
          onPress={() => {
            setView((current) => ({ ...current, activeTab: "weight" }));
          }}
        />
      </BottomActionBar>
    </View>
  );
}

function NutritionInsightsPanel({
  rangeDayCount,
}: {
  readonly rangeDayCount: InsightRangeDayCount;
}) {
  const machineAtom = useMemo(
    () =>
      MobileMachine.make(nutritionInsightsRouteMachine, {
        rangeDayCount,
      }),
    [rangeDayCount]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    NutritionInsightsStates.matches(stateResult.value, "Loading")
  ) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </View>
    );
  }

  const failure = NutritionInsightsStates.get(
    stateResult.value,
    "Failure"
  ).pipe(Option.getOrUndefined);
  if (failure !== undefined) {
    return (
      <View style={styles.failure}>
        <Notice
          message={failure.message}
          title="Nutrition insights unavailable"
          tone="warning"
        />
        <Button
          onPress={() => send(new RetryNutritionInsights())}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  const noPlans = NutritionInsightsStates.get(
    stateResult.value,
    "NoPlans"
  ).pipe(Option.getOrUndefined);
  if (noPlans !== undefined) {
    return (
      <View style={styles.failure}>
        <Notice
          message={noPlans.message}
          title="Nutrition unavailable"
          tone="neutral"
        />
        <Button
          icon={Plus}
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: noPlans.dateKey,
              },
            });
          }}
        >
          Create plan
        </Button>
      </View>
    );
  }

  const loaded = NutritionInsightsStates.get(stateResult.value, "Loaded").pipe(
    Option.getOrThrow
  );

  return (
    <View style={styles.nutritionStack}>
      <NutritionTrends
        currentReport={loaded.currentReport}
        onSelectDate={(dateKey) => {
          router.push({
            pathname: "/days/[dateKey]",
            params: {
              dateKey,
            },
          });
        }}
      />
      <RangeSummary
        rangeDayCount={loaded.rangeDayCount}
        report={loaded.currentReport}
      />
    </View>
  );
}

function InsightsBottomTab({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bottomTab,
        active ? styles.bottomTabActive : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Icon
        color={active ? color.primary : color.actionSheetText}
        size={20}
        strokeWidth={2.8}
      />
      <Text
        style={[
          styles.bottomTabLabel,
          active ? styles.bottomTabLabelActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InsightsHeader({
  activeRange,
  onBackToToday,
  onSelectRange,
}: {
  readonly activeRange: InsightRangeDayCount;
  readonly onBackToToday: () => void;
  readonly onSelectRange: (rangeDayCount: InsightRangeDayCount) => void;
}) {
  return (
    <MaiHeader
      action={
        <Pressable
          accessibilityLabel="Back to today"
          accessibilityRole="button"
          onPress={onBackToToday}
          style={({ pressed }) => [
            styles.headerAction,
            pressed ? styles.pressed : null,
          ]}
        >
          <ChevronLeft color={color.white} size={31} strokeWidth={2.6} />
        </Pressable>
      }
      title="Insights"
      trailing={
        <InputSelect
          onSelect={(value) => {
            onSelectRange(value === "7" ? 7 : value === "30" ? 30 : 90);
          }}
          options={rangeSelectOptions}
          selectedValue={
            activeRange === 7 ? "7" : activeRange === 30 ? "30" : "90"
          }
          title="Report range"
          variant="header"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: color.bg,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  centered: {
    minHeight: 260,
    justifyContent: "center",
  },
  failure: {
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  nutritionStack: {
    gap: spacing.xxxl,
  },
  pressed: {
    opacity: 0.82,
  },
  bottomTab: {
    minHeight: 52,
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  bottomTabActive: {
    backgroundColor: color.primarySoft,
  },
  bottomTabLabel: {
    color: color.actionSheetText,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  bottomTabLabelActive: {
    color: color.primary,
  },
});
