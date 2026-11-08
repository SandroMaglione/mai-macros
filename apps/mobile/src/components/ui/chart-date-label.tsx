import { useMachine } from "@/hooks/use-machine";
import { ChartDateLabelMachine } from "@/machines/chart-date-label-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ChartPressState } from "victory-native";

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
  const [snapshot, send] = useMachine(() =>
    AtomMachine.make(ChartDateLabelMachine)
  );
  const { isActive, matchedIndex, x } = pressState;
  useAnimatedReaction(
    () => (isActive.value && matchedIndex.value >= 0 ? x.value.value : null),
    (dayIndex, previous) => {
      if (dayIndex !== previous)
        scheduleOnRN(send, { _tag: "Select", dayIndex });
    }
  );
  const dayIndex = snapshot.value.dayIndex;
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
