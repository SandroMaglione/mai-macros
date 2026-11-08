import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { MealPlanSummaryCard } from "@/components/nutrition/meal-plan-summary-card";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingOverlay, LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { PagerTabs } from "@/components/ui/pager-tabs";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  PlansEvents,
  PlansMachine,
  PlansSource,
  PlansStates,
  type PlansRouteData,
  type PlansTabIndex,
} from "@/machines/plans-machine";
import { color, spacing } from "@/theme/tokens";
import { Domain, MealPlans } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";

const PlansSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  source: Schema.optionalKey(PlansSource),
});

export default function PlansScreen() {
  const search = useSchemaLocalSearchParams(PlansSearchParams);

  if (Option.isNone(search)) {
    return <Redirect href="/" />;
  }

  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(PlansMachine, {
      dateKey: search.value.dateKey,
      source: search.value.source,
    })
  );

  return Option.match(PlansStates.get(snapshot, "Loaded"), {
    onNone: () => (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    ),
    onSome: (loaded) => (
      <ReadyPlansScreen
        activeTab={loaded.activeTab}
        data={loaded.data}
        disabled={
          PlansStates.matches(snapshot, "Loaded.ChangingPlan") ||
          PlansStates.matches(snapshot, "Loaded.SavingPlan")
        }
        editingPlan={loaded.editingPlan}
        notice={loaded.notice}
        returnDateKey={search.value.dateKey}
        source={search.value.source}
        onChangePlan={(plan) => {
          send(PlansEvents.ChangePlan({ plan }));
        }}
        onClearEditPlan={() => {
          send(PlansEvents.ClearEditPlan());
        }}
        onCreatePlan={(input) => {
          send(PlansEvents.CreatePlan({ input }));
        }}
        onRevisePlan={(plan, input) => {
          send(PlansEvents.RevisePlan({ input, plan }));
        }}
        onSelectEditPlan={(plan) => {
          send(PlansEvents.SelectEditPlan({ plan }));
        }}
        onSelectTab={(index) => {
          send(
            PlansEvents.SelectTab({
              index: index === 0 ? 0 : index === 1 ? 1 : 2,
            })
          );
        }}
      />
    ),
  });
}

function ReadyPlansScreen({
  activeTab,
  data,
  disabled,
  editingPlan,
  notice,
  returnDateKey,
  source,
  onChangePlan,
  onClearEditPlan,
  onCreatePlan,
  onRevisePlan,
  onSelectEditPlan,
  onSelectTab,
}: {
  readonly activeTab: PlansTabIndex;
  readonly data: PlansRouteData;
  readonly disabled: boolean;
  readonly editingPlan: Domain.Plan | null;
  readonly notice: string | null;
  readonly returnDateKey: Domain.DateKey | undefined;
  readonly source: PlansSource | undefined;
  readonly onChangePlan: (plan: Domain.Plan) => void;
  readonly onClearEditPlan: () => void;
  readonly onCreatePlan: (input: MealPlans.CreateMealPlanInput) => void;
  readonly onRevisePlan: (
    plan: Domain.Plan,
    input: MealPlans.CreateMealPlanInput
  ) => void;
  readonly onSelectEditPlan: (plan: Domain.Plan) => void;
  readonly onSelectTab: (index: number) => void;
}) {
  const selectedPlan = data.day.selectedPlan;
  const tabs = [
    {
      accessibilityLabel: "Select active plan",
      key: "select",
      label: "Select",
    },
    {
      accessibilityLabel: "Create plan",
      key: "create",
      label: "Create",
    },
    {
      accessibilityLabel: "Edit plans",
      key: "edit",
      label: "Edit",
    },
  ] as const;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
      >
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel={
                source === "settings" ? "Back to settings" : "Back to day"
              }
              icon={ChevronLeft}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }

                if (source === "settings") {
                  if (returnDateKey === undefined) {
                    router.replace("/settings");
                    return;
                  }

                  router.replace({
                    pathname: "/settings",
                    params: {
                      dateKey: returnDateKey,
                    },
                  });
                  return;
                }

                router.replace({
                  pathname: "/days/[dateKey]",
                  params: {
                    dateKey: data.dateKey,
                  },
                });
              }}
              variant="ghost"
            />
          }
          shadow
          subtitle={data.dateKey}
          title="Plans"
        />

        {notice === null ? null : (
          <Notice
            message={notice}
            style={styles.notice}
            tone={notice.startsWith("Plan ") ? "success" : "danger"}
          />
        )}

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={onSelectTab}
          tabBarPosition="bottom"
          tabs={[
            {
              ...tabs[0],
              content: (
                <PlanSelectTab
                  disabled={disabled}
                  onChangePlan={onChangePlan}
                  plans={data.day.plans}
                  selectedPlanId={selectedPlan.id}
                />
              ),
            },
            {
              ...tabs[1],
              content: (
                <MealPlanForm
                  action="create"
                  canNavigateBack={false}
                  initialPlan={null}
                  isSubmitting={disabled}
                  layout="embedded"
                  onBack={() => {
                    onSelectTab(0);
                  }}
                  onSubmit={onCreatePlan}
                />
              ),
            },
            {
              ...tabs[2],
              content: (
                <PlanEditTab
                  disabled={disabled}
                  editingPlan={editingPlan}
                  onClearEditPlan={onClearEditPlan}
                  onRevisePlan={onRevisePlan}
                  onSelectEditPlan={onSelectEditPlan}
                  plans={data.day.plans}
                  selectedPlanId={selectedPlan.id}
                />
              ),
            },
          ]}
        />
      </AppScreen>

      <LoadingOverlay message="Saving plan" visible={disabled} />
    </View>
  );
}

