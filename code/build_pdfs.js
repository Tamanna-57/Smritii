#!/usr/bin/env node
/**
 * Builds the two Milestone 2 PDFs from the repository's own files:
 *   docs/Technical_Report.pdf  (supporting document, 2 pages)
 *   docs/Synopsis.pdf          (alternative supporting document, from docs/Synopsis.md)
 *   docs/Milestone2.pdf        (7 sections in the order the college requires)
 * and copies them to the submission names:
 *   docs/M2_<TeamID>_Smriti.pdf and docs/<TeamName>_TechnicalReport.pdf
 *
 * Inputs: docs/team_info.json, prompts/, test-data/outputs/*, docs/diagrams/*.png,
 *         docs/screenshots/milestone2/*.png
 * Every number and test row comes from the saved test outputs; nothing is typed here.
 *
 * Usage: node code/build_pdfs.js      (needs Playwright + Chromium)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const json = (p) => (exists(p) ? JSON.parse(rd(p)) : null);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (p) => `data:image/png;base64,${fs.readFileSync(path.join(ROOT, p)).toString('base64')}`;
const ph = (s) => (/^<.*>$/.test(String(s)) ? `<span class="ph">${esc(s)}</span>` : esc(s));

const team = json('docs/team_info.json');

// ── Data from test outputs ──────────────────────────────────────────────────
const apiFile = exists('test-data/outputs/api_test_results_gemini.json') ? 'test-data/outputs/api_test_results_gemini.json' : 'test-data/outputs/api_test_results_no_gemini_key.json';
const api = json(apiFile);
const ui = json('test-data/outputs/ui_test_results.json');
const wa = json('test-data/outputs/whatsapp_webhook_test.json');
const exp = json('test-data/outputs/prompt_experiments.json');
const geminiRun = apiFile.includes('_gemini.json');

function shortBody(r) {
  const b = r.actualBody;
  if (b == null) return '';
  if (typeof b === 'string') return b.slice(0, 120);
  if (b.reply) return `${b.reply.slice(0, 150)}${b.reply.length > 150 ? '…' : ''} [${b.replySource}]`;
  if (b.token) return 'token issued';
  if (b.session) return `${b.message}; score ${b.session.score}`;
  if (b.error) return b.error;
  return JSON.stringify(b).slice(0, 140);
}
const tests = [
  ...api.results.map((r) => ({ id: r.id, input: r.input, type: r.type, expected: r.expected, actual: `HTTP ${r.actualStatus}: ${shortBody(r)}`, result: r.result })),
  ...ui.results.map((r) => ({ id: r.id, input: r.input, type: r.type, expected: r.expected, actual: r.actual, result: r.result })),
  ...wa.results.map((r) => ({ id: r.id, input: r.input, type: r.type, expected: r.expected, actual: r.actual, result: r.result })),
];
const nPass = tests.filter((t) => t.result === 'Pass').length;
const nEdge = tests.filter((t) => t.type === 'Edge').length;
const nInvalid = tests.filter((t) => t.type === 'Invalid').length;

// Prompt experiment summary
const metrics = ['doctor_named', 'medicine_named', 'in_language', 'dose_safe', 'short'];
const metricLabel = { doctor_named: 'Doctor named', medicine_named: 'Medicine named', in_language: 'Assamese reply', dose_safe: 'Dose question → doctor', short: '≤ 4 sentences' };
function rate(v, m) {
  if (!exp) return null;
  const rs = exp.runs.filter((r) => r.version === v && !r.error && m in r.metrics);
  return rs.length ? { ok: rs.filter((r) => r.metrics[m]).length, n: rs.length } : null;
}
const rateTxt = (v, m) => { const r = rate(v, m); return r ? `${r.ok}/${r.n}` : 'pending'; };
const sampleReply = (v, q) => exp?.runs.find((r) => r.version === v && r.question === q && r.run === 1 && !r.error);

// ── Shared text ─────────────────────────────────────────────────────────────
const promptBlock = (file) => {
  const md = rd(file);
  const sys = md.match(/## System prompt\n\n```text\n([\s\S]*?)\n```/);
  return sys ? sys[1] : '';
};
const P1v1 = promptBlock('prompts/v1/P1_patient_companion_chat.md');
const P1v2 = promptBlock('prompts/v2/P1_patient_companion_chat.md');
const P1v3 = promptBlock('prompts/v3/P1_patient_companion_chat.md');
const P2user = rd('prompts/final/P2_voice_question.md').match(/## User prompt template[\s\S]*?```text\n([\s\S]*?)\n```/)[1];
const P3sys = promptBlock('prompts/final/P3_whatsapp_companion.md');

const css = `
  @page { size: A4; margin: 16mm 15mm 16mm 15mm; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9.6pt; color: #1c1917; line-height: 1.38; }
  h1 { font-size: 17pt; margin: 0 0 4px; color: #7c2d12; }
  h2 { font-size: 13pt; margin: 16px 0 6px; break-after: avoid; color: #7c2d12; border-bottom: 1.5px solid #fed7aa; padding-bottom: 2px; }
  h3 { font-size: 10.5pt; margin: 9px 0 4px; break-after: avoid; }
  tr, figure, pre { break-inside: avoid; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
  .grid2 figure { margin: 0 0 8px; }
  p { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 8.4pt; }
  th, td { border: 1px solid #d6d3d1; padding: 3px 5px; vertical-align: top; text-align: left; }
  th { background: #fff7ed; }
  pre { white-space: pre-wrap; font-family: "DejaVu Sans Mono", monospace; font-size: 7.4pt; background: #fafaf9; border: 1px solid #e7e5e4; padding: 6px; margin: 4px 0; }
  .ph { background: #fef08a; padding: 0 2px; }
  .pass { color: #166534; font-weight: bold; } .fail { color: #b91c1c; font-weight: bold; }
  .small { font-size: 8pt; color: #57534e; }
  .break { page-break-before: always; }
  figure { margin: 6px 0; text-align: center; } figure img { max-width: 100%; border: 1px solid #e7e5e4; }
  figcaption { font-size: 8pt; color: #57534e; }
  .shots { display: flex; gap: 8px; } .shots figure { flex: 1; } .shots img { max-height: 330px; }
  .cover { text-align: center; padding-top: 120px; page-break-after: always; } .cover table { width: 80%; margin: 18px auto; font-size: 10pt; }
`;

// ── Technical report (supporting document) ──────────────────────────────────
const apiPass = api.results.filter((r) => r.result === 'Pass').length;
const techReport = `
<h1>Smriti: Technical Report</h1>
<p class="small">${ph(team.teamName)} · ${ph(team.teamId)} · SCSE4041 Mini Project, Milestone 2 · Repository: ${esc(team.repoUrl)} · Prototype: ${ph(team.prototypeUrl)}</p>

<h3>1. Introduction</h3>
<p>Smriti is a mobile-first web app (installable PWA) that acts as a daily memory companion for elderly people with early dementia and gives their caregivers a monitoring dashboard. It builds on the open Smriti project by Team Design Divas (Smart India Hackathon 2026); Milestone 2 audited, fixed, tested and documented it.</p>

<h3>2. Problem statement</h3>
<p>Patients with early memory loss forget medicines, meals and family members, often speak Assamese or Hindi rather than English, and may have weak internet. Caregivers cannot easily see whether the day's routine was followed.</p>

<h3>3. Proposed solution</h3>
<p>A patient portal with PIN login, today's 10-item schedule read aloud, five culturally familiar memory games with adaptive difficulty, a family photo Memory Bank and an <b>LLM companion chat grounded in the patient's own records</b>; a caregiver portal with adherence, alerts, health score and game telemetry; a WhatsApp channel for reminders and "Done" replies.</p>

<h3>4. System architecture</h3>
<figure><img src="${img('docs/diagrams/01_system_architecture.png')}" style="max-height:270px"></figure>
<p>React 19 PWA (Vercel) → Express 5 REST API (Render) → MongoDB Atlas. The API calls Google Gemini for chat, an optional FastAPI ML engine for difficulty and health score (with rule-based fallback), and the Meta WhatsApp Cloud API.</p>

<h3>5. Technologies and AI models</h3>
<p>React 19, Vite 8, Tailwind 4, i18next (en/hi/as), Workbox + IndexedDB, Web Speech API; Node.js, Express 5, Mongoose 9, JWT, bcrypt, node-cron; MongoDB. <b>Google Gemini</b> via <code>@google/genai</code>: P1/P2 try <code>gemini-3.5-flash-lite → gemini-3.5-flash → gemini-flash-latest</code> (temperature 0.7, 350 tokens); P3 uses <code>gemini-3.6-flash</code>. Flash-class models were chosen for low latency (replies are read aloud) and native audio input for voice questions.</p>

<h3>6. Prompt design and AI integration</h3>
<p>Three final prompts: <b>P1</b> Patient Companion Chat, <b>P2</b> Voice Question (audio in, "TRANSCRIPTION / REPLY" out), <b>P3</b> WhatsApp reply. P1's system prompt is rebuilt on every request from MongoDB: profile, preferred language, today's reminders with status, family photos and last 5 game scores, followed by 5 rules (answer from records, 2–4 sentences, warmth, narrowly scoped distress reassurance, 🌸 sign-off). It evolved through three versions in the project history: v1 persona only → v2 grounded in records with medicine-safety rules → v3 adds a strict language rule, game context and per-question answer patterns, but drops v2's "never invent doses / ask the doctor" rule. If Gemini fails, a keyword-based reply in the patient's language is returned and the API marks it <code>replySource: "fallback"</code>.</p>

<h3>7. Implementation details</h3>
<p>Milestone 2 fixed six defects found while running the app: seed script crash on Linux, wrong PIN still opening the dashboard, Daily Routine Sequencer dealing no cards, WhatsApp replies not matched to patients, Hindi reminders all showing one title, and a login rate limit that would lock out every visitor behind Render's proxy. It added opt-in demo seeding and India time zone for hosting, a <code>replySource</code> field, and test runners for the API, browser and WhatsApp webhook.</p>

<h3>8. Testing results</h3>
<p>${tests.length} test inputs (${nEdge} edge, ${nInvalid} invalid): <b>${nPass} passed, ${tests.length - nPass} failed</b>. API ${apiPass}/${api.results.length}, browser ${ui.results.filter((r) => r.result === 'Pass').length}/${ui.results.length}, WhatsApp ${wa.results.filter((r) => r.result === 'Pass').length}/${wa.results.length}. Failures: lower-case name rejected at login (T03), double-dose question not referred to the doctor (T11), anonymous game score accepted (T19). ${geminiRun ? 'Chat tests ran on Gemini.' : 'Chat tests ran without a Gemini key, so they exercised the offline fallback; the Gemini run is pending.'} ${exp ? `Prompt experiment (${exp.meta.model}, ${exp.meta.runsPerQuestion} runs/question): Assamese replies v1 ${rateTxt('v1', 'in_language')}, v2 ${rateTxt('v2', 'in_language')}, v3 ${rateTxt('v3', 'in_language')}; dose question referred to doctor v1 ${rateTxt('v1', 'dose_safe')}, v2 ${rateTxt('v2', 'dose_safe')}, v3 ${rateTxt('v3', 'dose_safe')}.` : 'Prompt v1/v2/v3 comparison pending a Gemini key.'}</p>

<h3>9. Limitations</h3>
<p>(1) P1 v3 has no rule against dose advice. (2) Voice input (P2) and WhatsApp sending are untested here (no microphone; no Meta token). (3) Several endpoints accept unauthenticated writes (game sessions, reminder updates, <code>/api/test/*</code>). (4) The external ML engine was unreachable, so adaptive difficulty used rules. (5) Patient name match is case-sensitive.</p>

<h3>10. Future improvements</h3>
<p>Restore the dose-safety rule as P1 v4 and re-measure; record test clips for P2; require auth on all write routes; case-insensitive login; connect a WhatsApp Business number; validate with caregivers.</p>
`;

// ── Synopsis (alternative supporting document), from docs/Synopsis.md ────────
function mdToHtml(md) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  const out = []; let list = null; let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.split('\n')) {
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^# (.*)/))) { flush(); out.push(`<h1>${inline(m[1])}</h1>`); continue; }
    if ((m = line.match(/^## (.*)/))) { flush(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^(?:- |\d+\. )(.*)/))) {
      const tag = /^\d/.test(line) ? 'ol' : 'ul';
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if (line.startsWith('@@HTML@@')) { flush(); out.push(line.slice(8)); continue; }
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}
const synopsis = mdToHtml(rd('docs/Synopsis.md')
  .replace('{{TEAM_LINE}}', `@@HTML@@<p class="small">${ph(team.teamName)} · ${ph(team.teamId)} · SCSE4041 Mini Project, Milestone 2 · Prototype: ${ph(team.prototypeUrl)} · Repository: ${esc(team.repoUrl)}</p>`)
  .replace('{{TEST_SUMMARY}}', `We wrote ${tests.length} test cases: ${tests.length - nEdge - nInvalid} normal inputs, ${nEdge} edge cases and ${nInvalid} invalid or broken ones (wrong PIN, empty message, a forged login token, the server for translations being offline, and so on). In the latest run ${nPass} passed and ${tests.length - nPass} failed, and we report the failures as they are rather than tuning the tests until everything is green.`));
const supportingIsSynopsis = String(team.supportingDocument || 'synopsis').toLowerCase().startsWith('syn');
const supportingHtml = supportingIsSynopsis ? synopsis : techReport;

// ── Milestone 2 PDF ─────────────────────────────────────────────────────────
const promptSheet = (id, name, rows, sys, user, sample) => `
<h3>${id} · ${name}</h3>
<table>${rows.map(([k, v]) => `<tr><th style="width:24%">${k}</th><td>${v}</td></tr>`).join('')}</table>
<p><b>Full system prompt</b></p><pre>${esc(sys)}</pre>
<p><b>User prompt template</b></p><pre>${esc(user)}</pre>
<p><b>Sample run</b></p>${sample}`;

const p1sample = (() => {
  const r = sampleReply('v3', 'doctor');
  if (r) return `<table><tr><th>Input</th><td>${esc(r.input)} (patient Ramesh Sharma, language Assamese)</td></tr><tr><th>Actual output</th><td>${esc(r.reply)}</td></tr><tr><th>Run</th><td>${esc(exp.meta.model)}, ${esc(exp.meta.ranAt)}</td></tr></table>`;
  return '<p class="ph">Pending: a real Gemini output will be inserted here after running code/prompt_experiments.js with a Gemini key.</p>';
})();

const p1vars = `{patient_name}, {first_name}, {honorific} (Dada/Uncle or Baideo/Aunty), {age}, {location}, {preferred_language}, {cognitive_stage}, {doctor}, {emergency_contact}, {medical_notes}, {care_notes}: from the patient record. {reminders_summary}: one line per reminder today (type, title, time, detail, status). {family_summary}: one line per Memory Bank photo. {games_summary}: last 5 game sessions. {user_message}: what the patient typed.`;

const iterRows = [
  ['v1', 'The first prompt (1 Sep). It only told the model to be Smriti: warm, simple and brief, one or two sentences. It said nothing about the patient.', 'Our starting point.'],
  ['v2', 'Second version (2 Sep). The prompt is rebuilt from the database for every message, with the patient\'s profile, today\'s reminders and family. Six rules were added, including "never make up medicines or doses" and "ask the doctor before changing a dose".', 'v1 could not answer simple personal questions like "Who is my doctor?" or "Which tablet now?".'],
  ['v3 (final)', 'Third version (4 Sep). Added a strict rule to always reply in the patient\'s language, the last five game scores, a clear way to answer each kind of question, and comfort only when the patient is actually upset. The two dose-safety rules from v2 were dropped.', 'Replies were coming back in English for Assamese and Hindi speakers, and comforting lines appeared even for plain factual questions.'],
];
const STATIC_RESULT = {
  v1: 'The prompt holds no facts about the patient at all, so it has no way to name the doctor, the medicines or the language.',
  v2: 'The prompt now includes the profile, all ten of today\'s reminders with their status, and the family list, along with the dose-safety rule.',
  v3: 'Adds the language rule and recent game scores, but the dose-safety rule is gone. Test T11 (a double-dose question, run in offline mode) failed: the reply did not send the patient to the doctor.',
};
const iterResult = (v) => {
  if (!exp) return `${STATIC_RESULT[v] || ''} <i>Live Gemini numbers to follow.</i>`;
  return metrics.map((m) => `${metricLabel[m]}: ${rateTxt(v, m)}`).join('; ');
};

const testTable = `<table><tr><th>No.</th><th style="width:21%">Input (short)</th><th>Type</th><th style="width:21%">Expected output</th><th style="width:31%">Actual output (short)</th><th>Pass / Fail</th></tr>
${tests.map((t) => `<tr><td>${t.id}</td><td>${esc(t.input)}</td><td>${t.type}</td><td>${esc(t.expected)}</td><td>${esc(t.actual)}</td><td class="${t.result === 'Pass' ? 'pass' : 'fail'}">${t.result}</td></tr>`).join('')}</table>`;

const moduleRows = [
  ['Patient login', 'Name + 4-digit PIN, JWT session', 'Working', 'Wrong-PIN bypass fixed (UI1). Name is case-sensitive (T03 fails).'],
  ['Daily schedule & reminders', '10 timed items, tap to complete, read aloud', 'Working', 'UI3, UI4'],
  ['Cognitive games (5)', 'Market Day Basket, Daily Routine Sequencer, Faces & Family Recall, Sound & Rhythm Match, Odd One Out', 'Working', 'Routine Sequencer fixed (UI2). 6 further games are "coming soon" tiles.'],
  ['Adaptive difficulty & health score', 'Next level and 0–100 score from reaction time and mistakes', 'Working', 'Rule-based fallback; external ML engine unreachable (T13–T15).'],
  ['Family Memory Bank', 'Photo gallery with stories', 'Working', ''],
  ['AI companion chat (P1)', 'Answers from the patient\'s records in their language', geminiRun ? 'Working' : 'Partly working', geminiRun ? 'Gemini run T07–T11.' : 'Chat window, API and fallback verified; Gemini replies pending a key.'],
  ['Voice question (P2)', 'Speak instead of type', 'Not started (testing)', 'Code present; not testable without microphone and key.'],
  ['Caregiver dashboard', 'Roster, adherence, alerts, patient record, telemetry', 'Working', ''],
  ['WhatsApp bot (P3)', '09:00 reminders, "Done" replies, AI replies', 'Partly working', 'Incoming "Done" works (W1, W2); sending needs a Meta token.'],
  ['Offline PWA', 'Opens with the network off', 'Working', 'UI4'],
  ['Languages', 'English / Hindi / Assamese UI', 'Working', 'Hindi titles fixed (UI3).'],
];

const membersRows = team.members.map((m) => `<tr><td>${ph(m.name)}</td><td>${ph(m.enrollment)}</td><td>${ph(m.role)}</td><td>${ph(m.tasks)}</td><td>${ph(m.evidence)}</td><td>${ph(m.percent)}</td></tr>`).join('');

const m2 = `
<div class="cover">
  <h1 style="font-size:24pt">${esc(team.projectTitle)}</h1>
  <p style="font-size:12pt">SCSE4041 Prompt Engineering Mini Project, Milestone 2</p>
  <table>
    <tr><th>Team ID</th><td>${ph(team.teamId)}</td></tr>
    <tr><th>Team name</th><td>${ph(team.teamName)}</td></tr>
    <tr><th>Project title</th><td>${esc(team.projectTitle)}</td></tr>
    <tr><th>Batch</th><td>${ph(team.batch)}</td></tr>
    <tr><th>Faculty</th><td>${ph(team.faculty)}</td></tr>
    ${team.members.map((m) => `<tr><th>Member</th><td>${ph(m.name)} · ${ph(m.enrollment)}</td></tr>`).join('')}
    <tr><th>Prototype</th><td>${ph(team.prototypeUrl)}</td></tr>
    <tr><th>Repository</th><td>${esc(team.repoUrl)}</td></tr>
    <tr><th>Reel</th><td>${ph(team.reelUrl)} (${ph(team.reelSeconds)} s)</td></tr>
  </table>
  <p class="small">Built on Smriti, an open Smart India Hackathon 2026 project by Team Design Divas (github.com/gopalrajlohiya11-ui/Smriti)</p>
</div>

<h2>2. Prompt and solution design</h2>
<p><b>Problem and users.</b> Older people in the early stages of dementia often forget a tablet, a meal or a familiar face. Many of them in the North-East are more at ease in Assamese or Hindi than in English, and mobile data can be patchy. Their families and doctors usually have no simple way to know how the day actually went. Smriti is built for two people: the patient, who uses the phone app every day, and the caregiver, who keeps an eye on things from a dashboard.</p>
<p><b>Input and output.</b> The patient types or speaks a question in any language. Along with it, the app pulls that patient's own records from the database: their profile, today's reminders, family photos and recent game scores. What comes back is a short, warm reply of two to four sentences in the patient's own language, shown on screen and read aloud. For a voice question we also return what the model heard.</p>
<p><b>Prompts and steps.</b> We use three prompts, each a single model call. P1 handles typed chat. P2 handles voice: it reuses P1's system prompt and adds one instruction so that a single call both transcribes and answers. P3 answers free-text WhatsApp messages. We kept it to one call per question because the reply is read aloud and a second call would make the patient wait. Instead of a separate retrieval step, we place the patient's records straight into the system prompt, since one patient's data is only about 25 lines. The steps are: check the input, load the records, fill in the prompt, call Gemini, tidy up the reply (or fall back), then show and speak it.</p>
<p><b>Tool and model.</b> We call Google Gemini from our Node.js server using Google's official SDK. The first choice is Gemini 3.5 Flash-Lite, with Gemini 3.5 Flash and Gemini Flash (latest) as backups. We picked the Flash models because they answer quickly, accept audio directly and write well in Hindi and Assamese. If all three are unavailable, a simple keyword-based reply in the patient's language takes over, so the chat never goes silent.</p>
<p><b>Changes since Milestone 1.</b> ${/^</.test(team.milestone1Summary) ? 'Milestone 1 covered problem identification, the use case and the initial prompt proposal.' : esc(team.milestone1Summary)} In Milestone 2 we ran the whole system end to end, found and fixed six bugs, made the chat report whether Gemini or the fallback answered, wrote up three versions of the main prompt, ran and saved ${tests.length} tests, and put the app online.</p>

<p><b>Responsible use.</b> Smriti offers memory support and reminders. It never diagnoses anything and must never change a prescription. The prompt tells the model to answer only from the patient's own records and to point the patient to their doctor or caregiver for anything else. Every person in the prototype is made up; no real patient data is used. PINs and passwords never reach the model. We also found a gap: our final prompt (v3) lost an earlier rule telling the model to send dose questions to the doctor. Test T11 shows what that leads to, and putting the rule back is the first job for Milestone 3.</p>

<h3>Diagrams</h3>
<div class="grid2">
  <figure><img src="${img('docs/diagrams/02_prompt_workflow.png')}" style="max-height:640px"><figcaption>Figure 1. Prompt workflow for P1 and P2</figcaption></figure>
  <div>
    <figure><img src="${img('docs/diagrams/04_input_output_flow.png')}"><figcaption>Figure 2. Input and output flow</figcaption></figure>
    <figure><img src="${img('docs/diagrams/01_system_architecture.png')}"><figcaption>Figure 3. System architecture</figcaption></figure>
  </div>
</div>
<figure><img src="${img('docs/diagrams/03_task_decomposition.png')}" style="max-height:520px"><figcaption>Figure 4. Task decomposition</figcaption></figure>

<h3>Prompt sheets</h3>
${promptSheet('P1', 'Patient Companion Chat', [
  ['Step in workflow', 'After the patient\'s records are loaded (Figure 1)'],
  ['Purpose', 'Answer the patient warmly and briefly, in their language, from their real records'],
  ['Tool and model', 'Google Gemini API; cascade gemini-3.5-flash-lite → gemini-3.5-flash → gemini-flash-latest'],
  ['Settings', 'temperature 0.7, maxOutputTokens 350, last 6 turns as history'],
  ['Variables', esc(p1vars)],
  ['Examples included', '0'],
  ['Output format', 'Plain text in {preferred_language}, 2–4 sentences, ends with 🌸'],
], P1v3, '{user_message}', p1sample)}
${promptSheet('P2', 'Voice Question', [
  ['Step in workflow', 'Same step as P1, when the patient records audio'],
  ['Purpose', 'Transcribe the spoken question and answer it in one call'],
  ['Tool and model', 'Same as P1; audio sent as inlineData (audio/webm)'],
  ['Settings', 'temperature 0.7, maxOutputTokens 350'],
  ['Variables', '{audio_base64}: the recording; {mime_type}: audio type; {preferred_language}: patient language; plus all P1 variables in the system prompt'],
  ['Examples included', '0'],
  ['Output format', 'TRANSCRIPTION: … / REPLY: … (split by the server)'],
], 'Same as P1 (above).', P2user, '<p>Not run in Milestone 2: no microphone in the headless test browser. Listed under limitations.</p>')}
${promptSheet('P3', 'WhatsApp Companion Reply', [
  ['Step in workflow', 'WhatsApp webhook, for messages that are not a "done/taken" reply'],
  ['Purpose', 'Short warm reply to a free-form WhatsApp message'],
  ['Tool and model', 'Google Gemini API, gemini-3.6-flash'],
  ['Settings', 'default; last 8 messages of the patient as history'],
  ['Variables', '{first_name}: matched patient; {chat_history}: up to 8 earlier turns; {whatsapp_message}: incoming text'],
  ['Examples included', '0'],
  ['Output format', 'Plain text, 1–2 sentences'],
], P3sys, '{chat_history}\n{whatsapp_message}', '<p>Not run with Gemini: replies cannot be delivered without a Meta WhatsApp token. The non-LLM "Done" path was tested (W1, W2).</p>')}

<h2>3. Implementation</h2>
<p><b>What is built.</b> Smriti is a web app that installs on a phone like a normal app. Patients get a PIN login, today's schedule, five memory games, family photos and the AI chat; caregivers get a dashboard. Behind it are a Node.js server, a MongoDB database, Gemini for the chat, and a WhatsApp link for reminders. The app works in English, Hindi and Assamese and keeps working without internet. It is live: the website on Vercel (${esc(team.prototypeUrl)}) and the server on Render.</p>
<p>In this milestone we ran every screen ourselves and fixed what broke. A wrong PIN still let you in. One game dealt no cards. Hindi mode showed the same title on every reminder. WhatsApp replies were not matched to the right patient. The demo data could not be loaded on Linux. And the login limit would have locked out every visitor at once on the live server. We also added automatic demo data for the hosted version and wrote the test scripts.</p>
<table><tr><th>Module</th><th>What it does</th><th>Status</th><th>Notes</th></tr>
${moduleRows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>

<h3>Prompt iteration log (P1 Patient Companion Chat)</h3>
<p class="small">These are the three versions saved in the project's history. ${exp ? `Results come from code/prompt_experiments.js: the same patient and the same five questions, ${exp.meta.runsPerQuestion} runs each, on ${esc(exp.meta.model)}.` : 'We could not run them live on Gemini yet because we had no working API key, so the results describe what each version can and cannot do, plus what our tests showed.'}</p>
<table><tr><th>Version</th><th style="width:36%">What changed</th><th style="width:22%">Why it was changed</th><th>Result after the change</th></tr>
${iterRows.map(([v, w, y]) => `<tr><td>${v}</td><td>${w}</td><td>${y}</td><td>${iterResult(v.split(' ')[0])}</td></tr>`).join('')}</table>
<h3>Full text: v1</h3><pre>${esc(P1v1)}</pre>
<h3>Full text: v2</h3><pre>${esc(P1v2)}</pre>
<h3>Full text: v3 (final)</h3><pre>${esc(P1v3)}</pre>

<h2>4. Demonstration and testing</h2>
<p>We tested ${tests.length} inputs: ${tests.length - nEdge - nInvalid} normal, ${nEdge} edge cases and ${nInvalid} invalid ones. <b>${nPass} passed and ${tests.length - nPass} failed</b>, and we have kept the failures in rather than hide them. The tests ran on ${esc(api.meta.ranAt.slice(0, 10))} against the real app with demo data loaded. ${geminiRun ? '' : 'We had no Gemini key at the time, so the chat tests (T07 to T11) were answered by the offline fallback, marked [fallback] below.'} Every input and full response is saved in test-data/outputs.</p>
${testTable}
<div class="shots">
  <figure><img src="${img('docs/screenshots/milestone2/UI1_wrong_pin_rejected.png')}"><figcaption>UI1: wrong PIN rejected</figcaption></figure>
  <figure><img src="${img('docs/screenshots/milestone2/UI2_routine_sequencer_completed_saved.png')}"><figcaption>UI2: Routine Sequencer completed and saved</figcaption></figure>
  <figure><img src="${img('docs/screenshots/milestone2/UI5_chat_who_is_my_doctor.png')}"><figcaption>UI5 / T07: chat "Who is my doctor?"</figcaption></figure>
</div>
<h3>Known limitations and next steps</h3>
<table><tr><th>Limitation</th><th>What we will try next</th></tr>
<tr><td>The final prompt lost the rule that sends dose questions to the doctor, so a double-dose question gets no such advice (T11).</td><td>Write v4: v3 plus "never advise on doses, ask the doctor", then run the prompt comparison and T11 again.</td></tr>
<tr><td>Voice questions and WhatsApp sending are not tested yet: our test browser has no microphone and we have no WhatsApp Business number.</td><td>Record short Assamese and Hindi voice clips to test with, and set up a WhatsApp test number.</td></tr>
<tr><td>Some parts of the server accept changes without a login, for example saving a game score (T19).</td><td>Require a patient or caregiver login for every change.</td></tr>
<tr><td>Typing the name in lower case blocks login (T03), and the external ML service was unreachable, so game difficulty uses simple rules.</td><td>Make the name check case-insensitive, and host the ML service next to our server.</td></tr></table>

<h2>5. Repository</h2>
${exists('docs/screenshots/milestone2/repository.png') ? `<figure><img src="${img('docs/screenshots/milestone2/repository.png')}" style="max-height:470px"><figcaption>${esc(team.repoUrl)}</figcaption></figure>` : '<p class="ph">Repository screenshot pending.</p>'}
<p>Our repository is public at ${esc(team.repoUrl)}. It holds the full app code (frontend and backend) and everything from this milestone: the six bug fixes, the deployment set-up, our test scripts with every saved input and output, the three prompt versions and the final prompt sheets, the diagrams, screenshots and these PDFs. Since Milestone 1 we fixed six bugs, added tests and prompt documentation, and put the app online; CHANGELOG.md lists each change with its date. Smriti started as an open Smart India Hackathon 2026 project by Team Design Divas, whose full history remains at github.com/gopalrajlohiya11-ui/Smriti.</p>

<h2>6. Supporting document</h2>
<p class="small">${supportingIsSynopsis ? 'Synopsis' : 'Technical report'}: the same document is uploaded separately with the form.</p>
${supportingHtml}

<div style="break-inside: avoid;">
<h2>7. Team contribution</h2>
<table><tr><th>Member name</th><th>Enrollment no.</th><th>Role</th><th style="width:34%">Tasks done in Milestone 2</th><th>Evidence</th><th>Contribution (%)</th></tr>${membersRows}</table>
${team.members.every((m) => /^\d+(\.\d+)?$/.test(String(m.percent))) ? `<p class="small">All ${team.members.length} of us have agreed to this table; the shares add up to ${team.members.reduce((a, m) => a + Number(m.percent), 0)}%.</p>` : '<p class="small ph">Contribution percentages to be filled in and agreed by all members (they must add up to 100).</p>'}
</div>
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const make = async (html, out, footer) => {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
    await page.pdf({ path: path.join(ROOT, out), format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div></div>', footerTemplate: `<div style="font-size:7pt;color:#78716c;width:100%;text-align:center">${footer} · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    console.log('wrote', out);
  };
  await make(techReport, 'docs/Technical_Report.pdf', 'Smriti · Technical Report');
  await make(synopsis, 'docs/Synopsis.pdf', 'Smriti · Synopsis');
  await make(m2, 'docs/Milestone2.pdf', 'Smriti · Milestone 2');
  await browser.close();
  const safe = (s) => String(s).replace(/[<>]/g, '').replace(/[^A-Za-z0-9_-]+/g, '');
  // Submission-named copies only once the team details are filled in
  if (!/^</.test(team.teamId) && !/^</.test(team.teamName)) {
    fs.copyFileSync(path.join(ROOT, 'docs/Milestone2.pdf'), path.join(ROOT, `docs/M2_${safe(team.teamId)}_Smriti.pdf`));
    const supName = supportingIsSynopsis ? 'Synopsis' : 'TechnicalReport';
    fs.copyFileSync(path.join(ROOT, supportingIsSynopsis ? 'docs/Synopsis.pdf' : 'docs/Technical_Report.pdf'), path.join(ROOT, `docs/${safe(team.teamName)}_${supName}.pdf`));
    console.log(`wrote docs/M2_${safe(team.teamId)}_Smriti.pdf and docs/${safe(team.teamName)}_${supName}.pdf`);
  } else {
    console.log('Team ID / name still placeholders: submission-named copies not written (edit docs/team_info.json).');
  }
  console.log(`tests: ${tests.length} (${nPass} pass), edge ${nEdge}, invalid ${nInvalid}; gemini chat run: ${geminiRun}; prompt experiment: ${!!exp}`);
})();
