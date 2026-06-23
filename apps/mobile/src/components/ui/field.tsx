import { color, radius, spacing, tokens } from "@/theme/tokens";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

type FieldProps = Omit<TextInputProps, "style"> & {
  readonly error?: string;
  readonly helperText?: string;
  readonly label?: string;
  readonly rightElement?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
};

export function Field({
  error,
  helperText,
  label,
  placeholderTextColor = color.textSubtle,
  rightElement,
  style,
  ...inputProps
}: FieldProps) {
  const supportingText = error ?? helperText;

  return (
    <View style={[styles.root, style]}>
      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputShell,
          error === undefined ? null : styles.inputShellError,
        ]}
      >
        <TextInput
          {...inputProps}
          placeholderTextColor={placeholderTextColor}
          selectionColor={color.primary}
          style={[
            styles.input,
            inputProps.multiline === true ? styles.inputMultiline : null,
          ]}
        />
        {rightElement === undefined ? null : (
          <View style={styles.rightElement}>{rightElement}</View>
        )}
      </View>
      {supportingText === undefined ? null : (
        <Text
          style={[
            styles.supportingText,
            error === undefined ? null : styles.errorText,
          ]}
        >
          {supportingText}
        </Text>
      )}
    </View>
  );
}

export function NumberField(props: FieldProps) {
  return <Field keyboardType="decimal-pad" inputMode="decimal" {...props} />;
}

export function TextArea(props: FieldProps) {
  return <Field multiline textAlignVertical="top" {...props} />;
}

export function SearchField(props: FieldProps) {
  return (
    <Field
      autoCapitalize="none"
      autoCorrect={false}
      inputMode="search"
      returnKeyType="search"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  label: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  inputShell: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.sm,
    backgroundColor: color.field,
  },
  inputShellError: {
    borderColor: color.dangerBorder,
  },
  input: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  inputMultiline: {
    minHeight: 108,
  },
  rightElement: {
    flexShrink: 0,
    paddingRight: spacing.md,
  },
  supportingText: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  errorText: {
    color: color.dangerText,
  },
});
