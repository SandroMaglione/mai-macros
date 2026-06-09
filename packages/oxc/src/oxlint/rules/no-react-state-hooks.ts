const bannedHooks = new Set(["useEffect", "useState"]);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow React state hooks. Use xstate actors for state and side effects instead.",
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
          property?: { type: string; name?: string };
        };
      }) {
        const callee = node.callee;
        const hookName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                callee.property?.type === "Identifier"
              ? callee.property.name
              : undefined;

        if (hookName !== undefined && bannedHooks.has(hookName)) {
          context.report({
            node: callee,
            message: `${hookName} is banned. Use xstate actors instead.`,
          });
        }
      },
    };
  },
};

export default rule;
