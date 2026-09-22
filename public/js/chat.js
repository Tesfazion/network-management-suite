/**
 * NetVisor Suite — chat assistant widget.
 *
 * Self-contained: creates its own floating button + panel, no dependency on
 * app.js internals. Talks to POST /api/v1/chat (also mounted at /api/chat).
 * The backend runs a local rule-based assistant out of the box and upgrades
 * replies with an LLM only when BOT_API_KEY is configured.
 */
(function () {
  'use strict';

  var SUGGESTIONS = [
    'What can you do?',
    'Show my devices',
    'Network health',
    'Any IP conflicts?',
    'List VLANs',
    'Open incidents',
    'How do I connect devices?',
    'How do I add a device?',
    'Check all devices',
    'Cable test results',
  ];

  var state = {
    open: false,
    greeted: false,
    pending: false,
    history: [],
  };

  function chatFetch(payload) {
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || res.statusText);
        return data;
      });
    });
  }

  function scrollToBottom() {
    var box = document.getElementById('chatMsgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function addClass(el, cls) {
    el.classList.add(cls);
  }

  function makeMsg(role, text) {
    var wrap = document.createElement('div');
    addClass(wrap, 'chat-msg');
    addClass(wrap, role === 'user' ? 'chat-msg-user' : 'chat-msg-bot');
    var bubble = document.createElement('div');
    addClass(bubble, 'chat-bubble');
    bubble.textContent = text;
    wrap.appendChild(bubble);
    document.getElementById('chatMsgs').appendChild(wrap);
    scrollToBottom();
  }

  function setTyping(on) {
    var typing = document.getElementById('chatTyping');
    if (!typing) return;
    typing.hidden = !on;
    if (on) scrollToBottom();
  }

  function setModeBadge(ai, action) {
    var badge = document.getElementById('chatMode');
    if (!badge) return;
    var label = ai === 'ai' ? 'AI assistant' : 'Local assistant';
    if (action) label += ' · action done';
    badge.textContent = label;
  }

  function send(message) {
    var input = document.getElementById('chatInput');
    var text = String(message == null ? input.value : message).trim();
    if (!text || state.pending) return;
    if (input) input.value = '';
    state.pending = true;

    makeMsg('user', text);
    setTyping(true);

    chatFetch({ message: text, history: state.history.slice(-12) })
      .then(function (data) {
        makeMsg('bot', data.reply || '(no reply)');
        setModeBadge(data.ai, data.action && data.action.type);
        state.history.push({ role: 'user', content: text });
        if (data.reply) state.history.push({ role: 'assistant', content: data.reply });
        if (state.history.length > 24) state.history = state.history.slice(-24);
      })
      .catch(function (err) {
        makeMsg('bot', 'Sorry, something went wrong talking to the assistant: ' + err.message);
      })
      .finally(function () {
        state.pending = false;
        setTyping(false);
        if (input) input.focus();
      });
  }

  function buildSuggestions() {
    var box = document.getElementById('chatSugs');
    if (!box) return;
    SUGGESTIONS.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      addClass(chip, 'chat-chip');
      chip.textContent = s;
      chip.addEventListener('click', function () { send(s); box.hidden = true; });
      box.appendChild(chip);
    });
  }

  function greet() {
    if (state.greeted) return;
    state.greeted = true;
    makeMsg('bot', 'Hello! I\'m your network assistant.\nI can explain the app and answer with live data from ' +
      'your network. Ask me anything, or tap a shortcut below.');
    buildSuggestions();
  }

  function setOpen(open) {
    state.open = open;
    var panel = document.getElementById('chatPanel');
    var fab = document.getElementById('chatFab');
    var badge = document.getElementById('chatUnread');
    if (panel) panel.hidden = !open;
    if (fab) fab.classList.toggle('chat-fab-active', open);
    if (badge) badge.hidden = true;
    if (open) {
      greet();
      var input = document.getElementById('chatInput');
      if (input) input.focus();
      scrollToBottom();
    }
  }

  function install() {
    if (document.getElementById('chatPanel')) return;

    var root = document.createElement('div');
    root.id = 'chatRoot';
    root.innerHTML =
      '<button id="chatFab" class="chat-fab" type="button" aria-label="Open assistant" title="Ask the assistant">' +
      '  <span class="chat-fab-ico">💬</span>' +
      '  <span id="chatUnread" class="chat-fab-badge" hidden>1</span>' +
      '</button>' +
      '<div id="chatPanel" class="chat-panel" hidden>' +
      '  <div class="chat-head">' +
      '    <div class="chat-head-title"><b>NetVisor Assistant</b>' +
      '      <span id="chatMode" class="chat-mode">Local assistant</span></div>' +
      '    <button id="chatClose" class="chat-close" type="button" aria-label="Close chat">✕</button>' +
      '  </div>' +
      '  <div id="chatMsgs" class="chat-msgs" aria-live="polite">' +
      '    <div id="chatTyping" class="chat-typing" hidden>NetVisor is typing<span class="chat-dots">…</span></div>' +
      '  </div>' +
      '  <div id="chatSugs" class="chat-sugs" hidden></div>' +
      '  <form id="chatForm" class="chat-form">' +
      '    <input id="chatInput" class="chat-input" type="text" placeholder="Ask me anything…" autocomplete="off" maxlength="500">' +
      '    <button id="chatSend" class="chat-send" type="submit" aria-label="Send">➤</button>' +
      '  </form>' +
      '</div>';

    document.body.appendChild(root);

    document.getElementById('chatFab').addEventListener('click', function () { setOpen(!state.open); });
    document.getElementById('chatClose').addEventListener('click', function () { setOpen(false); });
    document.getElementById('chatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });

    addClass(root, 'chat-root');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();