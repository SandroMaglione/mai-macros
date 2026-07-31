import { DailyBodyWeightInput } from "@/components/body-weight/daily-body-weight-input";
import { FoodCurrentPriceIndicator } from "@/components/nutrition/food-current-price-indicator";
import { MealPlanSummaryCard } from "@/components/nutrition/meal-plan-summary-card";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import {
  formatCurrencyMinor,
  formatLoggedFoodQuantity,
  formatNumber,
} from "@/lib/format";
import { MobileMachine } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import {
  DailyLogs,
  Domain,
  Foods,
  MealEntries,
  Reporting,
  Utils,
} from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { router } from "expo-router";
import { Array, Effect, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Apple,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
} from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const OpenedDay = Schema.TaggedStruct("OpenedDay", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const UnrecordedDay = Schema.TaggedStruct("UnrecordedDay", {
  dateKey: Domain.DateKey,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const RecordedDailyLogViewData = Schema.TaggedStruct("RecordedDay", {
  day: OpenedDay,
  foods: Schema.Array(Domain.Food),
  mealEntries: Schema.Array(Domain.MealEntry),
});

export type RecordedDailyLogViewData = typeof RecordedDailyLogViewData.Type;

const UnrecordedDailyLogViewData = Schema.TaggedStruct("UnrecordedDay", {
  day: UnrecordedDay,
});

export type UnrecordedDailyLogViewData = typeof UnrecordedDailyLogViewData.Type;

const DailyLogViewData = Schema.Union([
  RecordedDailyLogViewData,
  UnrecordedDailyLogViewData,
]);

export type DailyLogViewData = typeof DailyLogViewData.Type;

type MacroDisplayMode = "consumed" | "remaining";

const DailyLogInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

class DailyLogLoading extends Schema.TaggedClass<DailyLogLoading>(
  "DailyLogLoading"
)("DailyLogLoading", {
  dateKey: Domain.DateKey,
}) {}

class DailyLogFailed extends Schema.TaggedClass<DailyLogFailed>(
  "DailyLogFailed"
)("DailyLogFailed", {
  dateKey: Domain.DateKey,
  message: Schema.String,
}) {}

class DailyLogRedirected extends Schema.TaggedClass<DailyLogRedirected>(
  "DailyLogRedirected"
)("DailyLogRedirected", {}) {}

class DailyLogDay extends Schema.TaggedClass<DailyLogDay>("DailyLogDay")(
  "DailyLogDay",
  { dateKey: Domain.DateKey }
) {}

class DailyLogRecorded extends Schema.TaggedClass<DailyLogRecorded>(
  "DailyLogRecorded"
)("DailyLogRecorded", {
  data: RecordedDailyLogViewData,
  message: Schema.NullOr(Schema.String),
}) {}

class DailyLogUnrecorded extends Schema.TaggedClass<DailyLogUnrecorded>(
  "DailyLogUnrecorded"
)("DailyLogUnrecorded", {
  data: UnrecordedDailyLogViewData,
  message: Schema.NullOr(Schema.String),
}) {}

class DailyLogCreating extends Schema.TaggedClass<DailyLogCreating>(
  "DailyLogCreating"
)("DailyLogCreating", {
  data: UnrecordedDailyLogViewData,
}) {}

class DailyLogDeleting extends Schema.TaggedClass<DailyLogDeleting>(
  "DailyLogDeleting"
)("DailyLogDeleting", {
  data: RecordedDailyLogViewData,
}) {}

class ReloadDailyLog extends Schema.TaggedClass<ReloadDailyLog>(
  "ReloadDailyLog"
)("ReloadDailyLog", {}) {}

class CreateDailyLog extends Schema.TaggedClass<CreateDailyLog>(
  "CreateDailyLog"
)("CreateDailyLog", {}) {}

class DeleteDailyLog extends Schema.TaggedClass<DeleteDailyLog>(
  "DeleteDailyLog"
)("DeleteDailyLog", {}) {}

class SelectDailyLogPlan extends Schema.TaggedClass<SelectDailyLogPlan>(
  "SelectDailyLogPlan"
)("SelectDailyLogPlan", {
  plan: Domain.Plan,
}) {}

class DailyLogLoaded extends Schema.TaggedClass<DailyLogLoaded>(
  "DailyLogLoaded"
)("DailyLogLoaded", {
  data: DailyLogViewData,
}) {}

class DailyLogLoadFailed extends Schema.TaggedClass<DailyLogLoadFailed>(
  "DailyLogLoadFailed"
)("DailyLogLoadFailed", {
  message: Schema.String,
}) {}

class DailyLogWasRedirected extends Schema.TaggedClass<DailyLogWasRedirected>(
  "DailyLogWasRedirected"
)("DailyLogWasRedirected", {}) {}

class DailyLogCreated extends Schema.TaggedClass<DailyLogCreated>(
  "DailyLogCreated"
)("DailyLogCreated", {
  data: RecordedDailyLogViewData,
}) {}

class DailyLogCreateFailed extends Schema.TaggedClass<DailyLogCreateFailed>(
  "DailyLogCreateFailed"
)("DailyLogCreateFailed", {
  message: Schema.String,
}) {}

class DailyLogDeleted extends Schema.TaggedClass<DailyLogDeleted>(
  "DailyLogDeleted"
)("DailyLogDeleted", {
  data: UnrecordedDailyLogViewData,
}) {}

class DailyLogDeleteFailed extends Schema.TaggedClass<DailyLogDeleteFailed>(
  "DailyLogDeleteFailed"
)("DailyLogDeleteFailed", {
  message: Schema.String,
}) {}

const macroProgress = [
  {
    color: color.nutritionCarbs,
    key: "carbsGrams",
    label: "Carbs",
    targetKey: "carbsTargetGrams",
    trackColor: "#4a2031",
  },
  {
    color: color.nutritionProtein,
    key: "proteinGrams",
    label: "Protein",
    targetKey: "proteinTargetGrams",
    trackColor: "#233059",
  },
  {
    color: color.nutritionFat,
    key: "fatGrams",
    label: "Fat",
    targetKey: "fatTargetGrams",
    trackColor: "#443719",
  },
] as const;

const dominantMacronutrientColors = {
  carbs: color.nutritionCarbs,
  fat: color.nutritionFat,
  protein: color.nutritionProtein,
} satisfies Record<Utils.DominantMacronutrient, string>;

const DailyLogRouteStates = Machine.defineStates({
  DailyLogLoading,
  DailyLogFailed,
  DailyLogRedirected,
  day: {
    schema: DailyLogDay,
    initial: "DailyLogUnrecorded",
    states: {
      DailyLogRecorded,
      DailyLogUnrecorded,
      DailyLogCreating,
      DailyLogDeleting,
    },
  },
});

const DailyLogEffects = {
  load: ({ dateKey }: typeof DailyLogInput.Type) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const foodsService = yield* Foods.Foods;
      const mealEntriesService = yield* MealEntries.MealEntries;
      const day = yield* dateKey === todayDateKey()
        ? dailyLogs.openOrCreate({ input: { dateKey } })
        : dailyLogs.open({ input: { dateKey } });

      if (day._tag === "UnrecordedDay") {
        return new DailyLogLoaded({
          data: { _tag: "UnrecordedDay", day },
        });
      }

      const mealEntries = yield* mealEntriesService.listForDay({
        input: { dateKey: day.dailyLog.dateKey },
      });
      const foods = yield* foodsService.getMany({
        input: { foodIds: mealEntries.map((entry) => entry.foodId) },
      });

      return new DailyLogLoaded({
        data: { _tag: "RecordedDay", day, foods, mealEntries },
      });
    }).pipe(
      Effect.catchTag("NoMealPlans", ({ dateKey: missingPlanDateKey }) =>
        Effect.sync(() => {
          router.replace({
            pathname: "/plans/new",
            params: { dateKey: missingPlanDateKey },
          });
          return new DailyLogWasRedirected();
        })
      ),
      Effect.catch((error) =>
        Effect.succeed(
          new DailyLogLoadFailed({
            message:
              error instanceof Error
                ? error.message
                : "Could not load the daily log.",
          })
        )
      )
    ),

  create: (data: UnrecordedDailyLogViewData) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const day = yield* dailyLogs.create({
        input: {
          dateKey: data.day.dateKey,
          planId: data.day.selectedPlan.id,
        },
      });
      return new DailyLogCreated({
        data: { _tag: "RecordedDay", day, foods: [], mealEntries: [] },
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new DailyLogCreateFailed({
            message: "Could not create this day. Please try again.",
          })
        )
      )
    ),

  delete: (data: RecordedDailyLogViewData) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const removedDay = yield* dailyLogs.remove({
        input: { dateKey: data.day.dailyLog.dateKey },
      });

      return new DailyLogDeleted({
        data: { _tag: "UnrecordedDay", day: removedDay.day },
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new DailyLogDeleteFailed({
            message: "Could not delete this day. Please try again.",
          })
        )
      )
    ),
};

