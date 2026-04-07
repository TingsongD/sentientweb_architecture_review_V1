(function () {
  "use strict";

  var runtime = window.SentientWidgetConfig;
  if (!runtime || !runtime.siteKey) return;

  var siteKey = runtime.siteKey;
  var baseOrigin = runtime.baseOrigin;
  var triggeredIds = {};
  var startedAt = Date.now();

  function getSessionId() {
    try {
      var key = "sentient_session_id:" + siteKey;
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var created = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, created);
      return created;
    } catch (error) {
      return "sess_" + Date.now();
    }
  }

  function getVisitedPages() {
    try {
      var key = "sentient_pages:" + siteKey;
      var existing = JSON.parse(sessionStorage.getItem(key) || "[]");
      if (existing.indexOf(window.location.pathname) === -1) {
        existing.push(window.location.pathname);
      }
      sessionStorage.setItem(key, JSON.stringify(existing.slice(-20)));
      return existing.length;
    } catch (error) {
      return 1;
    }
  }

  function inferPageType() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf("pricing") !== -1) return "pricing";
    if (path.indexOf("docs") !== -1 || path.indexOf("api") !== -1 || path.indexOf("guide") !== -1) return "docs";
    return "generic";
  }

  function postEvents(events) {
    return fetch(baseOrigin + "/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: siteKey,
        events: events
      })
    })
      .then(function (response) { return response.json(); })
      .catch(function () { return null; });
  }

  function dispatchTrigger(trigger) {
    if (!trigger || triggeredIds[trigger.id]) return;
    triggeredIds[trigger.id] = true;
    window.dispatchEvent(
      new CustomEvent("sentient:proactive", {
        detail: trigger
      })
    );
  }

  function sendIntentSnapshot() {
    var payload = {
      siteKey: siteKey,
      events: [
        {
          sessionId: getSessionId(),
          eventType: "intent_snapshot",
          source: "observer",
          pageUrl: window.location.href,
          payload: {
            pageType: inferPageType(),
            timeOnPageMs: Date.now() - startedAt,
            pagesViewed: getVisitedPages(),
            scrollDepthPercent: Math.round(
              ((window.scrollY + window.innerHeight) / Math.max(document.body.scrollHeight, 1)) * 100
            )
          }
        }
      ]
    };

    postEvents(payload.events).then(function (response) {
      if (response && response.trigger) {
        dispatchTrigger(response.trigger);
      }
    });
  }

  function sendPageView() {
    postEvents([
      {
        sessionId: getSessionId(),
        eventType: "page_view",
        source: "observer",
        pageUrl: window.location.href,
        payload: {
          pageType: inferPageType(),
          referrer: document.referrer || null
        }
      }
    ]).then(function (response) {
      if (response && response.trigger) {
        dispatchTrigger(response.trigger);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendPageView);
  } else {
    sendPageView();
  }

  setInterval(sendIntentSnapshot, 15000);
})();
