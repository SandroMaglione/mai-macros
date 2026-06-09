const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Effect.catchCause.",
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
          node.property.name === "catchCause"
        ) {
          context.report({
            node,
            message:
              "Do not use Effect.catchCause. Handle expected errors with Effect.catch, Effect.catchTag, or Effect.catchTags and let defects fail.",
          });
        }
      },
    };
  },
};

export default rule;
