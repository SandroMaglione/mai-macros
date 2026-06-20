const bannedBrowserStorageNames = new Set([
  "indexedDB",
  "localStorage",
  "sessionStorage",
]);

const _getStaticPropertyName = (node: {
  type: string;
  name?: string;
  value?: unknown;
}) => {
  if (node.type === "Identifier") {
    return node.name;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }

  return undefined;
};

const _getStorageIdentifierName = (node: { type: string; name?: string }) =>
  node.type === "Identifier" &&
  node.name !== undefined &&
  bannedBrowserStorageNames.has(node.name)
    ? node.name
    : undefined;

const _isGlobalStorageMember = (node: {
  object: { type: string; name?: string };
  property: { type: string; name?: string; value?: unknown };
}) =>
  node.object.type === "Identifier" &&
  (node.object.name === "globalThis" || node.object.name === "window") &&
  bannedBrowserStorageNames.has(_getStaticPropertyName(node.property) ?? "");

const _isObjectLiteralPropertyKey = (node: {
  parent?: {
    type: string;
    key?: unknown;
    parent?: { type: string };
    value?: unknown;
  };
}) =>
  node.parent?.type === "Property" &&
  node.parent.key === node &&
  node.parent.parent?.type !== "ObjectPattern" &&
  node.parent.value !== node;

const _isMemberProperty = (node: {
  parent?: { type: string; computed?: boolean; property?: unknown };
}) =>
  node.parent?.type === "MemberExpression" &&
  node.parent.property === node &&
  node.parent.computed !== true;

const _isAliasedImportName = (node: {
  parent?: { type: string; imported?: unknown; local?: unknown };
}) =>
  node.parent?.type === "ImportSpecifier" &&
  node.parent.imported === node &&
  node.parent.local !== node;

const _isMemberObject = (node: {
  parent?: { type: string; object?: unknown };
}) => node.parent?.type === "MemberExpression" && node.parent.object === node;

const _messageFor = (name: string) =>
  `Do not use ${name} directly. Use Effect's IndexedDb or KeyValueStore modules instead.`;

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct browser storage APIs in favor of Effect storage modules.",
    },
  },
  create(context: {
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    return {
      Identifier(node: {
        type: string;
        name?: string;
        parent?: {
          type: string;
          imported?: unknown;
          key?: unknown;
          local?: unknown;
          object?: unknown;
          property?: unknown;
          value?: unknown;
        };
      }) {
        const storageName = _getStorageIdentifierName(node);

        if (storageName === undefined) {
          return;
        }

        if (
          _isObjectLiteralPropertyKey(node) ||
          _isMemberProperty(node) ||
          _isAliasedImportName(node) ||
          _isMemberObject(node)
        ) {
          return;
        }

        context.report({
          node,
          message: _messageFor(storageName),
        });
      },
      MemberExpression(node: {
        object: { type: string; name?: string };
        property: { type: string; name?: string; value?: unknown };
      }) {
        const storageName = _getStorageIdentifierName(node.object);

        if (storageName !== undefined) {
          context.report({
            node,
            message: _messageFor(storageName),
          });
          return;
        }

        if (_isGlobalStorageMember(node)) {
          context.report({
            node,
            message: _messageFor(_getStaticPropertyName(node.property) ?? ""),
          });
        }
      },
    };
  },
};

export default rule;
