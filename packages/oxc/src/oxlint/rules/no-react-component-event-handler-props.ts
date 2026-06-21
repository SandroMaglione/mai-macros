type Node = {
  attributes?: Array<Node>;
  id?: Node;
  importKind?: string;
  imported?: Node;
  init?: Node;
  local?: Node;
  name?: Node | string;
  object?: Node;
  property?: Node;
  source?: { value?: string };
  specifiers?: Array<Node>;
  type: string;
};

type RuleOption = {
  localImportPrefixes?: Array<string>;
};

type Candidate = {
  attributeName: string;
  attributeNameNode: unknown;
  isMemberExpression: boolean;
  rootName: string;
};

const defaultLocalImportPrefixes = ["."];

const _startsWithUppercase = ({ value }: { value: string | undefined }) =>
  value !== undefined && /^[A-Z]/.test(value);

const _isUppercaseName = (value: string | undefined): value is string =>
  _startsWithUppercase({ value });

const _nodeName = ({ node }: { node: Node }) =>
  typeof node.name === "string" ? node.name : undefined;

const _localImportPrefixes = ({
  options,
}: {
  options: Array<RuleOption | undefined> | undefined;
}) => {
  const configuredPrefixes = options?.[0]?.localImportPrefixes;

  if (configuredPrefixes === undefined || configuredPrefixes.length === 0) {
    return defaultLocalImportPrefixes;
  }

  return configuredPrefixes;
};

const _isLocalSource = ({
  localImportPrefixes,
  source,
}: {
  localImportPrefixes: Array<string>;
  source: string | undefined;
}) =>
  source !== undefined &&
  localImportPrefixes.some((prefix) => source.startsWith(prefix));

const _jsxRootName = ({
  node,
}: {
  node: Node | string | undefined;
}): string | undefined => {
  if (node === undefined || typeof node === "string") {
    return undefined;
  }

  if (node.type === "JSXIdentifier") {
    return _nodeName({ node });
  }

  if (node.type === "JSXMemberExpression") {
    return _jsxRootName({ node: node.object });
  }

  return undefined;
};

const _isMemberExpression = ({ node }: { node: Node | string | undefined }) =>
  typeof node !== "string" && node?.type === "JSXMemberExpression";

const _isSimpleCapitalizedJsxName = ({
  node,
}: {
  node: Node | string | undefined;
}) =>
  typeof node !== "string" &&
  node?.type === "JSXIdentifier" &&
  _startsWithUppercase({ value: _nodeName({ node }) });

const _localSpecifierName = ({ node }: { node: Node }) => {
  if (node.importKind === "type") {
    return undefined;
  }

  if (node.local?.type !== "Identifier") {
    return undefined;
  }

  return _nodeName({ node: node.local });
};

const _bindingIdentifierName = ({ node }: { node: Node | undefined }) => {
  if (node?.type !== "Identifier") {
    return undefined;
  }

  return _nodeName({ node });
};

const _isComponentInitializer = ({ node }: { node: Node | undefined }) =>
  node?.type === "ArrowFunctionExpression" ||
  node?.type === "FunctionExpression" ||
  node?.type === "CallExpression";

const _isLocalComponentReference = ({
  candidate,
  localImportedComponents,
  localImportedNamespaces,
  sameFileComponents,
}: {
  candidate: Candidate;
  localImportedComponents: Set<string>;
  localImportedNamespaces: Set<string>;
  sameFileComponents: Set<string>;
}) => {
  if (candidate.isMemberExpression) {
    return (
      localImportedComponents.has(candidate.rootName) ||
      localImportedNamespaces.has(candidate.rootName) ||
      sameFileComponents.has(candidate.rootName)
    );
  }

  return (
    localImportedComponents.has(candidate.rootName) ||
    sameFileComponents.has(candidate.rootName)
  );
};

const _jsxAttributeName = ({ node }: { node: Node }) => {
  const name = _nodeName({ node });

  if (name !== undefined) {
    return name;
  }

  const nameNode = typeof node.name === "string" ? undefined : node.name;

  if (nameNode?.type === "JSXIdentifier") {
    return _nodeName({ node: nameNode });
  }

  return undefined;
};

const _isEventHandlerProp = (name: string | undefined): name is string =>
  name !== undefined && /^on[A-Z]/.test(name);

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn on React custom component onX props so callback prompts can be considered for actor refs instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          localImportPrefixes: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ localImportPrefixes: defaultLocalImportPrefixes }],
  },
  create(context: {
    options?: Array<RuleOption | undefined>;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    const localImportPrefixes = _localImportPrefixes({
      options: context.options,
    });
    const localImportedComponents = new Set<string>();
    const localImportedNamespaces = new Set<string>();
    const sameFileComponents = new Set<string>();
    const candidates: Array<Candidate> = [];

    return {
      FunctionDeclaration(node: Node) {
        const name = _bindingIdentifierName({ node: node.id });

        if (_isUppercaseName(name)) {
          sameFileComponents.add(name);
        }
      },
      ImportDeclaration(node: Node) {
        if (node.importKind === "type") {
          return;
        }

        const source = node.source?.value;
        const isLocalSource = _isLocalSource({ localImportPrefixes, source });

        if (!isLocalSource) {
          return;
        }

        for (const specifier of node.specifiers ?? []) {
          const localName = _localSpecifierName({ node: specifier });

          if (localName === undefined) {
            continue;
          }

          if (specifier.type === "ImportNamespaceSpecifier") {
            localImportedNamespaces.add(localName);
            continue;
          }

          localImportedComponents.add(localName);
        }
      },
      JSXOpeningElement(node: Node) {
        const rootName = _jsxRootName({ node: node.name });
        const isMemberExpression = _isMemberExpression({ node: node.name });

        if (
          rootName === undefined ||
          (!isMemberExpression &&
            !_isSimpleCapitalizedJsxName({ node: node.name }))
        ) {
          return;
        }

        for (const attribute of node.attributes ?? []) {
          if (attribute.type !== "JSXAttribute") {
            continue;
          }

          const name = _jsxAttributeName({ node: attribute });

          if (!_isEventHandlerProp(name)) {
            continue;
          }

          candidates.push({
            attributeName: name,
            attributeNameNode: attribute.name,
            isMemberExpression,
            rootName,
          });
        }
      },
      VariableDeclarator(node: Node) {
        if (!_isComponentInitializer({ node: node.init })) {
          return;
        }

        const name = _bindingIdentifierName({ node: node.id });

        if (_isUppercaseName(name)) {
          sameFileComponents.add(name);
        }
      },
      "Program:exit"() {
        for (const candidate of candidates) {
          if (
            !_isLocalComponentReference({
              candidate,
              localImportedComponents,
              localImportedNamespaces,
              sameFileComponents,
            })
          ) {
            continue;
          }

          context.report({
            node: candidate.attributeNameNode,
            message: `Consider whether ${candidate.attributeName} is needed here. Prefer passing an actor ref to the child component and modeling the interaction with XState actors instead of passing callback props down.`,
          });
        }
      },
    };
  },
};

export default rule;
