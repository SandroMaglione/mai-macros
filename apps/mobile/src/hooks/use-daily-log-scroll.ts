import type { Domain } from "@mai/nutrition";
import { HashMap, Option } from "effect";
import { useRef } from "react";
import type { ScrollViewProps } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";

let positions = HashMap.empty<Domain.DateKey, number>();

export function useDailyLogScroll(dateKey: Domain.DateKey) {
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const initialOffset = useRef({
    x: 0,
    y: Option.getOrElse(HashMap.get(positions, dateKey), () => 0),
  });
  const dragging = useRef(false);
  const restored = useRef(false);

  return {
    scrollRef,
    scrollProps: {
      contentOffset: initialOffset.current,
      scrollEventThrottle: 16,
      onContentSizeChange: (_width, height) => {
        if (!restored.current && height > 0 && scrollRef.current !== null) {
          restored.current = true;
          if (!dragging.current && initialOffset.current.y > 0) {
            scrollRef.current.scrollTo({
              ...initialOffset.current,
              animated: false,
            });
          }
        }
      },
      onScrollBeginDrag: () => {
        dragging.current = true;
      },
      onScroll: ({ nativeEvent }) => {
        if (dragging.current) {
          positions = HashMap.set(
            positions,
            dateKey,
            Math.max(0, nativeEvent.contentOffset.y)
          );
        }
      },
    } satisfies ScrollViewProps,
  };
}
