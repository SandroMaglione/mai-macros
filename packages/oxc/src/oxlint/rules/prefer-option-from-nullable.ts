const _isNullLiteral = (node: { type: string; value?: unknown }) =>
  node.type === "Literal" && node.value === null;

const _isOptionMemberCall = (params: {
  node: {
    type: string;
    callee?: {
      type: string;
      object?: { type: string; name?: string };
      property?: { type: string; name?: string };
      expression?: {
        type: string;
        object?: { type: string; name?: string };
        property?: { type: string; name?: string };
      };
    };
  };
  name: string;
}) => {
  if (params.node.type !== "CallExpression") {
    return false;
  }

  const callee = params.node.callee;
  const member =
    callee?.type === "MemberExpression"
      ? callee
      : callee?.type === "TSInstantiationExpression"
        ? callee.expression
        : undefined;

  return (
    member?.type === "MemberExpression" &&
    member.object?.type === "Identifier" &&
    member.object.name === "Option" &&
    member.property?.type === "Identifier" &&
    member.property.name === params.name
  );
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prefer Option.fromNullable over nullable ternaries.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      ConditionalExpression(node: {
        test: {
          type: string;
          operator?: string;
          left?: { type: string; value?: unknown };
          right?: { type: string; value?: unknown };
        };
        consequent: { type: string; callee?: { type: string } };
        alternate: { type: string; callee?: { type: string } };
      }) {
        if (
          node.test.type !== "BinaryExpression" ||
          (node.test.operator !== "!==" && node.test.operator !== "!=") ||
          node.test.left === undefined ||
          node.test.right === undefined ||
          (!_isNullLiteral(node.test.left) && !_isNullLiteral(node.test.right))
        ) {
          return;
        }

        if (
          _isOptionMemberCall({ node: node.consequent, name: "some" }) &&
          _isOptionMemberCall({ node: node.alternate, name: "none" })
        ) {
          context.report({
            node,
            message:
              "Use Option.fromNullable instead of a nullable ternary with Option.some and Option.none.",
          });
        }
      },
    };
  },
};

export default rule;
