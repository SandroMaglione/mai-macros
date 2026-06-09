const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

const _isTopLevelDeclaration = (parent: { type: string } | undefined) =>
  parent?.type === "Program" || parent?.type === "ExportNamedDeclaration";

const _isTopLevelConstFunction = (node: {
  id: { type: string; name?: string };
  init: { type: string } | null;
  parent?: { type: string; parent?: { type: string } };
}) =>
  node.id.type === "Identifier" &&
  node.init !== null &&
  functionTypes.has(node.init.type) &&
  node.parent?.type === "VariableDeclaration" &&
  node.parent.parent?.type === "Program";

const _isPascalCase = (name: string) => /^[A-Z]/.test(name);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require private top-level functions and const function values to start with an underscore.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    const report_ = (node: unknown) => {
      context.report({
        node,
        message: "Private top-level functions must start with an underscore.",
      });
    };

    return {
      FunctionDeclaration(node: {
        id: { name: string } | null;
        parent?: { type: string };
      }) {
        if (
          node.id !== null &&
          _isTopLevelDeclaration(node.parent) &&
          node.parent?.type !== "ExportNamedDeclaration" &&
          !_isPascalCase(node.id.name) &&
          !node.id.name.startsWith("_")
        ) {
          report_(node.id);
        }
      },
      VariableDeclarator(node: {
        id: { type: string; name?: string };
        init: { type: string } | null;
        parent?: { type: string; parent?: { type: string } };
      }) {
        if (
          _isTopLevelConstFunction(node) &&
          node.id.name !== undefined &&
          !_isPascalCase(node.id.name) &&
          !node.id.name.startsWith("_")
        ) {
          report_(node.id);
        }
      },
    };
  },
};

export default rule;
