const _isInsideOxcPackage = (filename: string) =>
  filename.includes("/packages/oxc/") || filename.includes("\\packages\\oxc\\");

const _isObjectLiteral = (node: { type: string; value?: unknown }) =>
  node.type === "Literal" && node.value === "object";

const _isTypeofExpression = (node: { type: string; operator?: string }) =>
  node.type === "UnaryExpression" && node.operator === "typeof";

const _isTypeofObjectComparison = (node: {
  operator: string;
  left: { type: string; operator?: string; value?: unknown };
  right: { type: string; operator?: string; value?: unknown };
}) =>
  (node.operator === "===" ||
    node.operator === "!==" ||
    node.operator === "==" ||
    node.operator === "!=") &&
  ((_isTypeofExpression(node.left) && _isObjectLiteral(node.right)) ||
    (_isObjectLiteral(node.left) && _isTypeofExpression(node.right)));

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow typeof object comparisons outside packages/oxc.",
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
      BinaryExpression(node: {
        operator: string;
        left: { type: string; operator?: string; value?: unknown };
        right: { type: string; operator?: string; value?: unknown };
      }) {
        if (!_isTypeofObjectComparison(node)) {
          return;
        }

        context.report({
          node,
          message:
            'Do not compare typeof values with "object". First consider whether Effect Schema is a better solution and whether this runtime check is necessary. If it is necessary, use an explicit null and object validation helper instead.',
        });
      },
    };
  },
};

export default rule;
