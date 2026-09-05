import { useDailyLogScroll } from "@/hooks/use-daily-log-scroll";
import { DailyNutritionSummary } from "./daily-nutrition-summary";
import { MealSection } from "./meal-section";
import { MealPlanSummaryCard } from "@/components/nutrition/meal-plan-summary-card";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines/schemas";
import * as Domain from "@mai/nutrition/domain";
import * as Reporting from "@mai/nutrition/reporting";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import * as Foods from "@mai/nutrition/services/foods";
import * as MealEntries from "@mai/nutrition/services/meal-entries";
import { useMachine } from "@xstate/react";
import { router } from "expo-router";
import { Array, Effect, Match, Option, Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Apple,
  Ban,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplet,
  Plus,
  Moon,
  Settings,
  Trash2,
  Utensils,
} from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

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

const dayModeOptions = [
  {
    description: "Included in averages, trends, and insights.",
    icon: Utensils,
    label: "Active",
    mode: "eating",
  },
  {
    description: "Excluded and identified as an intentional fast.",
    icon: Moon,
    label: "Fasting",
    mode: "fasting",
  },
  {
    description: "Excluded and identified as missing or incomplete tracking.",
    icon: Ban,
    label: "Not recorded",
    mode: "not-recorded",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly mode: Domain.DailyLogMode;
}[];

const dayModeConfirmationCopy = {
  eating: {
    action: "Count day",
    message:
      "All meals and entries on this day will be included in nutrition averages, trends, and insights.",
    title: "Count this day?",
  },
  fasting: {
    action: "Mark fasting",
    message:
      "You can keep adding and editing meals. The entire day, including any logged food, will be excluded from nutrition averages, trends, and insights.",
    title: "Mark as a fasting day?",
  },
  "not-recorded": {
    action: "Mark not recorded",
    message:
      "You can keep adding and editing meals. The entire day, including any logged food, will be excluded from nutrition averages, trends, and insights as missing or incomplete tracking.",
    title: "Mark as not recorded?",
  },
} satisfies Record<
  Domain.DailyLogMode,
  {
    readonly action: string;
    readonly message: string;
    readonly title: string;
  }
>;

const LoadDailyLogResult = Schema.Union([
  Schema.TaggedStruct("Ready", {
    data: DailyLogViewData,
  }),
  Schema.TaggedStruct("NoMealPlans", {
    dateKey: Domain.DateKey,
  }),
]);

const DailyLogContext = Schema.Struct({
  data: Schema.NullOr(DailyLogViewData),
  dateKey: Domain.DateKey,
  message: Schema.NullOr(Schema.String),
});

const DailyLogInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const CreateDailyLogInput = Schema.Struct({
  dateKey: Domain.DateKey,
  planId: Domain.PlanId,
});

const SetDailyLogModeInput = Schema.Struct({
  dateKey: Domain.DateKey,
  mode: Domain.DailyLogMode,
});

const SetWaterServingsInput = Schema.Struct({
  dateKey: Domain.DateKey,
  waterServings: Schema.NullOr(Domain.WaterServingCount),
});

const dailyLogRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(DailyLogContext),
    events: {
      createDay: Schema.toStandardSchemaV1(EmptyEvent),
      deleteDay: Schema.toStandardSchemaV1(EmptyEvent),
      reload: Schema.toStandardSchemaV1(EmptyEvent),
      setDayMode: Schema.toStandardSchemaV1(
        Schema.Struct({
          mode: Domain.DailyLogMode,
        })
      ),
      setWaterServings: Schema.toStandardSchemaV1(
        Schema.Struct({
          waterServings: Schema.NullOr(Domain.WaterServingCount),
        })
      ),
      selectPlan: Schema.toStandardSchemaV1(
        Schema.Struct({
          plan: Domain.Plan,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(DailyLogInput),
  },
  states: {
    Loading: {},
    Error: {},
    Ready: {},
    Creating: {},
    Deleting: {},
    Redirected: {},
    UpdatingMode: {},
    UpdatingWater: {},
  },
  actions: {
    redirectToNewPlan: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/plans/new",
        params,
      });
    },
  },
  actorSources: {
    createDailyLog: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(CreateDailyLogInput),
        output: Schema.toStandardSchemaV1(DailyLogViewData),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const day = yield* dailyLogs.create({
              input,
            });

            return {
              _tag: "RecordedDay" as const,
              day,
              foods: [],
              mealEntries: [],
            };
          })
        ),
    }),
    deleteDailyLog: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(DailyLogInput),
        output: Schema.toStandardSchemaV1(DailyLogViewData),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const removedDay = yield* dailyLogs.remove({
              input,
            });

            return {
              _tag: "UnrecordedDay" as const,
              day: removedDay.day,
            };
          })
        ),
    }),
    loadDailyLog: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(DailyLogInput),
        output: Schema.toStandardSchemaV1(LoadDailyLogResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const foodsService = yield* Foods.Foods;
            const mealEntriesService = yield* MealEntries.MealEntries;
            const day = yield* input.dateKey === todayDateKey()
              ? dailyLogs.openOrCreate({
                  input: {
                    dateKey: input.dateKey,
                  },
                })
              : dailyLogs.open({
                  input: {
                    dateKey: input.dateKey,
                  },
                });

            if (day._tag === "UnrecordedDay") {
              return {
                _tag: "Ready" as const,
                data: {
                  _tag: "UnrecordedDay" as const,
                  day,
                },
              };
            }

            const mealEntries = yield* mealEntriesService.listForDay({
              input: {
                dateKey: day.dailyLog.dateKey,
              },
            });
            const foods = yield* foodsService.getMany({
              input: {
                foodIds: Domain.mealEntryFoodIds(mealEntries),
              },
            });

            return {
              _tag: "Ready" as const,
              data: {
                _tag: "RecordedDay" as const,
                day,
                foods,
                mealEntries,
              },
            };
          }).pipe(
            Effect.catchTag("NoMealPlans", ({ dateKey: noPlanDateKey }) =>
              Effect.succeed({
                _tag: "NoMealPlans" as const,
                dateKey: noPlanDateKey,
              })
            )
          )
        ),
    }),
    setDailyLogMode: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SetDailyLogModeInput),
        output: Schema.toStandardSchemaV1(Domain.DailyLog),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const changedDay = yield* dailyLogs.setMode({ input });

            return changedDay.dailyLog;
          })
        ),
    }),
    setWaterServings: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SetWaterServingsInput),
        output: Schema.toStandardSchemaV1(Domain.DailyLog),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const changedDay = yield* dailyLogs.setWaterServings({ input });

            return changedDay.dailyLog;
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    data: null,
    dateKey: input.dateKey,
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadDailyLog",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              NoMealPlans: ({ dateKey }) => {
                enq(actions.redirectToNewPlan, { dateKey });

                return { target: "Redirected" as const };
              },
              Ready: ({ data }) => ({
                target: "Ready" as const,
                context: {
                  data,
                  message: null,
                },
              }),
            })
          ),
        onError: ({ event }) => ({
          target: "Error",
          context: {
            message:
              event.error instanceof Error
                ? event.error.message
                : "Could not load the daily log.",
          },
        }),
      },
    },
    Error: {
      on: {
        reload: {
          target: "Loading",
          context: {
            data: null,
            message: null,
          },
        },
      },
    },
    Ready: {
      on: {
        createDay: {
          target: "Creating",
        },
        deleteDay: ({ context }) => {
          if (
            context.data === null ||
            context.data._tag !== "RecordedDay" ||
            Array.isReadonlyArrayNonEmpty(context.data.mealEntries) ||
            context.data.day.dailyLog.waterServings !== null
          ) {
            return undefined;
          }

          return {
            target: "Deleting",
            context: {
              message: null,
            },
          };
        },
        reload: {
          target: "Loading",
          context: {
            data: null,
            message: null,
          },
        },
        setDayMode: ({ context }) => {
          if (context.data === null || context.data._tag !== "RecordedDay") {
            return undefined;
          }

          return {
            target: "UpdatingMode",
            context: {
              message: null,
            },
          };
        },
        setWaterServings: ({ context }) => {
          if (context.data === null || context.data._tag !== "RecordedDay") {
            return undefined;
          }

          return {
            target: "UpdatingWater",
            context: {
              message: null,
            },
          };
        },
        selectPlan: ({ context, event }) => {
          if (context.data === null || context.data._tag !== "UnrecordedDay") {
            return undefined;
          }

          return {
            context: {
              data: {
                _tag: "UnrecordedDay" as const,
                day: new DailyLogs.UnrecordedDay({
                  dateKey: context.data.day.dateKey,
                  plans: context.data.day.plans,
                  selectedPlan: event.plan,
                }),
              },
              message: null,
            },
          };
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteDailyLog",
        input: ({ context }) => {
          if (context.data === null || context.data._tag !== "RecordedDay") {
            throw new Error("Cannot delete a day before it loads.");
          }

          return {
            dateKey: context.data.day.dailyLog.dateKey,
          };
        },
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            data: event.output,
            message: null,
          },
        }),
        onError: {
          target: "Ready",
          context: {
            message: "Could not delete this day. Please try again.",
          },
        },
      },
    },
    Creating: {
      invoke: {
        src: "createDailyLog",
        input: ({ context }) => {
          if (context.data === null || context.data._tag !== "UnrecordedDay") {
            throw new Error("Cannot create a day before it loads.");
          }

          return {
            dateKey: context.data.day.dateKey,
            planId: context.data.day.selectedPlan.id,
          };
        },
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            data: event.output,
            message: null,
          },
        }),
        onError: {
          target: "Ready",
          context: {
            message: "Could not create this day. Please try again.",
          },
        },
      },
    },
    UpdatingMode: {
      invoke: {
        src: "setDailyLogMode",
        input: ({ context, event }) => {
          if (
            context.data === null ||
            context.data._tag !== "RecordedDay" ||
            event.type !== "setDayMode"
          ) {
            throw new Error("Cannot change a day mode before it loads.");
          }

          return {
            dateKey: context.data.day.dailyLog.dateKey,
            mode: event.mode,
          };
        },
        onDone: ({ context, event }) => {
          if (context.data === null || context.data._tag !== "RecordedDay") {
            return {
              target: "Loading" as const,
            };
          }

          return {
            target: "Ready" as const,
            context: {
              data: {
                ...context.data,
                day: {
                  ...context.data.day,
                  dailyLog: event.output,
                },
              },
              message: null,
            },
          };
        },
        onError: {
          target: "Ready",
          context: {
            message: "Could not change this day mode. Please try again.",
          },
        },
      },
    },
    UpdatingWater: {
      invoke: {
        src: "setWaterServings",
        input: ({ context, event }) => {
          if (
            context.data === null ||
            context.data._tag !== "RecordedDay" ||
            event.type !== "setWaterServings"
          ) {
            throw new Error("Cannot change daily water before the day loads.");
          }

          return {
            dateKey: context.data.day.dailyLog.dateKey,
            waterServings: event.waterServings,
          };
        },
        onDone: ({ context, event }) => {
          if (context.data === null || context.data._tag !== "RecordedDay") {
            return {
              target: "Loading" as const,
            };
          }

          return {
            target: "Ready" as const,
            context: {
              data: {
                ...context.data,
                day: {
                  ...context.data.day,
                  dailyLog: event.output,
                },
              },
              message: null,
            },
          };
        },
        onError: {
          target: "Ready",
          context: {
            message: "Could not update daily water. Please try again.",
          },
        },
      },
    },
    Redirected: {},
  },
});

