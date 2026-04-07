(function () {
  "use strict";

  var runtime = window.SentientWidgetConfig;
  if (
    !runtime ||
    !runtime.installKey ||
    !runtime.sessionId ||
    !runtime.visitorToken
  ) {
    return;
  }

  var installKey = runtime.installKey;
  var sessionId = runtime.sessionId;
  var visitorToken = runtime.visitorToken;
  var baseOrigin = runtime.baseOrigin;
  var triggeredIds = {};
  var startedAt = Date.now();

  function getVisitedPages() {
    try {
      var key = "sentient_pages:" + installKey;
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
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + visitorToken,
      },
      body: JSON.stringify({
        installKey: installKey,
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
      installKey: installKey,
      events: [
        {
          sessionId: sessionId,
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
        sessionId: sessionId,
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
