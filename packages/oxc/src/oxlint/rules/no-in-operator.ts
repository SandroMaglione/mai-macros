const _isInsideOxcPackage = (filename: string) =>
  filename.includes("/packages/oxc/") || filename.includes("\\packages\\oxc\\");

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the in operator for object key checks outside packages/oxc.",
    },
  },
  create(context: {
    filename: string;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    if (_isInsideOxcPackage(context.filename)) {
      return {};
    }

    return {
      BinaryExpression(node: { operator: string }) {
        if (node.operator !== "in") {
          return;
        }

        context.report({
          node,
          message:
            'Do not use the "in" operator to check for object keys. Fix or refactor the code so this key check is not needed. Only use Predicate as a last-resort escape hatch.',
        });
      },
    };
  },
};

export default rule;
