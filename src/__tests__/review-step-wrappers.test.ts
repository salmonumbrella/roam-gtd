import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => {
  const TriggerListStep = vi.fn(({ pageName }: { pageName: string }) =>
    React.createElement("div", null, `Forwarded page: ${pageName}`),
  );
  const WorkflowReviewStep = vi.fn(() => null);
  return { TriggerListStep, WorkflowReviewStep };
});

vi.mock("../components/TriggerListStep", () => ({
  TriggerListStep: mocks.TriggerListStep,
}));

vi.mock("../components/WorkflowReviewStep", () => ({
  WorkflowReviewStep: mocks.WorkflowReviewStep,
}));

import { NextActionsStep } from "../components/NextActionsStep";
import { SomedayMaybeStep } from "../components/SomedayMaybeStep";
import { TriggersStep } from "../components/TriggersStep";
import { WaitingForStep } from "../components/WaitingForStep";

function makeNextActionsProps() {
  return {
    activeTriageUid: null,
    items: [],
    onItemProcessed: vi.fn(),
    onOpenTriage: vi.fn(),
    settings: TEST_SETTINGS,
    t: (key: string) => key,
  };
}

function makeWaitingForProps() {
  return {
    activePersonDetail: null,
    activeTriageUid: null,
    delegatedChildPersonRefs: new Map<string, Array<string>>(),
    delegatedItems: [],
    delegatedPeople: [],
    onItemProcessed: vi.fn(),
    onOpenPersonDetail: vi.fn(),
    onOpenTriage: vi.fn(),
    settings: TEST_SETTINGS,
    t: (key: string) => key,
    waitingItems: [],
  };
}

function makeSomedayMaybeProps() {
  return {
    activeTriageUid: null,
    items: [],
    onItemProcessed: vi.fn(),
    onOpenTriage: vi.fn(),
    settings: TEST_SETTINGS,
    t: (key: string) => key,
  };
}

describe("review step wrappers", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    mocks.TriggerListStep.mockClear();
    mocks.WorkflowReviewStep.mockClear();
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders the TriggersStep prompt and forwards pageName", () => {
    const props = {
      pageName: "Trigger List",
      t: (key: string) => key,
    };

    act(() => {
      ReactDOM.render(React.createElement(TriggersStep, props), root);
    });

    expect(root.textContent).toContain("triggerListPrompt");
    expect(root.textContent).toContain(`Forwarded page: ${props.pageName}`);
  });

  it("renders workflow-family wrappers through WorkflowReviewStep", () => {
    const nextActionsProps = makeNextActionsProps();
    const waitingForProps = makeWaitingForProps();
    const somedayMaybeProps = makeSomedayMaybeProps();

    act(() => {
      ReactDOM.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(NextActionsStep, nextActionsProps),
          React.createElement(WaitingForStep, waitingForProps),
          React.createElement(SomedayMaybeStep, somedayMaybeProps),
        ),
        root,
      );
    });

    expect(mocks.WorkflowReviewStep).toHaveBeenCalledTimes(3);
    expect(mocks.WorkflowReviewStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeTriageUid: nextActionsProps.activeTriageUid,
        emptyStepTitle: "step3Title",
        sections: expect.arrayContaining([
          expect.objectContaining({
            items: nextActionsProps.items,
            key: "next-actions",
          }),
        ]),
        useIncrementalRows: true,
      }),
      expect.anything(),
    );
    expect(mocks.WorkflowReviewStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        activeTriageUid: waitingForProps.activeTriageUid,
        emptyStepTitle: "step4Title",
        sections: expect.arrayContaining([
          expect.objectContaining({
            items: waitingForProps.delegatedItems,
            key: "delegated",
          }),
          expect.objectContaining({
            items: waitingForProps.waitingItems,
            key: "waiting",
          }),
        ]),
        useIncrementalRows: true,
      }),
      expect.anything(),
    );
    expect(mocks.WorkflowReviewStep).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        activeTriageUid: somedayMaybeProps.activeTriageUid,
        emptyStepTitle: "step5Title",
        sections: expect.arrayContaining([
          expect.objectContaining({
            items: somedayMaybeProps.items,
            key: "someday",
          }),
        ]),
        useIncrementalRows: true,
      }),
      expect.anything(),
    );
  });
});
