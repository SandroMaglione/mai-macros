import * as BodyWeightReports from "@mai/nutrition/services/body-weight-reports";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Layer } from "effect";
import { Atom } from "effect/reactivity";

import { MobileMachineLayer } from "./machine-runtime.ts";

const InsightsServicesLayer = Layer.mergeAll(
  BodyWeightReports.BodyWeightReports.layer,
  NutritionReports.NutritionReports.layer
);

export const InsightsMachineAtoms = AtomMachine.bind(
  Atom.runtime(Layer.provideMerge(InsightsServicesLayer, MobileMachineLayer))
);
