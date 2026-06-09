const catchMethods = new Set([
  "catch",
  "catchTag",
  "catchTags",
  "catchReason",
  "catchReasons",
]);

const _isEffectVoidOrUnit = (node: {
  type: string;
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}) =>
  node.type === "MemberExpression" &&
  node.object?.type === "Identifier" &&
  node.object.name === "Effect" &&
  node.property?.type === "Identifier" &&
  (node.property.name === "void" || node.property.name === "unit");

const _returnsOnlyVoid = (node: {
  type: string;
  body?: {
    type: string;
    body?: { type: string; argument?: { type: string } | null }[];
  };
}) => {
  if (
    node.type !== "ArrowFunctionExpression" &&
    node.type !== "FunctionExpression"
  ) {
    return false;
  }

  if (node.body !== undefined && _isEffectVoidOrUnit(node.body)) {
    return true;
  }

  if (node.body?.type !== "BlockStatement" || node.body.body?.length !== 1) {
    return false;
  }

  const statement = node.body.body[0];

  return (
    statement?.type === "ReturnStatement" &&
    statement.argument !== null &&
    statement.argument !== undefined &&
    _isEffectVoidOrUnit(statement.argument)
  );
};

const _checkObjectHandlers = (params: {
  context: { report: (opts: { node: unknown; message: string }) => void };
  node: {
    type: string;
    properties?: {
      type: string;
      value?: {
        type: string;
        body?: {
          type: string;
          body?: { type: string; argument?: { type: string } | null }[];
        };
      };
    }[];
  };
}) => {
  if (params.node.type !== "ObjectExpression") {
    return;
  }

  for (const property of params.node.properties ?? []) {
    if (
      property.type === "Property" &&
      property.value !== undefined &&
      _returnsOnlyVoid(property.value)
    ) {
      params.context.report({
        node: property.value,
        message:
          "Do not silently swallow Effect errors with Effect.void or Effect.unit. Recover meaningfully, transform the error, or let it propagate.",
      });
    }
  }
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Effect catch handlers that silently swallow errors.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: {
        callee: {
          type: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
        arguments: {
          type: string;
          body?: {
            type: string;
            body?: { type: string; argument?: { type: string } | null }[];
          };
          properties?: {
            type: string;
            value?: {
              type: string;
              body?: {
                type: string;
                body?: { type: string; argument?: { type: string } | null }[];
              };
            };
          }[];
        }[];
      }) {
        const callee = node.callee;

        if (
          callee.type !== "MemberExpression" ||
          callee.object?.type !== "Identifier" ||
          callee.object.name !== "Effect" ||
          callee.property?.type !== "Identifier" ||
          !catchMethods.has(callee.property.name ?? "")
        ) {
          return;
        }

        for (const argument of node.arguments) {
          if (_returnsOnlyVoid(argument)) {
            context.report({
              node: argument,
              message:
                "Do not silently swallow Effect errors with Effect.void or Effect.unit. Recover meaningfully, transform the error, or let it propagate.",
            });
          }

          _checkObjectHandlers({ context, node: argument });
        }
      },
    };
  },
};

export default rule;
