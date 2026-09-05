import { EmptyEvent } from "@mai/machines/schemas";
import { dailySummaryNutrients } from "@/lib/daily-summary-nutrients";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import { useRef } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { setup } from "xstate";

const SummaryNutrient = Schema.Literals(
  dailySummaryNutrients.map(({ name }) => name)
);

export const dailyNutritionSummaryMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        mode: Schema.Literals(["consumed", "remaining"]),
        pinned: Schema.Boolean,
        nutrient: SummaryNutrient,
      })
    ),
    events: {
      toggle: Schema.toStandardSchemaV1(EmptyEvent),
      selectNutrient: Schema.toStandardSchemaV1(
        Schema.Struct({ nutrient: SummaryNutrient })
      ),
      setPinned: Schema.toStandardSchemaV1(
        Schema.Struct({ pinned: Schema.Boolean })
      ),
    },
  },
}).createMachine({
  context: { mode: "consumed", pinned: false, nutrient: "energyKcal" },
  on: {
    toggle: ({ context }) => ({
      context: { mode: context.mode === "consumed" ? "remaining" : "consumed" },
    }),
    setPinned: ({ event }) => ({ context: { pinned: event.pinned } }),
    selectNutrient: ({ event }) => ({ context: { nutrient: event.nutrient } }),
  },
});

export function useDailyNutritionSummary(initialScrollY: number) {
  const [snapshot, , actor] = useMachine(dailyNutritionSummaryMachine);
  const scrollY = useRef(initialScrollY);
  const summaryBottom = useRef<number | null>(null);
  const pinned = useRef(false);
  const syncPinned = () => {
    const next =
      summaryBottom.current !== null &&
      scrollY.current >= summaryBottom.current;
    if (next !== pinned.current) {
      pinned.current = next;
      actor.trigger.setPinned({ pinned: next });
    }
  };
  return {
    mode: snapshot.context.mode,
    pinned: snapshot.context.pinned,
    nutrient: snapshot.context.nutrient,
    selectNutrient: actor.trigger.selectNutrient,
    toggle: actor.trigger.toggle,
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
