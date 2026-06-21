import {
  AppHeader,
  AppModalSheet,
  AppScreen,
  BottomActionBar,
  Button,
  LoadingOverlay,
  LoadingView,
  Notice,
} from "@/components/ui";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import {
  DateKey,
  addNutrientTotals,
  calculateEntryNutrients,
  calculatePlanEnergyKcal,
  emptyNutrientTotals,
  type Food,
  type Meal,
  type MealEntry,
  type NutrientTotals,
  type Plan,
} from "@mai/nutrition";
import type { OpenedDay } from "@mai/nutrition/services/daily-logs";
import { DailyLogs } from "@mai/nutrition/services/daily-logs";
import { Foods } from "@mai/nutrition/services/foods";
import type { MealFoodUsage } from "@mai/nutrition/services/meal-entries";
import { MealEntries } from "@mai/nutrition/services/meal-entries";
import { useMachine } from "@xstate/react";
import { router, type RelativePathString } from "expo-router";
import { Array as EffectArray, Effect, Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  Apple,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react-native";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

export type DailyLogViewData = {
  readonly day: OpenedDay;
  readonly foodUsage: readonly MealFoodUsage[];
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
};

type DailyLogRouteProps = {
  readonly dateKey: string;
};

type DailyLogLoadResult =
  | {
      readonly _tag: "OpenedDay";
      readonly data: DailyLogViewData;
    }
  | {
      readonly _tag: "InvalidDateKey";
    }
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: string;
    };

type SheetName = "plans" | "foods" | "backup" | null;

type SelectedMealEntry = {
  readonly food: Food | undefined;
  readonly mealEntry: MealEntry;
};

type DailyLogRouteEvent = {
  readonly type: "reload";
};

type DailyLogViewEvent =
  | {
      readonly quantityGrams: string;
      readonly type: "changeMealEntryQuantity";
    }
  | {
      readonly dateKey: string;
      readonly plan: Plan;
      readonly type: "changePlan";
    }
  | {
      readonly type: "closeMealEntry";
    }
  | {
      readonly type: "closeSheet";
    }
  | {
      readonly mealEntry: MealEntry;
      readonly type: "deleteMealEntry";
    }
  | {
      readonly sheet: Exclude<SheetName, null>;
      readonly type: "openSheet";
    }
  | {
      readonly mealEntry: MealEntry;
      readonly quantityGrams: string;
      readonly type: "reviseMealEntry";
    }
  | {
      readonly selectedMealEntry: SelectedMealEntry;
      readonly type: "selectMealEntry";
    };

type DailyLogViewContext = {
  readonly activeSheet: SheetName;
  readonly onReload: () => void;
  readonly pendingMessage: string | null;
  readonly quantityGrams: string;
  readonly selectedMealEntry: SelectedMealEntry | null;
};

const mealOptions: readonly {
  readonly label: string;
  readonly value: Meal;
}[] = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Dinner", value: "dinner" },
];

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
      readonly dateKey: string;
      readonly message: string | null;
    },
    events: {} as DailyLogRouteEvent,
    input: {} as {
      readonly dateKey: string;
    },
  },
  actors: {
    loadDailyLog: fromPromise<DailyLogLoadResult, { readonly dateKey: string }>(
      ({ input }) => loadDailyLog({ dateKey: input.dateKey })
    ),
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
            guard: ({ event }) => event.output._tag === "InvalidDateKey",
            target: "Redirected",
            actions: () => {
              router.replace("/");
            },
          },
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
            guard: ({ event }) => event.output._tag === "OpenedDay",
            target: "Ready",
            actions: assign(({ event }) => ({
              data: getDailyLogViewData({ result: event.output }),
              message: null,
            })),
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
        reload: {
          target: "Loading",
          actions: assign({
            data: null,
            message: null,
          }),
        },
      },
    },
    Redirected: {},
  },
});

