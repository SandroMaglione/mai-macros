import {
  AppModalSheet,
  AppScreen,
  BottomActionBar,
  Button,
  IconButton,
  LoadingOverlay,
  LoadingView,
  Notice,
} from "@/components/ui";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatDateTitle, formatNumber } from "@/lib/format";
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
  },
  {
    color: color.nutritionProtein,
    key: "proteinGrams",
    label: "Protein",
    targetKey: "proteinTargetGrams",
  },
  {
    color: color.nutritionFat,
    key: "fatGrams",
    label: "Fat",
    targetKey: "fatTargetGrams",
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

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        scroll
        scrollProps={{
          contentInsetAdjustmentBehavior: "never",
        }}
      >
        <View style={styles.header}>
          <IconButton
            accessibilityLabel="Previous day"
            glyph="<"
            onPress={() => {
              router.push({
                pathname: "/days/[dateKey]",
                params: {
                  dateKey: previousDateKey,
                },
              });
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push("/");
            }}
            style={styles.dateButton}
          >
            <Text style={styles.dateEyebrow}>Daily log</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.date}>
              {formatDateTitle({ dateKey: data.day.dailyLog.dateKey })}
            </Text>
          </Pressable>
          <IconButton
            accessibilityLabel="Next day"
            glyph=">"
            onPress={() => {
              router.push({
                pathname: "/days/[dateKey]",
                params: {
                  dateKey: nextDateKey,
                },
              });
            }}
          />
        </View>

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

      <BottomActionBar>
        <BottomAction
          glyph="S"
          label="Stats"
          onPress={() => {
            router.push("/insights");
          }}
        />
        <BottomAction
          glyph="P"
          label="Plans"
          onPress={() => {
            actor.send({
              sheet: "plans",
              type: "openSheet",
            });
          }}
        />
        <BottomAction
          glyph="F"
          label="Foods"
          onPress={() => {
            actor.send({
              sheet: "foods",
              type: "openSheet",
            });
          }}
        />
        <BottomAction
          glyph="B"
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
    <View style={styles.progressPanel}>
      <View style={styles.planHeader}>
        <View style={styles.planCopy}>
          <Text style={styles.panelEyebrow}>Active plan</Text>
          <Text numberOfLines={1} style={styles.panelTitle}>
            {plan.name}
          </Text>
        </View>
        <View style={styles.energyBadge}>
          <Text style={styles.energyValue}>
            {_formatMacroValue({ value: nutrients.energyKcal })}
          </Text>
          <Text style={styles.energyUnit}>kcal</Text>
        </View>
      </View>

      <NutrientProgress
        colorValue={color.nutritionEnergy}
        label="Energy"
        target={targetEnergyKcal}
        unit="kcal"
        value={nutrients.energyKcal}
      />

      <View style={styles.macroGrid}>
        {macroProgress.map((macro) => (
          <NutrientProgress
            colorValue={macro.color}
            compact
            key={macro.key}
            label={macro.label}
            target={plan[macro.targetKey]}
            unit="g"
            value={nutrients[macro.key]}
          />
        ))}
      </View>

      <View style={styles.secondaryNutrients}>
        <SecondaryNutrient
          label="Fiber"
          target={plan.fiberTargetGrams}
          value={nutrients.fiberGrams}
        />
        <SecondaryNutrient
          label="Sugar"
          target={plan.sugarTargetGrams}
          value={nutrients.sugarGrams}
        />
        <SecondaryNutrient
          label="Sat fat"
          target={plan.saturatedFatTargetGrams}
          value={nutrients.saturatedFatGrams}
        />
        <SecondaryNutrient
          label="Salt"
          target={plan.saltTargetGrams}
          value={nutrients.saltGrams}
        />
      </View>
    </View>
  );
}

