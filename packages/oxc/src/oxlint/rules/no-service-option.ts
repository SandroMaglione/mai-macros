const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Effect.serviceOption.",
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
          node.property.name === "serviceOption"
        ) {
          context.report({
            node,
            message:
              "Do not use Effect.serviceOption. Require the service directly and provide it in the layer.",
          });
        }
      },
    };
  },
};

export default rule;