function PlanSelectTab({
  disabled,
  onChangePlan,
  plans,
  selectedPlanId,
}: {
  readonly disabled: boolean;
  readonly onChangePlan: (plan: Domain.Plan) => void;
  readonly plans: readonly Domain.Plan[];
  readonly selectedPlanId: Domain.Plan["id"];
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;

        return (
          <MealPlanSummaryCard
            disabled={disabled || isSelected}
            isActive={isSelected}
            key={plan.id}
            onPress={() => {
              onChangePlan(plan);
            }}
            plan={plan}
          />
        );
      })}
    </ScrollView>
  );
}

function PlanEditTab({
  disabled,
  editingPlan,
  onClearEditPlan,
  onRevisePlan,
  onSelectEditPlan,
  plans,
  selectedPlanId,
}: {
  readonly disabled: boolean;
  readonly editingPlan: Domain.Plan | null;
  readonly onClearEditPlan: () => void;
  readonly onRevisePlan: (
    plan: Domain.Plan,
    input: MealPlans.CreateMealPlanInput
  ) => void;
  readonly onSelectEditPlan: (plan: Domain.Plan) => void;
  readonly plans: readonly Domain.Plan[];
  readonly selectedPlanId: Domain.Plan["id"];
}) {
  if (editingPlan === null) {
    return (
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.tabScrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.tabScroll}
      >
        {plans.map((plan) => (
          <MealPlanSummaryCard
            disabled={disabled}
            isActive={plan.id === selectedPlanId}
            key={plan.id}
            onPress={() => {
              onSelectEditPlan(plan);
            }}
            plan={plan}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.editTab}>
      <Button
        disabled={disabled}
        icon={Pencil}
        onPress={onClearEditPlan}
        variant="secondary"
      >
        Change plan
      </Button>
      <MealPlanForm
        action="edit"
        initialPlan={editingPlan}
        isSubmitting={disabled}
        key={editingPlan.id}
        layout="embedded"
        onBack={onClearEditPlan}
        onSubmit={(input) => {
          onRevisePlan(editingPlan, input);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  notice: {
    marginBottom: -spacing.sm,
  },
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  editTab: {
    flex: 1,
    gap: spacing.md,
  },
});
