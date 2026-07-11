import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import noBannedTypeAssertions from "../src/oxlint/rules/no-banned-type-assertions.ts";
import noComments from "../src/oxlint/rules/no-comments.ts";
import noDirectBrowserStorage from "../src/oxlint/rules/no-direct-browser-storage.ts";
import noDirectFetch from "../src/oxlint/rules/no-direct-fetch.ts";
import noDisableValidation from "../src/oxlint/rules/no-disable-validation.ts";
import noEffectAsvoid from "../src/oxlint/rules/no-effect-asvoid.ts";
import noEffectCatchCause from "../src/oxlint/rules/no-effect-catch-cause.ts";
import noEffectIgnore from "../src/oxlint/rules/no-effect-ignore.ts";
import noGlobalJson from "../src/oxlint/rules/no-global-json.ts";
import noInOperator from "../src/oxlint/rules/no-in-operator.ts";
import noMultipleFunctionParams from "../src/oxlint/rules/no-multiple-function-params.ts";
import noMultipleXstateHooks from "../src/oxlint/rules/no-multiple-xstate-hooks.ts";
import noNestedEffectArrayMethods from "../src/oxlint/rules/no-nested-effect-array-methods.ts";
import noNestedLayerProvide from "../src/oxlint/rules/no-nested-layer-provide.ts";
import noOptionalFunctionParameters from "../src/oxlint/rules/no-optional-function-parameters.ts";
import noReactComponentEventHandlerProps from "../src/oxlint/rules/no-react-component-event-handler-props.ts";
import noReactComponentInnerFunctions from "../src/oxlint/rules/no-react-component-inner-functions.ts";
import noReactNonComponentFunctionExports from "../src/oxlint/rules/no-react-non-component-function-exports.ts";
import noReactStateHooks from "../src/oxlint/rules/no-react-state-hooks.ts";
import noServiceOption from "../src/oxlint/rules/no-service-option.ts";
import noShadowedStandardArrayStatic from "../src/oxlint/rules/no-shadowed-standard-array-static.ts";
import noSilentErrorSwallow from "../src/oxlint/rules/no-silent-error-swallow.ts";
import noSingleUsePrivateFunctions from "../src/oxlint/rules/no-single-use-private-functions.ts";
import noSingleUseXstateActions from "../src/oxlint/rules/no-single-use-xstate-actions.ts";
import noSingleUseXstateGuards from "../src/oxlint/rules/no-single-use-xstate-guards.ts";
import noSqlTypeParameter from "../src/oxlint/rules/no-sql-type-parameter.ts";
import noStandardMapSet from "../src/oxlint/rules/no-standard-map-set.ts";
import noSwitch from "../src/oxlint/rules/no-switch.ts";
import noSyncSchemaApis from "../src/oxlint/rules/no-sync-schema-apis.ts";
import noTypeofObject from "../src/oxlint/rules/no-typeof-object.ts";
import noTypeAssertion from "../src/oxlint/rules/no-type-assertion.ts";
import noTryCatch from "../src/oxlint/rules/no-try-catch.ts";
import pipeMaxArguments from "../src/oxlint/rules/pipe-max-arguments.ts";
import preferOptionFromNullable from "../src/oxlint/rules/prefer-option-from-nullable.ts";
import privateFunctionPrefix from "../src/oxlint/rules/private-function-prefix.ts";
import requireXstateEventSatisfies from "../src/oxlint/rules/require-xstate-event-satisfies.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    sourceType: "module",
    parserOptions: {
      lang: "ts",
    },
  },
});

type TestCases = Parameters<RuleTester["run"]>[2];

// oxlint-disable-next-line mai/no-type-assertion
const run = tester.run.bind(tester) as (
  name: string,
  rule: unknown,
  tests: TestCases
) => void;

run("no-banned-type-assertions", noBannedTypeAssertions, {
  valid: ["const value = input as string;", "const value = <number>input;"],
  invalid: [
    {
      code: "const value = input as any;",
      errors: [/Do not assert to any, never, or unknown/],
    },
    {
      code: "const value = input as never;",
      errors: [/Do not assert to any, never, or unknown/],
    },
    {
      code: "const value = <unknown>input;",
      errors: [/Do not assert to any, never, or unknown/],
    },
  ],
});

run("no-comments", noComments, {
  valid: [
    "const value = 1;",
    "// oxlint-disable-next-line gokugoku-prompt/no-comments\nconst value = 1;",
    {
      code: "// generated type definition\ndeclare const value: string;",
      filename: "types.d.ts",
    },
  ],
  invalid: [
    {
      code: "// explain value\nconst value = 1;",
      errors: [/Comments are banned/],
    },
    {
      code: "const value = 1; /* explain value */",
      errors: [/Comments are banned/],
    },
  ],
});

