import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, RotateCcw, Save } from "lucide-react-native";
import { Alert, Keyboard, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { createAsyncLogic, setup } from "xstate";

const nutrientFields = [
  { key: "energyKcal", label: "Calories", unit: "kcal" },
  { key: "carbsGrams", label: "Carbs", unit: "g" },
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "fatGrams", label: "Fat", unit: "g" },
  { key: "fiberGrams", label: "Fiber", unit: "g" },
  { key: "sugarGrams", label: "Sugar", unit: "g" },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g" },
  { key: "saltGrams", label: "Salt", unit: "g" },
] as const;

const Draft = Schema.Struct({
  energyKcal: Schema.String,
  carbsGrams: Schema.String,
  proteinGrams: Schema.String,
  fatGrams: Schema.String,
  fiberGrams: Schema.String,
  sugarGrams: Schema.String,
  saturatedFatGrams: Schema.String,
  saltGrams: Schema.String,
});

function _draft(
  corrections: Domain.FoodNutritionCorrections
): typeof Draft.Type {
  return {
    energyKcal: corrections.energyKcal?.toString() ?? "",
    carbsGrams: corrections.carbsGrams?.toString() ?? "",
    proteinGrams: corrections.proteinGrams?.toString() ?? "",
    fatGrams: corrections.fatGrams?.toString() ?? "",
    fiberGrams: corrections.fiberGrams?.toString() ?? "",
    sugarGrams: corrections.sugarGrams?.toString() ?? "",
    saturatedFatGrams: corrections.saturatedFatGrams?.toString() ?? "",
    saltGrams: corrections.saltGrams?.toString() ?? "",
  };
}

function _corrections(draft: typeof Draft.Type) {
  return Schema.decodeOption(Domain.FoodNutritionCorrections)(
    Object.fromEntries(
      nutrientFields.flatMap(({ key }) => {
        const value = draft[key].trim().replace(",", ".");
        return value === "" ? [] : [[key, Number(value)]];
      })
    )
  );
}

const Context = Schema.Struct({
  foodId: Domain.FoodId,
  food: Schema.NullOr(Domain.Food),
  draft: Draft,
  usage: Schema.NullOr(Foods.FoodEditUsage),
  message: Schema.NullOr(Schema.String),
});
const FoodInput = Schema.Struct({ foodId: Domain.FoodId });
const SaveInput = Schema.Struct({
  foodId: Domain.FoodId,
  corrections: Domain.FoodNutritionCorrections,
});

const nutritionEditorMachine = setup({
  schemas: {
    input: Schema.toStandardSchemaV1(FoodInput),
    context: Schema.toStandardSchemaV1(Context),
    events: {
      change: Schema.toStandardSchemaV1(
        Schema.Struct({
          field: Schema.Literals(nutrientFields.map(({ key }) => key)),
          value: Schema.String,
        })
      ),
      save: Schema.toStandardSchemaV1(EmptyEvent),
      reset: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  actorSources: {
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(FoodInput),
        output: Schema.toStandardSchemaV1(
          Schema.Struct({ food: Domain.Food, usage: Foods.FoodEditUsage })
        ),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return {
              food: yield* foods.get({ input }),
              usage: yield* foods.inspectEdit({ input }),
            };
          })
        ),
    }),
    save: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SaveInput),
        output: Schema.toStandardSchemaV1(Domain.Food),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return yield* foods.setNutritionCorrections({ input });
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    foodId: input.foodId,
    food: null,
    draft: _draft({}),
    usage: null,
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ foodId: context.foodId }),
        onDone: ({ event }) => ({
          target: "Editing",
          context: {
            food: event.output.food,
            usage: event.output.usage,
            draft: _draft(event.output.food.nutritionCorrections),
          },
        }),
        onError: {
          target: "Failed",
          context: { message: "Could not load this food." },
        },
      },
    },
    Failed: {
      on: { retry: { target: "Loading", context: { message: null } } },
    },
    Editing: {
      on: {
        change: ({ context, event }) => ({
          context: {
            draft: { ...context.draft, [event.field]: event.value },
            message: null,
          },
        }),
        save: ({ context }) =>
          Option.isSome(_corrections(context.draft))
            ? { target: "Saving", context: { message: null } }
            : {},
        reset: {
          target: "Saving",
          context: { draft: _draft({}), message: null },
        },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ context }) => {
          const corrections = _corrections(context.draft);
          if (Option.isNone(corrections))
            throw new Error("Expected valid nutrition corrections.");
          return { foodId: context.foodId, corrections: corrections.value };
        },
        onDone: ({ event }) => ({
          target: "Editing",
          context: {
            food: event.output,
            draft: _draft(event.output.nutritionCorrections),
            message: "Saved for all past and future entries.",
          },
        }),
        onError: {
          target: "Editing",
          context: {
            message:
              "Could not save. Your catalog values are unchanged. Try again.",
          },
        },
      },
    },
  },
});

export default function FoodNutritionRoute() {
  const params = useSchemaLocalSearchParams(
    Schema.Struct({ id: Domain.FoodId })
  );
  return Option.isNone(params) ? (
    <Redirect href="/foods" />
  ) : (
    <FoodNutritionEditor foodId={params.value.id} />
  );
}

function FoodNutritionEditor({ foodId }: { readonly foodId: Domain.FoodId }) {
  const [snapshot, , actor] = useMachine(nutritionEditorMachine, {
    input: { foodId },
  });
  const { food, draft, usage, message } = snapshot.context;
  const busy = snapshot.matches("Saving");
  const savedDraft = _draft(food?.nutritionCorrections ?? {});
  const hasChanges = nutrientFields.some(
    ({ key }) => draft[key] !== savedDraft[key]
  );
  const hasCorrections = nutrientFields.some(
    ({ key }) => food?.nutritionCorrections[key] !== undefined
  );
  const valid = Option.isSome(_corrections(draft));

  return (
    <AppScreen contentStyle={styles.screen} safeAreaEdges={["top"]}>
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
      {snapshot.matches("Loading") ? (
        <LoadingView message="Loading food" />
      ) : food === null ? (
        <View style={styles.body}>
          <Notice
            message={message ?? "Could not load this food."}
            tone="danger"
          />
          <Button onPress={actor.trigger.retry}>Try again</Button>
        </View>
      ) : food.origin !== "app-default" ? (
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
                {usage?.mealEntryCount === 0
                  ? "Applies to future entries."
                  : `Applies to ${usage?.mealEntryCount ?? 0} past ${usage?.mealEntryCount === 1 ? "entry" : "entries"} and future entries.`}
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
                  onChangeText={(value) =>
                    actor.send({ type: "change", field: key, value })
                  }
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
                      { text: "Reset", onPress: actor.trigger.reset },
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
                actor.trigger.save();
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