const dailyLogViewMachine = setup({
  types: {
    context: {} as DailyLogViewContext,
    events: {} as DailyLogViewEvent,
    input: {} as {
      readonly onReload: () => void;
    },
  },
  actors: {
    changeDayPlan: fromPromise<
      void,
      {
        readonly dateKey: string;
        readonly planId: string;
      }
    >(({ input }) => changeDayPlan(input).then(() => undefined)),
    deleteMealEntry: fromPromise<void, { readonly mealEntry: MealEntry }>(
      ({ input }) => deleteMealEntry(input).then(() => undefined)
    ),
    reviseMealEntry: fromPromise<
      void,
      {
        readonly mealEntry: MealEntry;
        readonly quantityGrams: string;
      }
    >(({ input }) => reviseMealEntry(input).then(() => undefined)),
  },
}).createMachine({
  context: ({ input }) => ({
    activeSheet: null,
    onReload: input.onReload,
    pendingMessage: null,
    quantityGrams: "",
    selectedMealEntry: null,
  }),
  initial: "Idle",
  states: {
    Idle: {
      on: {
        changeMealEntryQuantity: {
          actions: assign(({ event }) => {
            assertEvent(event, "changeMealEntryQuantity");

            return {
              quantityGrams: event.quantityGrams,
            };
          }),
        },
        changePlan: {
          target: "ChangingPlan",
          actions: assign({
            pendingMessage: "Changing plan",
          }),
        },
        closeMealEntry: {
          actions: assign({
            quantityGrams: "",
            selectedMealEntry: null,
          }),
        },
        closeSheet: {
          actions: assign({
            activeSheet: null,
          }),
        },
        deleteMealEntry: {
          target: "DeletingMealEntry",
          actions: assign({
            pendingMessage: "Deleting entry",
          }),
        },
        openSheet: {
          actions: assign(({ event }) => {
            assertEvent(event, "openSheet");

            return {
              activeSheet: event.sheet,
            };
          }),
        },
        reviseMealEntry: {
          target: "RevisingMealEntry",
          actions: assign({
            pendingMessage: "Saving entry",
          }),
        },
        selectMealEntry: {
          actions: assign(({ event }) => {
            assertEvent(event, "selectMealEntry");

            return {
              quantityGrams: `${event.selectedMealEntry.mealEntry.quantityGrams}`,
              selectedMealEntry: event.selectedMealEntry,
            };
          }),
        },
      },
    },
    ChangingPlan: {
      invoke: {
        src: "changeDayPlan",
        input: ({ event }) => {
          assertEvent(event, "changePlan");

          return {
            dateKey: event.dateKey,
            planId: event.plan.id,
          };
        },
        onDone: {
          target: "Idle",
          actions: [
            assign({
              activeSheet: null,
              pendingMessage: null,
            }),
            ({ context }) => {
              context.onReload();
            },
          ],
        },
        onError: {
          target: "Idle",
          actions: [
            assign({
              pendingMessage: null,
            }),
            ({ event }) => {
              Alert.alert("Could not change plan", _errorMessage(event.error));
            },
          ],
        },
      },
    },
    DeletingMealEntry: {
      invoke: {
        src: "deleteMealEntry",
        input: ({ event }) => {
          assertEvent(event, "deleteMealEntry");

          return {
            mealEntry: event.mealEntry,
          };
        },
        onDone: {
          target: "Idle",
          actions: [
            assign({
              pendingMessage: null,
              quantityGrams: "",
              selectedMealEntry: null,
            }),
            ({ context }) => {
              context.onReload();
            },
          ],
        },
        onError: {
          target: "Idle",
          actions: [
            assign({
              pendingMessage: null,
            }),
            ({ event }) => {
              Alert.alert("Could not delete entry", _errorMessage(event.error));
            },
          ],
        },
      },
    },
    RevisingMealEntry: {
      invoke: {
        src: "reviseMealEntry",
        input: ({ event }) => {
          assertEvent(event, "reviseMealEntry");

          return {
            mealEntry: event.mealEntry,
            quantityGrams: event.quantityGrams,
          };
        },
        onDone: {
          target: "Idle",
          actions: [
            assign({
              pendingMessage: null,
              quantityGrams: "",
              selectedMealEntry: null,
            }),
            ({ context }) => {
              context.onReload();
            },
          ],
        },
        onError: {
          target: "Idle",
          actions: [
            assign({
              pendingMessage: null,
            }),
            ({ event }) => {
              Alert.alert("Could not save entry", _errorMessage(event.error));
            },
          ],
        },
      },
    },
  },
});

