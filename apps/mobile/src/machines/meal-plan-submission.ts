import { Data, Effect, Match } from "effect";

import { Dialogs } from "./services/dialogs.ts";

export class PlanNotSaved extends Data.TaggedError("PlanNotSaved")<{
  readonly message: string;
}> {}

export const rejectPlanSubmission = (error: { readonly _tag: string }) =>
  Effect.gen(function* () {
    const dialogs = yield* Dialogs;
    const message = Match.value(error._tag).pipe(
      Match.when(
        "PlanMealNameAlreadyExists",
        () =>
          "Meal names must be unique inside a plan. Rename the duplicate meal and try again."
      ),
      Match.when(
        "PlanNameAlreadyExists",
        () =>
          "A plan with this name already exists. Choose a different name and try again."
      ),
      Match.when(
        "SchemaError",
        () =>
          "Check that the plan name and meal names are filled, and every target is a non-negative number."
      ),
      Match.orElse(
        () => "Something went wrong while saving the plan. Please try again."
      )
    );

    yield* dialogs.alert({ message, title: "Plan not saved" });

    return yield* new PlanNotSaved({ message });
  });
