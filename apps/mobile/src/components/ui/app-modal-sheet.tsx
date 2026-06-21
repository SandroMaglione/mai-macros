import { color, radius, spacing, type } from "@/theme/tokens";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRef, type ReactNode } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AppModalSheetProps = {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly title?: string;
  readonly visible: boolean;
};

export function AppModalSheet({
  children,
  onClose,
  title,
  visible,
}: AppModalSheetProps) {
  const insets = useSafeAreaInsets();
  const presented = useRef(false);

  if (!visible) {
    return null;
  }

  return (
    <BottomSheetModal
      ref={(sheet) => {
        if (sheet === null || presented.current) {
          return;
        }

        presented.current = true;
        sheet.present();
      }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.62}
          pressBehavior="close"
        />
      )}
      backgroundStyle={styles.background}
      enableBlurKeyboardOnGesture
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onAnimate={(...positions) => {
        const [fromIndex, toIndex] = positions;

        if (fromIndex !== -1 && toIndex === -1) {
          Keyboard.dismiss();
        }
      }}
      onDismiss={() => {
        presented.current = false;
        onClose();
      }}
      topInset={insets.top}
    >
      <BottomSheetView
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        {title === undefined ? null : (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>
        )}
        <View style={styles.body}>{children}</View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.actionSheetBorder,
    backgroundColor: color.actionSheet,
  },
  handle: {
    width: 44,
    backgroundColor: color.actionSheetBorder,
  },
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  header: {
    paddingTop: spacing.md,
  },
  title: {
    color: color.white,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  body: {
    paddingTop: spacing.lg,
  },
});
