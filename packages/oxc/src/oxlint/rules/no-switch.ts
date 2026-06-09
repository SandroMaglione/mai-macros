const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow switch statements. Use Match from effect instead.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      SwitchStatement(node: unknown) {
        context.report({
          node,
          message: "Switch statements are banned. Use Match from effect.",
        });
      },
    };
  },
};

export default rule;
