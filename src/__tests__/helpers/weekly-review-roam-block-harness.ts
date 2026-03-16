import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { vi } from "vitest";

import {
  WeeklyReviewRoamBlock,
  type WeeklyReviewRoamBlockProps,
} from "../../components/WeeklyReviewRoamBlock";

interface PendingRenderRequest {
  container: HTMLElement;
  uid: string;
}

interface RenderedWeeklyReviewRoamBlockView {
  container: HTMLDivElement;
  rerender: (props: WeeklyReviewRoamBlockProps) => void;
  unmount: () => void;
}

export interface WeeklyReviewRoamBlockHarness {
  cleanup: () => void;
  publishReady: (uid: string) => Promise<void>;
  renderBlock: (props: WeeklyReviewRoamBlockProps) => RenderedWeeklyReviewRoamBlockView;
}

function createRenderedBlockMarkup(uid: string): string {
  return `
    <div class="rm-block-main" data-rendered-uid="${uid}">
      <div class="rm-block__input">${uid}</div>
    </div>
  `;
}

export function createWeeklyReviewRoamBlockHarness(): WeeklyReviewRoamBlockHarness {
  vi.useFakeTimers();

  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
  const root = dom.window.document.getElementById("root") as HTMLDivElement;
  const pendingRenderRequests = new Map<string, PendingRenderRequest>();
  const renderBlock = vi.fn(
    ({ el, uid }: { el: HTMLElement; uid: string } & Record<string, unknown>) => {
      pendingRenderRequests.set(uid, {
        container: el,
        uid,
      });
    },
  );

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("FocusEvent", dom.window.FocusEvent);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Node", dom.window.Node);

  dom.window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    dom.window.setTimeout(() => callback(0), 0)) as typeof dom.window.requestAnimationFrame;
  dom.window.cancelAnimationFrame = ((handle: number) =>
    dom.window.clearTimeout(handle)) as typeof dom.window.cancelAnimationFrame;

  Reflect.set(dom.window, "roamAlphaAPI", {
    data: {
      pull: vi.fn(() => null),
    },
    ui: {
      components: {
        renderBlock,
      },
    },
  });

  const flushScheduledWork = (): void => {
    act(() => {
      vi.runAllTimers();
    });
  };

  const unmount = (): void => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
  };

  let cleanedUp = false;

  const render = (props: WeeklyReviewRoamBlockProps): void => {
    act(() => {
      ReactDOM.render(React.createElement(WeeklyReviewRoamBlock, props), root);
    });
    flushScheduledWork();
  };

  return {
    cleanup() {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      unmount();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      dom.window.close();
    },
    async publishReady(uid) {
      const request = pendingRenderRequests.get(uid);
      if (!request) {
        throw new Error(`No pending render request found for uid "${uid}"`);
      }

      await act(async () => {
        request.container.innerHTML = createRenderedBlockMarkup(request.uid);
        await Promise.resolve();
      });
    },
    renderBlock(props) {
      render(props);

      return {
        container: root,
        rerender(nextProps) {
          render(nextProps);
        },
        unmount,
      };
    },
  };
}
