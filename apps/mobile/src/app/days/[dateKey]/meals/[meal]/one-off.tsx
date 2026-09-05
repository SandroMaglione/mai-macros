import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field, NumberField, TextArea } from "@/components/ui/field";
import { AppHeader } from "@/components/ui/mai-header";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { InputSelect } from "@/components/ui/input-select";
import { LoadingView } from "@/components/ui/loading-view";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { oneOffEntryMachine, OneOffRoute } from "@/lib/one-off-entry-machine";
import { nutrientLabels } from "@/lib/nutrient-quality";
import { color, spacing } from "@/theme/tokens";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { Domain, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Alert, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

const RouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Schema.optional(Domain.MealEntryId),
});
export default function OneOffScreen() {
  const params = useSchemaLocalSearchParams(RouteParams);
  if (Option.isNone(params)) return <Redirect href="/" />;
  return (
    <OneOffForm
      route={{ ...params.value, mealEntryId: params.value.mealEntryId ?? null }}
    />
  );
}
function OneOffForm({ route }: { readonly route: typeof OneOffRoute.Type }) {
  const [snapshot, , actor] = useMachine(oneOffEntryMachine, { input: route });
  const { values, notice } = snapshot.context;
  const disabled = !snapshot.matches("Ready");
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <AppScreen
        scroll
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
        topSafeAreaColor={color.primary}
      >
        <AppHeader
          embedded
          title={
            route.mealEntryId === null ? "One-off entry" : "Edit one-off entry"
          }
          leading={
            <IconButton
              icon={ChevronLeft}
              accessibilityLabel="Back to day"
              variant="ghost"
              onPress={() =>
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: { dateKey: route.dateKey },
                })
              }
            />
          }
        />
        {snapshot.matches("Loading") ? (
          <LoadingView message="Opening meal" />
        ) : null}
        {snapshot.matches("Failure") ? (
          <>
            <Button onPress={() => actor.trigger.retry()}>Try again</Button>
            {notice === null ? null : <Notice message={notice} tone="danger" />}
          </>
        ) : (
          <>
            <Field
              label="Name"
              accessibilityLabel="One-off name"
              value={values.name}
              editable={!disabled}
              onChangeText={(value) =>
                actor.trigger.text({ field: "name", value })
              }
              placeholder="Restaurant noodle bowl"
            />
            <Field
              label="Amount eaten · optional"
              accessibilityLabel="Amount eaten"
              value={values.amountDescription}
              editable={!disabled}
              onChangeText={(value) =>
                actor.trigger.text({ field: "amountDescription", value })
              }
              placeholder="1 bowl, half a plate…"
            />
            <View style={styles.divider} />
            {Reporting.NutrientNames.map((field) => (
              <NumberField
                key={field}
                label={nutrientLabels[field]}
                labelStyle={{ color: nutrientFieldColors[field] }}
                accessibilityLabel={`One-off ${nutrientLabels[field]}`}
                value={values.nutrients[field].value}
                placeholder="—"
                editable={!disabled}
                onChangeText={(value) =>
                  actor.trigger.nutrient({ field, value })
                }
                rightElement={
                  <InputSelect
                    title={`${nutrientLabels[field]} source`}
                    disabled={disabled}
                    selectedValue={values.nutrients[field].source}
                    triggerLabel={
                      values.nutrients[field].source === "Estimated" ? "≈" : "="
                    }
                    options={[
                      { label: "Estimated", value: "Estimated" },
                      { label: "Recorded", value: "Recorded" },
                    ]}
                    onSelect={(source) => {
                      if (source === "Estimated" || source === "Recorded")
                        actor.trigger.source({ field, source });
                    }}
                  />
                }
              />
            ))}
            <TextArea
              label="Note · optional"
              accessibilityLabel="One-off note"
              value={values.note}
              editable={!disabled}
              onChangeText={(value) =>
                actor.trigger.text({ field: "note", value })
              }
            />
            <Button
              disabled={disabled || values.name.trim() === ""}
              loading={snapshot.matches("Saving")}
              onPress={() => actor.trigger.save()}
            >
              {route.mealEntryId === null ? "Add to meal" : "Save entry"}
            </Button>
            {notice === null ? null : <Notice message={notice} tone="danger" />}
            {route.mealEntryId === null ? null : (
              <Button
                variant="secondary"
                disabled={disabled}
                onPress={() =>
                  Alert.alert(
                    "Delete entry",
                    "Remove this one-off entry from the diary?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => actor.trigger.delete(),
                      },
                    ]
                  )
                }
              >
                Delete entry
              </Button>
            )}
          </>
        )}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { gap: spacing.lg, padding: spacing.lg },
  divider: { height: 1, backgroundColor: color.divider },
});
