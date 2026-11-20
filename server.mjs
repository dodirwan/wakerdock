import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, stat, open, appendFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const CONV_FILE = path.join(DATA_DIR, 'conversations.json');
const ROLES_FILE = path.join(DATA_DIR, 'roles.json');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const TASKS_LOG = path.join(LOG_DIR, 'tasks.jsonl');
const WORKFLOW_FILE = path.join(DATA_DIR, 'workflows.json');
const WORKFLOW_NAME = 'baas-project-workflow';
const SNOW_ID = '8b1d3421e986';
const WAKEADMIN_ID = '7c582ea8489a';
const SUMMER_ID = 'a1f397dea1ad';
const SUMMER_CONSOLE_CWD = process.env.SUMMER_CONSOLE_CWD || 'D:\\qwen\\Apps\\cohesity\\msv';
const WORKFILE_ROOT = process.env.WORKFILE_ROOT || 'D:/qwen/Apps/hackaton ai/mspbaas/Agent Work File';
const HOST = process.env.HOST || '127.0.0.1';
const PORT_START = Number(process.env.PORT || 5173);

function resolveQoderwake() {
  if (process.env.QODERWAKE_BIN) return process.env.QODERWAKE_BIN;
  const exe = process.platform === 'win32' ? 'qoderwake.exe' : 'qoderwake';
  const local = path.join(os.homedir(), '.qoderwake', 'bin', exe);
  if (existsSync(local)) return local;
  return 'qoderwake';
}

const QW = resolveQoderwake();

function resolveQwen() {
  if (process.env.QWEN_BIN) return { file: process.env.QWEN_BIN, prefix: [] };
  if (process.platform === 'win32') {
    const entry = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@qwen-code', 'qwen-code', 'cli-entry.js');
    if (existsSync(entry)) return { file: process.execPath, prefix: [entry] };
  }
  return { file: 'qwen', prefix: [] };
}

const QWEN = resolveQwen();

let roles = { defaults: { runner: 'qoderwake' }, roles: {} };
try {
  roles = JSON.parse(await readFile(ROLES_FILE, 'utf8'));
} catch { /* defaults keep everyone on QoderWake */ }

function roleFor(waker) {
  const entry = roles.roles?.[waker.id];
  const runner = entry?.runner || roles.defaults?.runner || 'qoderwake';
  return { runner, ...(entry || {}) };
}

function qwenRoleFor(agentId) {
  const entry = agentId ? roles.roles?.[agentId] : null;
  if (entry?.runner === 'qwen' && entry.sessionId && entry.cwd) return { runner: 'qwen', ...entry };
  return null;
}

function runQw(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const finish = (error, stdout, stderr) => resolve({
      code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
      stdout: stdout || '',
      stderr: (stderr || '') + (error && !stderr ? String(error.message || '') : ''),
    });
    try {
      execFile(QW, args, {
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      }, finish);
    } catch (error) {
      finish(error, '', 'Unable to start QoderWake CLI');
    }
  });
}

function parseJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  for (let end = text.length; end > start; end--) {
    const slice = text.slice(start, end).trim();
    if (!/[\]}]$/.test(slice)) continue;
    try { return JSON.parse(slice); } catch { /* keep shrinking */ }
  }
  return null;
}

let rosterCache = { at: 0, wakers: [], user: null, error: null };
let rosterInflight = null;
const ROSTER_FILE = path.join(DATA_DIR, 'roster-cache.json');

try {
  const saved = JSON.parse(await readFile(ROSTER_FILE, 'utf8'));
  if (Array.isArray(saved.wakers) && saved.wakers.length) {
    rosterCache = { at: Date.now() - 60000, wakers: saved.wakers, user: saved.user || null, error: null };
  }
} catch { /* first run */ }

async function loadRoster(force = false) {
  if (!force && rosterCache.wakers.length && Date.now() - rosterCache.at < 30000) return rosterCache;
  if (rosterInflight) return rosterInflight;
  rosterInflight = (async () => {
    const list = await runQw(['waker', 'list', '--json'], 60000);
    let wakers = [];
    let error = null;
    const parsed = parseJson(list.stdout);
    if (Array.isArray(parsed)) {
      wakers = parsed.map((w) => ({
        id: String(w.agentId || ''),
        memberId: String(w.employeeId || ''),
        name: String(w.name || 'Waker'),
        role: String(w.description || '').split('\n')[0].slice(0, 160),
        status: String(w.status || 'unknown'),
        staffId: w.staffId || '',
        sessions: w.sessionCount || 0,
        machine: w.machine?.machine_name || '',
      })).filter((w) => w.id);
    } else {
      error = (list.stderr || 'Unable to read QoderWake roster').slice(0, 400);
    }
    let user = rosterCache.user;
    if (!user) {
      const who = await runQw(['whoami'], 15000);
      if (who.code === 0) {
        const m = who.stdout.match(/Name:\s*(.+)/);
        if (m) user = m[1].trim();
      }
    }
    // don't cache failures, so the next request retries immediately
    rosterCache = { at: wakers.length ? Date.now() : 0, wakers, user, error };
    if (wakers.length) {
      writeFile(ROSTER_FILE, JSON.stringify({ wakers, user }), 'utf8').catch(() => {});
    }
    return rosterCache;
  })().finally(() => { rosterInflight = null; });
  return rosterInflight;
}

