(function () {
  "use strict";

  var runtime = window.SentientWidgetConfig;
  if (
    !runtime ||
    !runtime.installKey ||
    !runtime.visitorToken ||
    window.SentientWidgetInstance
  ) {
    return;
  }

  var installKey = runtime.installKey;
  var config = runtime.config || {};
  var branding = config.branding || {};
  var baseOrigin = runtime.baseOrigin;
  var assetCssHref = baseOrigin + config.assets.css;
  var STREAM_FAILURE_COPY =
    "I hit a temporary issue. Please try again or ask for a demo.";

  function getWidgetStorageKey() {
    return "sentient_widget_state:" + installKey;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function createMessage(role, content) {
    return {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      role: role,
      content: content,
      createdAt: new Date().toISOString(),
    };
  }

  function Widget() {
    this.sessionId = runtime.sessionId;
    this.visitorToken = runtime.visitorToken;
    this.state = {
      isOpen: false,
      isLoading: false,
      conversationId: null,
      messages: [],
      unread: false,
    };
    this.load();
    this.mount();
    this.render();
    this.bindEvents();
  }

  Widget.prototype.load = function () {
    try {
      var stored = JSON.parse(localStorage.getItem(getWidgetStorageKey()) || "{}");
      this.state.isOpen = !!stored.isOpen;
      this.state.conversationId = stored.conversationId || null;
      this.state.messages = Array.isArray(stored.messages) ? stored.messages : [];
      this.state.unread = !!stored.unread;
    } catch (error) {}
  };

  Widget.prototype.save = function () {
    try {
      localStorage.setItem(
        getWidgetStorageKey(),
        JSON.stringify({
          isOpen: this.state.isOpen,
          conversationId: this.state.conversationId,
          messages: this.state.messages.slice(-30),
          unread: this.state.unread,
        }),
      );
    } catch (error) {}
  };

  Widget.prototype.mount = function () {
    this.host = document.createElement("sentient-widget-host");
    this.host.className = "sentient-widget-host";
    this.shadow = this.host.attachShadow({ mode: "open" });
    document.body.appendChild(this.host);
  };

  Widget.prototype.bindEvents = function () {
    var self = this;
    window.addEventListener("sentient:proactive", function (event) {
      if (event.detail && event.detail.message) {
        self.pushAssistantMessage(event.detail.message);
      }
      self.open();
    });
  };

  Widget.prototype.sendEvent = function (eventType, payload) {
    return fetch(baseOrigin + "/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.visitorToken,
      },
      body: JSON.stringify({
        installKey: installKey,
        events: [
          {
            sessionId: this.sessionId,
            eventType: eventType,
            source: "widget",
            pageUrl: window.location.href,
            payload: payload || {},
            conversationId: this.state.conversationId || undefined,
          },
        ],
      }),
    }).catch(function () {});
  };

  Widget.prototype.pushAssistantMessage = function (content) {
    var last = this.state.messages[this.state.messages.length - 1];
    if (last && last.role === "assistant" && last.content === content) {
      return;
    }
    this.state.messages.push(createMessage("assistant", content));
    if (!this.state.isOpen) {
      this.state.unread = true;
    }
    this.save();
    this.render();
  };

  Widget.prototype.open = function () {
    var wasClosed = !this.state.isOpen;
    this.state.isOpen = true;
    this.state.unread = false;
    if (wasClosed) {
      this.sendEvent("widget_opened", { openedAt: Date.now() });
      if (this.state.messages.length === 0) {
        this.pushAssistantMessage(
          "Hi, I’m " +
            (branding.agentName || "Sentient") +
            ". Ask me anything about the product, or I can help you book a demo.",
        );
      }
    }
    this.save();
    this.render();
  };

  Widget.prototype.close = function () {
    this.state.isOpen = false;
    this.save();
    this.render();
  };

  Widget.prototype.toggle = function () {
    if (this.state.isOpen) {
      this.close();
    } else {
      this.open();
    }
  };

  Widget.prototype.sendMessage = function (message) {
    var self = this;
    this.state.messages.push(createMessage("user", message));
    this.state.isLoading = true;
    this.save();
    this.render();
    this.sendEvent("message_sent", { messageLength: message.length });

    var assistantMsg = createMessage("assistant", "");
    this.state.messages.push(assistantMsg);
    this.render();

    function applyStreamFailure() {
      assistantMsg.content = STREAM_FAILURE_COPY;
      self.state.isLoading = false;
      self.save();
      self.render();
    }

    return fetch(baseOrigin + "/api/agent/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.visitorToken,
      },
      body: JSON.stringify({
        installKey: installKey,
        sessionId: this.sessionId,
        conversationId: this.state.conversationId || undefined,
        message: message,
        pageUrl: window.location.href,
        stream: true,
      }),
    })
      .then(function (response) {
        if (!response.ok || !response.body) {
          throw new Error("Network response was not ok");
        }
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function read() {
          return reader.read().then(function (result) {
            if (result.done) {
              self.state.isLoading = false;
              self.save();
              self.render();
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            lines.forEach(function (line) {
              if (!line.startsWith("data: ")) return;
              try {
                var data = JSON.parse(line.slice(6));
                if (data.type === "delta") {
                  assistantMsg.content += data.content;
                  self.render();
                } else if (
                  data.type === "error" &&
                  data.code === "STREAM_FAILED"
                ) {
                  applyStreamFailure();
                } else if (data.type === "done") {
                  self.state.conversationId =
                    data.conversationId || self.state.conversationId;
                  assistantMsg.content = data.reply;
                  self.save();
                  self.render();
                }
              } catch (error) {}
            });

            return read();
          });
        }

        return read();
      })
      .catch(function (error) {
        console.error("[SentientWeb] Streaming error", error);
        applyStreamFailure();
      });
  };

  Widget.prototype.render = function () {
    var self = this;
    var accent = branding.accentColor || "#0d7a5f";
    var launcherLabel = branding.launcherLabel || "Ask Sentient";
    var unreadBadge = this.state.unread
      ? '<span class="sentient-unread-dot" aria-hidden="true"></span>'
      : "";
    var messagesHtml = this.state.messages
      .map(function (message) {
        return (
          '<div class="sentient-message sentient-message-' +
          message.role +
          '">' +
          "<div>" +
          escapeHtml(message.content).replace(/\n/g, "<br/>") +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    this.shadow.innerHTML =
      '<link rel="stylesheet" href="' +
      assetCssHref +
      '">' +
      '<div class="sentient-widget-root">' +
      '<div class="sentient-widget-shell" style="--sentient-accent:' +
      accent +
      ';">' +
      '<button class="sentient-launcher" data-action="toggle">' +
      unreadBadge +
      "<span>" +
      escapeHtml(launcherLabel) +
      "</span>" +
      "</button>" +
      '<div class="sentient-panel ' +
      (this.state.isOpen ? "is-open" : "") +
      '">' +
      '<div class="sentient-panel-header">' +
      "<div><strong>" +
      escapeHtml(branding.agentName || "Sentient") +
      '</strong><div class="sentient-subtitle">Backend-owned website agent</div></div>' +
      '<button class="sentient-close" data-action="close" type="button">Close</button>' +
      "</div>" +
      '<div class="sentient-messages">' +
      messagesHtml +
      (this.state.isLoading
        ? '<div class="sentient-message sentient-message-assistant"><div>Thinking…</div></div>'
        : "") +
      "</div>" +
      '<form class="sentient-input-row" data-role="composer">' +
      '<textarea rows="3" name="message" placeholder="Ask a product question or request a demo"></textarea>' +
      '<button class="sentient-send" type="submit">Send</button>' +
      "</form>" +
      "</div>" +
      "</div>" +
      "</div>";

    this.shadow.querySelector('[data-action="toggle"]').onclick = function () {
      self.toggle();
    };
    this.shadow.querySelector('[data-action="close"]').onclick = function () {
      self.close();
    };
    this.shadow.querySelector('[data-role="composer"]').onsubmit = function (
      event,
    ) {
      event.preventDefault();
      var textarea = self.shadow.querySelector('textarea[name="message"]');
      var value = textarea.value.trim();
      if (!value || self.state.isLoading) return;
      textarea.value = "";
      self.sendMessage(value);
    };
  };

  window.SentientWidgetInstance = new Widget();
})();
