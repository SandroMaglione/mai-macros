const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct fetch calls.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: {
        callee: {
          type: string;
          name?: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
      }) {
        const callee = node.callee;

        if (callee.type === "Identifier" && callee.name === "fetch") {
          context.report({
            node,
            message:
              "Do not call fetch directly. Use the existing API client or runtime client service.",
          });
          return;
        }

        if (
          callee.type === "MemberExpression" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "fetch" &&
          callee.object?.type === "Identifier" &&
          (callee.object.name === "window" ||
            callee.object.name === "globalThis")
        ) {
          context.report({
            node,
            message:
              "Do not call fetch directly. Use the existing API client or runtime client service.",
          });
        }
      },
    };
  },
};

export default rule;
