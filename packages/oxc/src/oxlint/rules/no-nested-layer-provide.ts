const _isLayerProvide = (node: {
  type: string;
  callee?: {
    type: string;
    object?: { type: string; name?: string };
    property?: { type: string; name?: string };
  };
}) =>
  node.type === "CallExpression" &&
  node.callee?.type === "MemberExpression" &&
  node.callee.object?.type === "Identifier" &&
  node.callee.object.name === "Layer" &&
  node.callee.property?.type === "Identifier" &&
  node.callee.property.name === "provide";

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow nested Layer.provide calls.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      CallExpression(node: {
        type: string;
        callee?: {
          type: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
        arguments: {
          type: string;
          callee?: {
            type: string;
            object?: { type: string; name?: string };
            property?: { type: string; name?: string };
          };
        }[];
      }) {
        if (!_isLayerProvide(node)) {
          return;
        }

        for (const argument of node.arguments) {
          if (_isLayerProvide(argument)) {
            context.report({
              node: argument,
              message:
                "Avoid nested Layer.provide calls. Extract the inner layer or use Layer.provideMerge.",
            });
          }
        }
      },
    };
  },
};

export default rule;
