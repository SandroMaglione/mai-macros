import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
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

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close sheet"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={styles.handle} />
          {title === undefined ? null : (
            <Text style={styles.title}>{title}</Text>
          )}
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: color.overlay,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: color.sheet,
    ...shadow.sheet,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
  },
  title: {
    marginTop: spacing.lg,
    color: color.text,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  body: {
    paddingTop: spacing.lg,
  },
});
