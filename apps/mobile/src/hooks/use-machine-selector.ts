import { RegistryContext } from "@effect/atom-react";
import { Cause, Equal } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { useContext, useMemo } from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector";

const pendingResults = new WeakMap<
  AtomRegistry.AtomRegistry,
  WeakMap<object, Promise<void>>
>();

export function useMachineSelector<State, Error, Value>(
  machine: {
    readonly result: Atom.Atom<AsyncResult.AsyncResult<State, Error>>;
  },
  {
    select,
    equals = Object.is,
  }: {
    readonly select: (state: State) => Value;
    readonly equals?: (previous: Value, next: Value) => boolean;
  }
): Value {
  const registry = useContext(RegistryContext);
  const atom = machine.result;
  const store = useMemo(
    () => ({
      subscribe: (notify: () => void) => registry.subscribe(atom, notify),
      snapshot: () => registry.get(atom),
      serverSnapshot: () => Atom.getServerValue(atom, registry),
    }),
    [registry, atom]
  );
  const result = useSyncExternalStoreWithSelector(
    store.subscribe,
    store.snapshot,
    store.serverSnapshot,
    (result) =>
      result._tag === "Failure"
        ? AsyncResult.failure<Value, Error>(result.cause, {
            waiting: result.waiting,
          })
        : AsyncResult.map(result, select),
    (previous, next) => {
      if (previous._tag !== next._tag || previous.waiting !== next.waiting)
        return false;
      if (previous._tag === "Success" && next._tag === "Success")
        return equals(previous.value, next.value);
      if (previous._tag === "Failure" && next._tag === "Failure")
        return Equal.equals(previous.cause, next.cause);
      return true;
    }
  );
  if (result._tag === "Initial") {
    let pending = pendingResults.get(registry);
    if (pending === undefined) {
      pending = new WeakMap();
      pendingResults.set(registry, pending);
    }
    const existing = pending.get(atom);
    if (existing !== undefined) throw existing;
    const cache = pending;
    const promise = new Promise<void>((resolve) => {
      const dispose = registry.subscribe(atom, (result) => {
        if (result._tag === "Initial") return;
        setTimeout(dispose, 1000);
        cache.delete(atom);
        resolve();
      });
    });
    pending.set(atom, promise);
    throw promise;
  }
  if (result._tag === "Failure") throw Cause.squash(result.cause);
  return result.value;
}