const dailyLogRouteMachine = Machine.make({
  states: DailyLogRouteStates.states,
  events: [ReloadDailyLog, CreateDailyLog, DeleteDailyLog, SelectDailyLogPlan],
  internalEvents: [
    DailyLogLoaded,
    DailyLogLoadFailed,
    DailyLogWasRedirected,
    DailyLogCreated,
    DailyLogCreateFailed,
    DailyLogDeleted,
    DailyLogDeleteFailed,
  ],
  input: DailyLogInput,
  initial: (input) =>
    DailyLogRouteStates.initial.DailyLogLoading(new DailyLogLoading(input)),
}).handle({
  DailyLogLoading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "loadDailyLog",
        src: () => Machine.effect(DailyLogEffects.load(state)),
      }),
    on: {
      DailyLogLoaded: ({ event, state, target }) => {
        const data = event.data;
        return data._tag === "RecordedDay"
          ? target.full.day(
              new DailyLogDay({ dateKey: state.dateKey }),
              (day) =>
                day.DailyLogRecorded(
                  new DailyLogRecorded({ data, message: null })
                )
            )
          : target.full.day(
              new DailyLogDay({ dateKey: state.dateKey }),
              (day) =>
                day.DailyLogUnrecorded(
                  new DailyLogUnrecorded({ data, message: null })
                )
            );
      },
      DailyLogLoadFailed: ({ event, state, target }) =>
        target.full.DailyLogFailed(
          new DailyLogFailed({
            dateKey: state.dateKey,
            message: event.message,
          })
        ),
      DailyLogWasRedirected: ({ target }) =>
        target.full.DailyLogRedirected(new DailyLogRedirected()),
    },
  },
  DailyLogFailed: {
    on: {
      ReloadDailyLog: ({ state, target }) =>
        target.full.DailyLogLoading(
          new DailyLogLoading({ dateKey: state.dateKey })
        ),
    },
  },
  DailyLogRedirected: {},
  day: {
    on: {
      ReloadDailyLog: ({ state, target }) =>
        target.full.DailyLogLoading(
          new DailyLogLoading({ dateKey: state.dateKey })
        ),
    },
    states: {
      DailyLogRecorded: {
        on: {
          DeleteDailyLog: ({ state, target }) =>
            Array.isReadonlyArrayNonEmpty(state.data.mealEntries)
              ? undefined
              : target.local.DailyLogDeleting(
                  new DailyLogDeleting({ data: state.data })
                ),
        },
      },
      DailyLogUnrecorded: {
        on: {
          CreateDailyLog: ({ state, target }) =>
            target.local.DailyLogCreating(
              new DailyLogCreating({ data: state.data })
            ),
          SelectDailyLogPlan: ({ event, state, target }) =>
            target.local.DailyLogUnrecorded(
              new DailyLogUnrecorded({
                data: {
                  _tag: "UnrecordedDay",
                  day: new DailyLogs.UnrecordedDay({
                    dateKey: state.data.day.dateKey,
                    plans: state.data.day.plans,
                    selectedPlan: event.plan,
                  }),
                },
                message: null,
              })
            ),
        },
      },
      DailyLogCreating: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "createDailyLog",
            src: () => Machine.effect(DailyLogEffects.create(state.data)),
          }),
        on: {
          DailyLogCreated: ({ event, target }) =>
            target.local.DailyLogRecorded(
              new DailyLogRecorded({ data: event.data, message: null })
            ),
          DailyLogCreateFailed: ({ event, state, target }) =>
            target.local.DailyLogUnrecorded(
              new DailyLogUnrecorded({
                data: state.data,
                message: event.message,
              })
            ),
        },
      },
      DailyLogDeleting: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "deleteDailyLog",
            src: () => Machine.effect(DailyLogEffects.delete(state.data)),
          }),
        on: {
          DailyLogDeleted: ({ event, target }) =>
            target.local.DailyLogUnrecorded(
              new DailyLogUnrecorded({ data: event.data, message: null })
            ),
          DailyLogDeleteFailed: ({ event, state, target }) =>
            target.local.DailyLogRecorded(
              new DailyLogRecorded({
                data: state.data,
                message: event.message,
              })
            ),
        },
      },
    },
  },
});

