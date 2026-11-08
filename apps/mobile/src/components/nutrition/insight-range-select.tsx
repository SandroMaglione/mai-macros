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
import { useMachine } from "@/hooks/use-machine";
import {
  InsightRangeEditorEvents,
  InsightRangeEditorMachine,
  InsightRangeEditorStates,
} from "@/machines/insight-range-editor-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Option, Schema } from "effect";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function InsightRangeSelect({
  compact = false,
  rangeDayCount,
  dateRange,
  onSelect,
}: {
  readonly compact?: boolean;
  readonly rangeDayCount: number;
  readonly dateRange: InsightDateRange | null;
  readonly onSelect: (
    rangeDayCount: number,
    dateRange: InsightDateRange | null
  ) => void;
}) {
  const [snapshot, send] = useMachine(() =>
    AtomMachine.make(InsightRangeEditorMachine)
  );
  const editor = snapshot.value;
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
              InsightRangeEditorEvents.Open({
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
      <Modal
        transparent
        visible={InsightRangeEditorStates.matches(snapshot, "Open")}
        animationType="fade"
        onRequestClose={() => {
          send(InsightRangeEditorEvents.Close());
        }}
      >
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
                value={editor.start}
                onChangeText={(value) => {
                  send(InsightRangeEditorEvents.ChangeStart({ value }));
                }}
              />
              <Field
                label="To"
                accessibilityLabel="Range end date"
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                value={editor.end}
                onChangeText={(value) => {
                  send(InsightRangeEditorEvents.ChangeEnd({ value }));
                }}
              />
              <Button
                onPress={() => {
                  const range = Schema.decodeOption(InsightDateRange)({
                    startDateKey: editor.start.trim(),
                    endDateKey: editor.end.trim(),
                  });
                  if (Option.isNone(range)) {
                    send(InsightRangeEditorEvents.Invalid());
                    return;
                  }
                  onSelect(insightRangeDayCount(range.value), range.value);
                  send(InsightRangeEditorEvents.Close());
                }}
              >
                Apply
              </Button>
              {editor.message === null ? null : (
                <Notice message={editor.message} tone="danger" />
              )}
              <Button
                variant="secondary"
                onPress={() => {
                  send(InsightRangeEditorEvents.Close());
                }}
              >
                Cancel
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
