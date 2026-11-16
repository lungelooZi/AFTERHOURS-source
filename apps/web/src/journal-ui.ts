// Deductions, Timeline, Notebook and Hints. Renders the server's PlayerView; returns
// true if it drew the app. Answers arrive only once a deduction is solved.

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const allFound = (view) => [...view.apps.messages, ...view.apps.files, ...view.apps.archive];

let notesTimer = 0;

export function renderJournal(app, body, view, act, rerender) {
  const text = (value, tag = 'p', className) => body.appendChild(el(tag, value, className));

  if (app === 'deductions') {
    text('Build your case', 'h2');
    text('Choose a conclusion and select every recovered document needed to support it.');
    const found = allFound(view);
    for (const d of view.deductions) {
      const form = body.appendChild(el('form', '', 'deduction'));
      form.append(el('h3', d.question));
      if (d.solved) {
        form.append(el('p', `VERIFIED · ${d.answer} — ${d.explanation}`, 'verified'));
        continue;
      }
      const label = form.appendChild(el('label', 'Conclusion'));
      const select = label.appendChild(el('select'));
      select.required = true;
      for (const option of ['', ...d.options]) {
        const o = select.appendChild(el('option', option || 'Choose a conclusion'));
        o.value = option;
      }
      const field = form.appendChild(el('fieldset'));
      field.append(el('legend', 'Supporting documents'));
      for (const clue of found) {
        const choice = field.appendChild(el('label', '', 'evidence-choice'));
        const input = choice.appendChild(el('input'));
        input.type = 'checkbox';
        input.value = clue.id;
        choice.append(document.createTextNode(clue.title));
      }
      if (!found.length) field.append(el('p', 'Recover documents in Messages, Files and Archive first.'));
      const submit = form.appendChild(el('button', 'Verify deduction'));
      const feedback = form.appendChild(el('p'));
      feedback.setAttribute('role', 'status');
      form.onsubmit = async (event) => {
        event.preventDefault();
        submit.disabled = true;
        const supporting = [...field.querySelectorAll('input:checked')].map((i) => i.value);
        const message = await act({ type: 'deduce', deductionId: d.id, answer: select.value, supporting });
        submit.disabled = false;
        if (message) feedback.textContent = message;
        else rerender();
      };
    }
    return true;
  }

  if (app === 'timeline') {
    text('The missing hour, reconstructed', 'h2');
    text('Only events supported by recovered documents appear. Times cross midnight.');
    for (const event of view.timeline) {
      text(event.known ? `${event.day} / ${event.time}` : 'Unrecovered event', 'h3');
      text(event.known ? event.text : 'Read more records to reconstruct this part of the night.');
    }
    return true;
  }

  if (app === 'notes') {
    text('Investigator’s notebook', 'h2');
    const label = body.appendChild(el('label', 'Your theories and observations (up to 4,000 characters)'));
    const input = label.appendChild(el('textarea'));
    input.maxLength = 4000;
    input.rows = 10;
    input.value = view.notes;
    const saved = text('Notes save automatically as you type.', 'p', 'muted');
    saved.setAttribute('role', 'status');
    input.oninput = () => {
      clearTimeout(notesTimer);
      saved.textContent = 'Saving…';
      // Save once typing pauses, not on every keystroke.
      notesTimer = setTimeout(async () => {
        const message = await act({ type: 'notes', text: input.value });
        saved.textContent = message || 'Saved.';
      }, 700);
    };
    return true;
  }

  if (app === 'hints') {
    text('Need a lead?', 'h2');
    text('Optional hints become more specific. Revealed hints stay available.');
    for (const hint of view.hints.revealed) text(hint);
    if (view.hints.remaining > 0) {
      const b = body.appendChild(el('button', 'Reveal next hint'));
      b.onclick = async () => {
        b.disabled = true;
        await act({ type: 'hint' });
        rerender();
      };
    } else text('All hints revealed. Compare your documents with the deductions.');
    return true;
  }

  return false;
}