export function DailyLogRoute({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const machineAtom = useMemo(
    () => MobileMachine.make(dailyLogRouteMachine, { dateKey }),
    [dateKey]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    AsyncResult.isFailure(stateResult) ||
    DailyLogRouteStates.matches(stateResult.value, "DailyLogLoading") ||
    DailyLogRouteStates.matches(stateResult.value, "DailyLogRedirected")
  ) {
    return (
      <AppScreen contentStyle={styles.loadingContent}>
        <LoadingView message="Loading daily log" />
      </AppScreen>
    );
  }

  const failed = DailyLogRouteStates.get(stateResult.value, "DailyLogFailed");
  if (failed._tag === "Some") {
    return (
      <AppScreen contentStyle={styles.centeredContent}>
        <Notice
          message={failed.value.message}
          title="Daily log unavailable"
          tone="danger"
        />
        <Button
          onPress={() => {
            send(new ReloadDailyLog());
          }}
          style={styles.retryButton}
          variant="secondary"
        >
          Try again
        </Button>
      </AppScreen>
    );
  }

  const recorded = DailyLogRouteStates.get(
    stateResult.value,
    "day.DailyLogRecorded"
  );
  const unrecorded = DailyLogRouteStates.get(
    stateResult.value,
    "day.DailyLogUnrecorded"
  );
  const creating = DailyLogRouteStates.get(
    stateResult.value,
    "day.DailyLogCreating"
  );
  const deleting = DailyLogRouteStates.get(
    stateResult.value,
    "day.DailyLogDeleting"
  );
  const data =
    recorded._tag === "Some"
      ? recorded.value.data
      : unrecorded._tag === "Some"
        ? unrecorded.value.data
        : creating._tag === "Some"
          ? creating.value.data
          : deleting._tag === "Some"
            ? deleting.value.data
            : null;
  const notice =
    recorded._tag === "Some"
      ? recorded.value.message
      : unrecorded._tag === "Some"
        ? unrecorded.value.message
        : null;

  return data === null ? (
    <AppScreen contentStyle={styles.loadingContent}>
      <LoadingView message="Loading daily log" />
    </AppScreen>
  ) : (
    <DailyLogView
      canDeleteDay={
        recorded._tag === "Some" &&
        !Array.isReadonlyArrayNonEmpty(recorded.value.data.mealEntries)
      }
      data={data}
      disabled={creating._tag === "Some" || deleting._tag === "Some"}
      notice={notice}
      onCreateDay={() => {
        send(new CreateDailyLog());
      }}
      onDeleteDay={() => {
        send(new DeleteDailyLog());
      }}
      onSelectPlan={(plan) => {
        send(new SelectDailyLogPlan({ plan }));
      }}
    />
  );
}

export function DailyLogTodayRoute() {
  return Schema.decodeOption(Domain.DateKey)(todayDateKey()).pipe(
    Option.match({
      onNone: () => (
        <AppScreen contentStyle={styles.centeredContent}>
          <Notice
            message="Could not create a valid date for today."
            title="Daily log unavailable"
            tone="danger"
          />
        </AppScreen>
      ),
      onSome: (dateKey) => <DailyLogRoute dateKey={dateKey} />,
    })
  );
}

export function DailyLogView({
  canDeleteDay,
  data,
  disabled,
  notice,
  onCreateDay,
  onDeleteDay,
  onSelectPlan,
}: {
  readonly canDeleteDay: boolean;
  readonly data: DailyLogViewData;
  readonly disabled: boolean;
  readonly notice: string | null;
  readonly onCreateDay: () => void;
  readonly onDeleteDay: () => void;
  readonly onSelectPlan: (plan: Domain.Plan) => void;
}) {
  return data._tag === "UnrecordedDay" ? (
    <UnrecordedDailyLogView
      data={data}
      disabled={disabled}
      notice={notice}
      onCreateDay={onCreateDay}
      onSelectPlan={onSelectPlan}
    />
  ) : (
    <RecordedDailyLogView
      canDeleteDay={canDeleteDay}
      data={data}
      disabled={disabled}
      onDeleteDay={onDeleteDay}
    />
  );
}

function RecordedDailyLogView({
  canDeleteDay,
  data,
  disabled,
  onDeleteDay,
}: {
  readonly canDeleteDay: boolean;
  readonly data: RecordedDailyLogViewData;
  readonly disabled: boolean;
  readonly onDeleteDay: () => void;
}) {
  const mealOptions = [...data.day.selectedPlan.meals].sort(
    (left, right) => left.position - right.position
  );
  const nutrients = Reporting.calculateMealEntriesNutrientTotals({
    foods: data.foods,
    mealEntries: data.mealEntries,
  }).totals;
  const dateKey = data.day.dailyLog.dateKey;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top"]}
        scroll
        scrollProps={{
          contentInsetAdjustmentBehavior: "never",
        }}
        style={styles.headerSafeArea}
      >
        <DayNavigationHeader dateKey={dateKey} />

        <DailyProgress day={data.day} nutrients={nutrients} />

        <DailyBodyWeightInput dateKey={dateKey} />

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push({
              pathname: "/days/[dateKey]/details",
              params: {
                dateKey,
              },
            });
          }}
          style={({ pressed }) => [
            styles.dayDetailsAction,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.detailsText}>Details</Text>
          <ChevronRight color={color.text} size={16} strokeWidth={3} />
        </Pressable>

        {canDeleteDay ? (
          <EmptyDayDeleteAction disabled={disabled} onDeleteDay={onDeleteDay} />
        ) : null}

        <View style={styles.meals}>
          {mealOptions.map((mealOption) => (
            <MealSection
              dateKey={dateKey}
              foods={data.foods}
              key={mealOption.id}
              meal={mealOption.id}
              mealEntries={data.mealEntries.filter(
                (mealEntry) => mealEntry.mealId === mealOption.id
              )}
              mealLabel={mealOption.name}
            />
          ))}
        </View>
      </AppScreen>

      <DayBottomActionBar dateKey={dateKey} />
    </View>
  );
}