run("no-direct-browser-storage", noDirectBrowserStorage, {
  valid: [
    "const store = KeyValueStore.KeyValueStore;",
    "const database = IndexedDb.IndexedDb;",
    "const localStore = custom.localStorage;",
    "const storageNames = { localStorage: 'local', sessionStorage: 'session', indexedDB: 'database' };",
    "import { indexedDB as fakeIndexedDb } from 'fake-indexeddb';\nIndexedDb.make({ indexedDB: fakeIndexedDb, IDBKeyRange });",
  ],
  invalid: [
    {
      code: "localStorage.getItem('key');",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "sessionStorage.setItem('key', value);",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "const request = indexedDB.open('mai');",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "window.localStorage.removeItem('key');",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "globalThis.sessionStorage.clear();",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "const database = window['indexedDB'];",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
    {
      code: "cache[localStorage] = value;",
      errors: [/Use Effect's IndexedDb or KeyValueStore modules/],
    },
  ],
});

run("no-direct-fetch", noDirectFetch, {
  valid: [
    "client.fetch('/api');",
    "const fetchData = () => api.request('/api');",
  ],
  invalid: [
    {
      code: "fetch('/api');",
      errors: [/Do not call fetch directly/],
    },
    {
      code: "window.fetch('/api');",
      errors: [/Do not call fetch directly/],
    },
    {
      code: "globalThis.fetch('/api');",
      errors: [/Do not call fetch directly/],
    },
  ],
});

run("no-disable-validation", noDisableValidation, {
  valid: [
    "Schema.decodeUnknown(schema, value, { disableValidation: false });",
    "Schema.decodeUnknown(schema, value, { validation: true });",
  ],
  invalid: [
    {
      code: "Schema.decodeUnknown(schema, value, { disableValidation: true });",
      errors: [/Do not use disableValidation: true/],
    },
    {
      code: "Schema.decodeUnknown(schema, value, { 'disableValidation': true });",
      errors: [/Do not use disableValidation: true/],
    },
  ],
});

run("no-effect-asvoid", noEffectAsvoid, {
  valid: ["Effect.void;", "CustomEffect.asVoid(effect);"],
  invalid: [
    {
      code: "Effect.asVoid(effect);",
      errors: [/Avoid Effect.asVoid/],
    },
  ],
});

run("no-effect-catch-cause", noEffectCatchCause, {
  valid: [
    "Effect.catchTag(effect, 'Error', handler);",
    "CustomEffect.catchCause(effect);",
  ],
  invalid: [
    {
      code: "Effect.catchCause(effect, handler);",
      errors: [/Do not use Effect.catchCause/],
    },
  ],
});

run("no-effect-ignore", noEffectIgnore, {
  valid: ["Effect.catchAll(effect, handler);", "CustomEffect.ignore(effect);"],
  invalid: [
    {
      code: "Effect.ignore(effect);",
      errors: [/Do not use Effect.ignore/],
    },
  ],
});

run("no-global-json", noGlobalJson, {
  valid: [
    "Schema.decodeEffect(Schema.fromJsonString(schema))(value);",
    "Schema.encodeEffect(Schema.fromJsonString(schema))(value);",
    "custom.JSON.parse(value);",
  ],
  invalid: [
    {
      code: "JSON.parse(value);",
      errors: [/Do not use the global JSON API/],
    },
    {
      code: "JSON.stringify(value);",
      errors: [/Do not use the global JSON API/],
    },
    {
      code: "globalThis.JSON.parse(value);",
      errors: [/Do not use the global JSON API/],
    },
  ],
});

run("no-in-operator", noInOperator, {
  valid: [
    "const valid = Object.hasOwn(value, 'key');",
    "for (const key in value) { console.log(key); }",
    {
      code: "const valid = 'type' in node;",
      filename: "/repo/packages/oxc/src/oxlint/rules/example.ts",
    },
  ],
  invalid: [
    {
      code: "const invalid = 'key' in value;",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not use the "in" operator/],
    },
    {
      code: "if (key in value) { use(value); }",
      filename: "/repo/apps/server/src/example.ts",
      errors: [/Do not use the "in" operator/],
    },
  ],
});

run("no-multiple-function-params", noMultipleFunctionParams, {
  valid: [
    "function _save(params: { id: string; value: string }) { return params; }",
    "const _save = (params: { id: string; value: string }) => params;",
    "items.map((item, index) => [item, index]);",
    {
      code: "<Button onPress={(event, index) => event} />",
      filename: "component.tsx",
    },
  ],
  invalid: [
    {
      code: "function _save(id: string, value: string) { return id + value; }",
      errors: [/Functions with more than one parameter/],
    },
    {
      code: "const _save = (id: string, value: string) => id + value;",
      errors: [/Functions with more than one parameter/],
    },
  ],
});

run("no-multiple-xstate-hooks", noMultipleXstateHooks, {
  valid: [
    "import { useMachine } from '@xstate/react';\nfunction Screen() { const [snapshot, send] = useMachine(machine); return null; }",
    "import { useMachine, useActorRef } from '@xstate/react';\nfunction Parent() { useMachine(parentMachine); return null; }\nfunction Child() { useActorRef(childMachine); return null; }",
    "import { useMachine } from '@xstate/react';\nfunction _helper() { useMachine(machine); useMachine(otherMachine); }",
    "import { useMachine } from './local';\nfunction Screen() { useMachine(machine); useMachine(otherMachine); return null; }",
    "import { useActorRef, useMachine } from '@xstate/react';\nconst Screen = memo(() => { useMachine(machine); return null; });\nconst Child = forwardRef(() => { useActorRef(childMachine); return null; });",
  ],
  invalid: [
    {
      code: "import { useMachine } from '@xstate/react';\nfunction Screen() { useMachine(machine); useMachine(otherMachine); return null; }",
      errors: [/Screen uses multiple @xstate\/react actor hooks/],
    },
    {
      code: "import { useActorRef, useMachine } from '@xstate/react';\nconst Screen = () => { useMachine(machine); useActorRef(otherMachine); return null; };",
      errors: [/Compose machines with actors/],
    },
    {
      code: "import { useMachine as useXstateMachine, useActor } from '@xstate/react';\nconst Screen = () => { useXstateMachine(machine); useActor(actor); return null; };",
      errors: [/Screen uses multiple @xstate\/react actor hooks/],
    },
    {
      code: "import * as XStateReact from '@xstate/react';\nconst Screen = () => { XStateReact.useMachine(machine); XStateReact.useActorRef(otherMachine); return null; };",
      errors: [/Screen uses multiple @xstate\/react actor hooks/],
    },
    {
      code: "import { useActor, useActorRef } from '@xstate/react';\nconst Screen = memo(() => { useActor(actor); useActorRef(machine); return null; });",
      errors: [/Screen uses multiple @xstate\/react actor hooks/],
    },
    {
      code: "import { useActor, useMachine } from '@xstate/react';\nconst Screen = forwardRef(() => { useMachine(machine); useActor(actor); return null; });",
      errors: [/Screen uses multiple @xstate\/react actor hooks/],
    },
  ],
});

run("no-optional-function-parameters", noOptionalFunctionParameters, {
  valid: [
    "function _save(value: string | undefined) { return value; }",
    "const _save = (value: string | null) => value;",
    "type Params = { value?: string };",
    "interface Params { value?: string }",
  ],
  invalid: [
    {
      code: "function _save(value?: string) { return value; }",
      errors: [/Optional function parameters are banned/],
    },
    {
      code: "const _save = (value?: string) => value;",
      errors: [/Optional function parameters are banned/],
    },
    {
      code: "class Service { constructor(private readonly value?: string) {} }",
      errors: [/Optional function parameters are banned/],
    },
  ],
});

run("no-nested-effect-array-methods", noNestedEffectArrayMethods, {
  valid: [
    "import { Array } from 'effect';\nArray.map(items, item => item);",
    "import { Array } from 'effect';\nconst mapped = Array.map(items, item => item);\nArray.filter(mapped, item => item.active);",
    "const result = Array.map(Array.filter(items, item => item.active), item => item.id);",
  ],
  invalid: [
    {
      code: "import { Array } from 'effect';\nconst result = Array.map(Array.filter(items, item => item.active), item => item.id);",
      errors: [/Do not nest Effect Array method calls/],
    },
  ],
});

run("no-nested-layer-provide", noNestedLayerProvide, {
  valid: [
    "Layer.provide(AppLayer, DependenciesLayer);",
    "Layer.provideMerge(AppLayer, DependenciesLayer);",
  ],
  invalid: [
    {
      code: "Layer.provide(AppLayer, Layer.provide(ServiceLayer, DependenciesLayer));",
      errors: [/Avoid nested Layer.provide calls/],
    },
  ],
});

run("no-react-state-hooks", noReactStateHooks, {
  valid: [
    "useMemo(() => value, [value]);",
    "React.useMemo(() => value, [value]);",
  ],
  invalid: [
    {
      code: "useState(0);",
      errors: [/useState is banned/],
    },
    {
      code: "React.useEffect(() => {}, []);",
      errors: [/useEffect is banned/],
    },
  ],
});

run(
  "no-react-component-event-handler-props",
  noReactComponentEventHandlerProps,
  {
    valid: [
      {
        code: "const view = <form onSubmit={handleSubmit} />;",
        filename: "component.tsx",
      },
      {
        code: "const view = <input onChange={handleChange} />;",
        filename: "component.tsx",
      },
      {
        code: "const view = <SearchForm actorRef={actorRef} />;",
        filename: "component.tsx",
      },
      {
        code: "const view = <SearchForm onchange={handleChange} />;",
        filename: "component.tsx",
      },
      {
        code: "const view = <SearchForm {...props} />;",
        filename: "component.tsx",
      },
      {
        code: "import { Pressable } from 'react-native';\nconst view = <Pressable onPress={handlePress} />;",
        filename: "component.tsx",
      },
      {
        code: "import { Image } from 'expo-image';\nconst view = <Image onLoad={handleLoad} />;",
        filename: "component.tsx",
      },
      {
        code: "import { Button } from '@some/ui-kit';\nconst view = <Button onPress={handlePress} />;",
        filename: "component.tsx",
      },
      {
        code: "import * as Native from 'react-native';\nconst view = <Native.Pressable onPress={handlePress} />;",
        filename: "component.tsx",
      },
      {
        code: "const view = <UnknownComponent onSubmit={handleSubmit} />;",
        filename: "component.tsx",
      },
    ],
    invalid: [
      {
        code: "function SearchForm() { return null; }\nconst view = <SearchForm onSubmit={handleSubmit} />;",
        filename: "component.tsx",
        errors: [/Consider whether onSubmit is needed/],
      },
      {
        code: "const FoodPicker = () => null;\nconst view = <FoodPicker onChange={handleChange} onSelect={handleSelect} />;",
        filename: "component.tsx",
        errors: [
          /Consider whether onChange is needed/,
          /Consider whether onSelect is needed/,
        ],
      },
      {
        code: "import { Modal } from './modal';\nconst view = <Modal.Footer onConfirm={handleConfirm} />;",
        filename: "component.tsx",
        errors: [/Consider whether onConfirm is needed/],
      },
      {
        code: "import * as components from './components';\nconst view = <components.FoodPicker onSelect={handleSelect} />;",
        filename: "component.tsx",
        errors: [/Consider whether onSelect is needed/],
      },
      {
        code: "import { SearchForm as LocalSearchForm } from './search-form';\nconst view = <LocalSearchForm onSubmit={handleSubmit} />;",
        filename: "component.tsx",
        errors: [/Consider whether onSubmit is needed/],
      },
      {
        code: "import { SearchForm } from '@/components/search-form';\nconst view = <SearchForm onSubmit={handleSubmit} />;",
        filename: "component.tsx",
        options: [{ localImportPrefixes: [".", "@/"] }],
        errors: [/Consider whether onSubmit is needed/],
      },
    ],
  }
);

run("no-react-component-inner-functions", noReactComponentInnerFunctions, {
  valid: [
    {
      code: "const _formatName = ({ value }: { value: string }) => value.trim();\nfunction ProfileCard({ user }: Props) { const name = _formatName({ value: user.name }); return <p>{name}</p>; }",
      filename: "component.tsx",
    },
    {
      code: "function ProfileCard({ users }: Props) { const activeUsers = users.filter((user) => user.active); return <List users={activeUsers} />; }",
      filename: "component.tsx",
    },
    {
      code: "function ProfileCard({ users }: Props) { const names = useMemo(() => users.map((user) => user.name), [users]); return <List names={names} />; }",
      filename: "component.tsx",
    },
    {
      code: "function ProfileCard() { const reset = () => actorRef.send({ type: 'Reset' }); return <button onClick={reset} />; }",
      filename: "component.tsx",
    },
    {
      code: "function Parser() { const parse = (value: string) => value.trim(); return parse(input); }",
      filename: "parser.ts",
    },
    {
      code: "const ProfileCard = memo(({ users }: Props) => { const activeUsers = users.filter((user) => user.active); return <List users={activeUsers} />; });",
      filename: "component.tsx",
    },
  ],
  invalid: [
    {
      code: "function ProfileCard({ user }: Props) { const formatName = (value: User) => value.name.trim(); return <p>{formatName(user)}</p>; }",
      filename: "component.tsx",
      errors: [/Move "formatName" out of the component/],
    },
    {
      code: "function ProfileCard({ user }: Props) { function formatName(value: User) { return value.name.trim(); } return <p>{formatName(user)}</p>; }",
      filename: "component.tsx",
      errors: [/Move "formatName" out of the component/],
    },
    {
      code: "function ProfileCard({ user }: Props) { const formatName = function (value: User) { return value.name.trim(); }; return <p>{formatName(user)}</p>; }",
      filename: "component.tsx",
      errors: [/Move "formatName" out of the component/],
    },
    {
      code: "const ProfileCard = memo(({ user }: Props) => { const formatName = (value: User) => value.name.trim(); return <p>{formatName(user)}</p>; });",
      filename: "component.tsx",
      errors: [/Move "formatName" out of the component/],
    },
    {
      code: "function ProfileCard() { const handleChange = useCallback((value: string) => { actorRef.send({ type: 'Changed', value }); }, []); return <input onChange={handleChange} />; }",
      filename: "component.tsx",
      errors: [/Move "handleChange" out of the component/],
    },
    {
      code: "function ProfileCard() { const handleChange = React.useCallback((value: string) => { actorRef.send({ type: 'Changed', value }); }, []); return <input onChange={handleChange} />; }",
      filename: "component.tsx",
      errors: [/Move "handleChange" out of the component/],
    },
  ],
});

run(
  "no-react-non-component-function-exports",
  noReactNonComponentFunctionExports,
  {
    valid: [
      {
        code: "export function formatName({ value }: { readonly value: string }) { return value.trim(); }",
        filename: "format.ts",
      },
      {
        code: "export function ProfileCard() { return <p />; }",
        filename: "component.tsx",
      },
      {
        code: "export default function ProfileCard() { return <p />; }",
        filename: "component.tsx",
      },
      {
        code: "const ProfileCard = () => <p />;\nexport { ProfileCard };",
        filename: "component.tsx",
      },
      {
        code: "export const ProfileCard = memo(() => <p />);",
        filename: "component.tsx",
      },
      {
        code: "export const ProfileCard = React.forwardRef(function ProfileCard() { return <p />; });",
        filename: "component.tsx",
      },
      {
        code: "function BaseProfileCard() { return <p />; }\nexport default memo(BaseProfileCard);",
        filename: "component.tsx",
      },
      {
        code: "function BaseProfileCard() { return <p />; }\nexport const ProfileCard = memo(BaseProfileCard);",
        filename: "component.tsx",
      },
      {
        code: "const formatName = ({ value }: { readonly value: string }) => value.trim();",
        filename: "component.tsx",
      },
      {
        code: "export type Props = { readonly value: string };",
        filename: "component.tsx",
      },
      {
        code: "export { formatName } from './format';",
        filename: "component.tsx",
      },
    ],
    invalid: [
      {
        code: "export function formatName({ value }: { readonly value: string }) { return value.trim(); }",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "export const formatName = ({ value }: { readonly value: string }) => value.trim();",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "const formatName = ({ value }: { readonly value: string }) => value.trim();\nexport { formatName };",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "const formatName = ({ value }: { readonly value: string }) => value.trim();\nexport { formatName as format };",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "const formatName = () => <p />;\nexport { formatName as ProfileCard };",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "const formatName = ({ value }: { readonly value: string }) => value.trim();\nexport default formatName;",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "export default function formatName({ value }: { readonly value: string }) { return value.trim(); }",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "export default ({ value }: { readonly value: string }) => value.trim();",
        filename: "component.tsx",
        errors: [/Move this exported function out of the TSX file/],
      },
      {
        code: "export const formatName = memo(() => <p />);",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
      {
        code: "const formatName = () => <p />;\nexport default memo(formatName);",
        filename: "component.tsx",
        errors: [/Move "formatName" out of the TSX file/],
      },
    ],
  }
);

run("no-service-option", noServiceOption, {
  valid: ["Effect.service(Service);", "CustomEffect.serviceOption(Service);"],
  invalid: [
    {
      code: "Effect.serviceOption(Service);",
      errors: [/Do not use Effect.serviceOption/],
    },
  ],
});

run("no-shadowed-standard-array-static", noShadowedStandardArrayStatic, {
  valid: [
    "Array.from(values);",
    "import { Array } from 'effect';\nglobalThis.Array.from(values);",
    "import { Array } from 'effect';\nArray.map(values, value => value);",
  ],
  invalid: [
    {
      code: "import { Array } from 'effect';\nArray.from(values);",
      errors: [/Use globalThis.Array/],
    },
    {
      code: "import { Array } from 'effect';\nArray.isArray(values);",
      errors: [/Use globalThis.Array/],
    },
    {
      code: "import { Array } from 'effect';\nArray.of(value);",
      errors: [/Use globalThis.Array/],
    },
  ],
});

run("no-silent-error-swallow", noSilentErrorSwallow, {
  valid: [
    "Effect.catch(effect, error => Effect.fail(error));",
    "Effect.catchTag(effect, 'Error', error => Console.log(error));",
    "Effect.catchTags(effect, { Error: error => Effect.fail(error) });",
  ],
  invalid: [
    {
      code: "Effect.catch(effect, error => Effect.void);",
      errors: [/Do not silently swallow Effect errors/],
    },
    {
      code: "Effect.catch(effect, function (error) { return Effect.unit; });",
      errors: [/Do not silently swallow Effect errors/],
    },
    {
      code: "Effect.catchTags(effect, { Error: error => Effect.void });",
      errors: [/Do not silently swallow Effect errors/],
    },
  ],
});

run("no-single-use-private-functions", noSingleUsePrivateFunctions, {
  valid: [
    "function _format(value: string) { return value.trim(); }\nconst a = _format(first);\nconst b = _format(second);",
    "const _format = (value: string) => value.trim();\nconst a = _format(first);\nconst b = _format(second);",
    {
      code: "function Component() { return null; }\nconst first = <Component />;\nconst second = <Component />;",
      filename: "component.tsx",
    },
    {
      code: "function Component() { return null; }\nconst view = <Component />;",
      filename: "component.tsx",
    },
    "function _format(value: string) { return value.trim(); }\nfunction _use(_format: (value: string) => string) { return _format(input); }",
    "function _format(value: string) { return value.trim(); }\n{\n  const _format = (value: string) => value.toUpperCase();\n  const value = _format(input);\n}",
    "function _format(value: string) { return value.trim(); }\ntype Formatter = typeof _format;",
    "export function format(value: string) { return value.trim(); }\nconst value = format(input);",
    "function _format(value: string) { return value.trim(); }\nexport { _format };",
    "function _format(value: string) { return value.trim(); }\nexport { _format as format };",
    "const _format = (value: string) => value.trim();\nexport default _format;",
    "const _load = Effect.fn('_load')(function* (value: string) { return value; });\nconst first = _load(input);\nconst second = _load(other);",
    "const _program = Effect.gen(function* () { return value; });\nruntime.runPromise(_program);\nruntime.runPromise(_program);",
    "const _load = CustomEffect.fn('_load')(function* () { return value; });\nconst value = _load();",
    "export const load = Effect.fn('load')(function* () { return value; });\nconst value = load();",
    "type Input = { readonly value: string };\nconst first: Input = input;\nconst second: Input = other;",
    "interface Input { readonly value: string }\nconst first: Input = input;\nconst second: Input = other;",
    "export type Input = { readonly value: string };\nconst value: Input = input;",
    "type Input = { readonly value: string };\nexport type { Input };",
    "type Input = { readonly value: string };",
    "function Component() { return null; }\nexport default Component;",
    "const result = values.map((value) => value.trim());",
    "function _unused(value: string) { return value.trim(); }",
  ],
  invalid: [
    {
      code: "function _format(value: string) { return value.trim(); }\nconst value = _format(input);",
      errors: [/Inline the private function "_format"/],
    },
    {
      code: "const _format = (value: string) => value.trim();\nconst value = _format(input);",
      errors: [/Inline the private function "_format"/],
    },
    {
      code: "const _format = function (value: string) { return value.trim(); };\nconst value = _format(input);",
      errors: [/Inline the private function "_format"/],
    },
    {
      code: "function _format(value: string) { return value.trim(); }\ntype Formatter = typeof _format;\nconst value = _format(input);",
      errors: [/Inline the private function "_format"/],
    },
    {
      code: "function _format(value: string) { return value.trim(); }\nexport const value = _format(input);",
      errors: [/Inline the private function "_format"/],
    },
    {
      code: "const _load = Effect.fn('_load')(function* (value: string) { return value; });\nconst value = _load(input);",
      errors: [/Inline the private Effect function "_load"/],
    },
    {
      code: "const _load = Effect.fn(function* (value: string) { return value; });\nconst value = _load(input);",
      errors: [/Inline the private Effect function "_load"/],
    },
    {
      code: "const _load = Effect.fnUntraced(function* (value: string) { return value; });\nconst value = _load(input);",
      errors: [/Inline the private Effect function "_load"/],
    },
    {
      code: "const _program = Effect.gen(function* () { return value; });\nruntime.runPromise(_program);",
      errors: [/Inline the private Effect program "_program"/],
    },
    {
      code: "type Input = { readonly value: string };\nconst value: Input = input;",
      errors: [/Inline the private type "Input"/],
    },
    {
      code: "interface Input { readonly value: string }\nconst value: Input = input;",
      errors: [/Inline the private type "Input"/],
    },
    {
      code: "type Input = { readonly value: string };\nexport const value: Input = input;",
      errors: [/Inline the private type "Input"/],
    },
  ],
});

run("no-single-use-xstate-actions", noSingleUseXstateActions, {
  valid: [
    "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: ['reset', 'reset'] } } });",
    "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: [] } } });",
    "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: assign({ value: null }) } } });",
    "const configured = setup({ actions: { reset: () => {} } }); configured.createMachine({ on: { CHANGE: { actions: 'reset' } } });",
  ],
  invalid: [
    {
      code: "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: 'reset' } } });",
      errors: [/Inline the "reset" XState action/],
    },
    {
      code: "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: ['reset', assign({ value: null })] } } });",
      errors: [/Inline the "reset" XState action/],
    },
    {
      code: "setup({ actions: { reset: () => {} } }).createMachine({ on: { CHANGE: { actions: { type: 'reset' } } } });",
      errors: [/Inline the "reset" XState action/],
    },
  ],
});

run("no-single-use-xstate-guards", noSingleUseXstateGuards, {
  valid: [
    "setup({ guards: { hasValue: () => true } }).createMachine({ on: { CHANGE: [{ guard: 'hasValue' }, { guard: 'hasValue' }] } });",
    "setup({ guards: { hasValue: () => true } }).createMachine({ on: { CHANGE: { guard: ({ context }) => context.value !== null } } });",
    "setup({ guards: { hasValue: () => true } }).createMachine({ on: { CHANGE: { actions: 'hasValue' } } });",
    "const configured = setup({ guards: { hasValue: () => true } }); configured.createMachine({ on: { CHANGE: { guard: 'hasValue' } } });",
  ],
  invalid: [
    {
      code: "setup({ guards: { hasValue: () => true } }).createMachine({ on: { CHANGE: { guard: 'hasValue' } } });",
      errors: [/Inline the "hasValue" XState guard/],
    },
    {
      code: "setup({ guards: { hasValue: () => true } }).createMachine({ on: { CHANGE: { guard: { type: 'hasValue' } } } });",
      errors: [/Inline the "hasValue" XState guard/],
    },
  ],
});

run("no-sql-type-parameter", noSqlTypeParameter, {
  valid: ["sql`select * from prompts`;", "db.sql`select * from prompts`;"],
  invalid: [
    {
      code: "sql<{ id: string }>`select * from prompts`;",
      errors: [/Do not use sql<Type> templates/],
    },
    {
      code: "db.sql<{ id: string }>`select * from prompts`;",
      errors: [/Do not use sql<Type> templates/],
    },
  ],
});

run("no-standard-map-set", noStandardMapSet, {
  valid: [
    "HashMap.empty<string, string>();",
    "object.Map;",
    "const object = { Map: value };",
  ],
  invalid: [
    {
      code: "const cache = new Map<string, string>();",
      filename: "/repo/packages/oxc/src/oxlint/rules/example.ts",
      errors: [/Do not use standard Map or Set collections/],
    },
    {
      code: "const cache = new Map<string, string>();",
      filename: "/repo/packages/typed-lint/src/rules/example.ts",
      errors: [/Do not use standard Map or Set collections/],
    },
    {
      code: "const cache = new Map<string, string>();",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not use standard Map or Set collections/],
    },
    {
      code: "const values = new Set<string>();",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not use standard Map or Set collections/],
    },
    {
      code: "let values: ReadonlySet<string>;",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not use standard Map or Set collections/],
    },
  ],
});

