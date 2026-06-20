import noBannedTypeAssertions from "./rules/no-banned-type-assertions.ts";
import noComments from "./rules/no-comments.ts";
import noDirectBrowserStorage from "./rules/no-direct-browser-storage.ts";
import noDirectFetch from "./rules/no-direct-fetch.ts";
import noDisableValidation from "./rules/no-disable-validation.ts";
import noEffectAsvoid from "./rules/no-effect-asvoid.ts";
import noEffectCatchCause from "./rules/no-effect-catch-cause.ts";
import noEffectIgnore from "./rules/no-effect-ignore.ts";
import noGlobalJson from "./rules/no-global-json.ts";
import noInOperator from "./rules/no-in-operator.ts";
import noMultipleFunctionParams from "./rules/no-multiple-function-params.ts";
import noMultipleXstateHooks from "./rules/no-multiple-xstate-hooks.ts";
import noNestedEffectArrayMethods from "./rules/no-nested-effect-array-methods.ts";
import noNestedLayerProvide from "./rules/no-nested-layer-provide.ts";
import noOptionalFunctionParameters from "./rules/no-optional-function-parameters.ts";
import noReactComponentEventHandlerProps from "./rules/no-react-component-event-handler-props.ts";
import noReactComponentInnerFunctions from "./rules/no-react-component-inner-functions.ts";
import noReactStateHooks from "./rules/no-react-state-hooks.ts";
import noServiceOption from "./rules/no-service-option.ts";
import noShadowedStandardArrayStatic from "./rules/no-shadowed-standard-array-static.ts";
import noSilentErrorSwallow from "./rules/no-silent-error-swallow.ts";
import noSingleUsePrivateFunctions from "./rules/no-single-use-private-functions.ts";
import noSingleUseXstateActions from "./rules/no-single-use-xstate-actions.ts";
import noSingleUseXstateGuards from "./rules/no-single-use-xstate-guards.ts";
import noSqlTypeParameter from "./rules/no-sql-type-parameter.ts";
import noStandardMapSet from "./rules/no-standard-map-set.ts";
import noSwitch from "./rules/no-switch.ts";
import noSyncSchemaApis from "./rules/no-sync-schema-apis.ts";
import noTypeofObject from "./rules/no-typeof-object.ts";
import noTypeAssertion from "./rules/no-type-assertion.ts";
import noTryCatch from "./rules/no-try-catch.ts";
import pipeMaxArguments from "./rules/pipe-max-arguments.ts";
import preferOptionFromNullable from "./rules/prefer-option-from-nullable.ts";
import privateFunctionPrefix from "./rules/private-function-prefix.ts";
import requireXstateEventSatisfies from "./rules/require-xstate-event-satisfies.ts";

export default {
  meta: {
    name: "mai",
  },
  rules: {
    "no-banned-type-assertions": noBannedTypeAssertions,
    "no-comments": noComments,
    "no-direct-browser-storage": noDirectBrowserStorage,
    "no-direct-fetch": noDirectFetch,
    "no-disable-validation": noDisableValidation,
    "no-effect-asvoid": noEffectAsvoid,
    "no-effect-catch-cause": noEffectCatchCause,
    "no-effect-ignore": noEffectIgnore,
    "no-global-json": noGlobalJson,
    "no-in-operator": noInOperator,
    "no-multiple-function-params": noMultipleFunctionParams,
    "no-multiple-xstate-hooks": noMultipleXstateHooks,
    "no-nested-effect-array-methods": noNestedEffectArrayMethods,
    "no-nested-layer-provide": noNestedLayerProvide,
    "no-optional-function-parameters": noOptionalFunctionParameters,
    "no-react-component-event-handler-props": noReactComponentEventHandlerProps,
    "no-react-component-inner-functions": noReactComponentInnerFunctions,
    "no-react-state-hooks": noReactStateHooks,
    "no-service-option": noServiceOption,
    "no-shadowed-standard-array-static": noShadowedStandardArrayStatic,
    "no-silent-error-swallow": noSilentErrorSwallow,
    "no-single-use-private-functions": noSingleUsePrivateFunctions,
    "no-single-use-xstate-actions": noSingleUseXstateActions,
    "no-single-use-xstate-guards": noSingleUseXstateGuards,
    "no-sql-type-parameter": noSqlTypeParameter,
    "no-standard-map-set": noStandardMapSet,
    "no-switch": noSwitch,
    "no-sync-schema-apis": noSyncSchemaApis,
    "no-typeof-object": noTypeofObject,
    "no-type-assertion": noTypeAssertion,
    "no-try-catch": noTryCatch,
    "pipe-max-arguments": pipeMaxArguments,
    "prefer-option-from-nullable": preferOptionFromNullable,
    "private-function-prefix": privateFunctionPrefix,
    "require-xstate-event-satisfies": requireXstateEventSatisfies,
  },
};
