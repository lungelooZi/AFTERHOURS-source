export const deductions = [
  {id:'location', question:'Where is Maya waiting?', options:['North lighthouse service tunnel','Company headquarters','South harbour office'], answer:'North lighthouse service tunnel', requires:['message','inspection','boat'], explanation:'The lighthouse inspection identifies the tunnel; Nia confirms Maya reached it.'},
  {id:'signature', question:'Does the ledger prove Eli approved the payments?', options:['Yes, his signature is conclusive','No, his credentials were reset by Daniel','Nia signed on his behalf'], answer:'No, his credentials were reset by Daniel', requires:['ledger'], explanation:'Daniel reset Eli’s password. A credential signature cannot establish who used it.'},
  {id:'route', question:'Which route connects the hiding place to the rescue boat?', options:['The main road to headquarters','The maintenance tunnel to Pier 4','The south harbour bridge'], answer:'The maintenance tunnel to Pier 4', requires:['inspection','boat'], explanation:'The inspection connects the tower to Pier 4, where Nia’s boat is waiting.'},
];
export const timeline = [
  {time:'22:10', day:'Before midnight', requires:['ledger'], text:'Daniel resets Eli’s password. The payment signature is now questionable.'},
  {time:'23:41', day:'Before midnight', requires:['message'], text:'Maya sends her warning: do not call Daniel.'},
  {time:'00:06', day:'After midnight', requires:['boat'], text:'Nia confirms Maya reached the service tunnel; her boat is at Pier 4.'},
];
export type Journal = { solved:string[]; notes:string; hints:number };
export const freshJournal = ():Journal => ({solved:[],notes:'',hints:0});
export function restoreJournal(raw:string|null, found:string[]):Journal {
  try {
    const value=JSON.parse(raw||'null');
    return {solved:deductions.filter(d=>Array.isArray(value?.solved)&&value.solved.includes(d.id)&&d.requires.every(id=>found.includes(id))).map(d=>d.id), notes:typeof value?.notes==='string'?value.notes.slice(0,4000):'', hints:Number.isInteger(value?.hints)?Math.max(0,Math.min(3,value.hints)):0};
  } catch {return freshJournal();}
}
export function deduce(journal:Journal, found:string[], id:string, answer:string, supporting:string[]):Journal {
  const deduction=deductions.find(d=>d.id===id);
  if(!deduction || journal.solved.includes(id) || answer!==deduction.answer || !deduction.requires.every(clue=>found.includes(clue)&&supporting.includes(clue))) return journal;
  return {...journal,solved:[...journal.solved,id]};
}
export function ready(found:string[],journal:Journal):boolean {
  return ['message','inspection','boat','ledger'].every(id=>found.includes(id))&&deductions.every(d=>journal.solved.includes(d.id));
}
export const hints=[
  'Start in Messages, then read both recovered files. Maya’s draft tells you which date matters.',
  'Decrypt the archive with the inspection year. Compare who signed the ledger with who reset the password.',
  'For deductions, select the documents that support your answer. Connect Maya’s message, the inspection and Nia’s update to locate her; the inspection and Nia’s update establish the route.',
];