async function readConversations() {
  try {
    return JSON.parse(await readFile(CONV_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeConversations(map) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONV_FILE, JSON.stringify(map, null, 2), 'utf8');
}

async function ensureConversation(waker) {
  const map = await readConversations();
  if (map[waker.id]?.convId) return map[waker.id];
  const res = await runQw(['group', 'create', '--title', `Office DM - ${waker.name}`, '--waker', waker.id, '--json'], 30000);
  const data = parseJson(res.stdout);
  const conv = data?.group?.conversation;
  if (!conv?.id) throw new Error((res.stderr || 'Could not create a conversation with ' + waker.name).slice(0, 300));
  const entry = {
    convId: conv.id,
    selfParticipantId: conv.selfParticipantId || '',
    name: waker.name,
  };
  map[waker.id] = entry;
  await writeConversations(map);
  return entry;
}

function mapMessages(raw, convId, selfId) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && m.body && m.body.type === 'text' && typeof m.body.text === 'string' && m.body.text.trim())
    .map((m) => ({
      id: m.id,
      seq: m.seq ?? 0,
      text: m.body.text.trim(),
      side: m.senderParticipantId === selfId ? 'me' : 'them',
      ts: m.createdAt || '',
    }))
    .sort((a, b) => a.seq - b.seq);
}

const msgCache = new Map();
const msgInflight = new Map();

function fetchMessages(waker) {
  if (msgInflight.has(waker.id)) return msgInflight.get(waker.id);
  const pending = (async () => {
    const map = await readConversations();
    const conv = map[waker.id];
    if (!conv?.convId) return { connected: true, messages: [] };
    const res = await runQw(['messages', 'list', conv.convId, '--json', '--limit', '80'], 30000);
    const raw = parseJson(res.stdout);
    if (!Array.isArray(raw)) {
      throw new Error((res.stderr || 'Could not load messages').slice(0, 300));
    }
    const payload = { connected: true, messages: mapMessages(raw, conv.convId, conv.selfParticipantId) };
    msgCache.set(waker.id, { at: Date.now(), payload });
    return payload;
  })();
  msgInflight.set(waker.id, pending);
  return pending.finally(() => msgInflight.delete(waker.id));
}

async function listMessages(waker) {
  const hit = msgCache.get(waker.id);
  if (hit) {
    if (Date.now() - hit.at > 6000) fetchMessages(waker).catch(() => {});
    return hit.payload;
  }
  try {
    return await fetchMessages(waker);
  } catch (err) {
    const stale = msgCache.get(waker.id);
    if (stale) return stale.payload;
    throw err;
  }
}

let adminApprovals = { pending: null, checkedAt: 0, error: null };
let adminApprovalsInflight = null;

function refreshAdminApprovals() {
  if (adminApprovalsInflight || Date.now() - adminApprovals.checkedAt < 10000) return;
  adminApprovalsInflight = (async () => {
    const result = await runQw(['permission', 'approval', 'list', '--waker-id', WAKEADMIN_ID, '--json'], 45000);
    const requests = parseJson(result.stdout);
    adminApprovals = result.code === 0 && Array.isArray(requests)
      ? { pending: requests.length, checkedAt: Date.now(), error: null }
      : { pending: null, checkedAt: Date.now(), error: 'Status approval belum tersedia. Periksa Console QoderWake.' };
  })().catch(() => {
    adminApprovals = { pending: null, checkedAt: Date.now(), error: 'Status approval belum tersedia. Periksa Console QoderWake.' };
  }).finally(() => { adminApprovalsInflight = null; });
}

async function sendMessage(waker, text) {
  const conv = await ensureConversation(waker);
  // no --wait: the CLI's long-poll can time out before the Waker answers.
  // Accept the send immediately; the office polls for the reply.
  const res = await runQw([
    'messages', 'send', conv.convId,
    '--text', text,
    '--mention', waker.memberId || waker.id,
    '--intent', 'chat',
    '--json',
  ], 60000);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout || 'QoderWake rejected the message').slice(0, 400));
  }
  msgCache.delete(waker.id);
  let messages = [];
  try {
    messages = (await listMessages(waker)).messages;
  } catch { /* delivery already accepted; client polling will pick it up */ }
  return { connected: true, messages, delivered: true };
}

/* ---------- BaaS WakerFlow (automatic case flow) ---------- */

let workflowRuns = {};
try {
  workflowRuns = JSON.parse(await readFile(WORKFLOW_FILE, 'utf8'));
} catch { /* first run */ }

async function saveWorkflowRuns() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(WORKFLOW_FILE, JSON.stringify(workflowRuns, null, 2), 'utf8');
}

