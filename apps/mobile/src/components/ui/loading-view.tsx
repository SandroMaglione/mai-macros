import { color, spacing, tokens } from "@/theme/tokens";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

type LoadingViewProps = {
  readonly message?: string;
};

type LoadingOverlayProps = LoadingViewProps & {
  readonly visible: boolean;
};

export function LoadingView({ message = "Loading" }: LoadingViewProps) {
  return (
    <View accessibilityRole="progressbar" style={styles.view}>
      <ActivityIndicator color={color.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function LoadingOverlay({ message, visible }: LoadingOverlayProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.overlayPanel}>
          <LoadingView message={message} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  view: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  message: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  overlayPanel: {
    minWidth: 180,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    backgroundColor: color.sheet,
  },
});
