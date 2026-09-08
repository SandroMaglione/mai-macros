import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { RegistryContext } from "@effect/atom-react";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import {
  Component,
  createElement,
  Suspense,
  type ReactElement,
  type ReactNode,
} from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useMachineSelector } from "../src/hooks/use-machine-selector.ts";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type State = { readonly left: string; readonly right: string };
type ResultAtom = Atom.Writable<AsyncResult.AsyncResult<State, Error>>;

function SelectorView({
  machine,
  field,
  renders,
}: {
  readonly machine: { readonly result: ResultAtom };
  readonly field: keyof State;
  readonly renders: string[];
}) {
  const value = useMachineSelector(machine, {
    select: (state) => state[field],
  });
  renders.push(value);
  return createElement("span", { value });
}

function ObjectSelectorView({
  machine,
  renders,
}: {
  readonly machine: { readonly result: ResultAtom };
  readonly renders: string[];
}) {
  const value = useMachineSelector(machine, {
    select: (state) => ({ text: state.left }),
    equals: (previous, next) => previous.text === next.text,
  });
  renders.push(value.text);
  return createElement("span", { value: value.text });
}

class ErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  state: { readonly error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render(): ReactNode {
    const error: Error | null = this.state.error;
    return error === null
      ? this.props.children
      : createElement("strong", { message: error.message });
  }
}

async function _mount(element: ReactElement): Promise<ReactTestRenderer> {
  const mounted: { renderer?: ReactTestRenderer } = {};
  await act(() => {
    mounted.renderer = create(element);
  });
  assert.ok(mounted.renderer);
  return mounted.renderer;
}

test("inline selectors track new fields and machines without unrelated renders", async () => {
  const registry = AtomRegistry.make();
  const result: ResultAtom = Atom.make<AsyncResult.AsyncResult<State, Error>>(
    AsyncResult.success<State, Error>({ left: "a", right: "b" })
  );
  const machine = { result };
  const renders: string[] = [];
  const renderer = await _mount(
    createElement(
      RegistryContext.Provider,
      { value: registry },
      createElement(SelectorView, { machine, field: "left", renders })
    )
  );
  const initialRenders = renders.length;
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "a", right: "c" }))
  );
  assert.equal(renders.length, initialRenders);
  await act(() =>
    renderer.update(
      createElement(
        RegistryContext.Provider,
        { value: registry },
        createElement(SelectorView, { machine, field: "right", renders })
      )
    )
  );
  assert.equal(renders.at(-1), "c");
  const afterFieldChange = renders.length;
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "d", right: "c" }))
  );
  assert.equal(renders.length, afterFieldChange);
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "d", right: "e" }))
  );
  assert.equal(renders.at(-1), "e");
  const replacement: ResultAtom = Atom.make<
    AsyncResult.AsyncResult<State, Error>
  >(AsyncResult.success<State, Error>({ left: "x", right: "y" }));
  await act(() =>
    renderer.update(
      createElement(
        RegistryContext.Provider,
        { value: registry },
        createElement(SelectorView, {
          machine: { result: replacement },
          field: "right",
          renders,
        })
      )
    )
  );
  assert.equal(renders.at(-1), "y");
  const afterReplacement = renders.length;
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "old", right: "old" }))
  );
  assert.equal(renders.length, afterReplacement);
  await act(() => renderer.unmount());
  await act(() =>
    registry.set(replacement, AsyncResult.success({ left: "z", right: "z" }))
  );
  assert.equal(renders.length, afterReplacement);
  registry.dispose();
});

test("custom equality suppresses equal object selections", async () => {
  const registry = AtomRegistry.make();
  const result: ResultAtom = Atom.make<AsyncResult.AsyncResult<State, Error>>(
    AsyncResult.success<State, Error>({ left: "a", right: "b" })
  );
  const renders: string[] = [];
  const renderer = await _mount(
    createElement(
      RegistryContext.Provider,
      { value: registry },
      createElement(ObjectSelectorView, { machine: { result }, renders })
    )
  );
  const initialRenders = renders.length;
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "a", right: "c" }))
  );
  assert.equal(renders.length, initialRenders);
  await act(() =>
    registry.set(result, AsyncResult.success({ left: "d", right: "c" }))
  );
  assert.equal(renders.at(-1), "d");
  await act(() => renderer.unmount());
  registry.dispose();
});

test("startup suspends and runtime failures reach the error boundary", async () => {
  const registry = AtomRegistry.make();
  const result: ResultAtom = Atom.make<AsyncResult.AsyncResult<State, Error>>(
    AsyncResult.initial<State, Error>()
  );
  const renderer = await _mount(
    createElement(
      RegistryContext.Provider,
      { value: registry },
      createElement(ErrorBoundary, {
        children: createElement(
          Suspense,
          { fallback: createElement("div") },
          createElement(SelectorView, {
            machine: { result },
            field: "left",
            renders: [],
          })
        ),
      })
    )
  );
  assert.equal(renderer.root.findAllByType("div").length, 1);
  await act(async () => {
    registry.set(result, AsyncResult.success({ left: "ready", right: "b" }));
    await setImmediate();
  });
  assert.equal(renderer.root.findAllByType("div").length, 0);
  assert.equal(renderer.root.findAllByType("span").length, 1);
  await act(() => registry.set(result, AsyncResult.fail(new Error("failed"))));
  assert.equal(renderer.root.findAllByType("strong").length, 1);
  await act(() => renderer.unmount());
  registry.dispose();
});
