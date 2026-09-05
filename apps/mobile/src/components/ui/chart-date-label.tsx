import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ChartPressState } from "victory-native";
import { setup } from "xstate";

const SelectedDay = Schema.Struct({ dayIndex: Schema.NullOr(Schema.Number) });

const chartDateMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(SelectedDay),
    events: { select: Schema.toStandardSchemaV1(SelectedDay) },
  },
}).createMachine({
  context: { dayIndex: null },
  on: { select: ({ event }) => ({ context: { dayIndex: event.dayIndex } }) },
});

export function ChartDateLabel({
  pressState,
  rangeLabel,
  style,
}: {
  readonly pressState: Pick<
    ChartPressState<{ x: number; y: Record<string, number> }>,
    "isActive" | "matchedIndex" | "x"
  >;
  readonly rangeLabel: string;
  readonly style: StyleProp<TextStyle>;
}) {
  const [snapshot, , actor] = useMachine(chartDateMachine);
  const select = actor.trigger.select;
  const { isActive, matchedIndex, x } = pressState;
  useAnimatedReaction(
    () => (isActive.value && matchedIndex.value >= 0 ? x.value.value : null),
    (dayIndex, previous) => {
      if (dayIndex !== previous) scheduleOnRN(select, { dayIndex });
    }
  );
  const dayIndex = snapshot.context.dayIndex;
  return (
    <Text style={style}>
      {dayIndex === null
        ? rangeLabel
        : new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(dayIndex * 86_400_000))}
    </Text>
  );
}
