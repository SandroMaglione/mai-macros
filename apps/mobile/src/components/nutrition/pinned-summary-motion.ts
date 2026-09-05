import {
  Easing,
  ReduceMotion,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from "react-native-reanimated";

export function enterPinnedSummary(values: EntryAnimationsValues) {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: -values.targetHeight }] },
    animations: {
      transform: [
        {
          translateY: withTiming(0, {
            duration: 240,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
}

export function exitPinnedSummary(values: ExitAnimationsValues) {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [
        {
          translateY: withTiming(-values.currentHeight, {
            duration: 200,
            easing: Easing.in(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
}
