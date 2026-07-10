import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { useMachine } from "@xstate/react";
import { Schema } from "effect";
import type { LucideIcon } from "lucide-react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { setup } from "xstate";

const disclosureCardMachine = setup({
  schemas: {
    events: {
      toggle: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Collapsed: {},
    Expanded: {},
  },
}).createMachine({
  initial: "Collapsed",
  states: {
    Collapsed: {
      on: {
        toggle: { target: "Expanded" },
      },
    },
    Expanded: {
      on: {
        toggle: { target: "Collapsed" },
      },
    },
  },
});

export function DisclosureCard({
  children,
  icon: Icon,
  style,
  title,
}: {
  readonly children: ReactNode;
  readonly icon?: LucideIcon;
  readonly style?: StyleProp<ViewStyle>;
  readonly title: string;
}) {
  const [snapshot, , actor] = useMachine(disclosureCardMachine);
  const isExpanded = snapshot.matches("Expanded");
  const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <View style={[styles.root, style]}>
      <Pressable
        accessibilityLabel={`${isExpanded ? "Hide" : "Show"} ${title.toLocaleLowerCase()}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={actor.trigger.toggle}
        style={({ pressed }) => [
          styles.header,
          pressed ? styles.headerPressed : null,
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.icons}>
          {Icon === undefined ? null : (
            <Icon color={color.textSubtle} size={17} strokeWidth={2.6} />
          )}
          <ToggleIcon color={color.textMuted} size={18} strokeWidth={2.8} />
        </View>
      </Pressable>
      {isExpanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    backgroundColor: color.field,
  },
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerPressed: {
    backgroundColor: color.surfaceRaised,
  },
  title: {
    flex: 1,
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  icons: {
    minWidth: 48,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    padding: spacing.lg,
  },
});
