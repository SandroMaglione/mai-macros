const maxPipeArguments = 20;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow very long pipe calls.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: {
        callee: {
          type: string;
          property?: { type: string; name?: string };
        };
        arguments: unknown[];
      }) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "pipe" &&
          node.arguments.length > maxPipeArguments
        ) {
          context.report({
            node,
            message:
              "This pipe has too many arguments. Split it into smaller named steps.",
          });
        }
      },
    };
  },
};

export default rule;