function looksLikeCase(text) {
  return text.length >= 80
    && /backup/i.test(text)
    && /(project\s+baru|detail\s+kebutuhan|new\s+project|renewal|penambahan)/i.test(text);
}

function parseCase(text) {
  const customerMatch = text.match(/\b(PT\.?\s*[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*)*)/);
  let customer = customerMatch ? customerMatch[1].replace(/[.,;:]+$/, '').trim() : 'New Project';
  if (/^PT\.?$/i.test(customer)) customer = 'New Project';
  customer = customer.replace(/^PT\.(?=\S)/, 'PT. ');

  const projectType = /existing|renewal|perpanjang|penambahan/i.test(text) ? 'existing' : 'new';
  const term = text.match(/(?:selama\s+)?(\d+)\s*(?:tahun|year)/i);
  const licenseTermYears = term ? Math.max(1, Math.min(10, Number(term[1]))) : 3;
  const growth = text.match(/daily\s+growth[^.\n]*/i)?.[0] || 'Daily growth 3%';
  const yearly = text.match(/yearly\s+growth[^.\n]*/i)?.[0] || 'yearly growth 15%';
  const retention = text.match(/retention[^.\n]*/i)?.[0] || 'Daily incremental retention 2 weeks; weekly full backup retention 1 month';
  const scope = text.match(/backup-restore[^.\n]*/i)?.[0] || 'Semua workload; single account dan cross account';

  return {
    customer,
    projectType,
    environments: text,
    growth: `${growth}, ${yearly}`,
    retention,
    backupScope: scope,
    licenseTermYears,
  };
}

async function triggerWorkflow(agentId, text) {
  const args = parseCase(text);
  const res = await runQw([
    'workflow', 'run', WORKFLOW_NAME,
    '--args-json', JSON.stringify(args),
    '--idempotency-key', `office-${agentId}-${Date.now()}`,
    '--json',
  ], 120000);
  const data = parseJson(res.stdout);
  if (!data?.runId) {
    throw new Error((res.stderr || res.stdout || 'Workflow rejected the case').slice(0, 400));
  }
  const rec = {
    runId: data.runId,
    agentId,
    customer: args.customer,
    projectType: args.projectType,
    licenseTermYears: args.licenseTermYears,
    startedAt: new Date().toISOString(),
    status: data.status || 'running',
    phase: 'Intake',
    events: [],
    checkedAt: 0,
  };
  workflowRuns[rec.runId] = rec;
  await saveWorkflowRuns();
  return rec;
}

async function refreshWorkflow(rec) {
  if (!rec || !rec.runId) return rec;
  if (Date.now() - (rec.checkedAt || 0) < 10000) return rec;
  let data;
  try {
    data = parseJson((await runQw(['workflow', 'run-get', rec.runId, '--json'], 8000)).stdout);
  } catch {
    return rec;
  }
  if (!data) return rec;
  rec.status = data.status || rec.status;
  rec.phase = data.currentPhase || rec.phase;
  rec.events = Array.isArray(data.events) ? data.events : rec.events;
  rec.finishedAt = data.finishedAt || rec.finishedAt || null;
  rec.checkedAt = Date.now();
  await saveWorkflowRuns();
  return rec;
}

async function workflowArtifacts(rec) {
  const dirs = [
    path.join(WORKFILE_ROOT, 'Account Manager', 'Customer', rec.projectType, rec.customer),
    path.join(WORKFILE_ROOT, 'Technical Product Solution', 'Project', rec.projectType === 'existing' ? 'Existing' : 'New', rec.customer),
    path.join(WORKFILE_ROOT, 'Product Manager', 'Customer', rec.projectType, rec.customer),
  ];
  const start = Date.parse(rec.startedAt);
  const out = [];
  for (const dir of dirs) {
    let names = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const s = await stat(file);
        if (s.isFile() && s.mtimeMs >= start - 5000) out.push(file);
      } catch { /* skip unreadable */ }
    }
  }
  return out;
}