function EmptyDayDeleteAction({
  disabled,
  onDeleteDay,
}: {
  readonly disabled: boolean;
  readonly onDeleteDay: () => void;
}) {
  return (
    <View style={styles.emptyDayActions}>
      <Button
        disabled={disabled}
        icon={Trash2}
        loading={disabled}
        onPress={onDeleteDay}
        style={styles.emptyDayDeleteButton}
        variant="danger"
      >
        Delete empty day
      </Button>
    </View>
  );
}

function UnrecordedDailyLogView({
  data,
  disabled,
  notice,
  onCreateDay,
  onSelectPlan,
}: {
  readonly data: UnrecordedDailyLogViewData;
  readonly disabled: boolean;
  readonly notice: string | null;
  readonly onCreateDay: () => void;
  readonly onSelectPlan: (plan: Domain.Plan) => void;
}) {
  const dateKey = data.day.dateKey;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.unrecordedContent}
        safeAreaEdges={["top"]}
        scroll
        scrollProps={{
          contentInsetAdjustmentBehavior: "never",
        }}
        style={styles.headerSafeArea}
      >
        <DayNavigationHeader dateKey={dateKey} />

        <DailyBodyWeightInput dateKey={dateKey} />

        <View style={styles.unrecordedBody}>
          <Notice
            message="This day has not been recorded."
            title="No day log"
            tone="neutral"
          />

          {notice === null ? null : <Notice message={notice} tone="danger" />}

          <View style={styles.unrecordedPlans}>
            {data.day.plans.map((plan) => {
              const selected = plan.id === data.day.selectedPlan.id;

              return (
                <MealPlanSummaryCard
                  disabled={disabled || selected}
                  isActive={selected}
                  key={plan.id}
                  onPress={() => {
                    onSelectPlan(plan);
                  }}
                  plan={plan}
                />
              );
            })}
          </View>
        </View>
      </AppScreen>

      <View style={styles.createDayActionBar}>
        <Button
          disabled={disabled}
          icon={Plus}
          loading={disabled}
          onPress={onCreateDay}
          style={styles.createDayButton}
        >
          Create day
        </Button>
      </View>

      <DayBottomActionBar dateKey={dateKey} />
    </View>
  );
}

function DayNavigationHeader({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const previousDateKey = shiftDateKey({
    dateKey,
    days: -1,
  });
  const nextDateKey = shiftDateKey({
    dateKey,
    days: 1,
  });
  const currentDateKey = todayDateKey();
  const displayedDateRelativeLabel =
    dateKey === currentDateKey
      ? "Today"
      : dateKey ===
          shiftDateKey({
            dateKey: currentDateKey,
            days: -1,
          })
        ? "Yesterday"
        : dateKey ===
            shiftDateKey({
              dateKey: currentDateKey,
              days: 1,
            })
          ? "Tomorrow"
          : null;
  const displayedDateValue = new Date(`${dateKey}T00:00:00`);
  const displayedDate =
    displayedDateRelativeLabel === null
      ? {
          eyebrow: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
          }).format(displayedDateValue),
          label: new Intl.DateTimeFormat("en-US", {
            day: "numeric",
            month: "short",
          }).format(displayedDateValue),
        }
      : {
          eyebrow: null,
          label: displayedDateRelativeLabel,
        };

  return (
    <AppHeader
      center={
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push("/");
          }}
          style={({ pressed }) => [
            styles.dateButton,
            pressed ? styles.headerPressed : null,
          ]}
        >
          {displayedDate.eyebrow === null ? null : (
            <Text style={styles.dateEyebrow}>{displayedDate.eyebrow}</Text>
          )}
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.date}>
            {displayedDate.label}
          </Text>
        </Pressable>
      }
      embedded
      leading={
        <HeaderIconButton
          accessibilityLabel="Previous day"
          icon={ChevronLeft}
          onPress={() => {
            router.push({
              pathname: "/days/[dateKey]",
              params: {
                dateKey: previousDateKey,
              },
            });
          }}
        />
      }
      shadow
      style={styles.dayHeader}
      trailing={
        <HeaderIconButton
          accessibilityLabel="Next day"
          icon={ChevronRight}
          onPress={() => {
            router.push({
              pathname: "/days/[dateKey]",
              params: {
                dateKey: nextDateKey,
              },
            });
          }}
        />
      }
    />
  );
}

