import {
  AppHeader,
  AppScreen,
  BottomActionBar,
  Button,
  LoadingView,
  Notice,
} from "@/components/ui";
import { MealPlanSummaryCard } from "@/components/nutrition/meal-plan-summary-card";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import {
  DailyLogs,
  Domain,
  Foods,
  MealEntries,
  Reporting,
  Utils,
} from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { router } from "expo-router";
import { Array as EffectArray, Effect, Option, Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Apple,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Plus,
  Trash2,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { assign, fromPromise, setup } from "xstate";

export type RecordedDailyLogViewData = {
  readonly _tag: "RecordedDay";
  readonly day: DailyLogs.OpenedDay;
  readonly foods: readonly Domain.Food[];
  readonly mealEntries: readonly Domain.MealEntry[];
};

export type UnrecordedDailyLogViewData = {
  readonly _tag: "UnrecordedDay";
  readonly day: DailyLogs.UnrecordedDay;
};

export type DailyLogViewData =
  | RecordedDailyLogViewData
  | UnrecordedDailyLogViewData;

type DailyLogLoadResult =
  | {
      readonly _tag: "Ready";
      readonly data: DailyLogViewData;
    }
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: Domain.DateKey;
    };

type MacroDisplayMode = "consumed" | "remaining";

type DailyLogRouteEvent =
  | {
      readonly type: "createDay";
    }
  | {
      readonly type: "deleteDay";
    }
  | {
      readonly plan: Domain.Plan;
      readonly type: "selectPlan";
    }
  | {
      readonly type: "reload";
    };

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

const dailyLogRouteMachine = setup({
  types: {
    context: {} as {
      readonly data: DailyLogViewData | null;
      readonly dateKey: Domain.DateKey;
      readonly message: string | null;
    },
    events: {} as DailyLogRouteEvent,
    input: {} as {
      readonly dateKey: Domain.DateKey;
    },
  },
  actors: {
    createDailyLog: fromPromise<
      DailyLogViewData,
      {
        readonly dateKey: Domain.DateKey;
        readonly planId: Domain.PlanId;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs.DailyLogs;
          const foodsService = yield* Foods.Foods;
          const mealEntriesService = yield* MealEntries.MealEntries;
          const day = yield* dailyLogs.create({
            input,
          });
          const foods = yield* foodsService.list();
          const mealEntries = yield* mealEntriesService.listForDay({
            input: {
              dateKey: day.dailyLog.dateKey,
            },
          });

          return {
            _tag: "RecordedDay" as const,
            day,
            foods,
            mealEntries,
          };
        })
      )
    ),
    deleteDailyLog: fromPromise<
      DailyLogViewData,
      {
        readonly dateKey: Domain.DateKey;
      }
    >(({ input }) =>
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
      )
    ),
    loadDailyLog: fromPromise<
      DailyLogLoadResult,
      { readonly dateKey: Domain.DateKey }
    >(({ input }) => loadDailyLog({ dateKey: input.dateKey })),
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
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "NoMealPlans",
            target: "Redirected",
            actions: ({ event }) => {
              const output = event.output;

              if (output._tag === "NoMealPlans") {
                router.replace({
                  pathname: "/plans/new",
                  params: {
                    dateKey: output.dateKey,
                  },
                });
              }
            },
          },
          {
            guard: ({ event }) => event.output._tag === "Ready",
            target: "Ready",
            actions: assign(({ event }) => {
              if (event.output._tag !== "Ready") {
                return {
                  data: null,
                  message: "Could not load the daily log.",
                };
              }

              return {
                data: event.output.data,
                message: null,
              };
            }),
          },
        ],
        onError: {
          target: "Error",
          actions: assign(({ event }) => ({
            message:
              event.error instanceof Error
                ? event.error.message
                : "Could not load the daily log.",
          })),
        },
      },
    },
    Error: {
      on: {
        reload: {
          target: "Loading",
          actions: assign({
            data: null,
            message: null,
          }),
        },
      },
    },
    Ready: {
      on: {
        createDay: {
          target: "Creating",
        },
        deleteDay: {
          guard: ({ context }) =>
            context.data === null || context.data._tag !== "RecordedDay"
              ? false
              : !EffectArray.isReadonlyArrayNonEmpty(context.data.mealEntries),
          target: "Deleting",
          actions: assign({
            message: null,
          }),
        },
        reload: {
          target: "Loading",
          actions: assign({
            data: null,
            message: null,
          }),
        },
        selectPlan: {
          actions: assign(({ context, event }) => {
            if (
              context.data === null ||
              context.data._tag !== "UnrecordedDay" ||
              event.type !== "selectPlan"
            ) {
              return {};
            }

            return {
              data: {
                _tag: "UnrecordedDay" as const,
                day: new DailyLogs.UnrecordedDay({
                  dateKey: context.data.day.dateKey,
                  plans: context.data.day.plans,
                  selectedPlan: event.plan,
                }),
              },
              message: null,
            };
          }),
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
        onDone: {
          target: "Ready",
          actions: assign(({ event }) => ({
            data: event.output,
            message: null,
          })),
        },
        onError: {
          target: "Ready",
          actions: assign({
            message: "Could not delete this day. Please try again.",
          }),
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
        onDone: {
          target: "Ready",
          actions: assign(({ event }) => ({
            data: event.output,
            message: null,
          })),
        },
        onError: {
          target: "Ready",
          actions: assign({
            message: "Could not create this day. Please try again.",
          }),
        },
      },
    },
    Redirected: {},
  },
});

