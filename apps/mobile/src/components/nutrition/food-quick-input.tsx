import { TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Array } from "effect";
import { spacing } from "@/theme/tokens";
import { StyleSheet, View } from "react-native";

export function FoodQuickInputTextField({
  disabled,
  input,
  onChangeText,
  placeholder = "Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1",
}: {
  readonly disabled: boolean;
  readonly input: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
}) {
  return (
    <TextArea
      autoCapitalize="sentences"
      autoCorrect={false}
      editable={!disabled}
      label="Food text"
      onChangeText={onChangeText}
      placeholder={placeholder}
      returnKeyType="default"
      value={input}
    />
  );
}

export function FoodQuickInputFeedback({
  issues,
}: {
  readonly issues: readonly string[];
}) {
  if (!Array.isReadonlyArrayNonEmpty(issues)) return null;
  return (
    <View style={styles.notices}>
      {issues.map((message, index) => (
        <Notice key={`${index}:${message}`} message={message} tone="danger" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  notices: { gap: spacing.sm },
});
