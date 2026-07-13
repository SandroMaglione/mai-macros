import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { BodyWeights, Domain } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { Save, Trash2 } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const DailyBodyWeightMachineInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const DailyBodyWeightContext = Schema.Struct({
  dateKey: Domain.DateKey,
  entry: Schema.NullOr(Domain.BodyWeightEntry),
  message: Schema.NullOr(Schema.String),
  weightInput: Schema.String,
});

const LoadDailyBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadDailyBodyWeightOutput = Schema.Union([
  Schema.TaggedStruct("Loaded", {
    entry: Domain.BodyWeightEntry,
  }),
  Schema.TaggedStruct("NoEntry", {}),
]);

const SaveDailyBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
  weightInput: Schema.String,
});

const SaveDailyBodyWeightOutput = Schema.Union([
  Schema.TaggedStruct("Saved", {
    entry: Domain.BodyWeightEntry,
  }),
  Schema.TaggedStruct("ValidationFailure", {}),
]);

const DeleteDailyBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const dailyBodyWeightMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(DailyBodyWeightContext),
    events: {
      changeWeight: Schema.toStandardSchemaV1(
        Schema.Struct({
          value: Schema.String,
        })
      ),
      deleteWeight: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
      save: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(DailyBodyWeightMachineInput),
  },
  states: {
    Deleting: {},
    Failed: {},
    Idle: {},
    Loading: {},
    Saving: {},
  },
  actorSources: {
    deleteWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(DeleteDailyBodyWeightInput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;

            yield* bodyWeights.delete({
              input: {
                dateKey: input.dateKey,
              },
            });
          })
        ),
    }),
    loadWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(LoadDailyBodyWeightInput),
        output: Schema.toStandardSchemaV1(LoadDailyBodyWeightOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;
            const entry = yield* bodyWeights.findByDate({
              input: {
                dateKey: input.dateKey,
              },
            });

            return Option.fromNullishOr(entry).pipe(
              Option.match({
                onNone: () => ({
                  _tag: "NoEntry" as const,
                }),
                onSome: (loadedEntry) => ({
                  _tag: "Loaded" as const,
                  entry: loadedEntry,
                }),
              })
            );
          })
        ),
    }),
    saveWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SaveDailyBodyWeightInput),
        output: Schema.toStandardSchemaV1(SaveDailyBodyWeightOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;
            const saved = yield* bodyWeights.save({
              input: {
                dateKey: input.dateKey,
                weightKilograms: input.weightInput,
              },
            });

            return {
              _tag: "Saved" as const,
              entry: saved.bodyWeightEntry,
            };
          }).pipe(
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "ValidationFailure" as const,
              })
            )
          )
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.dateKey,
    entry: null,
    message: null,
    weightInput: "",
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ context, event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Loaded: ({ entry }) => ({
                target: "Idle" as const,
                context: {
                  dateKey: context.dateKey,
                  entry,
                  message: null,
                  weightInput: _entryInput({ entry }),
                },
              }),
              NoEntry: () => ({
                target: "Idle" as const,
                context: {
                  dateKey: context.dateKey,
                  entry: null,
                  message: null,
                  weightInput: "",
                },
              }),
            })
          ),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load the weight for this day.",
          },
        },
      },
    },
    Idle: {
      on: {
        changeWeight: ({ event }) => ({
          context: {
            message: null,
            weightInput: event.value,
          },
        }),
        deleteWeight: ({ context }) =>
          context.entry === null
            ? undefined
            : {
                target: "Deleting" as const,
              },
        save: {
          target: "Saving",
        },
      },
    },
    Saving: {
      invoke: {
        src: "saveWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          weightInput: context.weightInput,
        }),
        onDone: ({ context, event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Saved: ({ entry }) => ({
                target: "Idle" as const,
                context: {
                  dateKey: context.dateKey,
                  entry,
                  message: null,
                  weightInput: _entryInput({ entry }),
                },
              }),
              ValidationFailure: () => ({
                target: "Idle" as const,
                context: {
                  message: "Enter a positive weight in kilograms.",
                },
              }),
            })
          ),
        onError: {
          target: "Idle",
          context: {
            message: "Could not save this weight.",
          },
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ context }) => ({
          target: "Idle",
          context: {
            dateKey: context.dateKey,
            entry: null,
            message: null,
            weightInput: "",
          },
        }),
        onError: {
          target: "Idle",
          context: {
            message: "Could not delete this weight.",
          },
        },
      },
    },
    Failed: {
      on: {
        retry: {
          target: "Loading",
          context: {
            message: null,
          },
        },
      },
    },
  },
});

export function DailyBodyWeightInput({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const [snapshot, , actor] = useMachine(dailyBodyWeightMachine, {
    input: {
      dateKey,
    },
  });
  const isBusy =
    snapshot.matches("Loading") ||
    snapshot.matches("Saving") ||
    snapshot.matches("Deleting");

  if (snapshot.matches("Loading")) {
    return (
      <View style={styles.root}>
        <LoadingView message="Loading weight..." />
      </View>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <View style={styles.root}>
        <Notice
          message={
            snapshot.context.message ??
            "Could not load the weight for this day."
          }
          tone="warning"
        />
        <Button onPress={actor.trigger.retry} variant="secondary">
          Retry weight
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <NumberField
          accessibilityLabel="Body weight in kilograms"
          editable={!isBusy}
          error={snapshot.context.message ?? undefined}
          onChangeText={(value) => {
            actor.trigger.changeWeight({ value });
          }}
          placeholder="0.00"
          rightElement={<Text style={styles.unit}>kg</Text>}
          style={styles.weightField}
          value={snapshot.context.weightInput}
        />
        <Button
          accessibilityLabel="Save body weight"
          disabled={isBusy || snapshot.context.weightInput.trim() === ""}
          icon={Save}
          loading={snapshot.matches("Saving")}
          onPress={actor.trigger.save}
          style={styles.saveButton}
        >
          Save
        </Button>
        {snapshot.context.entry === null ? null : (
          <IconButton
            accessibilityLabel="Delete body weight"
            disabled={isBusy}
            icon={Trash2}
            iconColor={color.dangerText}
            iconSize={17}
            onPress={() => {
              Alert.alert(
                "Delete body weight?",
                "This will permanently remove the weight recorded for this day.",
                [
                  {
                    style: "cancel",
                    text: "Cancel",
                  },
                  {
                    onPress: actor.trigger.deleteWeight,
                    style: "destructive",
                    text: "Delete",
                  },
                ]
              );
            }}
            style={styles.deleteButton}
            strokeWidth={3}
          />
        )}
      </View>
    </View>
  );
}

function _entryInput({
  entry,
}: {
  readonly entry: Domain.BodyWeightEntry | null;
}) {
  return entry === null
    ? ""
    : formatNumber({
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        value: entry.weightKilograms,
      });
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    marginHorizontal: -spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: color.sheet,
  },
  controls: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  unit: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
  },
  weightField: {
    minWidth: 0,
    flex: 1,
  },
  saveButton: {
    paddingHorizontal: spacing.md,
  },
  deleteButton: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
});
