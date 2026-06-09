const bannedTypes = new Set([
  "TSAnyKeyword",
  "TSNeverKeyword",
  "TSUnknownKeyword",
]);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow as any, as never, and as unknown assertions.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      TSAsExpression(node: { typeAnnotation: { type: string } }) {
        if (bannedTypes.has(node.typeAnnotation.type)) {
          context.report({
            node,
            message:
              "Do not assert to any, never, or unknown. Fix the type or use generics.",
          });
        }
      },
      TSTypeAssertion(node: { typeAnnotation: { type: string } }) {
        if (bannedTypes.has(node.typeAnnotation.type)) {
          context.report({
            node,
            message:
              "Do not assert to any, never, or unknown. Fix the type or use generics.",
          });
        }
      },
    };
  },
};

export default rule;
