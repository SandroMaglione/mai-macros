const _isArrayImportedFromEffect = (node: {
  source?: { value?: string };
  specifiers?: {
    type: string;
    imported?: { type: string; name?: string };
    local?: { type: string; name?: string };
  }[];
}) =>
  node.source?.value === "effect" &&
  (node.specifiers ?? []).some(
    (specifier) =>
      specifier.type === "ImportSpecifier" &&
      specifier.imported?.type === "Identifier" &&
      specifier.imported.name === "Array" &&
      specifier.local?.type === "Identifier" &&
      specifier.local.name === "Array"
  );

const _isEffectArrayCall = (node: {
  type: string;
  callee?: {
    type: string;
    object?: { type: string; name?: string };
    property?: { type: string; name?: string };
  };
}) =>
  node.type === "CallExpression" &&
  node.callee?.type === "MemberExpression" &&
  node.callee.object?.type === "Identifier" &&
  node.callee.object.name === "Array" &&
  node.callee.property?.type === "Identifier";

const _isNode = (
  node: unknown
): node is {
  type: string;
  callee?: {
    type: string;
    object?: { type: string; name?: string };
    property?: { type: string; name?: string };
  };
} =>
  node !== null &&
  typeof node === "object" &&
  "type" in node &&
  typeof node.type === "string";

const ignoredKeys = new Set(["parent"]);

const _containsEffectArrayCall = (params: {
  node: unknown;
  seen: WeakSet<object>;
}): boolean => {
  const node = params.node;

  if (node === null || typeof node !== "object") {
    return false;
  }

  if (params.seen.has(node)) {
    return false;
  }

  params.seen.add(node);

  if (_isNode(node) && _isEffectArrayCall(node)) {
    return true;
  }

  for (const [key, value] of Object.entries(node)) {
    if (ignoredKeys.has(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      if (
        value.some((item) =>
          _containsEffectArrayCall({ node: item, seen: params.seen })
        )
      ) {
        return true;
      }
      continue;
    }

    if (_containsEffectArrayCall({ node: value, seen: params.seen })) {
      return true;
    }
  }

  return false;
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow nested Effect Array method calls.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    let arrayImportedFromEffect = false;

    return {
      ImportDeclaration(node: {
        source?: { value?: string };
        specifiers?: {
          type: string;
          imported?: { type: string; name?: string };
          local?: { type: string; name?: string };
        }[];
      }) {
        if (_isArrayImportedFromEffect(node)) {
          arrayImportedFromEffect = true;
        }
      },
      CallExpression(node: {
        type: string;
        callee?: {
          type: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
        arguments: unknown[];
      }) {
        if (!arrayImportedFromEffect || !_isEffectArrayCall(node)) {
          return;
        }

        if (
          node.arguments.some((argument) =>
            _containsEffectArrayCall({
              node: argument,
              seen: new WeakSet<object>(),
            })
          )
        ) {
          context.report({
            node,
            message:
              "Do not nest Effect Array method calls. Use pipe to preserve inference.",
          });
        }
      },
    };
  },
};

export default rule;
