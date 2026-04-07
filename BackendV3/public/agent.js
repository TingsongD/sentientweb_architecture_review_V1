(function () {
  "use strict";

  if (window.SentientWidgetBooted) {
    return;
  }

  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.querySelectorAll(
      "script[data-install-key], script[data-site-key]",
    );
    currentScript = scripts[scripts.length - 1];
  }

  if (!currentScript) {
    console.error("[SentientWeb] agent.js loaded without a script tag context.");
    return;
  }

  var installKey = currentScript.getAttribute("data-install-key");
  var siteKey = currentScript.getAttribute("data-site-key");
  if (!installKey && !siteKey) {
    console.error(
      "[SentientWeb] Missing data-install-key or data-site-key on embed snippet.",
    );
    return;
  }

  var identityKey = installKey || siteKey;
  var storageKey = "sentient_widget_bootstrap:" + identityKey;
  var baseOrigin = new URL(currentScript.src, window.location.href).origin;
  var bootstrapUrl = baseOrigin + "/api/widget/bootstrap";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector(
        'script[data-sentient-src="' + src + '"]',
      );
      if (existing) {
        resolve();
        return;
      }

      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.sentientSrc = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function readBootstrapState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function persistBootstrapState(input) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(input));
    } catch (error) {}
  }

  var previousState = readBootstrapState();
  var payload = {
    installKey: installKey || undefined,
    siteKey: siteKey || undefined,
    visitorToken: previousState.visitorToken || undefined,
    pageUrl: window.location.href,
    platform: "script",
  };

  fetch(bootstrapUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(function (response) {
      if (!response.ok) throw new Error("Widget bootstrap request failed");
      return response.json();
    })
    .then(function (config) {
      window.SentientWidgetBooted = true;
      window.SentientWidgetConfig = {
        baseOrigin: baseOrigin,
        installKey: config.installKey,
        siteKey: config.siteKey,
        sessionId: config.visitor ? config.visitor.sessionId : null,
        visitorToken: config.visitor ? config.visitor.visitorToken : null,
        storageKey: storageKey,
        config: config,
      };

      persistBootstrapState({
        installKey: config.installKey,
        siteKey: config.siteKey,
        sessionId: config.visitor ? config.visitor.sessionId : null,
        visitorToken: config.visitor ? config.visitor.visitorToken : null,
        expiresAt: config.visitor ? config.visitor.expiresAt : null,
      });

      return loadScript(baseOrigin + config.assets.mouseTracker)
        .then(function () {
          return loadScript(baseOrigin + config.assets.observer);
        })
        .then(function () {
          return loadScript(baseOrigin + config.assets.widget);
        });
    })
    .catch(function (error) {
      console.error("[SentientWeb] Failed to boot widget", error);
    });
})();
