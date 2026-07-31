import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { formatNumber } from "@/lib/format";
import { MobileMachine } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { BodyWeights, Domain } from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Save, Trash2 } from "lucide-react-native";
import { useMemo } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

const DailyBodyWeightMachineInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const DailyBodyWeightData = {
  dateKey: Domain.DateKey,
  entry: Schema.NullOr(Domain.BodyWeightEntry),
  message: Schema.NullOr(Schema.String),
  weightInput: Schema.String,
} as const;

class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {
  dateKey: DailyBodyWeightData.dateKey,
}) {}

class Idle extends Schema.TaggedClass<Idle>("Idle")(
  "Idle",
  DailyBodyWeightData
) {}

class Saving extends Schema.TaggedClass<Saving>("Saving")(
  "Saving",
  DailyBodyWeightData
) {}

class Deleting extends Schema.TaggedClass<Deleting>("Deleting")(
  "Deleting",
  DailyBodyWeightData
) {}

class Failed extends Schema.TaggedClass<Failed>("Failed")("Failed", {
  dateKey: DailyBodyWeightData.dateKey,
  message: Schema.String,
}) {}

class ChangeWeight extends Schema.TaggedClass<ChangeWeight>("ChangeWeight")(
  "ChangeWeight",
  { value: Schema.String }
) {}

class DeleteWeight extends Schema.TaggedClass<DeleteWeight>("DeleteWeight")(
  "DeleteWeight",
  {}
) {}

class Retry extends Schema.TaggedClass<Retry>("Retry")("Retry", {}) {}

class SaveWeight extends Schema.TaggedClass<SaveWeight>("SaveWeight")(
  "SaveWeight",
  {}
) {}

class WeightLoaded extends Schema.TaggedClass<WeightLoaded>("WeightLoaded")(
  "WeightLoaded",
  { entry: Schema.NullOr(Domain.BodyWeightEntry) }
) {}

class WeightLoadFailed extends Schema.TaggedClass<WeightLoadFailed>(
  "WeightLoadFailed"
)("WeightLoadFailed", {}) {}

class WeightSaved extends Schema.TaggedClass<WeightSaved>("WeightSaved")(
  "WeightSaved",
  { entry: Domain.BodyWeightEntry }
) {}

class WeightValidationFailed extends Schema.TaggedClass<WeightValidationFailed>(
  "WeightValidationFailed"
)("WeightValidationFailed", {}) {}

class WeightSaveFailed extends Schema.TaggedClass<WeightSaveFailed>(
  "WeightSaveFailed"
)("WeightSaveFailed", {}) {}

class WeightDeleted extends Schema.TaggedClass<WeightDeleted>("WeightDeleted")(
  "WeightDeleted",
  {}
) {}

class WeightDeleteFailed extends Schema.TaggedClass<WeightDeleteFailed>(
  "WeightDeleteFailed"
)("WeightDeleteFailed", {}) {}

const DailyBodyWeightStates = Machine.defineStates({
  Deleting,
  Failed,
  Idle,
  Loading,
  Saving,
});