async function workflowMessagesFor(agentId) {
  const rec = Object.values(workflowRuns)
    .filter((r) => r.agentId === agentId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (!rec) return [];
  refreshWorkflow(rec).catch(() => {});
  const base = 1_000_000;
  const messages = [{
    id: `wf-${rec.runId}-ack`,
    seq: base,
    text: `[Workflow] Case ${rec.customer} diterima. Alur otomatis berjalan: Intake (Snow) → Requirement Dispatch (Winter) → Solution Design (Summer) → Pricing (Winter) → Delivery (Snow). Draft mengikuti template tiap workfile:\n- Account Manager/Customer/${rec.projectType}/${rec.customer} (requirement, proposal, email)\n- Technical Product Solution/Project/${rec.projectType === 'existing' ? 'Existing' : 'New'}/${rec.customer} (solution xlsx)\n- Product Manager/Customer/${rec.projectType}/${rec.customer} (BoQ xlsx)`,
    side: 'them',
    ts: rec.startedAt,
    kind: 'workflow',
  }];
  if (rec.error) {
    messages.push({
      id: `wf-${rec.startedAt}-err`,
      seq: base + 90000,
      text: `[Workflow] Gagal start: ${rec.error}`,
      side: 'them',
      ts: rec.startedAt,
      kind: 'workflow',
    });
  }
  for (const e of rec.events || []) {
    if (e.kind !== 'phase.started' && e.kind !== 'phase.finished' && e.kind !== 'worker.completed' && e.kind !== 'run.completed') continue;
    const label = e.payload?.title || e.payload?.label || e.kind;
    messages.push({
      id: `wf-${rec.runId}-e${e.seq}`,
      seq: base + Number(e.seq || 0),
      text: `[Workflow] ${label} — ${e.status}`,
      side: 'them',
      ts: e.createdAt || rec.startedAt,
      kind: 'workflow',
    });
  }
  if (rec.status === 'completed' || rec.status === 'succeeded') {
    const files = await workflowArtifacts(rec);
    messages.push({
      id: `wf-${rec.runId}-done`,
      seq: base + 90000,
      text: `[Workflow] Selesai. ${files.length ? 'Draft tersimpan:\n' + files.map((f) => `- ${f}`).join('\n') : 'Draft tersimpan di workfile masing-masing role.'}`,
      side: 'them',
      ts: rec.finishedAt || new Date().toISOString(),
      kind: 'workflow',
    });
  } else if (rec.status === 'failed' || rec.status === 'cancelled') {
    messages.push({
      id: `wf-${rec.runId}-stop`,
      seq: base + 90000,
      text: `[Workflow] ${rec.status} pada phase ${rec.phase}. Cek QoderWake run ${rec.runId}.`,
      side: 'them',
      ts: rec.finishedAt || new Date().toISOString(),
      kind: 'workflow',
    });
  }
  return messages;
}

/* ---------- QoderWake group rooms ---------- */

const GROUPS_FILE = path.join(DATA_DIR, 'groups-cache.json');
let groupsCache = { at: 0, groups: [] };
try {
  const saved = JSON.parse(await readFile(GROUPS_FILE, 'utf8'));
  if (Array.isArray(saved.groups) && saved.groups.length) groupsCache = { at: Date.now() - 60000, groups: saved.groups };
} catch { /* first run */ }

async function listGroups() {
  if (Date.now() - groupsCache.at < 60000) return groupsCache.groups;
  const res = await runQw(['group', 'list', '--json'], 15000);
  const arr = parseJson(res.stdout);
  if (Array.isArray(arr)) {
    const groups = arr
      .map((g) => ({
        groupId: g.binding?.resourceId || '',
        convId: g.binding?.conversationId || g.conversation?.id || '',
        title: g.conversation?.title || 'Group',
      }))
      .filter((g) => g.convId);
    groupsCache = { at: Date.now(), groups };
    writeFile(GROUPS_FILE, JSON.stringify({ groups }), 'utf8').catch(() => {});
  }
  return groupsCache.groups;
}

const groupInfoCache = new Map();
const GROUP_INFO_FILE = path.join(DATA_DIR, 'group-info-cache.json');
let groupInfoDisk = {};
try { groupInfoDisk = JSON.parse(await readFile(GROUP_INFO_FILE, 'utf8')); } catch { /* first run */ }

async function groupInfo(groupId) {
  const hit = groupInfoCache.get(groupId);
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  let d = null;
  try {
    const res = await runQw(['group', 'show', groupId, '--json'], 45000);
    d = parseJson(res.stdout);
  } catch { /* daemon busy */ }
  if (!d?.participants) return hit ? hit.data : groupInfoDisk[groupId] || null;
  const names = {};
  for (const p of d.participants) names[p.id] = p.wakerSnapshot?.name || 'Member';
  const data = { self: d.conversation?.selfParticipantId || null, names };
  groupInfoCache.set(groupId, { at: Date.now(), data });
  groupInfoDisk[groupId] = data;
  writeFile(GROUP_INFO_FILE, JSON.stringify(groupInfoDisk), 'utf8').catch(() => {});
  return data;
}

async function fetchGroupMessages(agentId, convId) {
  const g = (await listGroups()).find((x) => x.convId === convId);
  if (!g) throw new Error('Group conversation tidak ditemukan');
  const [info, res] = await Promise.all([
    groupInfo(g.groupId).catch(() => null),
    runQw(['messages', 'list', convId, '--json', '--limit', '80'], 45000),
  ]);
  const raw = parseJson(res.stdout);
  if (!Array.isArray(raw)) throw new Error((res.stderr || 'Could not load group messages').slice(0, 300));
  const messages = raw
    .filter((m) => m && m.body && m.body.type === 'text' && typeof m.body.text === 'string' && m.body.text.trim())
    .map((m) => ({
      id: m.id,
      seq: m.seq ?? 0,
      text: m.body.text.trim(),
      side: info?.self && m.senderParticipantId === info.self ? 'me' : 'them',
      speaker: info?.names[m.senderParticipantId] || null,
      ts: m.createdAt || '',
    }))
    .sort((a, b) => a.seq - b.seq);
  return { connected: true, messages, group: { title: g.title, participants: info ? Object.values(info.names) : [] } };
}

async function listGroupMessages(agentId, convId) {
  const hit = msgCache.get(agentId);
  if (hit) {
    if (Date.now() - hit.at > 6000) fetchGroupMessages(agentId, convId).then((payload) => msgCache.set(agentId, { at: Date.now(), payload })).catch(() => {});
    return hit.payload;
  }
  const payload = await fetchGroupMessages(agentId, convId);
  msgCache.set(agentId, { at: Date.now(), payload });
  return payload;
}

/* ---------- Qwen Code runner (Summer) ---------- */

const transcriptCache = new Map();
const qwenChains = new Map();
const qwenStates = new Map();

function projectKey(cwd) {
  return cwd.replace(/[:\\/]/g, '-').toLowerCase();
}

function transcriptPath(role) {
  if (role.historyFile) return path.resolve(role.historyFile);
  return path.join(os.homedir(), '.qwen', 'projects', projectKey(role.cwd), 'chats', `${role.sessionId}.jsonl`);
}

function transcriptMessage(rec, seq) {
  const parts = rec?.message?.parts;
  if (!Array.isArray(parts)) return null;
  if (rec.type === 'user') {
    if (parts.some((p) => p && p.functionResponse)) return null;
    const text = parts.filter((p) => p && typeof p.text === 'string').map((p) => p.text).join('\n').trim();
    if (!text) return null;
    return { id: rec.uuid || `q-${seq}`, seq, text: text.slice(0, 8000), side: 'me', ts: rec.timestamp || '' };
  }
  if (rec.type === 'assistant') {
    const text = parts.filter((p) => p && typeof p.text === 'string' && !p.thought).map((p) => p.text).join('\n').trim();
    if (!text) return null;
    return { id: rec.uuid || `q-${seq}`, seq, text: text.slice(0, 8000), side: 'them', ts: rec.timestamp || '' };
  }
  return null;
}

const transcriptInflight = new Map();

function transcriptCacheFile(file) {
  return path.join(CACHE_DIR, `qwen-${path.basename(file, '.jsonl')}.json`);
}

async function loadDiskCache(file, size) {
  try {
    const cached = JSON.parse(await readFile(transcriptCacheFile(file), 'utf8'));
    if (cached.file === file && Number(cached.size) <= size && Array.isArray(cached.messages)) {
      return { size: Number(cached.size), messages: cached.messages, remainder: Buffer.alloc(0) };
    }
  } catch { /* no cache yet */ }
  return null;
}

function scheduleCacheWrite(file, cache) {
  if (cache.writeTimer) return;
  cache.writeTimer = setTimeout(async () => {
    cache.writeTimer = null;
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      const target = transcriptCacheFile(file);
      const tmp = `${target}.${process.pid}.tmp`;
      const committed = cache.size - (cache.remainder?.length || 0);
      await writeFile(tmp, JSON.stringify({ file, size: committed, messages: cache.messages }), 'utf8');
      await rename(tmp, target);
    } catch { /* cache is best-effort */ }
  }, 2500);
  if (cache.writeTimer.unref) cache.writeTimer.unref();
}