export function DailyLogRoute({ dateKey }: DailyLogRouteProps) {
  const [snapshot, send] = useMachine(dailyLogRouteMachine, {
    input: {
      dateKey,
    },
  });

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return (
      <AppScreen>
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
    <AppScreen>
      <LoadingView message="Loading daily log" />
    </AppScreen>
  ) : (
    <DailyLogView
      data={snapshot.context.data}
      onReload={() => {
        send({
          type: "reload",
        });
      }}
    />
  );
}

export function DailyLogTodayRoute() {
  return <DailyLogRoute dateKey={todayDateKey()} />;
}

export function DailyLogView({
  data,
  onReload,
}: {
  readonly data: DailyLogViewData;
  readonly onReload: () => void;
}) {
  const [snapshot, , actor] = useMachine(dailyLogViewMachine, {
    input: {
      onReload,
    },
  });
  const { activeSheet, pendingMessage, quantityGrams, selectedMealEntry } =
    snapshot.context;
  const nutrients = _calculateEntriesNutrients({
    foods: data.foods,
    mealEntries: data.mealEntries,
  });
  const previousDateKey = shiftDateKey({
    dateKey: data.day.dailyLog.dateKey,
    days: -1,
  });
  const nextDateKey = shiftDateKey({
    dateKey: data.day.dailyLog.dateKey,
    days: 1,
  });
  const currentDateKey = todayDateKey();
  const displayedDateRelativeLabel =
    data.day.dailyLog.dateKey === currentDateKey
      ? "Today"
      : data.day.dailyLog.dateKey ===
          shiftDateKey({
            dateKey: currentDateKey,
            days: -1,
          })
        ? "Yesterday"
        : data.day.dailyLog.dateKey ===
            shiftDateKey({
              dateKey: currentDateKey,
              days: 1,
            })
          ? "Tomorrow"
          : null;
  const displayedDateValue = new Date(`${data.day.dailyLog.dateKey}T00:00:00`);
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
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top"]}
        scroll
        scrollProps={{
          contentInsetAdjustmentBehavior: "never",
        }}
      >
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

        <DailyProgress day={data.day} nutrients={nutrients} />

        <View style={styles.meals}>
          {mealOptions.map((mealOption) => (
            <MealSection
              dateKey={data.day.dailyLog.dateKey}
              foods={data.foods}
              key={mealOption.value}
              meal={mealOption.value}
              mealEntries={data.mealEntries.filter(
                (mealEntry) => mealEntry.meal === mealOption.value
              )}
              mealLabel={mealOption.label}
              onSelectMealEntry={(nextSelectedMealEntry) => {
                actor.send({
                  selectedMealEntry: nextSelectedMealEntry,
                  type: "selectMealEntry",
                });
              }}
            />
          ))}
        </View>
      </AppScreen>

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
            actor.send({
              sheet: "plans",
              type: "openSheet",
            });
          }}
        />
        <BottomAction
          icon={Apple}
          label="Foods"
          onPress={() => {
            actor.send({
              sheet: "foods",
              type: "openSheet",
            });
          }}
        />
        <BottomAction
          icon={Download}
          label="Backup"
          onPress={() => {
            actor.send({
              sheet: "backup",
              type: "openSheet",
            });
          }}
        />
      </BottomActionBar>

      <PlansSheet
        data={data}
        onChangePlan={({ plan }) => {
          actor.send({
            dateKey: data.day.dailyLog.dateKey,
            plan,
            type: "changePlan",
          });
        }}
        onClose={() => {
          actor.send({
            type: "closeSheet",
          });
        }}
        visible={activeSheet === "plans"}
      />
      <FoodsSheet
        dateKey={data.day.dailyLog.dateKey}
        onClose={() => {
          actor.send({
            type: "closeSheet",
          });
        }}
        visible={activeSheet === "foods"}
      />
      <BackupSheet
        onClose={() => {
          actor.send({
            type: "closeSheet",
          });
        }}
        visible={activeSheet === "backup"}
      />
      <MealEntrySheet
        onChangeQuantity={(nextQuantityGrams) => {
          actor.send({
            quantityGrams: nextQuantityGrams,
            type: "changeMealEntryQuantity",
          });
        }}
        onClose={() => {
          actor.send({
            type: "closeMealEntry",
          });
        }}
        onDelete={({ mealEntry }) => {
          actor.send({
            mealEntry,
            type: "deleteMealEntry",
          });
        }}
        onRevise={({ mealEntry, quantityGrams: nextQuantityGrams }) => {
          actor.send({
            mealEntry,
            quantityGrams: nextQuantityGrams,
            type: "reviseMealEntry",
          });
        }}
        quantityGrams={quantityGrams}
        selectedMealEntry={selectedMealEntry}
      />
      <LoadingOverlay
        message={pendingMessage ?? undefined}
        visible={pendingMessage !== null}
      />
    </View>
  );
}

