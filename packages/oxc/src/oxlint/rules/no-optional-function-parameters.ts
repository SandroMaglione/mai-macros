const _isOptionalParameter = (param: {
  optional?: boolean;
  parameter?: { optional?: boolean };
}) => param.optional === true || param.parameter?.optional === true;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow optional function parameters.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    const check_ = (node: {
      params: { optional?: boolean; parameter?: { optional?: boolean } }[];
    }) => {
      for (const param of node.params) {
        if (!_isOptionalParameter(param)) {
          continue;
        }

        context.report({
          node: param,
          message:
            "Optional function parameters are banned. Use an explicit union with undefined or null.",
        });
      }
    };

    return {
      FunctionDeclaration: check_,
      FunctionExpression: check_,
      ArrowFunctionExpression: check_,
    };
  },
};

export default rule;
