const _isSqlTag = (node: {
  type: string;
  name?: string;
  object?: { type: string };
  property?: { type: string; name?: string };
}) =>
  (node.type === "Identifier" && node.name === "sql") ||
  (node.type === "MemberExpression" &&
    node.property?.type === "Identifier" &&
    node.property.name === "sql");

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow type parameters on sql template literals.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      TaggedTemplateExpression(node: {
        tag: {
          type: string;
          name?: string;
          object?: { type: string };
          property?: { type: string; name?: string };
        };
        typeArguments?: unknown;
        typeParameters?: unknown;
      }) {
        if (
          _isSqlTag(node.tag) &&
          ((node.typeArguments !== undefined && node.typeArguments !== null) ||
            (node.typeParameters !== undefined && node.typeParameters !== null))
        ) {
          context.report({
            node,
            message:
              "Do not use sql<Type> templates. Use typed Drizzle/D1 query APIs or validated schemas instead.",
          });
        }
      },
    };
  },
};

export default rule;
