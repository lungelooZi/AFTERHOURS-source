export type Evidence = { id: string; title: string; source: string; text: string };
export const evidence: Evidence[] = [
 { id:'message', title:'The last message', source:'Messages / Maya', text:'23:41 — If I disappear, do not call Daniel. Find the place where the city keeps its light. I left the archive key in my draft. — Maya' },
 { id:'draft', title:'Unsent draft', source:'Files / unsent.txt', text:'Daniel thinks I copied the ledger. I did. The archive password is the year on the lighthouse inspection: 1998. Nia has a boat. I trust her.' },
 { id:'inspection', title:'Lighthouse inspection', source:'Files / inspection.txt', text:'HARBOUR AUTHORITY · 1998. North lighthouse, service entrance. A maintenance tunnel connects the tower to Pier 4. Warning: entrance is below the high-water line.' },
 { id:'ledger', title:'The payment ledger', source:'Archive / ledger.enc', text:'Payments authorised by Daniel Voss, signed with contractor Eli Reed’s credentials. An access note shows Daniel reset Eli’s password at 22:10. The signature alone does not prove Eli approved the payments.' },
 { id:'boat', title:'A private channel', source:'Messages / Nia', text:'00:06 — Maya made it to the service tunnel. My boat is at Pier 4. Send her location through our private channel; the company emergency line routes straight to Daniel.' },
];
export type Progress = { version: 1; found: string[]; pinned: string[]; unlocked: boolean; ending: null | 'safe' | 'intercepted' };
export const fresh = (): Progress => ({version:1,found:[],pinned:[],unlocked:false,ending:null});
export function restore(raw: string | null): Progress {
 try { const p = JSON.parse(raw || 'null'); if(p?.version !== 1) return fresh();
 const valid = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && evidence.some(e=>e.id===id)))] : [];
 const found=valid(p.found); return {version:1,found,pinned:valid(p.pinned).filter(id=>found.includes(id)),unlocked:p.unlocked===true,ending:['safe','intercepted'].includes(p.ending)?p.ending:null};
 } catch { return fresh(); }
}
export function discover(p: Progress, id: string): Progress {
 if(!evidence.some(e=>e.id===id) || (id==='ledger' && !p.unlocked)) return p;
 return {...p,found:[...new Set([...p.found,id])]};
}
export function unlock(p: Progress, password: string): Progress { return password.trim()==='1998' ? {...p,unlocked:true} : p; }
export function decide(p: Progress, channel: string): Progress {
 if(p.ending || !['message','inspection','boat','ledger'].every(id=>p.found.includes(id))) return p;
 if(!['private','company'].includes(channel)) return p;
 return {...p,ending:channel==='private'?'safe':'intercepted'};
}
