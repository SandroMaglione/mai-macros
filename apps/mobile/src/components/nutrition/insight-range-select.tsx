import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InputSelect } from "@/components/ui/input-select";
import { Notice } from "@/components/ui/notice";
import { shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { color, radius, spacing } from "@/theme/tokens";
import {
  InsightDateRange,
  insightRangeDayCount,
} from "@mai/machines/insight-range";
import { useAtomSet, useAtomSuspense } from "@effect/atom-react";
import {
  RangeEditorEvents,
  rangeEditorMachine,
} from "@/lib/range-editor-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import {
  createMachineContext,
  MachineState,
} from "@typeonce/effect-machine-react";
import { Suspense } from "react";
import { Option, Schema } from "effect";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const RangeEditor = createMachineContext(
  AtomMachine.factory(rangeEditorMachine)
);

type InsightRangeSelectProps = {
  readonly compact?: boolean;
  readonly rangeDayCount: number;
  readonly dateRange: InsightDateRange | null;
  readonly onSelect: (
    rangeDayCount: number,
    dateRange: InsightDateRange | null
  ) => void;
};

export function InsightRangeSelect(props: InsightRangeSelectProps) {
  return (
    <RangeEditor.Provider>
      <Suspense fallback={null}>
        <InsightRangeSelectContent {...props} />
      </Suspense>
    </RangeEditor.Provider>
  );
}

function InsightRangeSelectContent({
  compact = false,
  rangeDayCount,
  dateRange,
  onSelect,
}: InsightRangeSelectProps) {
  const machine = RangeEditor.useMachine();
  const send = useAtomSet(machine.send);
  return (
    <>
      <InputSelect
        title="Report range"
        selectedValue={dateRange === null ? String(rangeDayCount) : "custom"}
        triggerLabel={
          dateRange === null
            ? undefined
            : compact
              ? "Custom"
              : `${dateRange.startDateKey} – ${dateRange.endDateKey}`
        }
        options={[
          { label: "7 days", value: "7" },
          { label: "30 days", value: "30" },
          { label: "90 days", value: "90" },
          { label: "Custom range…", value: "custom" },
        ]}
        onSelect={(value) => {
          if (value === "custom") {
            const end = dateRange?.endDateKey ?? todayDateKey();
            send(
              RangeEditorEvents.open({
                start:
                  dateRange?.startDateKey ??
                  shiftDateKey({ dateKey: end, days: -(rangeDayCount - 1) }),
                end,
              })
            );
          } else if (value === "7" || value === "30" || value === "90") {
            onSelect(Number(value), null);
          }
        }}
      />
      <RangeEditorDialog onSelect={onSelect} />
    </>
  );
}

function RangeEditorDialog({
  onSelect,
}: Pick<InsightRangeSelectProps, "onSelect">) {
  const machine = RangeEditor.useMachine();
  const send = useAtomSet(machine.send);
  const open = useAtomSuspense(AtomMachine.matches(machine, "Open")).value;
  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={() => send(RangeEditorEvents.close())}
    >
      <MachineState machine={machine} path="Open">
        {({ value: draft }) => (
          <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
            <ScrollView
              contentContainerStyle={styles.backdrop}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.dialog}>
                <Text style={styles.title}>Custom range</Text>
                <Field
                  label="From"
                  accessibilityLabel="Range start date"
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  value={draft.start}
                  onChangeText={(value) =>
                    send(RangeEditorEvents.start({ value }))
                  }
                />
                <Field
                  label="To"
                  accessibilityLabel="Range end date"
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  value={draft.end}
                  onChangeText={(value) =>
                    send(RangeEditorEvents.end({ value }))
                  }
                />
                <Button
                  onPress={() => {
                    const range = Schema.decodeOption(InsightDateRange)({
                      startDateKey: draft.start.trim(),
                      endDateKey: draft.end.trim(),
                    });
                    if (Option.isNone(range)) {
                      send(RangeEditorEvents.invalid());
                      return;
                    }
                    onSelect(insightRangeDayCount(range.value), range.value);
                    send(RangeEditorEvents.close());
                  }}
                >
                  Apply
                </Button>
                {draft.message === null ? null : (
                  <Notice message={draft.message} tone="danger" />
                )}
                <Button
                  variant="secondary"
                  onPress={() => send(RangeEditorEvents.close())}
                >
                  Cancel
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </MachineState>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: "#00000099" },
  backdrop: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: color.sheet,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: color.text, fontSize: 18, fontWeight: "600" },
});
