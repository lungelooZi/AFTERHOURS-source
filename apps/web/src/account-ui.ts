import { createAccountClient } from '/account.js';

// Account window and header identity. Rendering only: requests and error wording
// live in account.ts, which is unit-tested.

export const account = createAccountClient();
let currentUser = null;
let mode = 'signin';

export function signedInUser() {
  return currentUser;
}

/** Fetches the session once and updates the header ("Guest" or "Signed in as ..."). */
export async function refreshIdentity() {
  currentUser = await account.me();
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

export function renderAccount(app, body, rerender) {
  if (app !== 'account') return;
  const text = (value, tag = 'p') => body.appendChild(el(tag, value));

  if (currentUser) {
    text('Your account', 'h2');
    text(`Signed in as ${currentUser.displayName} (${currentUser.email}).`);
    text('Case progress is still saved on this device. Saving it to your account is coming next.', 'p').className = 'muted';
    const status = statusLine(body);
    const out = el('button', 'Sign out');
    const everywhere = el('button', 'Sign out on every device');
    out.onclick = () => submitWith(out, status, () => account.signOut(), async () => { await refreshIdentity(); rerender(); });
    everywhere.onclick = () => submitWith(everywhere, status, () => account.signOutEverywhere(), async () => { await refreshIdentity(); rerender(); });
    body.append(out, everywhere);
    return;
  }

  text(mode === 'signin' ? 'Sign in' : 'Create an account', 'h2');
  text('Accounts are optional. You can keep playing as a guest.', 'p').className = 'muted';

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
}