const dailyBodyWeightMachine = Machine.make({
  states: DailyBodyWeightStates.states,
  events: [ChangeWeight, DeleteWeight, Retry, SaveWeight],
  internalEvents: [
    WeightLoaded,
    WeightLoadFailed,
    WeightSaved,
    WeightValidationFailed,
    WeightSaveFailed,
    WeightDeleted,
    WeightDeleteFailed,
  ],
  input: DailyBodyWeightMachineInput,
  initial: ({ dateKey }) =>
    DailyBodyWeightStates.initial.Loading(new Loading({ dateKey })),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invokeEffect({
        id: "loadWeight",
        effect: Effect.gen(function* () {
          const bodyWeights = yield* BodyWeights.BodyWeights;
          return yield* bodyWeights.findByDate({
            input: { dateKey: state.dateKey },
          });
        }),
        onSuccess: (entry) => new WeightLoaded({ entry }),
        onFailure: () => new WeightLoadFailed(),
      }),
    on: {
      WeightLoaded: ({ event, state, target }) =>
        target.full.Idle(
          new Idle({
            dateKey: state.dateKey,
            entry: event.entry,
            message: null,
            weightInput: _entryInput({ entry: event.entry }),
          })
        ),
      WeightLoadFailed: ({ state, target }) =>
        target.full.Failed(
          new Failed({
            dateKey: state.dateKey,
            message: "Could not load the weight for this day.",
          })
        ),
    },
  },
  Idle: {
    on: {
      ChangeWeight: ({ event, state, target }) =>
        target.full.Idle(
          new Idle({
            ...state,
            message: null,
            weightInput: event.value,
          })
        ),
      DeleteWeight: ({ state, target }) =>
        state.entry === null
          ? undefined
          : target.full.Deleting(Machine.retag(Deleting, state)),
      SaveWeight: ({ state, target }) =>
        target.full.Saving(Machine.retag(Saving, state)),
    },
  },
  Saving: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "saveWeight",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const bodyWeights = yield* BodyWeights.BodyWeights;
              const saved = yield* bodyWeights.save({
                input: {
                  dateKey: state.dateKey,
                  weightKilograms: state.weightInput,
                },
              });

              return new WeightSaved({ entry: saved.bodyWeightEntry });
            }).pipe(
              Effect.catchTag("SchemaError", () =>
                Effect.succeed(new WeightValidationFailed())
              ),
              Effect.catch(() => Effect.succeed(new WeightSaveFailed()))
            )
          ),
      }),
    on: {
      WeightSaved: ({ event, state, target }) =>
        target.full.Idle(
          new Idle({
            dateKey: state.dateKey,
            entry: event.entry,
            message: null,
            weightInput: _entryInput({ entry: event.entry }),
          })
        ),
      WeightValidationFailed: ({ state, target }) =>
        target.full.Idle(
          Machine.retag(Idle, state, {
            message: "Enter a positive weight in kilograms.",
          })
        ),
      WeightSaveFailed: ({ state, target }) =>
        target.full.Idle(
          Machine.retag(Idle, state, {
            message: "Could not save this weight.",
          })
        ),
    },
  },
  Deleting: {
    invoke: ({ state }) =>
      Machine.invokeEffect({
        id: "deleteWeight",
        effect: Effect.gen(function* () {
          const bodyWeights = yield* BodyWeights.BodyWeights;
          yield* bodyWeights.delete({
            input: { dateKey: state.dateKey },
          });
        }),
        onSuccess: () => new WeightDeleted(),
        onFailure: () => new WeightDeleteFailed(),
      }),
    on: {
      WeightDeleted: ({ state, target }) =>
        target.full.Idle(
          new Idle({
            dateKey: state.dateKey,
            entry: null,
            message: null,
            weightInput: "",
          })
        ),
      WeightDeleteFailed: ({ state, target }) =>
        target.full.Idle(
          Machine.retag(Idle, state, {
            message: "Could not delete this weight.",
          })
        ),
    },
  },
  Failed: {
    on: {
      Retry: ({ state, target }) =>
        target.full.Loading(new Loading({ dateKey: state.dateKey })),
    },
  },
});

export function DailyBodyWeightInput({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const machineAtom = useMemo(
    () => MobileMachine.make(dailyBodyWeightMachine, { dateKey }),
    [dateKey]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (AsyncResult.isInitial(stateResult)) {
    return (
      <View style={styles.root}>
        <LoadingView message="Loading weight..." />
      </View>
    );
  }

  if (AsyncResult.isFailure(stateResult)) {
    return (
      <View style={styles.root}>
        <Notice
          message="Could not start the body-weight editor."
          tone="warning"
        />
      </View>
    );
  }

  const state = stateResult.value;
  const failed = DailyBodyWeightStates.get(state, "Failed").pipe(
    Option.getOrNull
  );
  const data = Option.firstSomeOf([
    DailyBodyWeightStates.get(state, "Idle"),
    DailyBodyWeightStates.get(state, "Saving"),
    DailyBodyWeightStates.get(state, "Deleting"),
  ]).pipe(Option.getOrNull);
  const isBusy =
    DailyBodyWeightStates.matches(state, "Saving") ||
    DailyBodyWeightStates.matches(state, "Deleting");

  if (DailyBodyWeightStates.matches(state, "Loading")) {
    return (
      <View style={styles.root}>
        <LoadingView message="Loading weight..." />
      </View>
    );
  }

  if (failed !== null) {
    return (
      <View style={styles.root}>
        <Notice message={failed.message} tone="warning" />
        <Button onPress={() => send(new Retry())} variant="secondary">
          Retry weight
        </Button>
      </View>
    );
  }

  if (data === null) {
    return null;
  }

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <NumberField
          accessibilityLabel="Body weight in kilograms"
          editable={!isBusy}
          error={data.message ?? undefined}
          onChangeText={(value) => {
            send(new ChangeWeight({ value }));
          }}
          placeholder="0.00"
          rightElement={<Text style={styles.unit}>kg</Text>}
          style={styles.weightField}
          value={data.weightInput}
        />
        <Button
          accessibilityLabel="Save body weight"
          disabled={isBusy || data.weightInput.trim() === ""}
          icon={Save}
          loading={DailyBodyWeightStates.matches(state, "Saving")}
          onPress={() => send(new SaveWeight())}
          style={styles.saveButton}
        >
          Save
        </Button>
        {data.entry === null ? null : (
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
                    onPress: () => send(new DeleteWeight()),
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