run("no-switch", noSwitch, {
  valid: ["Match.value(value).pipe(Match.when('a', () => 1));"],
  invalid: [
    {
      code: "switch (value) { case 'a': break; }",
      errors: [/Switch statements are banned/],
    },
  ],
});

run("no-sync-schema-apis", noSyncSchemaApis, {
  valid: [
    "Schema.decodeEffect(schema)(value);",
    "OtherSchema.decodeSync(value);",
  ],
  invalid: [
    {
      code: "Schema.decodeSync(schema)(value);",
      errors: [/Sync Schema APIs are banned/],
    },
    {
      code: "Schema.encodeSync(schema)(value);",
      errors: [/Sync Schema APIs are banned/],
    },
  ],
});

run("no-type-assertion", noTypeAssertion, {
  valid: [
    "const value = { id: 'id' } as const;",
    "setup({ types: { input: {} as Input, events: {} as Events, context: {} as Context, children: {} as Children } });",
  ],
  invalid: [
    {
      code: "const value = input as string;",
      errors: [/Avoid type assertions when possible/],
    },
    {
      code: "const value = <string>input;",
      errors: [/Avoid type assertions when possible/],
    },
  ],
});

run("no-try-catch", noTryCatch, {
  valid: [
    "const value = Effect.try({ try: () => JSON.parse(input), catch: (error) => error });",
    "const value = Effect.tryPromise({ try: () => fetchTask(), catch: (error) => error });",
  ],
  invalid: [
    {
      code: "try { work(); } catch (error) { handle(error); }",
      errors: [/Do not use try\/catch/],
    },
    {
      code: "try { work(); } finally { cleanup(); }",
      errors: [/Do not use try\/catch/],
    },
  ],
});

