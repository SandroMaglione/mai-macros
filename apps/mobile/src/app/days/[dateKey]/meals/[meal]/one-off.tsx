import { useMachineSelector } from "@/hooks/use-machine-selector";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field, NumberField, TextArea } from "@/components/ui/field";
import { AppHeader } from "@/components/ui/mai-header";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { InputSelect } from "@/components/ui/input-select";
import { LoadingView } from "@/components/ui/loading-view";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import {
  OneOffEntryEvents,
  OneOffRoute,
  oneOffEntryMachine,
} from "@/lib/one-off-entry-machine";
import { MachineAtoms } from "@/lib/machine-atoms";
import { nutrientLabels } from "@/lib/nutrient-quality";
import { color, spacing } from "@/theme/tokens";
import { nutrientFieldColors } from "@/theme/nutrient-field-colors";
import { Domain, Reporting } from "@mai/nutrition";
import { useAtomSet, useAtomSuspense } from "@effect/atom-react";
import {
  createMachineContext,
  MachineState,
} from "@typeonce/effect-machine-react";
import { Suspense } from "react";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Alert, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

export { ErrorBoundary } from "expo-router";

const OneOffEntry = createMachineContext(
  MachineAtoms.factory(oneOffEntryMachine)
);

const RouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.MealId,
  mealEntryId: Schema.optional(Domain.MealEntryId),
});

export default function OneOffScreen() {
  const params = useSchemaLocalSearchParams(RouteParams);
  if (Option.isNone(params)) return <Redirect href="/" />;
  const route = {
    ...params.value,
    mealEntryId: params.value.mealEntryId ?? null,
  };
  return (
    <OneOffEntry.Provider
      key={`${params.value.dateKey}/${params.value.meal}/${params.value.mealEntryId ?? "new"}`}
      input={route}
    >
      <Suspense fallback={<LoadingView message="Opening meal" />}>
        <OneOffForm route={route} />
      </Suspense>
    </OneOffEntry.Provider>
  );
}
function OneOffForm({ route }: { readonly route: typeof OneOffRoute.Type }) {
  const machine = OneOffEntry.useMachine();
  const send = useAtomSet(machine.send);
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
        <MachineState machine={machine} path="Loading">
          {() => <LoadingView message="Opening meal" />}
        </MachineState>
        <MachineState
          machine={machine}
          path="Failure"
          inactive={
            <>
              <OneOffTextField
                field="name"
                label="Name"
                accessibilityLabel="One-off name"
                placeholder="Restaurant noodle bowl"
              />
              <OneOffTextField
                field="amountDescription"
                label="Amount eaten · optional"
                accessibilityLabel="Amount eaten"
                placeholder="1 bowl, half a plate…"
              />
              <View style={styles.divider} />
              {Reporting.NutrientNames.map((field) => (
                <OneOffNutrientField key={field} field={field} />
              ))}
              <OneOffTextField
                field="note"
                label="Note · optional"
                accessibilityLabel="One-off note"
                placeholder={undefined}
              />
              <OneOffActions editing={route.mealEntryId !== null} />
            </>
          }
        >
          {({ value: { message } }) => (
            <>
              <Button onPress={() => send(OneOffEntryEvents.retry())}>
                Try again
              </Button>
              <Notice message={message} tone="danger" />
            </>
          )}
        </MachineState>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function OneOffTextField({
  field,
  label,
  accessibilityLabel,
  placeholder,
}: {
  readonly field: "name" | "amountDescription" | "note";
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly placeholder: string | undefined;
}) {
  const machine = OneOffEntry.useMachine();
  const value = useMachineSelector(machine, {
    select: (snapshot) => snapshot.value.values[field],
  });
  const editable = useAtomSuspense(AtomMachine.matches(machine, "Ready")).value;
  const send = useAtomSet(machine.send);
  const Input = field === "note" ? TextArea : Field;
  return (
    <Input
      label={label}
      accessibilityLabel={accessibilityLabel}
      placeholder={placeholder}
      value={value}
      editable={editable}
      onChangeText={(value) => send(OneOffEntryEvents.text({ field, value }))}
    />
  );
}

function OneOffNutrientField({
  field,
}: {
  readonly field: (typeof Reporting.NutrientNames)[number];
}) {
  const machine = OneOffEntry.useMachine();
  const value = useMachineSelector(machine, {
    select: (snapshot) => snapshot.value.values.nutrients[field].value,
  });
  const source = useMachineSelector(machine, {
    select: (snapshot) => snapshot.value.values.nutrients[field].source,
  });
  const editable = useAtomSuspense(AtomMachine.matches(machine, "Ready")).value;
  const send = useAtomSet(machine.send);
  return (
    <NumberField
      label={nutrientLabels[field]}
      labelStyle={{ color: nutrientFieldColors[field] }}
      accessibilityLabel={`One-off ${nutrientLabels[field]}`}
      value={value}
      placeholder="—"
      editable={editable}
      onChangeText={(value) =>
        send(OneOffEntryEvents.nutrient({ field, value }))
      }
      rightElement={
        <InputSelect
          title={`${nutrientLabels[field]} source`}
          disabled={!editable}
          selectedValue={source}
          options={[
            { label: "Estimated", value: "Estimated" },
            { label: "Recorded", value: "Recorded" },
          ]}
          onSelect={(source) => {
            if (source === "Estimated" || source === "Recorded")
              send(OneOffEntryEvents.source({ field, source }));
          }}
        />
      }
    />
  );
}

function OneOffActions({ editing }: { readonly editing: boolean }) {
  const machine = OneOffEntry.useMachine();
  const emptyName = useMachineSelector(machine, {
    select: (snapshot) => snapshot.value.values.name.trim() === "",
  });
  const editable = useAtomSuspense(AtomMachine.matches(machine, "Ready")).value;
  const saving = useAtomSuspense(AtomMachine.matches(machine, "Saving")).value;
  const send = useAtomSet(machine.send);
  return (
    <>
      <Button
        disabled={!editable || emptyName}
        loading={saving}
        onPress={() => send(OneOffEntryEvents.save())}
      >
        {editing ? "Save entry" : "Add to meal"}
      </Button>
      <MachineState machine={machine} path="Ready">
        {({ value: { notice } }) =>
          notice === null ? null : <Notice message={notice} tone="danger" />
        }
      </MachineState>
      {editing ? (
        <Button
          variant="secondary"
          disabled={!editable}
          onPress={() =>
            Alert.alert(
              "Delete entry",
              "Remove this one-off entry from the diary?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => send(OneOffEntryEvents.delete()),
                },
              ]
            )
          }
        >
          Delete entry
        </Button>
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { gap: spacing.lg, padding: spacing.lg },
  divider: { height: 1, backgroundColor: color.divider },
});
