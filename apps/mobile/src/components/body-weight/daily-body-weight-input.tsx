import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { useMachine } from "@/hooks/use-machine";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  DailyBodyWeightEvents,
  DailyBodyWeightMachine,
  DailyBodyWeightStates,
} from "@/machines/daily-body-weight-machine";
import { color, spacing, tokens } from "@/theme/tokens";
import type * as Domain from "@mai/nutrition/domain";
import { Save, Trash2 } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";

export function DailyBodyWeightInput({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(DailyBodyWeightMachine, { dateKey })
  );
  const isBusy =
    DailyBodyWeightStates.matches(snapshot, "Loading") ||
    DailyBodyWeightStates.matches(snapshot, "Saving") ||
    DailyBodyWeightStates.matches(snapshot, "Deleting");

  if (DailyBodyWeightStates.matches(snapshot, "Loading")) {
    return (
      <View style={styles.root}>
        <LoadingView message="Loading weight..." />
      </View>
    );
  }

  if (DailyBodyWeightStates.matches(snapshot, "Failed")) {
    return (
      <View style={styles.root}>
        <Notice
          message={
            snapshot.value.message ?? "Could not load the weight for this day."
          }
          tone="warning"
        />
        <Button
          onPress={() => {
            send(DailyBodyWeightEvents.Retry());
          }}
          variant="secondary"
        >
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
          error={snapshot.value.message ?? undefined}
          onChangeText={(value) => {
            send(DailyBodyWeightEvents.ChangeWeight({ value }));
          }}
          placeholder="0.00"
          rightElement={<Text style={styles.unit}>kg</Text>}
          style={styles.weightField}
          value={snapshot.value.weightInput}
        />
        <Button
          accessibilityLabel="Save body weight"
          disabled={isBusy || snapshot.value.weightInput.trim() === ""}
          icon={Save}
          loading={DailyBodyWeightStates.matches(snapshot, "Saving")}
          onPress={() => {
            send(DailyBodyWeightEvents.Save());
          }}
          style={styles.saveButton}
        >
          Save
        </Button>
        {snapshot.value.entry === null ? null : (
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
                    onPress: () => {
                      send(DailyBodyWeightEvents.DeleteWeight());
                    },
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
    fontWeight: tokens.type.weight.semibold,
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