run("no-typeof-object", noTypeofObject, {
  valid: [
    "const valid = typeof value !== 'string';",
    {
      code: "const valid = typeof node !== 'object';",
      filename: "/repo/packages/oxc/src/oxlint/rules/example.ts",
    },
  ],
  invalid: [
    {
      code: "const invalid = typeof value !== 'object';",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not compare typeof values with "object"/],
    },
    {
      code: "const invalid = typeof value === 'object';",
      filename: "/repo/apps/server/src/example.ts",
      errors: [/Do not compare typeof values with "object"/],
    },
    {
      code: "const invalid = 'object' !== typeof value;",
      filename: "/repo/packages/api/src/example.ts",
      errors: [/Do not compare typeof values with "object"/],
    },
    {
      code: "const invalid = typeof value != 'object';",
      filename: "/repo/packages/api/src/example.ts",
      errors: [/Do not compare typeof values with "object"/],
    },
    {
      code: "const invalid = value !== null && typeof value === 'object';",
      filename: "/repo/apps/mobile/src/example.ts",
      errors: [/Do not compare typeof values with "object"/],
    },
  ],
});

run("pipe-max-arguments", pipeMaxArguments, {
  valid: [
    "effect.pipe(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19);",
  ],
  invalid: [
    {
      code: "effect.pipe(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, a18, a19, a20, a21);",
      errors: [/This pipe has too many arguments/],
    },
  ],
});

