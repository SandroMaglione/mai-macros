import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import { Check, ChevronDown } from "lucide-react-native";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { setup } from "xstate";

export type InputSelectOption<Value extends string> = {
  readonly accessibilityLabel?: string;
  readonly label: string;
  readonly value: Value;
};

const inputSelectDialogMachine = setup({
  schemas: {
    events: {
      close: Schema.toStandardSchemaV1(EmptyEvent),
      open: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Closed: {},
    Open: {},
  },
}).createMachine({
  initial: "Closed",
  states: {
    Closed: {
      on: {
        open: { target: "Open" },
      },
    },
    Open: {
      on: {
        close: { target: "Closed" },
      },
    },
  },
});

export function InputSelect<Value extends string>({
  disabled = false,
  onSelect,
  options,
  selectedValue,
  title,
  variant = "default",
}: {
  readonly disabled?: boolean;
  readonly onSelect: (value: Value) => void;
  readonly options: readonly InputSelectOption<Value>[];
  readonly selectedValue: Value;
  readonly title: string;
  readonly variant?: "default" | "header";
}) {
  const [snapshot, , actor] = useMachine(inputSelectDialogMachine);
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? options[0];
  const close = actor.trigger.close;
  const open = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: options.length,
          options: [...options.map((option) => option.label), "Cancel"],
          title,
          userInterfaceStyle: "dark",
        },
        (buttonIndex) => {
          const option = options[buttonIndex];

          if (option !== undefined) {
            onSelect(option.value);
          }
        }
      );
      return;
    }

    actor.trigger.open();
  };

  return (
    <>
      <Pressable
        accessibilityLabel={
          selectedOption?.accessibilityLabel ??
          `${title}, ${selectedOption?.label ?? selectedValue}`
        }
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={spacing.sm}
        onPress={open}
        style={({ pressed }) => [
          styles.selector,
          variant === "header" ? styles.selectorHeader : null,
          pressed && !disabled
            ? variant === "header"
              ? styles.selectorHeaderPressed
              : styles.selectorPressed
            : null,
          disabled ? styles.selectorDisabled : null,
        ]}
      >
        <Text
          style={[
            styles.selectorLabel,
            variant === "header" ? styles.selectorLabelHeader : null,
          ]}
        >
          {selectedOption?.label ?? selectedValue}
        </Text>
        <ChevronDown
          color={variant === "header" ? color.white : color.textSubtle}
          size={14}
          strokeWidth={3}
        />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={close}
        transparent
        visible={snapshot.matches("Open")}
      >
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={styles.dialogBackdrop}
        >
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <ScrollView
              contentContainerStyle={styles.dialogOptions}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const selected = option.value === selectedValue;

                return (
                  <Pressable
                    accessibilityLabel={
                      option.accessibilityLabel ?? option.label
                    }
                    accessibilityRole="button"
                    key={option.value}
                    onPress={() => {
                      onSelect(option.value);
                      close();
                    }}
                    style={({ pressed }) => [
                      styles.dialogOption,
                      selected ? styles.dialogOptionSelected : null,
                      pressed ? styles.dialogOptionPressed : null,
                    ]}
                  >
                    <Text style={styles.dialogOptionLabel}>{option.label}</Text>
                    {selected ? (
                      <Check color={color.text} size={18} strokeWidth={3} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    minWidth: 56,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
  },
  selectorPressed: {
    backgroundColor: color.surfaceRaised,
  },
  selectorHeader: {
    minWidth: 70,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  selectorHeaderPressed: {
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorLabel: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  selectorLabelHeader: {
    color: color.white,
  },
  dialogBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  dialog: {
    maxHeight: "80%",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.sheet,
  },
  dialogTitle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogOptions: {
    gap: spacing.sm,
  },
  dialogOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  dialogOptionSelected: {
    backgroundColor: color.surfaceRaised,
  },
  dialogOptionPressed: {
    opacity: 0.86,
  },
  dialogOptionLabel: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
});
