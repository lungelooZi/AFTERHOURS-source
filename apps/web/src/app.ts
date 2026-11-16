import {freshJournal,restoreJournal,ready} from '/investigation.js';
import {renderJournal} from '/journal-ui.js';
import {renderAccount,refreshIdentity,handleResetLink} from '/account-ui.js';
import {evidence,fresh,restore,discover,unlock,decide} from '/case.js';
let state = fresh();
let storageOK=true;
try{state=restore(localStorage.getItem('afterhours.v1'));}catch{storageOK=false;}
let journal=freshJournal();
try{journal=restoreJournal(localStorage.getItem('afterhours.journal.v1'),state.found);}catch{storageOK=false;}
const host=document.querySelector('#windows')!;
let layer=5;
function save(){try{localStorage.setItem("afterhours.v1",JSON.stringify(state));localStorage.setItem("afterhours.journal.v1",JSON.stringify(journal));}catch{storageOK=false;}document.querySelector("#status")!.textContent=`${state.found.length} / 5 TRACES | ${journal.solved.length} / 3 DEDUCTIONS | ${state.ending?"CASE CLOSED":"INVESTIGATION ACTIVE"}${storageOK?"":" | SAVE UNAVAILABLE"}`;}
function open(app: string){
 document.querySelector('.window')?.remove();
 const win=document.createElement('section');win.className='window';win.setAttribute('aria-label',app);win.style.zIndex=String(++layer);
 const bar=document.createElement('div');bar.className='bar';bar.innerHTML=`<span>${app.toUpperCase()} / MAYA'S TERMINAL</span><button aria-label="Close window">×</button>`;
 bar.querySelector('button')!.onclick=()=>win.remove();win.append(bar);
 const body=document.createElement('div');body.className='content';win.append(body);host.append(win);
 function button(label: string, action:()=>void){const b=document.createElement('button');b.textContent=label;b.onclick=action;body.append(b);return b;}
 function text(value: string,tag='p'){const p=document.createElement(tag);p.textContent=value;body.append(p);return p;}
 function trace(id: string){const e=evidence.find(e=>e.id===id)!;state=discover(state,id);save();const box=document.createElement('article');box.className='trace';const h=document.createElement('h3');h.textContent=e.title;box.append(h);const p=document.createElement('p');p.textContent=e.text;box.append(p);body.append(box);button(state.pinned.includes(id)?'Unpin evidence':'Pin to evidence board',()=>{state={...state,pinned:state.pinned.includes(id)?state.pinned.filter(x=>x!==id):[...state.pinned,id]};save();open(app);});}
 renderJournal(app,body,state,journal,(next,refresh)=>{journal=next;save();if(refresh)open(app);});
 renderAccount(app,body,()=>open(app));
 if(app==='messages'){text('Someone was here after midnight.','h2');trace('message');trace('boat');}
 if(app==='files'){text('Recovered from the desktop','h2');trace('draft');trace('inspection');}
 if(app==='archive'){
  text('Private archive','h2');
  if(state.unlocked)trace('ledger');else{ text('Password protected. Maya left a hint in her unsent draft.');const form=document.createElement('form');const label=document.createElement('label');label.textContent='Archive password ';const input=document.createElement('input');input.type='password';input.required=true;label.append(input);form.append(label);const submit=document.createElement('button');submit.textContent='Decrypt';form.append(submit);const error=text('');error.setAttribute('role','status');form.onsubmit=e=>{e.preventDefault();state=unlock(state,input.value);save();if(state.unlocked)open(app);else error.textContent='Incorrect key. Check the recovered files.';};body.append(form);}
 }
 if(app==='board'){text('What the traces tell you','h2');text('Pin documents as you read them. Compare the payment signature with the password reset, and the company line with Nia’s warning.');if(!state.pinned.length)text('No evidence pinned yet.');for(const id of state.pinned){const e=evidence.find(e=>e.id===id)!;text(e.source,'h3');text(e.text);}text('Suspects: Daniel Voss — company director. Eli Reed — contractor. Nia Cole — harbour pilot.','p');}
 if(app==='resolve'){
  text('The missing hour','h2');
  if(state.ending){text(state.ending==='safe'?'SIGNAL RECEIVED / MAYA IS SAFE':'SIGNAL INTERCEPTED','h3').className='ending';text(state.ending==='safe'?'You sent the service-tunnel location directly to Nia. Her boat reached Pier 4 before the tide rose. Maya escaped with the ledger. Daniel’s reset of Eli’s credentials is the next lead.':'The company line forwarded your location to Daniel. By the time Nia reached the tunnel, Maya was gone. The copied ledger survives, but the rescue failed.');text('This is the end of the first case prototype. Restart to explore the other channel.');}
  else if(!ready(state.found,journal)){text("Recover the key documents and verify all three deductions in Deductions before making contact.").className="notice";button("Open deductions",()=>open("deductions"));}
  else {text('Maya is in the North lighthouse service tunnel. Who gets her location? This closes the case.');button('Send privately to Nia',()=>{state=decide(state,'private',ready(state.found,journal));save();open(app);});button('Call the company emergency line',()=>{state=decide(state,'company',ready(state.found,journal));save();open(app);});}
 }
 let dx=0,dy=0;bar.onpointerdown=e=>{if((e.target as HTMLElement).closest('button'))return;dx=e.clientX-win.offsetLeft;dy=e.clientY-win.offsetTop;bar.setPointerCapture(e.pointerId);};bar.onpointermove=e=>{if(!bar.hasPointerCapture(e.pointerId))return;win.style.left=Math.max(0,Math.min(innerWidth-win.offsetWidth,e.clientX-dx))+'px';win.style.top=Math.max(0,Math.min(innerHeight-48,e.clientY-dy))+'px';};bar.onpointerup=e=>{if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);};
 bar.querySelector('button')!.focus();
 win.onkeydown=e=>{if(e.key==='Escape')win.remove();};
}
document.querySelectorAll<HTMLButtonElement>('[data-app]').forEach(b=>b.onclick=()=>open(b.dataset.app!));
document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{if(confirm('Erase this case’s progress and start again?')){state=fresh();journal=freshJournal();save();document.querySelector('.window')?.remove();}};
save();
refreshIdentity();
handleResetLink(()=>open('account'));