run("prefer-option-from-nullable", preferOptionFromNullable, {
  valid: [
    "const value = Option.fromNullable(input);",
    "const value = input === null ? Option.none() : Option.some(input);",
    "const value = input !== undefined ? Option.some(input) : Option.none();",
  ],
  invalid: [
    {
      code: "const value = input !== null ? Option.some(input) : Option.none();",
      errors: [/Use Option.fromNullable/],
    },
    {
      code: "const value = null != input ? Option.some(input) : Option.none();",
      errors: [/Use Option.fromNullable/],
    },
    {
      code: "const value = input !== null ? Option.some<string>(input) : Option.none();",
      errors: [/Use Option.fromNullable/],
    },
  ],
});

run("private-function-prefix", privateFunctionPrefix, {
  valid: [
    "function _load() { return 1; }",
    "function Component() { return null; }",
    "export function load() { return 1; }",
    "const _load = () => 1;",
    "const Component = () => null;",
  ],
  invalid: [
    {
      code: "function load() { return 1; }",
      errors: [/Private top-level functions must start with an underscore/],
    },
    {
      code: "const load = () => 1;",
      errors: [/Private top-level functions must start with an underscore/],
    },
  ],
});

run("require-xstate-event-satisfies", requireXstateEventSatisfies, {
  valid: [
    "sendTo(actorId, () => ({ type: 'child.close' }) satisfies ChildEvent);",
    "sendParent(() => ({ type: 'parent.changed' }) satisfies ParentEvent);",
    "sendTo(actorId, function () { return ({ type: 'child.close' }) satisfies ChildEvent; });",
    "sendTo(actorId, event);",
    "sendTo(actorId, () => event);",
    "otherSend(() => ({ type: 'event' }));",
  ],
  invalid: [
    {
      code: "sendTo(actorId, () => ({ type: 'child.close' }));",
      errors: [/XState sent object events must use satisfies/],
    },
    {
      code: "sendTo(actorId, function () { return { type: 'child.close' }; });",
      errors: [/XState sent object events must use satisfies/],
    },
    {
      code: "sendParent(() => ({ type: 'parent.changed' }));",
      errors: [/XState sent object events must use satisfies/],
    },
    {
      code: "sendParent({ type: 'parent.changed' });",
      errors: [/XState sent object events must use satisfies/],
    },
  ],
});
