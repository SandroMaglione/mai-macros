import { color, radius, spacing, tokens } from "@/theme/tokens";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type NoticeTone = "neutral" | "success" | "danger" | "warning";

type NoticeProps = {
  readonly message: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly title?: string;
  readonly tone?: NoticeTone;
};

export function Notice({
  message,
  style,
  title,
  tone = "neutral",
}: NoticeProps) {
  return (
    <View style={[styles.root, toneStyles[tone], style]}>
      {title === undefined ? null : (
        <Text style={[styles.title, { color: toneText[tone] }]}>{title}</Text>
      )}
      <Text style={[styles.message, { color: toneText[tone] }]}>{message}</Text>
    </View>
  );
}

const toneText: Record<NoticeTone, string> = {
  danger: color.dangerText,
  neutral: color.textMuted,
  success: color.successText,
  warning: color.warningText,
};

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  title: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  message: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
});

const toneStyles = StyleSheet.create({
  neutral: {
    borderColor: color.divider,
    backgroundColor: color.field,
  },
  success: {
    borderColor: color.successBorder,
    backgroundColor: color.successBg,
  },
  danger: {
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  warning: {
    borderColor: color.warningBorder,
    backgroundColor: color.warningBg,
  },
});
