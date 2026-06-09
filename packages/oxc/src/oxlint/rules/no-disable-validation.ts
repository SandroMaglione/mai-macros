const _propertyName = (node: { type: string; name?: string; value?: string }) =>
  node.type === "Identifier" || node.type === "PrivateIdentifier"
    ? node.name
    : node.type === "StringLiteral" || node.type === "Literal"
      ? node.value
      : undefined;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow disabling Effect Schema validation.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      Property(node: {
        key?: { type: string; name?: string; value?: string };
        value?: { type: string; value?: boolean };
      }) {
        if (
          node.key !== undefined &&
          _propertyName(node.key) === "disableValidation" &&
          node.value?.type === "Literal" &&
          node.value.value === true
        ) {
          context.report({
            node,
            message:
              "Do not use disableValidation: true. Fix the data or schema and keep validation enabled.",
          });
        }
      },
    };
  },
};

export default rule;
