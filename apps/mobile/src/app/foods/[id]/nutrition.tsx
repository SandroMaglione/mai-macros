import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  FoodNutritionEvents,
  FoodNutritionLoaderEvents,
  FoodNutritionLoaderMachine,
  FoodNutritionMachine,
  FoodNutritionStates,
  nutrientFields,
  nutritionCorrections,
  nutritionDraft,
  type FoodNutritionData,
} from "@/machines/food-nutrition-machine";
import { color, spacing, tokens } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, RotateCcw, Save } from "lucide-react-native";
import { Alert, Keyboard, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export default function FoodNutritionRoute() {
  const params = useSchemaLocalSearchParams(
    Schema.Struct({ id: Domain.FoodId })
  );
  return Option.isNone(params) ? (
    <Redirect href="/foods" />
  ) : (
    <FoodNutritionLoader foodId={params.value.id} />
  );
}

function FoodNutritionLoader({ foodId }: { readonly foodId: Domain.FoodId }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodNutritionLoaderMachine, { foodId })
  );
  const state = snapshot.state;

  return state.path === "Ready" ? (
    <FoodNutritionEditor data={state.value.data} />
  ) : (
    <AppScreen contentStyle={styles.screen} safeAreaEdges={["top"]}>
      <NutritionHeader busy={false} />
      {state.path === "Loading" ? (
        <LoadingView message="Loading food" />
      ) : (
        <View style={styles.body}>
          <Notice message={state.value.message} tone="danger" />
          <Button
            onPress={() => {
              send(FoodNutritionLoaderEvents.Retry());
            }}
          >
            Try again
          </Button>
        </View>
      )}
    </AppScreen>
  );
}

function NutritionHeader({ busy }: { readonly busy: boolean }) {
  return (
    <AppHeader
      embedded
      title="Customize nutrition"
      leading={
        <IconButton
          accessibilityLabel="Back"
          icon={ChevronLeft}
          disabled={busy}
          onPress={() => router.back()}
          variant="ghost"
        />
      }
    />
  );
}

function FoodNutritionEditor({ data }: { readonly data: FoodNutritionData }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodNutritionMachine, data)
  );
  const { food, draft, usage, message } = snapshot.value;
  const busy = FoodNutritionStates.matches(snapshot, "Saving");
  const savedDraft = nutritionDraft(food.nutritionCorrections);
  const hasChanges = nutrientFields.some(
    ({ key }) => draft[key] !== savedDraft[key]
  );
  const hasCorrections = nutrientFields.some(
    ({ key }) => food.nutritionCorrections[key] !== undefined
  );
  const valid = Option.isSome(nutritionCorrections(draft));

  return (
    <AppScreen contentStyle={styles.screen} safeAreaEdges={["top"]}>
      <NutritionHeader busy={busy} />
      {food.origin !== "app-default" ? (
        <View style={styles.body}>
          <Notice
            message="Use Edit food details to update this food."
            tone="neutral"
          />
        </View>
      ) : (
        <>
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            bottomOffset={spacing.lg}
          >
            <View style={styles.heading}>
              <Text style={styles.name}>{food.name}</Text>
              <Text style={styles.muted}>
                Per {food.nutritionReference.amount}{" "}
                {food.nutritionReference.unit}
              </Text>
              <Text style={styles.muted}>
                Blank fields use catalog values. Enter 0 for zero.
              </Text>
              <Text style={styles.muted}>
                {usage.mealEntryCount === 0
                  ? "Applies to future entries."
                  : `Applies to ${usage.mealEntryCount} past ${usage.mealEntryCount === 1 ? "entry" : "entries"} and future entries.`}
              </Text>
            </View>
            <View style={styles.grid}>
              {nutrientFields.map(({ key, label, unit }) => (
                <NumberField
                  key={key}
                  style={styles.field}
                  accessibilityLabel={label}
                  label={label}
                  editable={!busy}
                  value={draft[key]}
                  placeholder={food[key]?.toString() ?? "Unknown"}
                  onChangeText={(value) => {
                    send(FoodNutritionEvents.Change({ field: key, value }));
                  }}
                  rightElement={<Text style={styles.muted}>{unit}</Text>}
                  selectTextOnFocus
                />
              ))}
            </View>
            {!valid ? (
              <Notice
                message="Enter a number of zero or more, or leave the field blank."
                tone="danger"
              />
            ) : null}
            {message === null ? null : (
              <Notice
                message={message}
                tone={hasChanges ? "danger" : "neutral"}
              />
            )}
            {hasCorrections ? (
              <Button
                variant="secondary"
                icon={RotateCcw}
                disabled={busy}
                onPress={() => {
                  Keyboard.dismiss();
                  Alert.alert(
                    "Reset to catalog?",
                    "Restore the original nutrition for all past and future entries using this food.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Reset",
                        onPress: () => {
                          send(FoodNutritionEvents.Reset());
                        },
                      },
                    ]
                  );
                }}
              >
                Reset to catalog
              </Button>
            ) : null}
          </KeyboardAwareScrollView>
          <BottomActionBar>
            <Button
              style={styles.save}
              icon={Save}
              loading={busy}
              disabled={busy || !valid || !hasChanges}
              onPress={() => {
                Keyboard.dismiss();
                send(FoodNutritionEvents.Save());
              }}
            >
              Save nutrition
            </Button>
          </BottomActionBar>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingBottom: 0 },
  scroll: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.xl },
  heading: { gap: spacing.sm },
  name: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.semibold,
  },
  muted: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    lineHeight: tokens.type.lineHeight.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  field: { width: "46%", flexGrow: 1 },
  save: { flex: 1 },
});