function DailyProgress({
  day,
  nutrients,
}: {
  readonly day: OpenedDay;
  readonly nutrients: NutrientTotals;
}) {
  const plan = day.selectedPlan;
  const targetEnergyKcal = calculatePlanEnergyKcal({ plan });

  return (
    <View style={styles.dailyProgress}>
      <View style={styles.macroGrid}>
        {macroProgress.map((macro) => (
          <DailyProgressMetric
            colorValue={macro.color}
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
        target={targetEnergyKcal}
        value={nutrients.energyKcal}
      />

      <View style={styles.dailyNutrientGrid}>
        <DailyNutrientMetric
          colorValue={color.nutritionCarbs}
          label="Fiber"
          target={plan.fiberTargetGrams}
          trackColor="#4a2031"
          value={nutrients.fiberGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionCarbs}
          label="Sugar"
          target={plan.sugarTargetGrams}
          trackColor="#4a2031"
          value={nutrients.sugarGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionFat}
          label="Sat fat"
          target={plan.saturatedFatTargetGrams}
          trackColor="#443719"
          value={nutrients.saturatedFatGrams}
        />
        <DailyNutrientMetric
          colorValue={color.nutritionSalt}
          label="Salt"
          target={plan.saltTargetGrams}
          trackColor="#303034"
          value={nutrients.saltGrams}
        />
      </View>
    </View>
  );
}

function DailyProgressMetric({
  colorValue,
  label,
  target,
  trackColor,
  unit,
  value,
}: {
  readonly colorValue: string;
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
        {_formatMacroValue({ value })} / {_formatMacroValue({ value: target })}{" "}
        {unit}
      </Text>
    </View>
  );
}

function DailyEnergyProgress({
  target,
  value,
}: {
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
        {_formatMacroValue({ value })} / {_formatMacroValue({ value: target })}{" "}
        kcal
      </Text>
    </View>
  );
}

function DailyNutrientMetric({
  colorValue,
  label,
  target,
  trackColor,
  value,
}: {
  readonly colorValue: string;
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
          ? `${_formatMacroValue({ value })}g / ${_formatMacroValue({
              value: target,
            })}g`
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
  onSelectMealEntry,
}: {
  readonly dateKey: string;
  readonly foods: readonly Food[];
  readonly meal: Meal;
  readonly mealEntries: readonly MealEntry[];
  readonly mealLabel: string;
  readonly onSelectMealEntry: (selectedMealEntry: SelectedMealEntry) => void;
}) {
  const nutrients = _calculateEntriesNutrients({ foods, mealEntries });

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{mealLabel}</Text>
      </View>

      <MealMacroStripe nutrients={nutrients} />

      {EffectArray.isReadonlyArrayNonEmpty(mealEntries) ? (
        <View style={styles.mealEntries}>
          {mealEntries.map((mealEntry) => {
            const food = _findFoodById({
              foodId: mealEntry.foodId,
              foods,
            });

            return (
              <MealEntryRow
                food={food}
                key={mealEntry.id}
                mealEntry={mealEntry}
                onPress={() => {
                  onSelectMealEntry({
                    food,
                    mealEntry,
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
  readonly nutrients: NutrientTotals;
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
  readonly nutrients: NutrientTotals;
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
  readonly nutrients: NutrientTotals;
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
  readonly food: Food | undefined;
  readonly mealEntry: MealEntry;
  readonly onPress: () => void;
}) {
  const nutrients =
    food === undefined
      ? undefined
      : calculateEntryNutrients({
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
          {nutrients === undefined
            ? "C - P - F -"
            : `C ${_formatMacroValue({
                value: nutrients.carbsGrams,
              })} P ${_formatMacroValue({
                value: nutrients.proteinGrams,
              })} F ${_formatMacroValue({ value: nutrients.fatGrams })}`}
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

function PlansSheet({
  data,
  onChangePlan,
  onClose,
  visible,
}: {
  readonly data: DailyLogViewData;
  readonly onChangePlan: ({ plan }: { readonly plan: Plan }) => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const selectedPlanId = data.day.selectedPlan.id;

  return (
    <AppModalSheet onClose={onClose} title="Plans" visible={visible}>
      <View style={styles.sheetList}>
        {data.day.plans.map((plan) => {
          const isSelected = plan.id === selectedPlanId;

          return (
            <Pressable
              accessibilityRole="button"
              disabled={isSelected}
              key={plan.id}
              onPress={() => {
                onChangePlan({ plan });
              }}
              style={[
                styles.planOption,
                isSelected ? styles.planOptionSelected : null,
              ]}
            >
              <View style={styles.planOptionCopy}>
                <Text style={styles.planOptionName}>{plan.name}</Text>
                <Text style={styles.planOptionMacros}>
                  {_formatMacroValue({
                    value: calculatePlanEnergyKcal({ plan }),
                  })}{" "}
                  kcal | C {_formatMacroValue({ value: plan.carbsTargetGrams })}
                  g | P {_formatMacroValue({ value: plan.proteinTargetGrams })}g
                  | F {_formatMacroValue({ value: plan.fatTargetGrams })}g
                </Text>
              </View>
              {isSelected ? (
                <Text style={styles.selectedBadge}>Active</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sheetActions}>
        <SheetAction
          icon={Pencil}
          label="Edit plan"
          onPress={() => {
            router.push({
              pathname: "/plans/[planId]/edit",
              params: {
                dateKey: data.day.dailyLog.dateKey,
                planId: data.day.selectedPlan.id,
              },
            });
          }}
        />
        <SheetAction
          icon={Plus}
          label="New plan"
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: data.day.dailyLog.dateKey,
              },
            });
          }}
        />
      </View>
    </AppModalSheet>
  );
}

function FoodsSheet({
  dateKey,
  onClose,
  visible,
}: {
  readonly dateKey: string;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  return (
    <AppModalSheet onClose={onClose} title="Foods" visible={visible}>
      <View style={styles.sheetActions}>
        <SheetAction
          icon={Plus}
          label="Create food"
          onPress={() => {
            router.push({
              pathname: "/foods/new",
              params: {
                dateKey,
              },
            });
          }}
        />
        <SheetAction
          icon={Pencil}
          label="Edit foods"
          onPress={() => {
            router.push({
              pathname: "/foods/edit",
              params: {
                dateKey,
              },
            });
          }}
        />
      </View>
    </AppModalSheet>
  );
}

function BackupSheet({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  return (
    <AppModalSheet onClose={onClose} title="Backup" visible={visible}>
      <View style={styles.sheetActions}>
        <SheetAction
          icon={Download}
          label="Open backup"
          onPress={() => {
            router.push("/backup" as RelativePathString);
          }}
        />
      </View>
    </AppModalSheet>
  );
}

function MealEntrySheet({
  onChangeQuantity,
  onClose,
  onDelete,
  onRevise,
  quantityGrams,
  selectedMealEntry,
}: {
  readonly onChangeQuantity: (quantityGrams: string) => void;
  readonly onClose: () => void;
  readonly onDelete: ({ mealEntry }: { readonly mealEntry: MealEntry }) => void;
  readonly onRevise: ({
    mealEntry,
    quantityGrams,
  }: {
    readonly mealEntry: MealEntry;
    readonly quantityGrams: string;
  }) => void;
  readonly quantityGrams: string;
  readonly selectedMealEntry: SelectedMealEntry | null;
}) {
  return (
    <AppModalSheet
      onClose={onClose}
      title={selectedMealEntry?.food?.name ?? "Meal entry"}
      visible={selectedMealEntry !== null}
    >
      {selectedMealEntry === null ? null : (
        <View style={styles.entrySheet}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <View style={styles.quantityFieldShell}>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={onChangeQuantity}
                placeholder="0"
                placeholderTextColor={color.textSubtle}
                selectionColor={color.primary}
                style={styles.quantityField}
                value={quantityGrams}
              />
              <Text style={styles.quantityUnit}>g</Text>
            </View>
          </View>
          <View style={styles.sheetActions}>
            <SheetAction
              danger
              icon={Trash2}
              label="Delete"
              onPress={() => {
                Alert.alert(
                  "Delete entry",
                  "This removes the meal entry from this day.",
                  [
                    {
                      style: "cancel",
                      text: "Cancel",
                    },
                    {
                      onPress: () => {
                        onDelete({
                          mealEntry: selectedMealEntry.mealEntry,
                        });
                      },
                      style: "destructive",
                      text: "Delete",
                    },
                  ]
                );
              }}
            />
            <SheetAction
              icon={Pencil}
              label="Save"
              onPress={() => {
                onRevise({
                  mealEntry: selectedMealEntry.mealEntry,
                  quantityGrams,
                });
              }}
            />
          </View>
        </View>
      )}
    </AppModalSheet>
  );
}

function SheetAction({
  danger = false,
  icon: Icon,
  label,
  onPress,
}: {
  readonly danger?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const contentColor = danger ? color.dangerText : color.actionSheetText;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetAction,
        pressed ? styles.sheetActionPressed : null,
        danger ? styles.sheetActionDanger : null,
      ]}
    >
      <Icon color={contentColor} size={16} strokeWidth={3} />
      <Text style={[styles.sheetActionLabel, { color: contentColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function getDailyLogViewData({
  result,
}: {
  readonly result: DailyLogLoadResult;
}): DailyLogViewData {
  if (result._tag !== "OpenedDay") {
    throw new Error("Expected opened daily log data.");
  }

  return result.data;
}

export function loadDailyLog({
  dateKey,
}: {
  readonly dateKey: string;
}): Promise<DailyLogLoadResult> {
  return RuntimeClient.runPromise(
    Effect.gen(function* () {
      const decodedDateKey = yield* Schema.decodeEffect(DateKey)(dateKey);
      const dailyLogs = yield* DailyLogs;
      const foodsService = yield* Foods;
      const mealEntriesService = yield* MealEntries;
      const day = yield* dailyLogs.open({
        input: {
          dateKey: decodedDateKey,
        },
      });
      const foods = yield* foodsService.list();
      const mealEntries = yield* mealEntriesService.listForDay({
        input: {
          dateKey: day.dailyLog.dateKey,
        },
      });
      const foodUsage = yield* mealEntriesService.listFoodUsage();

      return {
        _tag: "OpenedDay" as const,
        data: {
          day,
          foodUsage,
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
      ),
      Effect.catchTag("SchemaError", () =>
        Effect.succeed({
          _tag: "InvalidDateKey" as const,
        })
      )
    )
  );
}

export function changeDayPlan({
  dateKey,
  planId,
}: {
  readonly dateKey: string;
  readonly planId: string;
}) {
  return RuntimeClient.runPromise(
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs;

      return yield* dailyLogs.changePlan({
        input: {
          dateKey,
          planId,
        },
      });
    })
  );
}

export function reviseMealEntry({
  mealEntry,
  quantityGrams,
}: {
  readonly mealEntry: MealEntry;
  readonly quantityGrams: string;
}) {
  return RuntimeClient.runPromise(
    Effect.gen(function* () {
      const mealEntries = yield* MealEntries;

      return yield* mealEntries.revise({
        input: {
          mealEntryId: mealEntry.id,
          quantityGrams,
        },
      });
    })
  );
}

export function deleteMealEntry({
  mealEntry,
}: {
  readonly mealEntry: MealEntry;
}) {
  return RuntimeClient.runPromise(
    Effect.gen(function* () {
      const mealEntries = yield* MealEntries;

      return yield* mealEntries.delete({
        input: {
          mealEntryId: mealEntry.id,
        },
      });
    })
  );
}

function _calculateEntriesNutrients({
  foods,
  mealEntries,
}: {
  readonly foods: readonly Food[];
  readonly mealEntries: readonly MealEntry[];
}): NutrientTotals {
  return mealEntries.reduce((totals, mealEntry) => {
    const food = _findFoodById({
      foodId: mealEntry.foodId,
      foods,
    });

    if (food === undefined) {
      return totals;
    }

    const nutrients = calculateEntryNutrients({
      food,
      quantityGrams: mealEntry.quantityGrams,
    });

    return addNutrientTotals({
      left: totals,
      right: {
        carbsGrams: nutrients.carbsGrams,
        energyKcal: nutrients.energyKcal,
        fatGrams: nutrients.fatGrams,
        fiberGrams: nutrients.fiberGrams ?? 0,
        proteinGrams: nutrients.proteinGrams,
        saltGrams: nutrients.saltGrams ?? 0,
        saturatedFatGrams: nutrients.saturatedFatGrams ?? 0,
        sugarGrams: nutrients.sugarGrams ?? 0,
      },
    });
  }, emptyNutrientTotals());
}

function _findFoodById({
  foodId,
  foods,
}: {
  readonly foodId: Food["id"];
  readonly foods: readonly Food[];
}) {
  return foods.find((food) => food.id === foodId);
}

function _formatMacroValue({ value }: { readonly value: number }) {
  return formatNumber({
    maximumFractionDigits: value < 10 ? 1 : 0,
    value,
  });
}

function _errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please try again.";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    gap: 0,
    paddingBottom: spacing.xl,
  },
  centeredContent: {
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
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  date: {
    color: color.white,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
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
  dailyProgress: {
    gap: spacing.md,
    marginHorizontal: -spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#222226",
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: color.sheet,
  },
  macroGrid: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  dailyMetric: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  dailyMetricLabel: {
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
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
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
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
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  dailyNutrientGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dailyNutrient: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  dailyNutrientLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
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
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
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
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  mealTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
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
    fontSize: type.size.md,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.md,
  },
  entryDetail: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.medium,
    lineHeight: type.lineHeight.sm,
  },
  entryNumbers: {
    maxWidth: 132,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  entryKcal: {
    color: color.nutritionEnergy,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  entryMacros: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
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
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  mealTotalLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
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
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  mealNutrientValue: {
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  mealNutrientLabel: {
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
  addFoodButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
  },
  addFoodIcon: {
    marginTop: 1,
  },
  addFoodText: {
    color: color.primary,
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
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
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  sheetList: {
    gap: spacing.sm,
  },
  planOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.actionSheetBorder,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: color.actionSheet,
  },
  planOptionSelected: {
    borderColor: color.primary,
    backgroundColor: color.actionSheetPressed,
  },
  planOptionCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  planOptionName: {
    color: color.actionSheetText,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  planOptionMacros: {
    color: color.actionSheetTextMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
  selectedBadge: {
    color: color.primary,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sheetAction: {
    minHeight: 42,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: color.actionSheetBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: color.actionSheet,
  },
  sheetActionPressed: {
    backgroundColor: color.actionSheetPressed,
  },
  sheetActionDanger: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  sheetActionLabel: {
    flexShrink: 1,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
    textAlign: "center",
  },
  entrySheet: {
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: color.text,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  quantityFieldShell: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.sm,
    backgroundColor: color.field,
  },
  quantityField: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: spacing.md,
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  quantityUnit: {
    paddingRight: spacing.md,
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
});
