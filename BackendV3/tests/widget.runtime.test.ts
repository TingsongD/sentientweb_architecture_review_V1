import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const widgetSource = readFileSync(
  new URL("../public/widget/widget.js", import.meta.url),
  "utf8",
);

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function createShadowRoot() {
  const nodes = new Map<string, Record<string, unknown>>();

  return {
    innerHTML: "",
    querySelector(selector: string) {
      if (!nodes.has(selector)) {
        nodes.set(selector, {
          value: "",
          onclick: null,
          onsubmit: null,
        });
      }

      return nodes.get(selector);
    },
  };
}

describe("widget runtime", () => {
  it("treats STREAM_FAILED SSE frames like transport failures without clearing conversation state", async () => {
    const localStorage = createStorage();
    localStorage.setItem(
      "sentient_widget_state:sw_inst_test",
      JSON.stringify({
        isOpen: true,
        conversationId: "conversation_existing",
        messages: [],
        unread: false,
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"error","code":"STREAM_FAILED","message":"The agent is temporarily unavailable."}\n\n',
              ),
            );
            controller.close();
          },
        }),
      });

    const shadowRoot = createShadowRoot();
    const host = {
      className: "",
      attachShadow() {
        return shadowRoot;
      },
    };
    const windowObject: Record<string, unknown> = {
      SentientWidgetConfig: {
        installKey: "sw_inst_test",
        visitorToken: "visitor_token",
        sessionId: "session_server",
        baseOrigin: "https://backend.example.com",
        config: {
          assets: {
            css: "/widget.css",
          },
          branding: {},
        },
      },
      location: {
        href: "https://www.example.com/pricing",
      },
      addEventListener: vi.fn(),
    };

    runInNewContext(widgetSource, {
      window: windowObject,
      document: {
        createElement: vi.fn(() => host),
        body: {
          appendChild: vi.fn(),
        },
      },
      localStorage,
      fetch: fetchMock,
      console: {
        error: vi.fn(),
      },
      TextEncoder,
      TextDecoder,
      ReadableStream,
      Date,
      JSON,
      Math,
    });

    const widgetInstance = windowObject.SentientWidgetInstance as {
      state: {
        conversationId: string | null;
        isLoading: boolean;
        messages: Array<{ role: string; content: string }>;
      };
      sendMessage: (message: string) => Promise<void>;
    };

    await widgetInstance.sendMessage("hello");

    expect(widgetInstance.state.conversationId).toBe("conversation_existing");
    expect(widgetInstance.state.isLoading).toBe(false);
    expect(widgetInstance.state.messages.at(-1)?.content).toBe(
      "I hit a temporary issue. Please try again or ask for a demo.",
    );
  });
});