export function DailyLogRoute({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const [snapshot, , actor] = useMachine(dailyLogRouteMachine, {
    input: {
      dateKey,
    },
  });
  const deleteDayEvent = {
    type: "deleteDay",
  } as const;
  const routeState = snapshot.value;

  if (routeState === "Loading" || routeState === "Redirected") {
    return (
      <AppScreen contentStyle={styles.loadingContent}>
        <LoadingView message="Loading daily log" />
      </AppScreen>
    );
  }

  if (routeState === "Error") {
    return (
      <AppScreen contentStyle={styles.centeredContent}>
        <Notice
          message={snapshot.context.message ?? "Could not load the daily log."}
          title="Daily log unavailable"
          tone="danger"
        />
        <Button
          onPress={() => {
            actor.trigger.reload();
          }}
          style={styles.retryButton}
          variant="secondary"
        >
          Try again
        </Button>
      </AppScreen>
    );
  }

  return snapshot.context.data === null ? (
    <AppScreen contentStyle={styles.loadingContent}>
      <LoadingView message="Loading daily log" />
    </AppScreen>
  ) : (
    <DailyLogView
      canDeleteDay={snapshot.can(deleteDayEvent)}
      data={snapshot.context.data}
      disabled={
        routeState === "Creating" ||
        routeState === "Deleting" ||
        routeState === "UpdatingMode" ||
        routeState === "UpdatingWater"
      }
      notice={snapshot.context.message}
      onCreateDay={() => {
        actor.trigger.createDay();
      }}
      onDeleteDay={() => {
        actor.trigger.deleteDay();
      }}
      onSelectPlan={(plan) => {
        actor.trigger.selectPlan({ plan });
      }}
      onSetDayMode={(mode) => {
        actor.trigger.setDayMode({ mode });
      }}
      onSetWaterServings={(waterServings) => {
        actor.trigger.setWaterServings({ waterServings });
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
  onSetDayMode,
  onSetWaterServings,
}: {
  readonly canDeleteDay: boolean;
  readonly data: DailyLogViewData;
  readonly disabled: boolean;
  readonly notice: string | null;
  readonly onCreateDay: () => void;
  readonly onDeleteDay: () => void;
  readonly onSelectPlan: (plan: Domain.Plan) => void;
  readonly onSetDayMode: (mode: Domain.DailyLogMode) => void;
  readonly onSetWaterServings: (
    waterServings: Domain.WaterServingCount | null
  ) => void;
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
      onSetDayMode={onSetDayMode}
      onSetWaterServings={onSetWaterServings}
    />
  );
}

function RecordedDailyLogView({
  canDeleteDay,
  data,
  disabled,
  onDeleteDay,
  onSetDayMode,
  onSetWaterServings,
}: {
  readonly canDeleteDay: boolean;
  readonly data: RecordedDailyLogViewData;
  readonly disabled: boolean;
  readonly onDeleteDay: () => void;
  readonly onSetDayMode: (mode: Domain.DailyLogMode) => void;
  readonly onSetWaterServings: (
    waterServings: Domain.WaterServingCount | null
  ) => void;
}) {
  const mealOptions = [...data.day.selectedPlan.meals].sort(
    (left, right) => left.position - right.position
  );
  const nutrition = Reporting.calculateMealEntriesNutrientTotals({
    foods: data.foods,
    mealEntries: data.mealEntries,
  });
  const dateKey = data.day.dailyLog.dateKey;
  const dayMode = data.day.dailyLog.mode;
  const scrollPosition = useDailyLogScroll(dateKey);

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top"]}
        scroll
        scrollRef={scrollPosition.scrollRef}
        scrollProps={{
          ...scrollPosition.scrollProps,
          contentInsetAdjustmentBehavior: "never",
        }}
        style={styles.headerSafeArea}
      >
        <DayNavigationHeader dateKey={dateKey} mode={dayMode} />

        <DailyNutritionSummary
          dayMode={dayMode}
          plan={data.day.selectedPlan}
          nutrition={nutrition}
        />

        <View style={styles.dayPrimaryActions}>
          <Pressable
            accessibilityLabel="Open weight insights"
            accessibilityRole="button"
            onPress={() => {
              router.push({
                pathname: "/insights",
                params: {
                  tab: "weight",
                },
              });
            }}
            style={({ pressed }) => [
              styles.dayPrimaryAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.detailsText}>Weight</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open day details"
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
              styles.dayPrimaryAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.detailsText}>Details</Text>
          </Pressable>
        </View>

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

        <WaterTracker
          disabled={disabled}
          onSetWaterServings={onSetWaterServings}
          waterServings={data.day.dailyLog.waterServings}
        />

        <DayModeAction
          disabled={disabled}
          mode={data.day.dailyLog.mode}
          onSetDayMode={onSetDayMode}
        />
      </AppScreen>

      <DayBottomActionBar dateKey={dateKey} />
    </View>
  );
}

const waterServingsPerRow = 8;

const waterTrackerDisclosureMachine = setup({
  schemas: {
    events: {
      toggle: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Collapsed: {},
    Expanded: {},
  },
}).createMachine({
  initial: "Collapsed",
  states: {
    Collapsed: {
      on: {
        toggle: {
          target: "Expanded",
        },
      },
    },
    Expanded: {
      on: {
        toggle: {
          target: "Collapsed",
        },
      },
    },
  },
});

function WaterTracker({
  disabled,
  onSetWaterServings,
  waterServings,
}: {
  readonly disabled: boolean;
  readonly onSetWaterServings: (
    waterServings: Domain.WaterServingCount | null
  ) => void;
  readonly waterServings: Domain.WaterServingCount | null;
}) {
  const [disclosureSnapshot, , disclosureActor] = useMachine(
    waterTrackerDisclosureMachine
  );
  const isExpanded = disclosureSnapshot.matches("Expanded");
  const recordedWaterServings = waterServings ?? 0;
  const visibleDropCount =
    (Math.floor(recordedWaterServings / waterServingsPerRow) + 1) *
    waterServingsPerRow;
  const liters = recordedWaterServings / 4;
  const toggleColor = waterServings === null ? color.textMuted : color.water;

  return (
    <View style={styles.waterTracker}>
      <View style={styles.waterTrackerContent}>
        <View style={styles.waterTrackerHeader}>
          <View style={styles.waterTrackerCopy}>
            <Text style={styles.waterTrackerTitle}>Water</Text>
            <Text style={styles.waterTrackerDescription}>
              Each drop is 250 ml
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`${isExpanded ? "Hide" : "Show"} water controls`}
            accessibilityRole="button"
            accessibilityState={{ disabled, expanded: isExpanded }}
            disabled={disabled}
            onPress={disclosureActor.trigger.toggle}
            style={({ pressed }) => [
              styles.waterTrackerToggle,
              pressed ? styles.pressed : null,
              disabled ? styles.waterTrackerToggleDisabled : null,
            ]}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.waterTrackerToggleLabel, { color: toggleColor }]}
            >
              {waterServings === null
                ? "Add"
                : `${formatNumber({ maximumFractionDigits: 2, value: liters })} L`}
            </Text>
            {isExpanded ? (
              <ChevronUp color={toggleColor} size={18} strokeWidth={2.6} />
            ) : (
              <ChevronDown color={toggleColor} size={18} strokeWidth={2.6} />
            )}
          </Pressable>
        </View>
        {isExpanded ? (
          <View style={styles.waterDropGrid}>
            {globalThis.Array.from(
              { length: visibleDropCount / waterServingsPerRow },
              (_, rowIndex) => (
                <View key={rowIndex} style={styles.waterDropRow}>
                  {globalThis.Array.from(
                    { length: waterServingsPerRow },
                    (_, columnIndex) => {
                      const index =
                        rowIndex * waterServingsPerRow + columnIndex;
                      const selected = index < recordedWaterServings;
                      const nextWaterServings = selected ? index : index + 1;
                      const nextLiters = nextWaterServings / 4;

                      return (
                        <Pressable
                          accessibilityLabel={`${selected ? "Remove water through" : "Add water through"} ${formatNumber({ maximumFractionDigits: 2, value: nextLiters })} liters`}
                          accessibilityRole="button"
                          accessibilityState={{ disabled, selected }}
                          disabled={disabled}
                          key={columnIndex}
                          onPress={() => {
                            Schema.decodeOption(Domain.WaterServingCount)(
                              nextWaterServings
                            ).pipe(Option.map(onSetWaterServings));
                          }}
                          style={({ pressed }) => [
                            styles.waterDropButton,
                            pressed ? styles.pressed : null,
                            disabled ? styles.waterDropButtonDisabled : null,
                          ]}
                        >
                          <Droplet
                            color={selected ? color.water : color.textSubtle}
                            fill={selected ? color.water : "transparent"}
                            size={30}
                            strokeWidth={2.4}
                          />
                        </Pressable>
                      );
                    }
                  )}
                </View>
              )
            )}
          </View>
        ) : null}
      </View>
      {isExpanded ? (
        <Button
          accessibilityLabel="Clear water recording"
          disabled={disabled || waterServings === null}
          onPress={() => {
            onSetWaterServings(null);
          }}
          style={styles.waterTrackerClear}
          variant="secondary"
        >
          Clear water
        </Button>
      ) : null}
    </View>
  );
}

