import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const observerSource = readFileSync(
  new URL("../public/widget/observer.js", import.meta.url),
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

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// Helper: run the observer in an isolated VM context and return a spy
// for window.dispatchEvent so we can assert trigger dispatching behaviour.
function runObserverWithTrigger(triggerPayload: unknown) {
  const dispatchEventSpy = vi.fn();
  const fetchMock = vi.fn().mockResolvedValue({
    json: vi.fn().mockResolvedValue({ trigger: triggerPayload }),
  });

  runInNewContext(observerSource, {
    window: {
      SentientWidgetConfig: {
        baseOrigin: "https://backend.example.com",
        installKey: "sw_inst_test",
        sessionId: "session_abc",
        visitorToken: "visitor_token",
      },
      location: { href: "https://www.example.com/", pathname: "/" },
      innerHeight: 600,
      scrollY: 0,
      dispatchEvent: dispatchEventSpy,
    },
    document: {
      readyState: "complete",
      referrer: "",
      body: { scrollHeight: 1000 },
      addEventListener: vi.fn(),
    },
    fetch: fetchMock,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    CustomEvent: class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    setInterval: vi.fn(),
    Date,
    JSON,
    Math,
    URL,
  });

  return { dispatchEventSpy, fetchMock };
}

describe("widget observer runtime", () => {
  it("uses the bootstrapped visitor token and session for observer events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ trigger: null }),
    });
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    let intervalCallback: unknown = null;

    runInNewContext(observerSource, {
      window: {
        SentientWidgetConfig: {
          baseOrigin: "https://backend.example.com",
          installKey: "sw_inst_test",
          siteKey: "sw_pub_test",
          sessionId: "session_server",
          visitorToken: "visitor_token",
        },
        location: {
          href: "https://www.example.com/pricing",
          pathname: "/pricing",
        },
        innerHeight: 600,
        scrollY: 240,
        dispatchEvent: vi.fn(),
      },
      document: {
        readyState: "complete",
        referrer: "https://referrer.example.com",
        body: {
          scrollHeight: 2000,
        },
        addEventListener: vi.fn(),
      },
      fetch: fetchMock,
      localStorage,
      sessionStorage,
      CustomEvent: class {
        type: string;
        detail: unknown;

        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
      setInterval(callback: () => void) {
        intervalCallback = callback;
        return 1;
      },
      console: {
        error: vi.fn(),
      },
      Date,
      JSON,
      Math,
      URL,
    });

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://backend.example.com/api/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer visitor_token",
        }),
      }),
    );

    const pageViewBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(pageViewBody).toMatchObject({
      installKey: "sw_inst_test",
      events: [
        expect.objectContaining({
          sessionId: "session_server",
          eventType: "page_view",
        }),
      ],
    });
    expect(pageViewBody.siteKey).toBeUndefined();
    expect(localStorage.getItem("sentient_session_id:sw_pub_test")).toBeNull();

    expect(intervalCallback).not.toBeNull();
    if (!intervalCallback) {
      throw new Error("Expected observer to register an interval callback");
    }
    (intervalCallback as () => void)();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const intentBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(intentBody).toMatchObject({
      installKey: "sw_inst_test",
      events: [
        expect.objectContaining({
          sessionId: "session_server",
          eventType: "intent_snapshot",
          payload: expect.objectContaining({
            pageType: "pricing",
            pagesViewed: 1,
          }),
        }),
      ],
    });
    expect(
      sessionStorage.getItem("sentient_pages:sw_inst_test"),
    ).toBe('["/pricing"]');
  });

  describe("trigger injection hardening", () => {
    it("dispatches sentient:proactive for a well-formed trigger", async () => {
      const { dispatchEventSpy } = runObserverWithTrigger({
        id: "trigger-1",
        type: "proactive_message",
        message: "Can I help you?",
      });

      await flushMicrotasks();

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe("sentient:proactive");
      expect(event.detail).toEqual({
        id: "trigger-1",
        type: "proactive_message",
        message: "Can I help you?",
      });
    });

    it("does not dispatch when trigger id is missing", async () => {
      const { dispatchEventSpy } = runObserverWithTrigger({
        type: "proactive_message",
        message: "Sneak attack",
      });

      await flushMicrotasks();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("does not dispatch when trigger message is not a string", async () => {
      const { dispatchEventSpy } = runObserverWithTrigger({
        id: "trigger-2",
        type: "proactive_message",
        message: { html: "<script>alert(1)</script>" },
      });

      await flushMicrotasks();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("does not dispatch when trigger type is missing", async () => {
      const { dispatchEventSpy } = runObserverWithTrigger({
        id: "trigger-3",
        message: "No type field",
      });

      await flushMicrotasks();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("strips extra properties from the dispatched event detail", async () => {
      const { dispatchEventSpy } = runObserverWithTrigger({
        id: "trigger-4",
        type: "proactive_message",
        message: "Hello",
        __proto__: { polluted: true },
        constructor: "overridden",
        extraField: "should not appear",
      });

      await flushMicrotasks();

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const detail = dispatchEventSpy.mock.calls[0][0].detail;
      expect(detail).toEqual({
        id: "trigger-4",
        type: "proactive_message",
        message: "Hello",
      });
      // Only the three allow-listed fields should be own properties on the detail.
      expect(Object.keys(detail as object).sort()).toEqual(["id", "message", "type"]);
    });

    it("does not dispatch when baseOrigin is not HTTPS", async () => {
      const dispatchEventSpy = vi.fn();
      const fetchMock = vi.fn();

      runInNewContext(observerSource, {
        window: {
          SentientWidgetConfig: {
            baseOrigin: "http://evil.example.com",
            installKey: "sw_inst_test",
            sessionId: "session_abc",
            visitorToken: "visitor_token",
          },
          location: { href: "https://www.example.com/", pathname: "/" },
          innerHeight: 600,
          scrollY: 0,
          dispatchEvent: dispatchEventSpy,
        },
        document: {
          readyState: "complete",
          referrer: "",
          body: { scrollHeight: 1000 },
          addEventListener: vi.fn(),
        },
        fetch: fetchMock,
        localStorage: createStorage(),
        sessionStorage: createStorage(),
        CustomEvent: class {
          type: string;
          detail: unknown;
          constructor(type: string, init?: { detail?: unknown }) {
            this.type = type;
            this.detail = init?.detail;
          }
        },
        setInterval: vi.fn(),
        Date,
        JSON,
        Math,
        URL,
      });

      await flushMicrotasks();

      // Widget should abort early — no fetch calls, no events dispatched
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("does not dispatch when baseOrigin is missing from config", async () => {
      const dispatchEventSpy = vi.fn();
      const fetchMock = vi.fn();

      runInNewContext(observerSource, {
        window: {
          SentientWidgetConfig: {
            installKey: "sw_inst_test",
            sessionId: "session_abc",
            visitorToken: "visitor_token",
            // baseOrigin intentionally omitted
          },
          location: { href: "https://www.example.com/", pathname: "/" },
          innerHeight: 600,
          scrollY: 0,
          dispatchEvent: dispatchEventSpy,
        },
        document: {
          readyState: "complete",
          referrer: "",
          body: { scrollHeight: 1000 },
          addEventListener: vi.fn(),
        },
        fetch: fetchMock,
        localStorage: createStorage(),
        sessionStorage: createStorage(),
        CustomEvent: class {
          type: string;
          detail: unknown;
          constructor(type: string, init?: { detail?: unknown }) {
            this.type = type;
            this.detail = init?.detail;
          }
        },
        setInterval: vi.fn(),
        Date,
        JSON,
        Math,
        URL,
      });

      await flushMicrotasks();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
  });
});
