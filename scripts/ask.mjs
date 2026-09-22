// Asks the AI tab one question and reports what it actually did.
//
// The test the architecture exists to pass: a question needing arithmetic
// over real data must come back with TOOL CALLS in the transcript, not a
// confident-sounding number. A run showing "NONE" is the failure, however
// plausible the prose looks.
//
// It also prints the provider request count, which is not obvious: the
// agentic loop makes one request per ROUND TRIP, not per message. Measured
// at 5 for a single two-part question, against a free tier of 5-15 a minute.
//
//   node --env-file-if-exists=.env.local scripts/ask.mjs "your question"
//
// Needs the dev server up and .shots/.session.json from a screenshot run.

import { readFile } from 'node:fs/promises';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, ref=new URL(url).hostname.split('.')[0];
const s=JSON.parse(await readFile('.shots/.session.json','utf8'));
const enc=`base64-${Buffer.from(JSON.stringify(s)).toString('base64')}`;
const CHUNK=3180; const jar=[];
if(enc.length<=CHUNK) jar.push(`sb-${ref}-auth-token=${enc}`);
else for(let i=0;i*CHUNK<enc.length;i++) jar.push(`sb-${ref}-auth-token.${i}=${enc.slice(i*CHUNK,(i+1)*CHUNK)}`);

const question = process.argv[2] ?? 'How much did I earn in September, and am I on track for Erasmus?';
console.log(`Q: ${question}\n`);

const r = await fetch('http://localhost:3000/api/ai/chat', {
  method:'POST',
  headers:{'Content-Type':'application/json', cookie: jar.join('; ')},
  body: JSON.stringify({ message: question }),
});
console.log(`HTTP ${r.status}`);
if (!r.body) { console.log(await r.text()); process.exit(0); }

const reader=r.body.getReader(); const dec=new TextDecoder();
let buf=''; let text=''; const tools=[]; let requests=null; let err=null;
while(true){
  const {done,value}=await reader.read(); if(done) break;
  buf+=dec.decode(value,{stream:true});
  const lines=buf.split('\n'); buf=lines.pop()??'';
  for(const line of lines){
    if(!line.trim()) continue;
    const e=JSON.parse(line);
    if(e.type==='text') text+=e.text;
    if(e.type==='tool') tools.push(e.name);
    if(e.type==='tool_result') tools[tools.length-1]+=` -> ${JSON.stringify(e.output).slice(0,110)}`;
    if(e.type==='done') requests=e.requests;
    if(e.type==='error') err=e;
  }
}
console.log('\n--- TOOL CALLS ---');
console.log(tools.length ? tools.map(t=>'  '+t).join('\n') : '  NONE  <-- the failure this architecture exists to prevent');
console.log('\n--- ANSWER ---');
console.log(text.trim().slice(0,900) || '(empty)');
if(err) console.log('\n--- ERROR ---\n', JSON.stringify(err,null,2).slice(0,900));
console.log(`\n--- provider requests for this one message: ${requests ?? 'n/a'} ---`);
