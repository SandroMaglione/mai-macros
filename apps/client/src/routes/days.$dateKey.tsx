import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Effect } from "effect";
import { fromPromise, setup } from "xstate";

import { RuntimeClient } from "../lib/runtime-client.ts";
import type { ChangeDayPlanInput } from "../lib/services/daily-logs.ts";
import { DailyLogs } from "../lib/services/daily-logs.ts";
import { shiftDateKey } from "../lib/utils.ts";

export const Route = createFileRoute("/days/$dateKey")({
  loader: async ({ params }) => {
    const result = await RuntimeClient.runPromise(
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs;
        return yield* dailyLogs.open({
          input: {
            dateKey: params.dateKey,
          },
        });
      }).pipe(Effect.catchTag("NoMealPlans", () => Effect.succeed(null)))
    );

    if (result === null) {
      throw redirect({
        to: "/plans/new",
        search: {
          dateKey: params.dateKey,
        },
      });
    }

    return result;
  },
  component: Component,
});

const changeDayPlanMachine = setup({
  types: {
    events: {} as {
      readonly type: "changePlan";
      readonly input: ChangeDayPlanInput;
      readonly invalidate: () => Promise<void>;
    },
  },
  actors: {
    changeDayPlan: fromPromise<
      "changed" | "planNotFound",
      {
        readonly input: ChangeDayPlanInput;
        readonly invalidate: () => Promise<void>;
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs;
          yield* dailyLogs.changePlan({
            input: input.input,
          });
          return "changed" as const;
        }).pipe(
          Effect.tap(() => Effect.promise(() => input.invalidate())),
          Effect.catchTag("PlanNotFound", () =>
            Effect.succeed("planNotFound" as const)
          )
        )
      )
    ),
  },
}).createMachine({
  initial: "Idle",
  states: {
    Idle: {
      on: {
        changePlan: {
          target: "Changing",
        },
      },
    },
    Changing: {
      invoke: {
        src: "changeDayPlan",
        input: ({ event }) => ({
          input: event.input,
          invalidate: event.invalidate,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output === "planNotFound",
            target: "PlanNotFound",
            actions: () => {
              globalThis.alert("Could not find that meal plan.");
            },
          },
          {
            target: "Idle",
          },
        ],
        onError: {
          target: "Failure",
          actions: () => {
            globalThis.alert("Could not change the meal plan.");
          },
        },
      },
    },
    PlanNotFound: {
      on: {
        changePlan: {
          target: "Changing",
        },
      },
    },
    Failure: {
      on: {
        changePlan: {
          target: "Changing",
        },
      },
    },
  },
});

function Component() {
  const day = Route.useLoaderData();
  const router = useRouter();
  const [snapshot, send] = useMachine(changeDayPlanMachine);
  const isChangingPlan = snapshot.matches("Changing");
  const previousDateKey = shiftDateKey({
    dateKey: day.dailyLog.dateKey,
    days: -1,
  });
  const nextDateKey = shiftDateKey({
    dateKey: day.dailyLog.dateKey,
    days: 1,
  });
  const planOptions = day.plans.map((plan) => (
    <option key={plan.id} value={plan.id}>
      {plan.name}
    </option>
  ));

  return (
    <main className="app-shell">
      <section className="day-view">
        <div className="day-toolbar" aria-label="Day navigation">
          <Link
            className="nav-button"
            params={{ dateKey: previousDateKey }}
            to="/days/$dateKey"
          >
            Previous
          </Link>
          <Link className="nav-button" to="/">
            Today
          </Link>
          <Link
            className="nav-button"
            params={{ dateKey: nextDateKey }}
            to="/days/$dateKey"
          >
            Next
          </Link>
        </div>

        <div className="page-heading">
          <p className="eyebrow">Daily log</p>
          <h1>{day.dailyLog.dateKey}</h1>
          <p className="lede">
            Opening this date creates a daily log from the active meal plan.
          </p>
        </div>

        <div className="plan-row">
          <label>
            Meal plan
            <select
              disabled={isChangingPlan}
              value={day.selectedPlan.id}
              onChange={(event) => {
                send({
                  type: "changePlan",
                  input: {
                    dateKey: day.dailyLog.dateKey,
                    planId: event.currentTarget.value,
                  },
                  invalidate: () => router.invalidate(),
                });
              }}
            >
              {planOptions}
            </select>
          </label>

          <Link
            className="secondary-link"
            search={{ dateKey: day.dailyLog.dateKey }}
            to="/plans/new"
          >
            New plan
          </Link>
        </div>

        <dl className="target-grid">
          <div>
            <dt>Protein</dt>
            <dd>{day.selectedPlan.proteinTargetGrams}g</dd>
          </div>
          <div>
            <dt>Carbs</dt>
            <dd>{day.selectedPlan.carbsTargetGrams}g</dd>
          </div>
          <div>
            <dt>Fat</dt>
            <dd>{day.selectedPlan.fatTargetGrams}g</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
