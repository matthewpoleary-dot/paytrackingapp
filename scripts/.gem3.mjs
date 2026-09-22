const key=process.env.GEMINI_API_KEY;
const model='gemini-3.5-flash';
const tools=[{name:'get_pay_snapshot',description:'x',parameters:{type:'OBJECT',properties:{from:{type:'STRING'}},required:['from']}}];

async function call(label, config) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body: JSON.stringify({ contents:[{role:'user',parts:[{text:'Reply with the word OK.'}]}], ...config }),
  });
  const body=await r.text();
  let note='';
  try{ const j=JSON.parse(body); note = j.error ? `${j.error.status}` : 'ok'; }catch{ note=body.slice(0,40); }
  console.log(`  ${String(r.status).padEnd(4)} ${label.padEnd(34)} ${note}`);
  return r.status;
}

console.log('same model, same prompt, different request shape:\n');
await call('plain', {});
await call('+ functionDeclarations', { tools:[{functionDeclarations:tools}] });
await call('+ googleSearch', { tools:[{googleSearch:{}}] });
await call('+ both (what the app sends)', { tools:[{functionDeclarations:tools},{googleSearch:{}}] });
