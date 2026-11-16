import { createAccountClient, resetTokenFromHash, describeDevice, timeAgo } from '/account.js';

// Account window and header identity. Rendering only: requests and error wording
// live in account.ts, which is unit-tested.

export const account = createAccountClient();
let currentUser = null;
let mode = 'signin'; // signin | signup | forgot | reset
let resetToken = null;
let flash = '';

export function signedInUser() {
  return currentUser;
}

/** Fetches the session once and updates the header ("Guest" or "Signed in as ..."). */
export async function refreshIdentity() {
  currentUser = await account.me();
  if (currentUser) mode = 'signin'; // the next time they're signed out, offer sign-in
  const label = document.querySelector('#identity');
  if (label) label.textContent = currentUser ? `SIGNED IN AS ${currentUser.displayName.toUpperCase()}` : 'GUEST';
}

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function field(form, labelText, attrs) {
  const label = el('label', labelText + ' ', { class: 'field' });
  const input = el('input', '', attrs);
  label.append(input);
  form.append(label);
  return input;
}

function statusLine(parent) {
  const status = el('p', '', { role: 'status', 'aria-live': 'polite', class: 'notice' });
  parent.append(status);
  return status;
}

/** Runs an account action with the submit button disabled, then reports the outcome. */
async function submitWith(button, status, action, onSuccess) {
  button.disabled = true;
  status.textContent = '';
  const result = await action();
  button.disabled = false;
  if (result.ok) onSuccess(result.value);
  else status.textContent = result.message;
}

/**
 * If the page was opened from a reset email, remember the token, remove it from the
 * address bar and history, and open the Account window on the new-password form.
 */
export function handleResetLink(openAccount) {
  const check = () => {
    const token = resetTokenFromHash(location.hash);
    if (!token) return;
    resetToken = token;
    mode = 'reset';
    history.replaceState(null, '', location.pathname + location.search);
    openAccount();
  };
  check();
  // Opening the link in a tab where the game is already loaded only changes the hash.
  window.addEventListener('hashchange', check);
}

function renderForgot(body, rerender) {
  body.append(el('h2', 'Reset your password'));
  body.append(el('p', "Enter your account's email. If it exists, we'll send a link to choose a new password.", { class: 'muted' }));
  const form = el('form', '', { class: 'account-form', novalidate: '' });
  body.append(form);
  const email = field(form, 'Email', { name: 'email', type: 'email', autocomplete: 'email', required: '' });
  const submit = el('button', 'Send reset link', { type: 'submit' });
  form.append(submit);
  const status = statusLine(form);
  form.onsubmit = (event) => {
    event.preventDefault();
    submitWith(submit, status, () => account.requestPasswordReset(email.value), (value) => {
      status.className = 'verified';
      status.textContent = value.message;
    });
  };
  const back = el('button', 'Back to sign in', { type: 'button', class: 'link' });
  back.onclick = () => { mode = 'signin'; rerender(); };
  body.append(back);
}

function renderReset(body, rerender) {
  body.append(el('h2', 'Choose a new password'));
  body.append(el('p', 'This signs you out on every device. Use at least 12 characters.', { class: 'muted' }));
  const form = el('form', '', { class: 'account-form', novalidate: '' });
  body.append(form);
  const password = field(form, 'New password', { name: 'password', type: 'password', autocomplete: 'new-password', required: '', minlength: '12' });
  const submit = el('button', 'Save new password', { type: 'submit' });
  form.append(submit);
  const status = statusLine(form);
  form.onsubmit = (event) => {
    event.preventDefault();
    submitWith(submit, status, () => account.resetPassword(resetToken, password.value), async () => {
      resetToken = null;
      mode = 'signin';
      flash = 'Password changed. Sign in with your new password.';
      await refreshIdentity();
      rerender();
    });
  };
}

