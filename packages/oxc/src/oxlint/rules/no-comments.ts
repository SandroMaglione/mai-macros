const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow comments in source files.",
    },
  },
  create(context: {
    filename: string;
    report: (opts: { node: unknown; message: string }) => void;
  }) {
    if (context.filename.endsWith(".d.ts")) {
      return {};
    }

    return {
      Program(node: { comments: { value: string }[] }) {
        for (const comment of node.comments) {
          if (comment.value.trim().startsWith("oxlint-")) {
            continue;
          }

          context.report({
            node: comment,
            message: "Comments are banned.",
          });
        }
      },
    };
  },
};

export default rule;