function DayBottomActionBar({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  return (
    <BottomActionBar variant="tab">
      <BottomAction
        icon={Activity}
        label="Insights"
        onPress={() => {
          router.push("/insights");
        }}
      />
      <BottomAction
        icon={CalendarCheck}
        label="Events"
        onPress={() => {
          router.push({
            pathname: "/events",
            params: {
              dateKey,
            },
          });
        }}
      />
      <BottomAction
        icon={Apple}
        label="Foods"
        onPress={() => {
          router.push({
            pathname: "/foods",
            params: {
              dateKey,
            },
          });
        }}
      />
      <BottomAction
        icon={Settings}
        label="Settings"
        onPress={() => {
          router.push({
            pathname: "/settings",
            params: {
              dateKey,
            },
          });
        }}
      />
    </BottomActionBar>
  );
}

function DailyProgress({
  day,
  nutrients,
}: {
  readonly day: typeof OpenedDay.Type;
  readonly nutrients: Reporting.NutrientTotals;
}) {
  const plan = day.selectedPlan;
  const targetEnergyKcal = Utils.calculatePlanEnergyKcal({ plan });
  const displayModeAtom = useMemo(
    () => Atom.make<MacroDisplayMode>("consumed"),
    []
  );
  const displayMode = useAtomValue(displayModeAtom);
  const setDisplayMode = useAtomSet(displayModeAtom);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: displayMode === "remaining" }}
      onPress={() => {
        setDisplayMode((current) =>
          current === "consumed" ? "remaining" : "consumed"
        );
      }}
      style={({ pressed }) => [
        styles.dailyProgress,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.macroGrid}>
        {macroProgress.map((macro) => (
          <DailyProgressMetric
            colorValue={macro.color}
            displayMode={displayMode}
            key={macro.key}
            label={macro.label}
            target={plan[macro.targetKey]}
            trackColor={macro.trackColor}
            unit="g"
            value={nutrients[macro.key]}
          />
        ))}
      </View>

      <DailyEnergyProgress
        displayMode={displayMode}
        target={targetEnergyKcal}
        value={nutrients.energyKcal}
      />

      <View style={styles.dailyNutrientGrid}>
        <DailyNutrientMetric
          colorValue={color.nutritionCarbs}
          displayMode={displayMode}
          label="Fiber"
          target={plan.fiberTargetGrams}
          trackColor="#4a2031"
          value={nutrients.fiberGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionCarbs}
          displayMode={displayMode}
          label="Sugar"
          target={plan.sugarTargetGrams}
          trackColor="#4a2031"
          value={nutrients.sugarGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionFat}
          displayMode={displayMode}
          label="Sat fat"
          target={plan.saturatedFatTargetGrams}
          trackColor="#443719"
          value={nutrients.saturatedFatGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionSalt}
          displayMode={displayMode}
          label="Salt"
          target={plan.saltTargetGrams}
          trackColor="#303034"
          value={nutrients.saltGrams}
        />
      </View>
    </Pressable>
  );
}