/** "Where you're signed in": filled in once the list arrives. */
function renderDevices(body, rerender) {
  const section = el('section', '', { class: 'devices', 'aria-label': 'Signed-in devices' });
  section.append(el('h3', "Where you're signed in"));
  const list = el('ul', '', { class: 'device-list' });
  const status = statusLine(section);
  status.textContent = 'Loading devices…';
  section.append(list);
  body.append(section);

  account.listDevices().then((result) => {
    status.textContent = result.ok ? '' : result.message;
    if (!result.ok) return;
    for (const device of result.value) {
      const item = el('li', '', { class: 'device' });
      const name = el('strong', describeDevice(device.userAgent));
      item.append(name);
      if (device.current) item.append(el('span', 'This device', { class: 'tag' }));
      const details = [device.ip ? `IP ${device.ip}` : null, `active ${timeAgo(device.lastUsedAt)}`, `signed in ${timeAgo(device.createdAt)}`].filter(Boolean).join(' · ');
      item.append(el('small', details, { class: 'muted' }));
      if (!device.current) {
        const button = el('button', 'Sign out', { type: 'button', 'aria-label': `Sign out ${describeDevice(device.userAgent)}` });
        button.onclick = () => submitWith(button, status, () => account.signOutDevice(device.id), () => rerender());
        item.append(button);
      }
      list.append(item);
    }
  });
}

export function renderAccount(app, body, rerender) {
  if (app !== 'account') return;
  const text = (value, tag = 'p') => body.appendChild(el(tag, value));

  if (currentUser) {
    text('Your account', 'h2');
    text(`Signed in as ${currentUser.displayName} (${currentUser.email}).`);
    text('Your case progress is saved to your account, so you can continue on any device.', 'p').className = 'muted';
    const status = statusLine(body);
    const out = el('button', 'Sign out');
    const everywhere = el('button', 'Sign out on every device');
    out.onclick = () => submitWith(out, status, () => account.signOut(), async () => { await refreshIdentity(); rerender(); });
    everywhere.onclick = () => submitWith(everywhere, status, () => account.signOutEverywhere(), async () => { await refreshIdentity(); rerender(); });
    body.append(out, everywhere);
    renderDevices(body, rerender);
    return;
  }

  if (mode === 'forgot') return renderForgot(body, rerender);
  if (mode === 'reset' && resetToken) return renderReset(body, rerender);

  text(mode === 'signin' ? 'Sign in' : 'Create an account', 'h2');
  if (flash) {
    text(flash, 'p').className = 'verified';
    flash = '';
  }
  text('Accounts are optional. As a guest, progress is saved for this browser; sign in to keep it on any device.', 'p').className = 'muted';

  const form = el('form', '', { class: 'account-form', novalidate: '' });
  body.append(form);
  const name = mode === 'signup' ? field(form, 'Display name', { name: 'displayName', autocomplete: 'nickname', required: '', minlength: '2', maxlength: '40' }) : null;
  const email = field(form, 'Email', { name: 'email', type: 'email', autocomplete: 'email', required: '' });
  const password = field(form, 'Password', {
    name: 'password',
    type: 'password',
    required: '',
    autocomplete: mode === 'signin' ? 'current-password' : 'new-password',
    ...(mode === 'signup' ? { minlength: '12' } : {}),
  });
  if (mode === 'signup') form.append(el('small', 'At least 12 characters. A short sentence works well.', { class: 'muted' }));
  const submit = el('button', mode === 'signin' ? 'Sign in' : 'Create account', { type: 'submit' });
  form.append(submit);
  const status = statusLine(form);

  form.onsubmit = (event) => {
    event.preventDefault();
    const action = mode === 'signin'
      ? () => account.signIn(email.value, password.value)
      : () => account.signUp(name.value, email.value, password.value);
    submitWith(submit, status, action, async () => { await refreshIdentity(); rerender(); });
  };

  const swap = el('button', mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in', { type: 'button', class: 'link' });
  swap.onclick = () => { mode = mode === 'signin' ? 'signup' : 'signin'; rerender(); };
  body.append(swap);
  if (mode === 'signin') {
    const forgot = el('button', 'Forgot password?', { type: 'button', class: 'link' });
    forgot.onclick = () => { mode = 'forgot'; rerender(); };
    body.append(el('br'), forgot);
  }
}
