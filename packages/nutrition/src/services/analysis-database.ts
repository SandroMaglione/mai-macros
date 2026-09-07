import { Context, type Effect } from "effect";
import type { AnalysisData } from "./analysis-schema.ts";
import type {
  AnalysisDocumentation,
  AnalysisExportError,
} from "./analysis-documentation.ts";

export type AnalysisDatabaseInput = {
  readonly data: AnalysisData;
  readonly documentation: AnalysisDocumentation;
  readonly metadataJson: string;
};

export class AnalysisDatabase extends Context.Service<
  AnalysisDatabase,
  {
    readonly render: (
      input: AnalysisDatabaseInput
    ) => Effect.Effect<Uint8Array, AnalysisExportError>;
  }
>()("@mai/nutrition/AnalysisDatabase") {}
