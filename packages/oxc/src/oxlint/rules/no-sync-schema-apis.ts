const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow sync Effect Schema APIs.",
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
      }) {
        const callee = node.callee;

        if (
          callee.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "Schema" &&
          callee.property?.type === "Identifier" &&
          callee.property.name?.endsWith("Sync")
        ) {
          context.report({
            node: callee,
            message:
              "Sync Schema APIs are banned. Use decodeEffect or encodeEffect and handle failures.",
          });
        }
      },
    };
  },
};

export default rule;
