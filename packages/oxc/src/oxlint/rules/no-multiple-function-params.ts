const maxParams = 1;

const _isCallback = (parent: { type: string } | null | undefined) =>
  parent?.type === "CallExpression" ||
  parent?.type === "NewExpression" ||
  parent?.type === "JSXExpressionContainer";

const _isOwnedFunction = (node: {
  type: string;
  parent?: {
    type: string;
    init?: unknown;
    right?: unknown;
    declaration?: unknown;
  };
}) => {
  if (node.type === "FunctionDeclaration") {
    return true;
  }

  const parent = node.parent;

  if (_isCallback(parent)) {
    return false;
  }

  return (
    parent?.type === "VariableDeclarator" ||
    parent?.type === "AssignmentExpression" ||
    parent?.type === "ExportDefaultDeclaration"
  );
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow multiple parameters for internally defined functions.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    const check_ = (node: {
      type: string;
      params: unknown[];
      parent?: { type: string };
    }) => {
      if (node.params.length <= maxParams || !_isOwnedFunction(node)) {
        return;
      }

      context.report({
        node,
        message:
          "Functions with more than one parameter must accept a single object parameter.",
      });
    };

    return {
      FunctionDeclaration: check_,
      FunctionExpression: check_,
      ArrowFunctionExpression: check_,
    };
  },
};

export default rule;
