import { useMachine } from "@/hooks/use-machine";
import {
  DailyNutritionSummaryEvents,
  DailyNutritionSummaryMachine,
} from "@/machines/daily-nutrition-summary-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { useRef } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

export function useDailyNutritionSummary(initialScrollY: number) {
  const [snapshot, send] = useMachine(() =>
    AtomMachine.make(DailyNutritionSummaryMachine)
  );
  const scrollY = useRef(initialScrollY);
  const summaryBottom = useRef<number | null>(null);
  const pinned = useRef(false);
  const syncPinned = () => {
    const next =
      summaryBottom.current !== null &&
      scrollY.current >= summaryBottom.current;
    if (next !== pinned.current) {
      pinned.current = next;
      send(DailyNutritionSummaryEvents.SetPinned({ pinned: next }));
    }
  };
  return {
    mode: snapshot.value.mode,
    pinned: snapshot.value.pinned,
    nutrient: snapshot.value.nutrient,
    selectNutrient: ({
      nutrient,
    }: {
      readonly nutrient: typeof snapshot.value.nutrient;
    }) => {
      send(DailyNutritionSummaryEvents.SelectNutrient({ nutrient }));
    },
    toggle: () => {
      send(DailyNutritionSummaryEvents.Toggle());
    },
    onSummaryLayout: ({ nativeEvent }: LayoutChangeEvent) => {
      summaryBottom.current = nativeEvent.layout.y + nativeEvent.layout.height;
      syncPinned();
    },
    onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = nativeEvent.contentOffset.y;
      syncPinned();
    },
  };
}