function DailyProgressMetric({
  colorValue,
  displayMode,
  label,
  target,
  trackColor,
  unit,
  value,
}: {
  readonly colorValue: string;
  readonly displayMode: MacroDisplayMode;
  readonly label: string;
  readonly target: number;
  readonly trackColor: string;
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  const progress = target <= 0 ? (value > 0 ? 1 : 0) : value / target;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const isAboveTarget = value > target;
  const contentColor = isAboveTarget ? color.primary : colorValue;

  return (
    <View style={styles.dailyMetric}>
      <Text
        numberOfLines={1}
        style={[styles.dailyMetricLabel, { color: contentColor }]}
      >
        {label}
      </Text>
      <View style={[styles.dailyMetricTrack, { backgroundColor: trackColor }]}>
        <View
          style={[
            styles.dailyMetricFill,
            {
              backgroundColor: contentColor,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.dailyMetricValue, { color: contentColor }]}
      >
        {_formatDisplayValue({ displayMode, target, unit, value })}
      </Text>
    </View>
  );
}

function DailyEnergyProgress({
  displayMode,
  target,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
  readonly target: number;
  readonly value: number;
}) {
  const progress = target <= 0 ? (value > 0 ? 1 : 0) : value / target;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const isAboveTarget = value > target;
  const contentColor = isAboveTarget ? color.primary : color.nutritionEnergy;

  return (
    <View style={styles.energyProgress}>
      <View style={styles.energyTrack}>
        <View
          style={[
            styles.energyFill,
            {
              backgroundColor: contentColor,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.energyProgressValue, { color: contentColor }]}
      >
        {_formatDisplayValue({
          displayMode,
          target,
          unit: "kcal",
          value,
        })}
      </Text>
    </View>
  );
}

function DailyNutrientMetric({
  colorValue,
  displayMode,
  label,
  target,
  trackColor,
  value,
}: {
  readonly colorValue: string;
  readonly displayMode: MacroDisplayMode;
  readonly label: string;
  readonly target: number | undefined;
  readonly trackColor: string;
  readonly value: number;
}) {
  const hasTarget = target !== undefined;
  const progress =
    target === undefined || target <= 0 ? (value > 0 ? 1 : 0) : value / target;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const isAboveTarget = target !== undefined && value > target;
  const contentColor = isAboveTarget ? color.primary : colorValue;

  return (
    <View style={styles.dailyNutrient}>
      <Text
        numberOfLines={1}
        style={[styles.dailyNutrientLabel, { color: contentColor }]}
      >
        {label}
      </Text>
      <View
        style={[styles.dailyNutrientTrack, { backgroundColor: trackColor }]}
      >
        <View
          style={[
            styles.dailyNutrientFill,
            {
              backgroundColor: contentColor,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.dailyNutrientValue, { color: contentColor }]}
      >
        {hasTarget
          ? _formatDisplayValue({
              displayMode,
              target,
              unit: "g",
              value,
            })
          : `${_formatMacroValue({ value })}g`}
      </Text>
    </View>
  );
}

function MealSection({
  dateKey,
  foods,
  meal,
  mealEntries,
  mealLabel,
}: {
  readonly dateKey: Domain.DateKey;
  readonly foods: readonly Domain.Food[];
  readonly meal: Domain.MealId;
  readonly mealEntries: readonly Domain.MealEntry[];
  readonly mealLabel: string;
}) {
  const nutrients = Reporting.calculateMealEntriesNutrientTotals({
    foods,
    mealEntries,
  }).totals;
  const weightTotals = Reporting.calculateMealEntriesWeightTotals({
    foods,
    mealEntries,
  });
  const costTotals = Reporting.calculateMealEntriesCostTotals({
    foods,
    mealEntries,
  });

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{mealLabel}</Text>
        <Pressable
          accessibilityLabel={`${mealLabel} details`}
          accessibilityRole="button"
          onPress={() => {
            router.push({
              pathname: "/days/[dateKey]/meals/[meal]/details",
              params: {
                dateKey,
                meal,
              },
            });
          }}
          style={({ pressed }) => [
            styles.mealDetailsButton,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.detailsText}>Details</Text>
          <ChevronRight color={color.text} size={16} strokeWidth={3} />
        </Pressable>
      </View>

      <MealMacroStripe nutrients={nutrients} />

      {Array.isReadonlyArrayNonEmpty(mealEntries) ? (
        <View style={styles.mealEntries}>
          {mealEntries.map((mealEntry) => {
            const food = foods.find(
              (candidate) => candidate.id === mealEntry.foodId
            );

            return (
              <MealEntryRow
                food={food}
                key={mealEntry.id}
                mealEntry={mealEntry}
                onPress={() => {
                  router.push({
                    pathname:
                      "/days/[dateKey]/meals/[meal]/entries/[mealEntryId]/edit",
                    params: {
                      dateKey,
                      meal,
                      mealEntryId: mealEntry.id,
                    },
                  });
                }}
              />
            );
          })}
        </View>
      ) : null}

      <MealTotalColumns nutrients={nutrients} />
      <MealNutrientColumns nutrients={nutrients} />
      <MealCalorieWeightRatio
        costIsComplete={
          costTotals.resolvedEntriesCount === costTotals.entriesCount
        }
        costMinor={costTotals.costMinorByCurrency.EUR}
        energyKcal={nutrients.energyKcal}
        weightIsComplete={
          weightTotals.resolvedEntriesCount === weightTotals.entriesCount
        }
        quantityGrams={weightTotals.quantityGrams}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.push({
            pathname: "/days/[dateKey]/meals/[meal]/add",
            params: {
              dateKey,
              meal,
            },
          });
        }}
        style={styles.addFoodButton}
      >
        <Plus
          color={color.primary}
          size={16}
          strokeWidth={3}
          style={styles.addFoodIcon}
        />
        <Text style={styles.addFoodText}>Add food</Text>
      </Pressable>
    </View>
  );
}

function MealCalorieWeightRatio({
  costIsComplete,
  costMinor,
  energyKcal,
  quantityGrams,
  weightIsComplete,
}: {
  readonly costIsComplete: boolean;
  readonly costMinor: number;
  readonly energyKcal: number;
  readonly quantityGrams: number;
  readonly weightIsComplete: boolean;
}) {
  const gramsPerCalorie = Reporting.calculateGramsPerCalorie({
    energyKcal,
    quantityGrams,
  });
  const ratioLabel =
    !weightIsComplete || gramsPerCalorie === null
      ? "- g/kcal"
      : `${formatNumber({
          maximumFractionDigits: gramsPerCalorie < 1 ? 2 : 1,
          value: gramsPerCalorie,
        })} g/kcal`;
  const weightLabel = `${_formatMacroValue({ value: quantityGrams })}g`;

  return (
    <View style={styles.mealWeightRatioColumns}>
      <MealNutrientColumn
        colorValue={color.secondaryMetric}
        label={weightIsComplete ? "Food weight" : "Resolved weight"}
        value={weightLabel}
      />
      <MealNutrientColumn
        colorValue={color.secondaryMetric}
        label="Weight / calorie"
        value={ratioLabel}
      />
      <MealNutrientColumn
        colorValue={color.safeText}
        label="Cost"
        value={`${formatCurrencyMinor({ currency: "EUR", minorValue: costMinor })}${costIsComplete ? "" : "+"}`}
      />
    </View>
  );
}

function MealTotalColumns({
  nutrients,
}: {
  readonly nutrients: Reporting.NutrientTotals;
}) {
  return (
    <View style={styles.mealTotalColumns}>
      <MealTotalColumn
        colorValue={color.nutritionCarbs}
        label="Carbs"
        value={_formatMacroValue({ value: nutrients.carbsGrams })}
      />
      <MealTotalColumn
        colorValue={color.nutritionProtein}
        label="Protein"
        value={_formatMacroValue({ value: nutrients.proteinGrams })}
      />
      <MealTotalColumn
        colorValue={color.nutritionFat}
        label="Fat"
        value={_formatMacroValue({ value: nutrients.fatGrams })}
      />
      <MealTotalColumn
        colorValue={color.nutritionEnergy}
        label="Calories"
        value={_formatMacroValue({ value: nutrients.energyKcal })}
      />
    </View>
  );
}

function MealTotalColumn({
  colorValue,
  label,
  value,
}: {
  readonly colorValue: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.mealTotalColumn}>
      <Text
        numberOfLines={1}
        style={[styles.mealTotalValue, { color: colorValue }]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.mealTotalLabel, { color: colorValue }]}
      >
        {label}
      </Text>
    </View>
  );
}