function DayModeAction({
  disabled,
  mode,
  onSetDayMode,
}: {
  readonly disabled: boolean;
  readonly mode: Domain.DailyLogMode;
  readonly onSetDayMode: (mode: Domain.DailyLogMode) => void;
}) {
  return (
    <View style={styles.dayModeAction}>
      <Text style={styles.dayModeTitle}>Day mode</Text>
      <View accessibilityRole="radiogroup" style={styles.dayModeOptions}>
        {dayModeOptions.map((option) => {
          const selected = option.mode === mode;
          const OptionIcon = option.icon;
          const selectedStyle =
            option.mode === "eating"
              ? styles.dayModeOptionSelectedEating
              : option.mode === "fasting"
                ? styles.dayModeOptionSelectedFasting
                : styles.dayModeOptionSelectedNotRecorded;
          const selectedColor =
            option.mode === "eating"
              ? color.primary
              : option.mode === "fasting"
                ? color.safeText
                : color.notRecordedText;

          return (
            <Pressable
              accessibilityLabel={`${option.label}. ${option.description}`}
              accessibilityRole="radio"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={option.mode}
              onPress={() => {
                if (selected) return;

                const confirmation = dayModeConfirmationCopy[option.mode];
                Alert.alert(confirmation.title, confirmation.message, [
                  { style: "cancel", text: "Cancel" },
                  {
                    onPress: () => {
                      onSetDayMode(option.mode);
                    },
                    text: confirmation.action,
                  },
                ]);
              }}
              style={({ pressed }) => [
                styles.dayModeOption,
                selected ? selectedStyle : null,
                pressed ? styles.pressed : null,
                disabled ? styles.dayModeOptionDisabled : null,
              ]}
            >
              <OptionIcon
                color={selected ? selectedColor : color.textMuted}
                size={20}
                strokeWidth={2.5}
              />
              <View style={styles.dayModeOptionCopy}>
                <Text style={styles.dayModeOptionLabel}>{option.label}</Text>
                <Text style={styles.dayModeOptionDescription}>
                  {option.description}
                </Text>
              </View>
              <View
                style={[
                  styles.dayModeIndicator,
                  selected
                    ? {
                        backgroundColor: selectedColor,
                        borderColor: selectedColor,
                      }
                    : null,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
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
        <DayNavigationHeader dateKey={dateKey} mode="eating" />

        <View style={styles.dayPrimaryActions}>
          <Pressable
            accessibilityLabel="Open weight insights"
            accessibilityRole="button"
            onPress={() => {
              router.push({
                pathname: "/insights",
                params: {
                  tab: "weight",
                },
              });
            }}
            style={({ pressed }) => [
              styles.dayPrimaryAction,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.detailsText}>Weight</Text>
          </Pressable>
        </View>

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
  mode,
}: {
  readonly dateKey: Domain.DateKey;
  readonly mode: Domain.DailyLogMode;
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
          eyebrow: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            day: "numeric",
            month: "short",
          }).format(displayedDateValue),
          label: displayedDateRelativeLabel,
        };

  return (
    <AppHeader
      center={
        <Pressable
          accessibilityRole="button"
          accessibilityHint={
            mode === "eating"
              ? "Active day"
              : mode === "fasting"
                ? "Fasting day"
                : "Not recorded"
          }
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
    backgroundColor: color.header,
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
    borderBottomColor: color.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: color.sheet,
  },
  emptyDayDeleteButton: {
    width: "100%",
  },
  waterTracker: {
    overflow: "hidden",
    marginTop: spacing.xl,
    borderColor: color.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: color.surfaceRaised,
  },
  waterTrackerContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  waterTrackerHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  waterTrackerCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  waterTrackerTitle: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  waterTrackerDescription: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    lineHeight: tokens.type.lineHeight.xs,
  },
  waterTrackerToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    backgroundColor: "transparent",
  },
  waterTrackerToggleLabel: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  waterTrackerToggleDisabled: {
    opacity: 0.58,
  },
  waterTrackerClear: {
    alignSelf: "stretch",
    borderRadius: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  waterDropGrid: {
    gap: spacing.xs,
  },
  waterDropRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  waterDropButton: {
    width: "12%",
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  waterDropButtonDisabled: {
    opacity: 0.58,
  },
  dayModeAction: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  dayModeTitle: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  dayModeOptions: {
    gap: spacing.sm,
  },
  dayModeOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: color.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: color.surfaceRaised,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dayModeOptionSelectedEating: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  dayModeOptionSelectedFasting: {
    borderColor: color.safeBorder,
    backgroundColor: color.safeBg,
  },
  dayModeOptionSelectedNotRecorded: {
    borderColor: color.notRecordedBorder,
    backgroundColor: color.notRecordedBg,
  },
  dayModeOptionDisabled: {
    opacity: 0.58,
  },
  dayModeOptionCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  dayModeOptionLabel: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  dayModeOptionDescription: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    lineHeight: tokens.type.lineHeight.xs,
  },
  dayModeIndicator: {
    width: 14,
    height: 14,
    borderColor: color.fieldBorder,
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: color.field,
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
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  date: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.semibold,
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
  dayPrimaryActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  dayPrimaryAction: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    minHeight: 44,
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  detailsText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  meals: {
    gap: spacing.xxxl,
    paddingTop: spacing.xxl,
  },
  pressed: {
    opacity: 0.82,
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
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
});
