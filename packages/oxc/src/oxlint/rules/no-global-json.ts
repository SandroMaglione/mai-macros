const _isGlobalJson = (node: {
  type: string;
  name?: string;
  object?: { type: string; name?: string };
  property?: { type: string; name?: string };
}) =>
  (node.type === "Identifier" && node.name === "JSON") ||
  (node.type === "MemberExpression" &&
    node.object?.type === "Identifier" &&
    node.object.name === "globalThis" &&
    node.property?.type === "Identifier" &&
    node.property.name === "JSON");

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow global JSON APIs.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      MemberExpression(node: {
        object: {
          type: string;
          name?: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
      }) {
        if (!_isGlobalJson(node.object)) {
          return;
        }

        context.report({
          node,
          message:
            "Do not use the global JSON API. Use Effect Schema encode/decode APIs instead.",
        });
      },
    };
  },
};

export default rule;