async function readTranscript(role) {
  const file = transcriptPath(role);
  if (transcriptInflight.has(file)) return transcriptInflight.get(file);
  const job = readTranscriptNow(file).finally(() => transcriptInflight.delete(file));
  transcriptInflight.set(file, job);
  return job;
}

async function readTranscriptNow(file) {
  const info = await stat(file);
  let cache = transcriptCache.get(file);
  if (!cache) cache = await loadDiskCache(file, info.size);
  if (!cache || info.size < cache.size) {
    cache = { size: 0, messages: [], remainder: Buffer.alloc(0) };
  }
  if (info.size > cache.size) {
    const handle = await open(file, 'r');
    try {
      const length = info.size - cache.size;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, cache.size);
      const data = Buffer.concat([cache.remainder, buffer]);
      let start = 0;
      for (;;) {
        const nl = data.indexOf(10, start);
        if (nl === -1) break;
        const line = data.toString('utf8', start, nl);
        start = nl + 1;
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        const msg = transcriptMessage(rec, cache.messages.length);
        if (msg) cache.messages.push(msg);
      }
      cache.remainder = data.subarray(start);
      cache.size = info.size;
      scheduleCacheWrite(file, cache);
    } finally {
      await handle.close();
    }
  }
  transcriptCache.set(file, cache);
  return { file, messages: cache.messages };
}

async function qwenHistory(role, limit, before) {
  const { file, messages } = await readTranscript(role);
  let pool = messages;
  if (Number.isFinite(before)) pool = messages.filter((m) => m.seq < before);
  const slice = pool.slice(-limit);
  const oldestSeq = slice.length ? slice[0].seq : null;
  const hasOlder = slice.length ? messages.some((m) => m.seq < oldestSeq) : false;
  return { file, total: messages.length, slice, oldestSeq, hasOlder };
}