function MealNutrientColumns({
  nutrients,
}: {
  readonly nutrients: Reporting.NutrientTotals;
}) {
  return (
    <View style={styles.mealNutrientColumns}>
      <MealNutrientColumn
        colorValue={color.nutritionCarbs}
        label="Fiber"
        value={`${_formatMacroValue({ value: nutrients.fiberGrams })}g`}
      />
      <MealNutrientColumn
        colorValue={color.nutritionSalt}
        label="Salt"
        value={`${_formatMacroValue({ value: nutrients.saltGrams })}g`}
      />
      <MealNutrientColumn
        colorValue={color.nutritionFat}
        label="Sat fat"
        value={`${_formatMacroValue({ value: nutrients.saturatedFatGrams })}g`}
      />
    </View>
  );
}

function MealNutrientColumn({
  colorValue,
  label,
  value,
}: {
  readonly colorValue: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.mealNutrientColumn}>
      <Text
        numberOfLines={1}
        style={[styles.mealNutrientValue, { color: colorValue }]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.mealNutrientLabel, { color: colorValue }]}
      >
        {label}
      </Text>
    </View>
  );
}

function MealMacroStripe({
  nutrients,
}: {
  readonly nutrients: Reporting.NutrientTotals;
}) {
  const total =
    nutrients.carbsGrams + nutrients.proteinGrams + nutrients.fatGrams;

  if (total <= 0) {
    return <View style={styles.emptyStripe} />;
  }

  return (
    <View style={styles.macroStripe}>
      <View
        style={[
          styles.macroStripeSegment,
          {
            backgroundColor: color.nutritionCarbs,
            flex: nutrients.carbsGrams,
          },
        ]}
      />
      <View
        style={[
          styles.macroStripeSegment,
          {
            backgroundColor: color.nutritionProtein,
            flex: nutrients.proteinGrams,
          },
        ]}
      />
      <View
        style={[
          styles.macroStripeSegment,
          {
            backgroundColor: color.nutritionFat,
            flex: nutrients.fatGrams,
          },
        ]}
      />
    </View>
  );
}

function MealEntryRow({
  food,
  mealEntry,
  onPress,
}: {
  readonly food: Domain.Food | undefined;
  readonly mealEntry: Domain.MealEntry;
  readonly onPress: () => void;
}) {
  const nutrients =
    food === undefined
      ? undefined
      : Utils.calculateEntryNutrients({
          food,
          nutritionMultiplier: mealEntry.nutritionMultiplier,
        });
  const quantityLabel = formatLoggedFoodQuantity({
    quantity: mealEntry.quantity,
  });
  const dominantMacronutrientColorsForFood =
    food === undefined
      ? []
      : Utils.findDominantMacronutrients({ food }).map(
          (macronutrient) => dominantMacronutrientColors[macronutrient]
        );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealEntryRow,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.entryCopy}>
        <Text numberOfLines={1} style={styles.entryName}>
          {food?.name ?? "Unknown food"}
        </Text>
        <View style={styles.entryDetailRow}>
          <FoodCurrentPriceIndicator food={food} />
          {!Array.isReadonlyArrayNonEmpty(
            dominantMacronutrientColorsForFood
          ) ? null : (
            <View accessible={false} style={styles.entryMacronutrientDots}>
              {dominantMacronutrientColorsForFood.map(
                (dominantMacronutrientColor) => (
                  <View
                    key={dominantMacronutrientColor}
                    style={[
                      styles.entryMacronutrientDot,
                      { backgroundColor: dominantMacronutrientColor },
                    ]}
                  />
                )
              )}
            </View>
          )}
          <Text numberOfLines={1} style={styles.entryDetail}>
            {food?.brand === undefined
              ? quantityLabel
              : `${food.brand}, ${quantityLabel}`}
          </Text>
        </View>
      </View>
      <View style={styles.entryNumbers}>
        <Text style={styles.entryKcal}>
          {nutrients === undefined
            ? "-"
            : _formatMacroValue({ value: nutrients.energyKcal })}
        </Text>
        <Text numberOfLines={1} style={styles.entryMacros}>
          {nutrients === undefined ? (
            "C: - P: - F: -"
          ) : (
            <>
              <Text style={styles.entryMacroLabel}>C: </Text>
              <Text style={styles.entryCarbs}>
                {_formatMacroValue({ value: nutrients.carbsGrams })}
              </Text>
              <Text style={styles.entryMacroLabel}> P: </Text>
              <Text style={styles.entryProtein}>
                {_formatMacroValue({ value: nutrients.proteinGrams })}
              </Text>
              <Text style={styles.entryMacroLabel}> F: </Text>
              <Text style={styles.entryFat}>
                {_formatMacroValue({ value: nutrients.fatGrams })}
              </Text>
            </>
          )}
        </Text>
      </View>
    </Pressable>
  );
}

