const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Effect.asVoid.",
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
          node.property.name === "asVoid"
        ) {
          context.report({
            node,
            message:
              "Avoid Effect.asVoid. Prefer returning the effect directly when the success type is void.",
          });
        }
      },
    };
  },
};

export default rule;
