const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow try statements.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      TryStatement(node: unknown) {
        context.report({
          node,
          message:
            "Do not use try/catch. Use Effect.try, Effect.tryPromise, or explicit error channels instead.",
        });
      },
    };
  },
};

export default rule;
