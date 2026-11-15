import {evidence} from '/case.js';
import {deductions,timeline,deduce,hints} from '/investigation.js';

// UI stays separate from the pure investigation rules used by tests.
export function renderJournal(app,body,state,journal,update){
 const text=(value,tag='p')=>{const node=document.createElement(tag);node.textContent=value;body.append(node);return node;};
 if(app==='deductions'){
  text('Build your case','h2');text('Choose a conclusion and select every recovered document needed to support it.');
  for(const d of deductions){
   const form=document.createElement('form');form.className='deduction';body.append(form);
   const heading=document.createElement('h3');heading.textContent=d.question;form.append(heading);
   if(journal.solved.includes(d.id)){const p=document.createElement('p');p.className='verified';p.textContent='VERIFIED · '+d.answer+' — '+d.explanation;form.append(p);continue;}
   const label=document.createElement('label');label.textContent='Conclusion';const select=document.createElement('select');select.required=true;
   for(const answer of ['',...d.options]){const option=document.createElement('option');option.value=answer;option.textContent=answer||'Choose a conclusion';select.append(option);}label.append(select);form.append(label);
   const field=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Supporting documents';field.append(legend);form.append(field);
   for(const clue of evidence.filter(e=>state.found.includes(e.id))){const label=document.createElement('label');label.className='evidence-choice';const input=document.createElement('input');input.type='checkbox';input.value=clue.id;label.append(input,document.createTextNode(clue.title));field.append(label);}
   if(!state.found.length){const p=document.createElement('p');p.textContent='Recover documents in Messages, Files and Archive first.';field.append(p);}
   const submit=document.createElement('button');submit.textContent='Verify deduction';form.append(submit);const feedback=document.createElement('p');feedback.setAttribute('role','status');form.append(feedback);
   form.onsubmit=e=>{e.preventDefault();const selected=Array.from(field.querySelectorAll('input:checked')).map(input=>input.value);const next=deduce(journal,state.found,d.id,select.value,selected);if(next===journal)feedback.textContent='Not established yet. Reconsider your conclusion and select all supporting documents.';else update(next,true);};
  }
 }
 if(app==='timeline'){
  text('The missing hour, reconstructed','h2');text('Only events supported by recovered documents appear. Times cross midnight.');
  for(const event of timeline){const known=event.requires.every(id=>state.found.includes(id));text(known?event.day+' / '+event.time:'Unrecovered event','h3');text(known?event.text:'Read more records to reconstruct this part of the night.');}
 }
 if(app==='notes'){
  text('Investigator’s notebook','h2');const label=document.createElement('label');label.textContent='Your theories and observations (up to 4,000 characters)';const input=document.createElement('textarea');input.maxLength=4000;input.rows=10;input.value=journal.notes;label.append(input);body.append(label);text('Notes save on this device as you type. Check the desktop status for save availability.');input.oninput=()=>{journal={...journal,notes:input.value};update(journal,false);};
 }
 if(app==='hints'){
  text('Need a lead?','h2');text('Optional hints become more specific. Revealed hints stay available.');for(const hint of hints.slice(0,journal.hints))text(hint);
  if(journal.hints<hints.length){const button=document.createElement('button');button.textContent='Reveal next hint';button.onclick=()=>update({...journal,hints:journal.hints+1},true);body.append(button);}else text('All hints revealed. Compare your documents with the deductions.');
 }
}