async function sendQwenHistory(res, role, wakerId, url) {
  const limitParam = url.searchParams.get('limit');
  const rawLimit = limitParam == null ? NaN : Number(limitParam);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 50), 5000) : Number(role.historyLimit) || 500;
  const rawBefore = Number(url.searchParams.get('before'));
  const before = Number.isFinite(rawBefore) && rawBefore > 0 ? rawBefore : undefined;
  const state = qwenState(wakerId);
  try {
    const hist = await qwenHistory(role, limit, before);
    return sendJson(res, 200, {
      connected: true,
      runner: 'qwen',
      label: role.label || 'Qwen Code',
      sessionId: role.sessionId,
      total: hist.total,
      oldestSeq: hist.oldestSeq,
      hasOlder: hist.hasOlder,
      running: state.running,
      queued: state.queued,
      startedAt: state.startedAt,
      error: state.lastError,
      messages: hist.slice,
    });
  } catch (err) {
    return sendJson(res, 200, {
      connected: true,
      runner: 'qwen',
      label: role.label || 'Qwen Code',
      sessionId: role.sessionId,
      total: 0,
      hasOlder: false,
      running: state.running,
      queued: state.queued,
      startedAt: state.startedAt,
      error: 'History unavailable: ' + err.message,
      messages: [],
    });
  }
}

function qwenState(id) {
  let state = qwenStates.get(id);
  if (!state) {
    state = { running: false, queued: 0, startedAt: null, lastError: null, lastExit: null, lastDoneAt: null, child: null };
    qwenStates.set(id, state);
  }
  return state;
}