function NutrientProgress({
  colorValue,
  compact = false,
  label,
  target,
  unit,
  value,
}: {
  readonly colorValue: string;
  readonly compact?: boolean;
  readonly label: string;
  readonly target: number;
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  const progress = target <= 0 ? (value > 0 ? 1 : 0) : value / target;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const isAboveTarget = value > target;

  return (
    <View style={compact ? styles.compactProgress : styles.progressBlock}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text
          numberOfLines={1}
          style={[
            styles.progressValue,
            { color: isAboveTarget ? color.primary : colorValue },
          ]}
        >
          {_formatMacroValue({ value })} /{" "}
          {_formatMacroValue({ value: target })} {unit}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: isAboveTarget ? color.primary : colorValue,
              width: `${clampedProgress * 100}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

function SecondaryNutrient({
  label,
  target,
  value,
}: {
  readonly label: string;
  readonly target: number | undefined;
  readonly value: number;
}) {
  const valueLabel =
    target === undefined
      ? `${_formatMacroValue({ value })}g`
      : `${_formatMacroValue({ value })}/${_formatMacroValue({
          value: target,
        })}g`;

  return (
    <View style={styles.secondaryNutrient}>
      <Text numberOfLines={1} style={styles.secondaryLabel}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.secondaryValue}>
        {valueLabel}
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
        <Text style={styles.mealKcal}>
          {_formatMacroValue({ value: nutrients.energyKcal })} kcal
        </Text>
      </View>

      <MealMacroStripe nutrients={nutrients} />

      <View style={styles.mealEntries}>
        {!EffectArray.isReadonlyArrayNonEmpty(mealEntries) ? (
          <Text style={styles.emptyMeal}>No entries yet</Text>
        ) : (
          mealEntries.map((mealEntry) => {
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
          })
        )}
      </View>

      <View style={styles.mealTotals}>
        <Text style={styles.mealTotalText}>
          C {_formatMacroValue({ value: nutrients.carbsGrams })}g
        </Text>
        <Text style={styles.mealTotalText}>
          P {_formatMacroValue({ value: nutrients.proteinGrams })}g
        </Text>
        <Text style={styles.mealTotalText}>
          F {_formatMacroValue({ value: nutrients.fatGrams })}g
        </Text>
      </View>

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
        <Text style={styles.addFoodText}>+ Add food</Text>
      </Pressable>
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

function BottomAction({
  glyph,
  label,
  onPress,
}: {
  readonly glyph: string;
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
      <Text style={styles.bottomGlyph}>{glyph}</Text>
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
        <Button
          onPress={() => {
            router.push({
              pathname: "/plans/[planId]/edit",
              params: {
                dateKey: data.day.dailyLog.dateKey,
                planId: data.day.selectedPlan.id,
              },
            });
          }}
          style={styles.sheetAction}
          variant="secondary"
        >
          Edit
        </Button>
        <Button
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: data.day.dailyLog.dateKey,
              },
            });
          }}
          style={styles.sheetAction}
        >
          New
        </Button>
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
        <Button
          onPress={() => {
            router.push({
              pathname: "/foods/new",
              params: {
                dateKey,
              },
            });
          }}
          style={styles.sheetAction}
        >
          Create
        </Button>
        <Button
          onPress={() => {
            router.push({
              pathname: "/foods/edit",
              params: {
                dateKey,
              },
            });
          }}
          style={styles.sheetAction}
          variant="secondary"
        >
          Edit
        </Button>
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
      <Button
        onPress={() => {
          router.push("/backup" as RelativePathString);
        }}
        variant="secondary"
      >
        Open backup
      </Button>
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
            <Button
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
              style={styles.sheetAction}
              variant="danger"
            >
              Delete
            </Button>
            <Button
              onPress={() => {
                onRevise({
                  mealEntry: selectedMealEntry.mealEntry,
                  quantityGrams,
                });
              }}
              style={styles.sheetAction}
            >
              Save
            </Button>
          </View>
        </View>
      )}
    </AppModalSheet>
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
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  centeredContent: {
    justifyContent: "center",
  },
  retryButton: {
    marginTop: spacing.lg,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dateButton: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dateEyebrow: {
    color: color.textSubtle,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  date: {
    color: color.text,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  progressPanel: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  planCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  panelEyebrow: {
    color: color.textSubtle,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  panelTitle: {
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  energyBadge: {
    minWidth: 78,
    alignItems: "flex-end",
  },
  energyValue: {
    color: color.nutritionEnergy,
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
  energyUnit: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  progressBlock: {
    gap: spacing.xs,
  },
  compactProgress: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  progressLabelRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressLabel: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  progressValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  progressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: color.progressTrack,
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  macroGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  secondaryNutrients: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryNutrient: {
    minWidth: 0,
    flex: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: color.field,
  },
  secondaryLabel: {
    color: color.textSubtle,
    fontSize: 11,
    fontWeight: type.weight.black,
    lineHeight: 14,
  },
  secondaryValue: {
    color: color.text,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  meals: {
    gap: spacing.lg,
  },
  mealCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
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
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  mealKcal: {
    color: color.nutritionEnergy,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
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
  emptyMeal: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: color.textSubtle,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  mealEntryRow: {
    minHeight: 62,
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
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  entryDetail: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.medium,
    lineHeight: type.lineHeight.xs,
  },
  entryNumbers: {
    maxWidth: 132,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  entryKcal: {
    color: color.nutritionEnergy,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  entryMacros: {
    color: color.textMuted,
    fontSize: 11,
    fontWeight: type.weight.black,
    lineHeight: 14,
  },
  mealTotals: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  mealTotalText: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  addFoodButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
  },
  addFoodText: {
    color: color.primary,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  bottomAction: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  bottomGlyph: {
    color: color.primary,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  bottomLabel: {
    color: color.text,
    fontSize: 11,
    fontWeight: type.weight.black,
    lineHeight: 14,
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
    borderColor: color.divider,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  planOptionSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  planOptionCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  planOptionName: {
    color: color.text,
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  planOptionMacros: {
    color: color.textMuted,
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
    flex: 1,
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
