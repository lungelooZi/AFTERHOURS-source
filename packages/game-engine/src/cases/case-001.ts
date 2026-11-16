import type { CaseDefinition } from '../types.ts';

/** Case 001: The Missing Hour. Server-only: this file contains every answer. */
export const case001: CaseDefinition = {
  id: 'case-001',
  title: 'The Missing Hour',
  evidence: [
    { id: 'message', title: 'The last message', source: 'Messages / Maya', text: '23:41 — If I disappear, do not call Daniel. Find the place where the city keeps its light. I left the archive key in my draft. — Maya' },
    { id: 'draft', title: 'Unsent draft', source: 'Files / unsent.txt', text: 'Daniel thinks I copied the ledger. I did. The archive password is the year on the lighthouse inspection: 1998. Nia has a boat. I trust her.' },
    { id: 'inspection', title: 'Lighthouse inspection', source: 'Files / inspection.txt', text: 'HARBOUR AUTHORITY · 1998. North lighthouse, service entrance. A maintenance tunnel connects the tower to Pier 4. Warning: entrance is below the high-water line.' },
    { id: 'ledger', title: 'The payment ledger', source: 'Archive / ledger.enc', text: 'Payments authorised by Daniel Voss, signed with contractor Eli Reed’s credentials. An access note shows Daniel reset Eli’s password at 22:10. The signature alone does not prove Eli approved the payments.' },
    { id: 'boat', title: 'A private channel', source: 'Messages / Nia', text: '00:06 — Maya made it to the service tunnel. My boat is at Pier 4. Send her location through our private channel; the company emergency line routes straight to Daniel.' },
  ],
  apps: { messages: ['message', 'boat'], files: ['draft', 'inspection'], archive: [] },
  archive: { password: '1998', reveals: ['ledger'] },
  deductions: [
    { id: 'location', question: 'Where is Maya waiting?', options: ['North lighthouse service tunnel', 'Company headquarters', 'South harbour office'], answer: 'North lighthouse service tunnel', requires: ['message', 'inspection', 'boat'], explanation: 'The lighthouse inspection identifies the tunnel; Nia confirms Maya reached it.' },
    { id: 'signature', question: 'Does the ledger prove Eli approved the payments?', options: ['Yes, his signature is conclusive', 'No, his credentials were reset by Daniel', 'Nia signed on his behalf'], answer: 'No, his credentials were reset by Daniel', requires: ['ledger'], explanation: 'Daniel reset Eli’s password. A credential signature cannot establish who used it.' },
    { id: 'route', question: 'Which route connects the hiding place to the rescue boat?', options: ['The main road to headquarters', 'The maintenance tunnel to Pier 4', 'The south harbour bridge'], answer: 'The maintenance tunnel to Pier 4', requires: ['inspection', 'boat'], explanation: 'The inspection connects the tower to Pier 4, where Nia’s boat is waiting.' },
  ],
  timeline: [
    { time: '22:10', day: 'Before midnight', requires: ['ledger'], text: 'Daniel resets Eli’s password. The payment signature is now questionable.' },
    { time: '23:41', day: 'Before midnight', requires: ['message'], text: 'Maya sends her warning: do not call Daniel.' },
    { time: '00:06', day: 'After midnight', requires: ['boat'], text: 'Nia confirms Maya reached the service tunnel; her boat is at Pier 4.' },
  ],
  hints: [
    'Start in Messages, then read both recovered files. Maya’s draft tells you which date matters.',
    'Decrypt the archive with the inspection year. Compare who signed the ledger with who reset the password.',
    'For deductions, select the documents that support your answer. Connect Maya’s message, the inspection and Nia’s update to locate her; the inspection and Nia’s update establish the route.',
  ],
  rescueRequires: ['message', 'inspection', 'boat', 'ledger'],
  resolve: {
    prompt: 'Maya is in the North lighthouse service tunnel. Who gets her location? This closes the case.',
    channels: [
      { id: 'private', label: 'Send privately to Nia', ending: 'safe' },
      { id: 'company', label: 'Call the company emergency line', ending: 'intercepted' },
    ],
  },
  endings: {
    safe: { title: 'SIGNAL RECEIVED / MAYA IS SAFE', text: 'You sent the service-tunnel location directly to Nia. Her boat reached Pier 4 before the tide rose. Maya escaped with the ledger. Daniel’s reset of Eli’s credentials is the next lead.' },
    intercepted: { title: 'SIGNAL INTERCEPTED', text: 'The company line forwarded your location to Daniel. By the time Nia reached the tunnel, Maya was gone. The copied ledger survives, but the rescue failed.' },
  },
};
