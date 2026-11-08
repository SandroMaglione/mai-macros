import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Layer } from "effect";
import { Atom } from "effect/reactivity";

import { AppActivityLayer } from "./app-activity-layer.ts";
import { DialogsLayer } from "./dialogs-layer.ts";
import { NavigationLayer } from "./navigation-layer.ts";
import { RuntimeClient } from "./runtime-client.ts";

export const MobileMachineLayer = Layer.mergeAll(
  Layer.effectContext(RuntimeClient.contextEffect),
  AppActivityLayer,
  DialogsLayer,
  NavigationLayer
);

export const MachineAtoms = AtomMachine.bind(Atom.runtime(MobileMachineLayer));
