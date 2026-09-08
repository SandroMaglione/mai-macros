import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Layer } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { Router } from "./router";
import { RuntimeClient } from "./runtime-client";

export const MachineAtoms = AtomMachine.bind(
  Atom.runtime(
    Layer.mergeAll(
      Layer.effectContext(RuntimeClient.contextEffect),
      Router.layerExpo
    )
  )
);
