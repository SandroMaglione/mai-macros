const standardCollections = new Set([
  "Map",
  "ReadonlyMap",
  "ReadonlySet",
  "Set",
]);

const _isProperty = (node: {
  parent?: { type: string; property?: unknown; key?: unknown };
}) =>
  (node.parent?.type === "MemberExpression" && node.parent.property === node) ||
  (node.parent?.type === "Property" && node.parent.key === node);

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow standard Map and Set collections in app code.",
    },
  },
  create(context: {
    filename: string;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      Identifier(node: {
        name: string;
        parent?: { type: string; property?: unknown; key?: unknown };
      }) {
        if (!standardCollections.has(node.name) || _isProperty(node)) {
          return;
        }

        context.report({
          node,
          message:
            "Do not use standard Map or Set collections. Use HashMap or HashSet from effect.",
        });
      },
    };
  },
};

export default rule;
