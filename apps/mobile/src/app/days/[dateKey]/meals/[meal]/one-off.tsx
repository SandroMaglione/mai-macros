import {
  FoodQuickInputTextField,
  FoodQuickInputFeedback,
} from "@/components/nutrition/food-quick-input";
import { OneOffEntryList } from "@/components/nutrition/one-off-entry-list";
import { PagerTabBar } from "@/components/ui/pager-tabs";
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
import { Array, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
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
  const {
    values,
    notice,
    quickInput,
    quickInputIssues,
    historyQuery,
    history,
  } = snapshot.context;
  const isHistory = snapshot.matches("History");
  const historyEntries = history.filter((entry) =>
    `${entry.name} ${entry.amountDescription}`
      .toLocaleLowerCase()
      .includes(historyQuery.trim().toLocaleLowerCase())
  );
  const disabled = !snapshot.matches("Ready");
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <AppScreen
        scroll
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
        topSafeAreaColor={color.header}
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
        {route.mealEntryId === null &&
        (snapshot.matches("Ready") || isHistory) ? (
          <PagerTabBar
            activeIndex={isHistory ? 1 : 0}
            onActiveIndexChange={(index) =>
              index === 1
                ? actor.trigger.showHistory()
                : actor.trigger.showForm()
            }
            tabs={[
              {
                key: "new",
                label: "New entry",
                accessibilityLabel: "New one-off entry",
              },
              {
                key: "past",
                label: "Past entries",
                accessibilityLabel: "Past one-off entries",
              },
            ]}
          />
        ) : null}
        {snapshot.matches("Loading") ? (
          <LoadingView message="Opening meal" />
        ) : null}
        {snapshot.matches("Failure") ? (
          <>
            <Button onPress={() => actor.trigger.retry()}>Try again</Button>
            {notice === null ? null : <Notice message={notice} tone="danger" />}
          </>
        ) : isHistory ? (
          <>
            <Field
              label="Search past entries"
              accessibilityLabel="Search past one-off entries"
              placeholder="Name or amount"
              value={historyQuery}
              onChangeText={(query) => actor.trigger.searchHistory({ query })}
            />
            {snapshot.matches({ History: "Loading" }) ? (
              <LoadingView message="Loading past entries" />
            ) : null}
            {snapshot.matches({ History: "Failure" }) ? (
              <>
                {notice === null ? null : (
                  <Notice message={notice} tone="danger" />
                )}
                <Button onPress={() => actor.trigger.retry()}>Try again</Button>
              </>
            ) : null}
            {snapshot.matches({ History: "Ready" }) ? (
              Array.isReadonlyArrayNonEmpty(historyEntries) ? (
                <OneOffEntryList
                  entries={historyEntries}
                  onSelect={(entry) =>
                    actor.trigger.reuse({ mealEntryId: entry.id })
                  }
                />
              ) : (
                <Text style={styles.empty}>
                  {historyQuery.trim() === ""
                    ? "No past one-off entries yet"
                    : "No matching entries"}
                </Text>
              )
            ) : null}
          </>
        ) : (
          <>
            <FoodQuickInputTextField
              disabled={disabled}
              input={quickInput}
              onChangeText={(input) =>
                actor.trigger.changeQuickInput({ input })
              }
              placeholder="Noodle bowl, 1 bowl, k650 p25 c80 f20"
            />
            <FoodQuickInputFeedback issues={quickInputIssues} />
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
            <View style={styles.sourceActions}>
              <Button
                disabled={disabled}
                variant="secondary"
                style={styles.sourceAction}
                onPress={() =>
                  actor.trigger.allSources({ source: "Estimated" })
                }
              >
                All estimated
              </Button>
              <Button
                disabled={disabled}
                variant="secondary"
                style={styles.sourceAction}
                onPress={() => actor.trigger.allSources({ source: "Recorded" })}
              >
                All recorded
              </Button>
            </View>
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
              disabled={
                disabled ||
                values.name.trim() === "" ||
                Array.isReadonlyArrayNonEmpty(quickInputIssues)
              }
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
  empty: { color: color.textMuted },
  screen: { flex: 1, backgroundColor: color.bg },
  content: { gap: spacing.lg, padding: spacing.lg },
  divider: { height: 1, backgroundColor: color.divider },
  sourceActions: { flexDirection: "row", gap: spacing.sm },
  sourceAction: { flex: 1 },
});
