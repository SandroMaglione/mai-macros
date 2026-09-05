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
import { EmptyEvent } from "@mai/machines/schemas";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { setup } from "xstate";

const rangeEditorMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        open: Schema.Boolean,
        start: Schema.String,
        end: Schema.String,
        message: Schema.NullOr(Schema.String),
      })
    ),
    events: {
      open: Schema.toStandardSchemaV1(
        Schema.Struct({ start: Schema.String, end: Schema.String })
      ),
      close: Schema.toStandardSchemaV1(EmptyEvent),
      start: Schema.toStandardSchemaV1(Schema.Struct({ value: Schema.String })),
      end: Schema.toStandardSchemaV1(Schema.Struct({ value: Schema.String })),
      invalid: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
}).createMachine({
  context: { open: false, start: "", end: "", message: null },
  on: {
    open: ({ event }) => ({
      context: {
        open: true,
        start: event.start,
        end: event.end,
        message: null,
      },
    }),
    close: () => ({ context: { open: false } }),
    start: ({ event }) => ({ context: { start: event.value, message: null } }),
    end: ({ event }) => ({ context: { end: event.value, message: null } }),
    invalid: () => ({
      context: {
        message: "Enter valid dates as YYYY-MM-DD, with From on or before To.",
      },
    }),
  },
});

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
  const [snapshot, , actor] = useMachine(rangeEditorMachine);
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
            actor.trigger.open({
              start:
                dateRange?.startDateKey ??
                shiftDateKey({ dateKey: end, days: -(rangeDayCount - 1) }),
              end,
            });
          } else if (value === "7" || value === "30" || value === "90") {
            onSelect(Number(value), null);
          }
        }}
      />
      <Modal
        transparent
        visible={snapshot.context.open}
        animationType="fade"
        onRequestClose={actor.trigger.close}
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
                value={snapshot.context.start}
                onChangeText={(value) => actor.trigger.start({ value })}
              />
              <Field
                label="To"
                accessibilityLabel="Range end date"
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                value={snapshot.context.end}
                onChangeText={(value) => actor.trigger.end({ value })}
              />
              <Button
                onPress={() => {
                  const range = Schema.decodeOption(InsightDateRange)({
                    startDateKey: snapshot.context.start.trim(),
                    endDateKey: snapshot.context.end.trim(),
                  });
                  if (Option.isNone(range)) {
                    actor.trigger.invalid();
                    return;
                  }
                  onSelect(insightRangeDayCount(range.value), range.value);
                  actor.trigger.close();
                }}
              >
                Apply
              </Button>
              {snapshot.context.message === null ? null : (
                <Notice message={snapshot.context.message} tone="danger" />
              )}
              <Button variant="secondary" onPress={actor.trigger.close}>
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
