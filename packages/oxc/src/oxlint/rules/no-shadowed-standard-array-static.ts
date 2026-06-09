const standardArrayMethods = new Set(["from", "isArray", "of"]);

const _isArrayImportedFromEffect = (node: {
  source?: { value?: string };
  specifiers?: {
    type: string;
    imported?: { type: string; name?: string };
    local?: { type: string; name?: string };
  }[];
}) =>
  node.source?.value === "effect" &&
  (node.specifiers ?? []).some(
    (specifier) =>
      specifier.type === "ImportSpecifier" &&
      specifier.imported?.type === "Identifier" &&
      specifier.imported.name === "Array" &&
      specifier.local?.type === "Identifier" &&
      specifier.local.name === "Array"
  );

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require globalThis.Array when Array is imported from effect.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    let arrayImportedFromEffect = false;

    return {
      ImportDeclaration(node: {
        source?: { value?: string };
        specifiers?: {
          type: string;
          imported?: { type: string; name?: string };
          local?: { type: string; name?: string };
        }[];
      }) {
        if (_isArrayImportedFromEffect(node)) {
          arrayImportedFromEffect = true;
        }
      },
      MemberExpression(node: {
        object: {
          type: string;
          name?: string;
          object?: { type: string; name?: string };
          property?: { type: string; name?: string };
        };
        property: { type: string; name?: string };
      }) {
        if (!arrayImportedFromEffect) {
          return;
        }

        if (
          node.object.type === "Identifier" &&
          node.object.name === "Array" &&
          node.property.type === "Identifier" &&
          standardArrayMethods.has(node.property.name ?? "")
        ) {
          context.report({
            node,
            message:
              "Array is imported from effect in this file. Use globalThis.Array for standard Array static APIs.",
          });
        }
      },
    };
  },
};

export default rule;
