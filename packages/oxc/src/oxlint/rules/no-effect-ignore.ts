const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Effect.ignore.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      MemberExpression(node: {
        object: { type: string; name?: string };
        property: { type: string; name?: string };
      }) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "Effect" &&
          node.property.type === "Identifier" &&
          node.property.name === "ignore"
        ) {
          context.report({
            node,
            message:
              "Do not use Effect.ignore. Handle expected errors explicitly or let them propagate.",
          });
        }
      },
    };
  },
};

export default rule;
