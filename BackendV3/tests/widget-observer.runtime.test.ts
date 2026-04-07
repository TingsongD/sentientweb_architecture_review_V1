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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
});