function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  } else {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function spawnQwen(role, text, state) {
  return new Promise((resolve) => {
    const args = ['-r', role.sessionId, '-o', 'json', '--chat-recording'];
    const started = Date.now();
    const timeoutMs = Number(role.timeoutMs) || 1800000;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawn(QWEN.file, [...QWEN.prefix, ...args], {
        cwd: role.cwd,
        windowsHide: true,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ code: -1, stdout, stderr: err.message, durationMs: 0 });
      return;
    }
    state.child = child;
    const finish = (code, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.child = null;
      resolve({ code, stdout, stderr: (stderr + extra).slice(-1200), durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => {
      state.lastError = `qwen timed out after ${Math.round(timeoutMs / 60000)} min`;
      killTree(child);
      finish(-2);
    }, timeoutMs);
    child.stdout.on('data', (d) => { if (stdout.length < 4 * 1024 * 1024) stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { if (stderr.length < 256 * 1024) stderr += d.toString('utf8'); });
    child.on('error', (err) => finish(-1, err.message));
    child.on('close', (code) => finish(code ?? -1));
    child.stdin.on('error', () => {});
    child.stdin.end(text + '\n');
  });
}

async function logTask(entry) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(TASKS_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  } catch { /* auditing must never break a task */ }
}

function enqueueQwen(waker, role, text) {
  const state = qwenState(waker.id);
  state.queued += 1;
  state.lastError = null;
  const previous = qwenChains.get(waker.id) || Promise.resolve();
  const next = previous.then(async () => {
    state.queued = Math.max(0, state.queued - 1);
    state.running = true;
    state.startedAt = Date.now();
    let result;
    try {
      result = await spawnQwen(role, text, state);
    } catch (err) {
      result = { code: -1, stderr: err.message, durationMs: 0 };
    }
    state.running = false;
    state.startedAt = null;
    state.lastExit = result.code;
    state.lastDoneAt = Date.now();
    if (result.code !== 0 && !state.lastError) {
      state.lastError = (result.stderr || result.stdout || `qwen exited with code ${result.code}`).slice(-400);
    }
    logTask({
      agentId: waker.id,
      name: waker.name,
      runner: 'qwen',
      sessionId: role.sessionId,
      textChars: text.length,
      exitCode: result.code,
      durationMs: result.durationMs,
      ok: result.code === 0,
      queuedLeft: state.queued,
    });
  });
  qwenChains.set(waker.id, next.catch(() => {}));
  return state;
}

let summerConsoleLaunching = false;
let summerConsoleLaunchedAt = 0;

async function launchSummerConsole() {
  if (!(await stat(SUMMER_CONSOLE_CWD)).isDirectory()) throw new Error('Workspace Summer bukan folder');
  const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const command = `start "Summer - Qwen CLI" "${cmd}" /d /k "cd /d ${SUMMER_CONSOLE_CWD} && qwen --continue"`;
  await new Promise((resolve, reject) => {
    execFile(cmd, ['/d', '/s', '/c', command], {
      cwd: SUMMER_CONSOLE_CWD,
      windowsHide: true,
      windowsVerbatimArguments: true,
      timeout: 10000,
      env: process.env,
    }, (error) => error ? reject(error) : resolve());
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, rel);
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const data = await readFile(target);
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function handleApi(req, res) {
  // Behind a container platform the Host header is the route/service name rather than
  // HOST:PORT, so same-origin is derived from the request itself (TLS-proxy aware).
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const origin = `${proto}://${req.headers.host || `${HOST}:${server.address().port}`}`;
  if (req.method === 'POST' && (req.headers.origin && req.headers.origin !== origin
    || req.headers['sec-fetch-site'] === 'cross-site'
    || req.headers['content-type']?.split(';')[0].trim() !== 'application/json')) {
    return sendJson(res, 403, { ok: false, error: 'Use the local office with a same-origin JSON request' });
  }
  const url = new URL(req.url, origin);

  if (url.pathname === '/api/summer/console') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST' });
    if (req.headers.origin !== origin) return sendJson(res, 403, { ok: false, error: 'Buka CLI dari menu Summer di office lokal' });
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'Invalid JSON body' }); }
    if (!body || Array.isArray(body) || body.agentId !== SUMMER_ID || Object.keys(body).some((key) => key !== 'agentId')) {
      return sendJson(res, 400, { ok: false, error: 'Launcher hanya menerima identitas Summer; command dan workspace tidak dapat diganti' });
    }
    if (process.platform !== 'win32') return sendJson(res, 501, { ok: false, error: 'CLI Console memerlukan server office di Windows' });
    if (summerConsoleLaunching || Date.now() - summerConsoleLaunchedAt < 5000) {
      return sendJson(res, 429, { ok: false, error: 'Permintaan console baru saja dikirim. Periksa jendela CMD sebelum membuka lagi.' });
    }
    summerConsoleLaunching = true;
    try {
      await launchSummerConsole();
      summerConsoleLaunchedAt = Date.now();
      return sendJson(res, 202, { ok: true, message: 'Windows menerima permintaan membuka CMD baru. Lanjutkan di jendela Summer - Qwen CLI; proses inisialisasi Qwen tampil di sana.' });
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error.code === 'ENOENT'
        ? 'Workspace Summer atau Command Prompt tidak ditemukan pada laptop server office.'
        : 'Launcher CMD tidak terkonfirmasi. Periksa jendela Command Prompt sebelum mencoba lagi.' });
    } finally {
      summerConsoleLaunching = false;
    }
  }

  if (url.pathname === '/api/office' && req.method === 'GET') {
    const force = url.searchParams.get('refresh') === '1';
    let roster = rosterCache;
    if (force || !roster.wakers.length) {
      roster = await Promise.race([
        loadRoster(force).catch(() => rosterCache),
        new Promise((r) => setTimeout(() => r(rosterCache), 6000)),
      ]);
    } else {
      loadRoster().catch(() => {});
    }
    const groups = await Promise.race([
      listGroups().catch(() => groupsCache.groups),
      new Promise((r) => setTimeout(() => r(groupsCache.groups), 4000)),
    ]);
    return sendJson(res, 200, {
      connected: roster.wakers.length > 0,
      user: roster.user,
      error: roster.error,
      wakers: roster.wakers.map((w) => ({ ...w, runner: roleFor(w).runner, isAdmin: w.id === WAKEADMIN_ID })),
      groups: groups
        .filter((g) => !/^office dm\b/i.test(g.title))
        .map((g) => ({ id: `group:${g.convId}`, name: g.title, role: 'GROUP CONVERSATION' })),
      daemon: 'http://127.0.0.1:19820',
    });
  }

  if (url.pathname === '/api/messages' && req.method === 'GET') {
    const agentId = url.searchParams.get('agentId');
    if (agentId && agentId.startsWith('group:')) {
      const convId = agentId.slice(6);
      try {
        const data = await Promise.race([
          listGroupMessages(agentId, convId),
          new Promise((r) => setTimeout(() => r(null), 8000)),
        ]);
        if (data) return sendJson(res, 200, data);
        const stale = msgCache.get(agentId);
        return sendJson(res, 200, stale ? stale.payload : { connected: true, messages: [], error: 'QoderWake daemon busy' });
      } catch (err) {
        return sendJson(res, 200, { connected: true, messages: [], error: err.message });
      }
    }
    const direct = qwenRoleFor(agentId);
    if (direct) return sendQwenHistory(res, direct, agentId, url);
    if (rosterCache.wakers.length) {
      loadRoster().catch(() => {});
    } else {
      await Promise.race([loadRoster().catch(() => rosterCache), new Promise((r) => setTimeout(r, 4000))]);
    }
    const waker = rosterCache.wakers.find((w) => w.id === agentId);
    if (!waker) return sendJson(res, 404, { connected: false, error: 'Unknown Waker' });
    const role = roleFor(waker);
    if (role.runner === 'qwen') return sendQwenHistory(res, role, waker.id, url);
    if (waker.id === WAKEADMIN_ID) refreshAdminApprovals();
    const [base, workflow] = await Promise.all([
      Promise.race([
        listMessages(waker),
        new Promise((r) => setTimeout(() => r(null), 6000)),
      ]).catch((err) => ({ connected: true, messages: [], error: err.message })),
      Promise.race([
        workflowMessagesFor(waker.id).catch(() => []),
        new Promise((r) => setTimeout(() => r([]), 8000)),
      ]),
    ]);
    if (waker.id === WAKEADMIN_ID) {
      return sendJson(res, 200, {
        ...(base || { connected: true, warming: true, messages: [], error: 'QoderWake daemon busy' }),
        adminApprovals,
      });
    }
    if (!base) return sendJson(res, 200, { connected: true, warming: true, messages: workflow, error: 'QoderWake daemon busy' });
    if (!workflow.length) return sendJson(res, 200, base);
    const messages = [...base.messages, ...workflow].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    return sendJson(res, 200, { ...base, messages });
  }

  if (url.pathname === '/api/messages' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 8000) : '';
    if (!text) return sendJson(res, 400, { ok: false, error: 'Message text is required' });
    if (typeof body.agentId === 'string' && body.agentId.startsWith('group:')) {
      const convId = body.agentId.slice(6);
      try {
        const res0 = await runQw(['messages', 'send', convId, '--text', text, '--as-human', '--not-mention', '--intent', 'chat', '--json'], 60000);
        if (res0.code !== 0) throw new Error((res0.stderr || res0.stdout || 'QoderWake rejected the group message').slice(0, 400));
        msgCache.delete(body.agentId);
        let messages = [];
        try { messages = (await listGroupMessages(body.agentId, convId)).messages; } catch { /* polling picks it up */ }
        return sendJson(res, 200, { ok: true, connected: true, messages, delivered: true });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message });
      }
    }
    const direct = qwenRoleFor(body.agentId);
    if (direct) {
      const state = enqueueQwen({ id: body.agentId, name: direct.name || 'Agent' }, direct, text);
      return sendJson(res, 200, {
        ok: true,
        accepted: true,
        runner: 'qwen',
        running: state.running,
        queued: state.queued,
      });
    }
    if (rosterCache.wakers.length) {
      loadRoster(true).catch(() => {});
    } else {
      await Promise.race([loadRoster(true).catch(() => rosterCache), new Promise((r) => setTimeout(r, 5000))]);
    }
    const waker = rosterCache.wakers.find((w) => w.id === body.agentId);
    if (!waker) return sendJson(res, 404, { ok: false, error: 'Unknown Waker' });
    const role = roleFor(waker);
    if (role.runner === 'qwen') {
      if (!role.sessionId || !role.cwd) {
        return sendJson(res, 200, { ok: false, error: 'Qwen role is missing sessionId or cwd' });
      }
      const state = enqueueQwen(waker, role, text);
      return sendJson(res, 200, {
        ok: true,
        accepted: true,
        runner: 'qwen',
        running: state.running,
        queued: state.queued,
      });
    }
    try {
      const result = await sendMessage(waker, text);
      let workflow = null;
      if (waker.id === SNOW_ID && looksLikeCase(text)) {
        const active = Object.values(workflowRuns).some((r) => r.agentId === SNOW_ID && r.status === 'running');
        if (!active) {
          workflow = { started: true };
          triggerWorkflow(SNOW_ID, text).catch((err) => {
            workflowRuns[`failed-${Date.now()}`] = {
              runId: null, agentId: SNOW_ID, customer: 'unknown', projectType: 'new',
              startedAt: new Date().toISOString(), status: 'failed', phase: 'Dispatch',
              events: [], error: err.message,
            };
            saveWorkflowRuns().catch(() => {});
          });
        }
      }
      return sendJson(res, 200, { ok: true, ...result, workflow });
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    handleApi(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: err.message || 'Internal error' });
    });
    return;
  }
  serveStatic(req, res).catch(() => {
    if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
  });
});

