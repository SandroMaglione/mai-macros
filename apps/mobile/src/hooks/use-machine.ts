import { RegistryContext, useAtomSet } from "@effect/atom-react";
import type { Machine } from "@typeonce/effect-machine";
import {
  useMachineAtom,
  useMachineResult,
} from "@typeonce/effect-machine-react";
import type { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { use } from "react";

function _useResolvedValue<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
) {
  const registry = use(RegistryContext);
  const result = useMachineResult(atom);

  if (AsyncResult.isFailure(result)) {
    throw Cause.squash(result.cause);
  }

  if (AsyncResult.isSuccess(result)) {
    return result.value;
  }

  const planned = Atom.getServerValue(atom, registry);

  if (AsyncResult.isSuccess(planned)) {
    return planned.value;
  }

  throw new Error("The machine has no planned startup snapshot.");
}

export function useMachine<State, Event, Error, Output, StartError, Emitted>(
  create: () => AtomMachine.MachineAtom<
    State,
    Event,
    Error,
    Output,
    StartError,
    Emitted
  >
) {
  const machine = useMachineAtom(create);
  const snapshot = _useResolvedValue(machine.result);
  const send = useAtomSet(machine.send);

  return [snapshot, send, machine] as const;
}

export function useChildMachine<
  Child extends Machine.ChildMachine.Any,
  StartError,
>(child: AtomMachine.ChildMachineAtom<Child, StartError>) {
  const snapshot = _useResolvedValue(child.result);
  const send = useAtomSet(child.send);

  return [snapshot, send] as const;
}

export function useMachineValue<A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
) {
  return _useResolvedValue(atom);
}