function HeaderIconButton({
  accessibilityLabel,
  icon: Icon,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly icon: LucideIcon;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerIconButton,
        pressed ? styles.headerPressed : null,
      ]}
    >
      <Icon color={color.white} size={22} strokeWidth={3} />
    </Pressable>
  );
}

function BottomAction({
  icon: Icon,
  label,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.bottomAction,
        pressed ? styles.pressed : null,
      ]}
    >
      <Icon color={color.actionSheetText} size={20} strokeWidth={2.8} />
      <Text numberOfLines={1} style={styles.bottomLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function _formatMacroValue({ value }: { readonly value: number }) {
  return formatNumber({
    maximumFractionDigits: value < 10 ? 1 : 0,
    value,
  });
}

function _formatDisplayValue({
  displayMode,
  target,
  unit,
  value,
}: {
  readonly displayMode: MacroDisplayMode;
  readonly target: number;
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  if (displayMode === "consumed") {
    return `${_formatMacroValue({ value })} / ${_formatMacroValue({
      value: target,
    })} ${unit}`;
  }

  const remainingValue = target - value;
  const formattedValue = _formatMacroValue({
    value: Math.abs(remainingValue),
  });

  return remainingValue < 0
    ? `-${formattedValue} ${unit}`
    : `${formattedValue} ${unit} left`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    gap: 0,
    paddingBottom: spacing.xl,
    backgroundColor: color.bg,
  },
  unrecordedContent: {
    gap: 0,
    paddingBottom: spacing.xl,
    backgroundColor: color.bg,
  },
  headerSafeArea: {
    backgroundColor: color.primary,
  },
  unrecordedBody: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  unrecordedPlans: {
    gap: spacing.md,
  },
  createDayButton: {
    width: "100%",
  },
  createDayActionBar: {
    backgroundColor: color.surfaceRaised,
    borderTopColor: color.sheetBorder,
    borderTopWidth: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  emptyDayActions: {
    marginHorizontal: -spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#222226",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: color.sheet,
  },
  emptyDayDeleteButton: {
    width: "100%",
  },
  centeredContent: {
    justifyContent: "center",
  },
  loadingContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  retryButton: {
    marginTop: spacing.lg,
  },
  dateButton: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  dateEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  date: {
    color: color.white,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  headerPressed: {
    opacity: 0.82,
  },
  dayHeader: {
    marginBottom: 0,
  },
  dailyProgress: {
    gap: spacing.lg,
    marginHorizontal: -spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#222226",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: color.sheet,
  },
  dayDetailsAction: {
    marginHorizontal: -spacing.lg,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#222226",
    backgroundColor: color.sheet,
  },
  detailsText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  macroGrid: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  dailyMetric: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
  },
  dailyMetricLabel: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  dailyMetricTrack: {
    width: "100%",
    height: 6,
    overflow: "hidden",
    borderRadius: radius.pill,
  },
  dailyMetricFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  dailyMetricValue: {
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  energyProgress: {
    gap: spacing.xs,
    alignItems: "center",
  },
  energyTrack: {
    width: "100%",
    height: 7,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: "#233059",
  },
  energyFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  energyProgressValue: {
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  dailyNutrientGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dailyNutrient: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  dailyNutrientLabel: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  dailyNutrientTrack: {
    width: "100%",
    height: 5,
    overflow: "hidden",
    borderRadius: radius.pill,
  },
  dailyNutrientFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  dailyNutrientValue: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  meals: {
    gap: spacing.xxl,
    paddingTop: spacing.xl,
  },
  mealCard: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  mealHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  mealTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  mealDetailsButton: {
    minHeight: 32,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.divider,
    paddingHorizontal: spacing.sm,
    backgroundColor: color.surfaceRaised,
  },
  macroStripe: {
    height: 4,
    flexDirection: "row",
    backgroundColor: color.progressTrack,
  },
  macroStripeSegment: {
    height: "100%",
  },
  emptyStripe: {
    height: 4,
    backgroundColor: color.progressTrack,
  },
  mealEntries: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
  },
  mealEntryRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.82,
  },
  entryCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  entryName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  entryDetailRow: {
    minHeight: tokens.type.lineHeight.sm,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  entryMacronutrientDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: 3,
  },
  entryMacronutrientDots: {
    flexShrink: 0,
    flexDirection: "row",
    gap: spacing.xxs,
  },
  entryDetail: {
    minWidth: 0,
    flexShrink: 1,
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.medium,
    lineHeight: tokens.type.lineHeight.sm,
  },
  entryNumbers: {
    maxWidth: 188,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  entryKcal: {
    color: color.nutritionEnergy,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  entryMacros: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  entryMacroLabel: {
    color: color.textMuted,
  },
  entryCarbs: {
    color: color.nutritionCarbs,
  },
  entryProtein: {
    color: color.nutritionEnergy,
  },
  entryFat: {
    color: color.nutritionFat,
  },
  mealTotalColumns: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
  },
  mealTotalColumn: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  mealTotalValue: {
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  mealTotalLabel: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  mealNutrientColumns: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    backgroundColor: "#18181b",
  },
  mealNutrientColumn: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  mealNutrientValue: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  mealNutrientLabel: {
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  mealWeightRatioColumns: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    backgroundColor: "#18181b",
  },
  addFoodButton: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  addFoodIcon: {
    marginTop: 1,
  },
  addFoodText: {
    color: color.primary,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  bottomAction: {
    minHeight: 52,
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  bottomLabel: {
    color: color.actionSheetText,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
});