const macroDisplayModeMachine = setup({
  types: {
    events: {} as {
      readonly type: "toggle";
    },
  },
}).createMachine({
  initial: "Consumed",
  states: {
    Consumed: {
      on: {
        toggle: {
          target: "Remaining",
        },
      },
    },
    Remaining: {
      on: {
        toggle: {
          target: "Consumed",
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
  const [snapshot, send] = useMachine(dailyLogRouteMachine, {
    input: {
      dateKey,
    },
  });
  const deleteDayEvent = {
    type: "deleteDay",
  } satisfies DailyLogRouteEvent;

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return (
      <AppScreen contentStyle={styles.loadingContent}>
        <LoadingView message="Loading daily log" />
      </AppScreen>
    );
  }

  if (snapshot.matches("Error")) {
    return (
      <AppScreen contentStyle={styles.centeredContent}>
        <Notice
          message={snapshot.context.message ?? "Could not load the daily log."}
          title="Daily log unavailable"
          tone="danger"
        />
        <Button
          onPress={() => {
            send({
              type: "reload",
            });
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
      disabled={snapshot.matches("Creating") || snapshot.matches("Deleting")}
      notice={snapshot.context.message}
      onCreateDay={() => {
        send({
          type: "createDay",
        });
      }}
      onDeleteDay={() => {
        send(deleteDayEvent);
      }}
      onSelectPlan={(plan) => {
        send({
          plan,
          type: "selectPlan",
        });
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
        label="Stats"
        onPress={() => {
          router.push("/insights");
        }}
      />
      <BottomAction
        icon={ClipboardList}
        label="Plans"
        onPress={() => {
          router.push({
            pathname: "/plans",
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
        icon={Download}
        label="Backup"
        onPress={() => {
          router.push("/backup");
        }}
      />
    </BottomActionBar>
  );
}

function DailyProgress({
  day,
  nutrients,
}: {
  readonly day: DailyLogs.OpenedDay;
  readonly nutrients: Reporting.NutrientTotals;
}) {
  const plan = day.selectedPlan;
  const targetEnergyKcal = Utils.calculatePlanEnergyKcal({ plan });
  const [snapshot, send] = useMachine(macroDisplayModeMachine);
  const displayMode = snapshot.matches("Remaining") ? "remaining" : "consumed";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: displayMode === "remaining" }}
      onPress={() => {
        send({
          type: "toggle",
        });
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

      {EffectArray.isReadonlyArrayNonEmpty(mealEntries) ? (
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
          quantityGrams: mealEntry.quantityGrams,
        });
  const quantityLabel = `${_formatMacroValue({
    value: mealEntry.quantityGrams,
  })} g`;

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
        <Text numberOfLines={1} style={styles.entryDetail}>
          {food?.brand === undefined
            ? quantityLabel
            : `${food.brand}, ${quantityLabel}`}
        </Text>
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

export function loadDailyLog({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}): Promise<DailyLogLoadResult> {
  return RuntimeClient.runPromise(
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const foodsService = yield* Foods.Foods;
      const mealEntriesService = yield* MealEntries.MealEntries;
      const day = yield* dateKey === todayDateKey()
        ? dailyLogs.openOrCreate({
            input: {
              dateKey,
            },
          })
        : dailyLogs.open({
            input: {
              dateKey,
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

      const foods = yield* foodsService.list();
      const mealEntries = yield* mealEntriesService.listForDay({
        input: {
          dateKey: day.dailyLog.dateKey,
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
  entryDetail: {
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
