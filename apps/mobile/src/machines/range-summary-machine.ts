import { Machine } from "@typeonce/effect-machine";

export const RangeSummaryListStates = Machine.state({
  states: { Collapsed: {}, Expanded: {} },
});

export const RangeSummaryListEvents = Machine.events({
  Collapse: {},
  Expand: {},
});

export const RangeSummaryListMachine = Machine.make({
  id: "RangeSummaryList",
  root: RangeSummaryListStates,
  events: RangeSummaryListEvents,
}).handle({
  initial: { target: "Collapsed" },
  states: {
    Collapsed: { on: { Expand: { target: "Expanded" } } },
    Expanded: { on: { Collapse: { target: "Collapsed" } } },
  },
});

export const CostCoverageDialogStates = Machine.state({
  states: { Closed: {}, Open: {} },
});

export const CostCoverageDialogEvents = Machine.events({
  Close: {},
  Open: {},
});

export const CostCoverageDialogMachine = Machine.make({
  id: "CostCoverageDialog",
  root: CostCoverageDialogStates,
  events: CostCoverageDialogEvents,
}).handle({
  initial: { target: "Closed" },
  states: {
    Closed: { on: { Open: { target: "Open" } } },
    Open: { on: { Close: { target: "Closed" } } },
  },
});
