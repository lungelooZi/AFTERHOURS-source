import { createCaseClient, rejectionMessage } from '/case-client.js';
import { renderJournal } from '/journal-ui.js';
import { renderAccount, refreshIdentity, handleResetLink } from '/account-ui.js';

// The desktop: windows, the Messages/Files/Archive/Board/Make contact apps, and the
// status line. Every game decision is made by the server; this file only renders
// the PlayerView it returns and sends the player's actions.

const client = createCaseClient();
let view = null;
let offlineMessage = '';
let layer = 5;
let current = null; // { app, body } of the open window

const statusLine = document.querySelector('#status');
const host = document.querySelector('#windows');

function updateStatus() {
  if (!view) {
    statusLine.textContent = offlineMessage ? `CASE SERVER OFFLINE | ${offlineMessage}` : 'CONNECTING…';
    return;
  }
  const p = view.progress;
  statusLine.textContent = `${p.found} / ${p.totalEvidence} TRACES | ${p.solved} / ${p.totalDeductions} DEDUCTIONS | ${p.closed ? 'CASE CLOSED' : 'INVESTIGATION ACTIVE'}`;
}

async function load() {
  const result = await client.load();
  if (result.ok) {
    view = result.value;
    offlineMessage = '';
  } else {
    view = null;
    offlineMessage = result.message;
  }
  updateStatus();
  rerender();
}

/** Sends an action; on success stores the new view. Returns the message to show, if any. */
async function act(action) {
  const result = await client.act(action);
  if (!result.ok) return result.message;
  view = result.value.view;
  updateStatus();
  return rejectionMessage(result.value.outcome);
}

function rerender() {
  if (current?.body.isConnected) draw(current.app, current.body);
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function draw(app, body) {
  body.replaceChildren();
  const text = (value, tag = 'p', className) => body.appendChild(el(tag, value, className));
  const button = (label, onClick) => {
    const b = body.appendChild(el('button', label));
    b.onclick = onClick;
    return b;
  };
  const status = () => {
    const s = body.appendChild(el('p', '', 'notice'));
    s.setAttribute('role', 'status');
    return s;
  };

  if (app === 'account') return renderAccount(app, body, () => load());
  if (!view) {
    text(offlineMessage || 'Connecting to the case server…', 'p', offlineMessage ? 'notice' : 'muted');
    if (offlineMessage) button('Try again', () => load());
    return;
  }
  if (renderJournal(app, body, view, act, rerender)) return;

  const trace = (e) => {
    const box = body.appendChild(el('article', '', 'trace'));
    box.append(el('h3', e.title), el('p', e.text));
    const pinned = view.pinned.some((p) => p.id === e.id);
    const b = box.appendChild(el('button', pinned ? 'Unpin evidence' : 'Pin to evidence board'));
    b.onclick = async () => {
      b.disabled = true;
      await act({ type: pinned ? 'unpin' : 'pin', evidenceId: e.id });
      rerender();
    };
  };

  if (app === 'messages' || app === 'files') {
    text(app === 'messages' ? 'Someone was here after midnight.' : 'Recovered from the desktop', 'h2');
    if (!view.apps[app].length) text('Recovering…', 'p', 'muted');
    view.apps[app].forEach(trace);
  }

  if (app === 'archive') {
    text('Private archive', 'h2');
    if (view.archive.unlocked) return view.apps.archive.forEach(trace);
    text('Password protected. Maya left a hint in her unsent draft.');
    const form = body.appendChild(el('form'));
    const label = form.appendChild(el('label', 'Archive password '));
    const input = label.appendChild(el('input'));
    input.type = 'password';
    input.required = true;
    form.appendChild(el('button', 'Decrypt'));
    const error = status();
    form.onsubmit = async (event) => {
      event.preventDefault();
      error.textContent = '';
      const message = await act({ type: 'unlock', password: input.value });
      if (message) error.textContent = message;
      else rerender();
    };
  }

  if (app === 'board') {
    text('What the traces tell you', 'h2');
    text('Pin documents as you read them. Compare the payment signature with the password reset, and the company line with Nia’s warning.');
    if (!view.pinned.length) text('No evidence pinned yet.');
    for (const e of view.pinned) {
      text(e.source, 'h3');
      text(e.text);
    }
    text('Suspects: Daniel Voss — company director. Eli Reed — contractor. Nia Cole — harbour pilot.');
  }

  if (app === 'resolve') {
    text('The missing hour', 'h2');
    if (view.ending) {
      text(view.ending.title, 'h3', 'ending');
      text(view.ending.text);
      text('This is the end of the first case. Restart to explore the other channel.');
    } else if (view.resolve.ready) {
      text(view.resolve.prompt);
      const error = status();
      for (const channel of view.resolve.channels) {
        button(channel.label, async () => {
          const message = await act({ type: 'decide', channel: channel.id });
          if (message) error.textContent = message;
          else rerender();
        });
      }
    } else {
      text('Recover the key documents and verify all three deductions in Deductions before making contact.', 'p', 'notice');
      button('Open deductions', () => open('deductions'));
    }
  }
}

/** Opening Messages, Files or Archive is itself an action: it recovers that app's documents. */
const DISCOVERY_APPS = new Set(['messages', 'files', 'archive']);

function open(app) {
  document.querySelector('.window')?.remove();
  const win = el('section', '', 'window');
  win.setAttribute('aria-label', app);
  win.style.zIndex = String(++layer);
  const bar = win.appendChild(el('div', '', 'bar'));
  bar.append(el('span', `${app.toUpperCase()} / MAYA'S TERMINAL`));
  const close = bar.appendChild(el('button', '×'));
  close.setAttribute('aria-label', 'Close window');
  close.onclick = () => win.remove();
  const body = win.appendChild(el('div', '', 'content'));
  host.append(win);
  current = { app, body };
  draw(app, body);
  if (view && DISCOVERY_APPS.has(app) && !view.progress.closed) {
    // Redraw only if something new was recovered, so we never wipe what the player is typing.
    const before = view.progress.found;
    act({ type: 'open', app }).then(() => {
      if (view && view.progress.found !== before) rerender();
    });
  }

  let dx = 0;
  let dy = 0;
  bar.onpointerdown = (e) => {
    if (e.target.closest('button')) return;
    dx = e.clientX - win.offsetLeft;
    dy = e.clientY - win.offsetTop;
    bar.setPointerCapture(e.pointerId);
  };
  bar.onpointermove = (e) => {
    if (!bar.hasPointerCapture(e.pointerId)) return;
    win.style.left = Math.max(0, Math.min(innerWidth - win.offsetWidth, e.clientX - dx)) + 'px';
    win.style.top = Math.max(0, Math.min(innerHeight - 48, e.clientY - dy)) + 'px';
  };
  bar.onpointerup = (e) => {
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  };
  close.focus();
  win.onkeydown = (e) => {
    if (e.key === 'Escape') win.remove();
  };
}

document.querySelectorAll('[data-app]').forEach((b) => (b.onclick = () => open(b.dataset.app)));
document.querySelector('#reset').onclick = async () => {
  if (!confirm('Erase this case’s progress and start again?')) return;
  const result = await client.restart();
  if (result.ok) view = result.value;
  updateStatus();
  document.querySelector('.window')?.remove();
};

// Progress used to live in localStorage; it is now on the server.
try {
  localStorage.removeItem('afterhours.v1');
  localStorage.removeItem('afterhours.journal.v1');
} catch {}

updateStatus();
refreshIdentity().then(load);
handleResetLink(() => open('account'));
