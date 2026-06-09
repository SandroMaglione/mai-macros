const _propertyName = (node: { type: string; name?: string; value?: string }) =>
  node.type === "Identifier" || node.type === "PrivateIdentifier"
    ? node.name
    : node.type === "StringLiteral"
      ? node.value
      : undefined;

const _isSetupTypeAssertion = (node: {
  parent?: {
    type: string;
    key?: { type: string; name?: string; value?: string };
    parent?: {
      type: string;
      parent?: {
        type: string;
        key?: { type: string; name?: string; value?: string };
        parent?: {
          type: string;
          parent?: {
            type: string;
            callee?: { type: string; name?: string };
          };
        };
      };
    };
  };
}) => {
  const typedProperty = node.parent;
  const typedKey = typedProperty?.key
    ? _propertyName(typedProperty.key)
    : undefined;
  const typesProperty = typedProperty?.parent?.parent;
  const setupCall = typesProperty?.parent?.parent;

  return (
    typedProperty?.type === "Property" &&
    (typedKey === "input" ||
      typedKey === "events" ||
      typedKey === "context" ||
      typedKey === "children") &&
    typedProperty.parent?.type === "ObjectExpression" &&
    typesProperty?.type === "Property" &&
    typesProperty.key !== undefined &&
    _propertyName(typesProperty.key) === "types" &&
    typesProperty.parent?.type === "ObjectExpression" &&
    setupCall?.type === "CallExpression" &&
    setupCall.callee?.type === "Identifier" &&
    setupCall.callee.name === "setup"
  );
};

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Warn on TypeScript type assertions.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      TSAsExpression(node: {
        parent?: {
          type: string;
          key?: { type: string; name?: string; value?: string };
          parent?: {
            type: string;
            parent?: {
              type: string;
              key?: { type: string; name?: string; value?: string };
              parent?: {
                type: string;
                parent?: {
                  type: string;
                  callee?: { type: string; name?: string };
                };
              };
            };
          };
        };
        typeAnnotation: {
          type: string;
          typeName?: { type: string; name?: string };
        };
      }) {
        if (
          node.typeAnnotation.type === "TSTypeReference" &&
          node.typeAnnotation.typeName?.type === "Identifier" &&
          node.typeAnnotation.typeName.name === "const"
        ) {
          return;
        }

        if (_isSetupTypeAssertion(node)) {
          return;
        }

        context.report({
          node,
          message:
            "Avoid type assertions when possible. Prefer typed construction, validation, or inference.",
        });
      },
      TSTypeAssertion(node: unknown) {
        context.report({
          node,
          message:
            "Avoid type assertions when possible. Prefer typed construction, validation, or inference.",
        });
      },
    };
  },
};

export default rule;