function listen(port, attempts = 20) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts > 0) {
      listen(port + 1, attempts - 1);
    } else {
      console.error('[office] failed to start:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    const roster = rosterCache.wakers.length ? `${rosterCache.wakers.length} Wakers` : 'roster pending';
    console.log(`\n  QODERWAKE // 8-BIT OFFICE`);
    console.log(`  http://${HOST}:${port}  (${roster})`);
    console.log(`  qoderwake binary: ${QW}`);
    const qwenRoles = Object.entries(roles.roles || {}).filter(([, r]) => r.runner === 'qwen');
    for (const [id, r] of qwenRoles) {
      console.log(`  qwen runner: ${r.name || id} → ${r.cwd} (session ${r.sessionId})`);
    }
    console.log('');
  });
}

await mkdir(DATA_DIR, { recursive: true });
server.requestTimeout = 0;
listen(PORT_START);
loadRoster().catch(() => {});

for (const [id, r] of Object.entries(roles.roles || {})) {
  if (r.runner !== 'qwen') continue;
  readTranscript({ runner: 'qwen', ...r })
    .then(({ messages }) => console.log(`  qwen history warmed: ${r.name || id} (${messages.length} messages)`))
    .catch((err) => console.warn(`  qwen history warm failed for ${r.name || id}: ${err.message}`));
}
