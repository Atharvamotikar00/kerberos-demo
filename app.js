import { deriveKey, importRawKey, encryptJson, decryptJson } from './crypto-client.js';
import { renderDiagram } from './diagram.js';
import { GLOSSARY } from './glossary.js';

const API = '';

async function api(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json;
  try { json = await res.json(); } catch (e) { json = {}; }
  return { status: res.status, ok: res.ok, body: json };
}

// ---------------------------------------------------------------------------
// Client-side session state. Note what's absent: no TGS key, no app-server
// key, no krbtgt key -- only what the AS-REP / TGS-REP legitimately handed us.
// ---------------------------------------------------------------------------
const state = {
  username: null,
  password: null,
  clientKey: null,        // CryptoKey derived from password (never leaves the browser)
  tgt: null,               // opaque blob -- client cannot decrypt this
  tgsSessionKeyB64: null,
  tgsSessionKey: null,     // CryptoKey
  serviceTicket: null,     // opaque blob -- client cannot decrypt this
  appSessionKeyB64: null,
  appSessionKey: null,     // CryptoKey
  lastTgsAuthenticator: null,
  lastApAuthenticator: null,
  fullFlowComplete: false,
};

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------
const staticDiagram = renderDiagram(document.getElementById('diagram-static'));
const wizardDiagram = renderDiagram(document.getElementById('diagram-wizard'));

// ---------------------------------------------------------------------------
// Step list scaffolding
// ---------------------------------------------------------------------------
const STEP_DEFS = [
  { id: 'AS-REQ', title: 'AS-REQ', sub: 'Client → Authentication Server' },
  { id: 'AS-REP', title: 'AS-REP', sub: 'Authentication Server → Client' },
  { id: 'TGS-REQ', title: 'TGS-REQ', sub: 'Client → Ticket Granting Server' },
  { id: 'TGS-REP', title: 'TGS-REP', sub: 'Ticket Granting Server → Client' },
  { id: 'AP-REQ', title: 'AP-REQ', sub: 'Client → Application Server' },
  { id: 'AP-REP', title: 'AP-REP', sub: 'Application Server → Client (mutual auth)' },
];

const stepListEl = document.getElementById('step-list');
STEP_DEFS.forEach((def) => {
  const li = document.createElement('li');
  li.className = 'step';
  li.dataset.step = def.id;
  li.dataset.state = 'pending';
  li.innerHTML = `
    <div class="step-header">
      <span class="step-badge">${def.id}</span>
      <div>
        <div class="step-title">${def.title}</div>
        <div class="step-sub">${def.sub}</div>
      </div>
      <span class="step-chevron">▸</span>
    </div>
    <div class="step-body"></div>
  `;
  stepListEl.appendChild(li);
});

stepListEl.addEventListener('click', (e) => {
  const header = e.target.closest('.step-header');
  if (!header) return;
  const step = header.closest('.step');
  if (step.dataset.state === 'pending') return;
  step.classList.toggle('open');
});

let decryptCounter = 0;
const decryptRegistry = new Map();

// Delegate decrypt button clicks
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.decrypt-btn');
  if (!btn) return;
  const entry = decryptRegistry.get(btn.dataset.decryptId);
  if (!entry) return;
  btn.disabled = true;
  btn.textContent = 'Decrypting…';
  try {
    const key = await entry.getKey();
    const plaintext = await decryptJson(key, entry.blob);
    const reveal = document.createElement('div');
    reveal.className = 'plaintext-reveal';
    reveal.textContent = JSON.stringify(plaintext, null, 2);
    btn.closest('.cipher-row').after(reveal);
    btn.textContent = 'Decrypted ✓';
  } catch (err) {
    const reveal = document.createElement('div');
    reveal.className = 'plaintext-reveal';
    reveal.style.color = 'var(--danger)';
    reveal.textContent = 'Decryption failed: ' + err.message;
    btn.closest('.cipher-row').after(reveal);
    btn.textContent = 'Failed ✗';
  }
});

function fieldBlock(label, obj) {
  return `<div class="field-block"><h4>${label}</h4><pre class="code-block">${escapeHtml(JSON.stringify(obj, null, 2))}</pre></div>`;
}

function cipherRow(label, blob, opaqueNote, getKeyFn) {
  const id = 'dec' + (decryptCounter++);
  if (getKeyFn) {
    decryptRegistry.set(id, { blob, getKey: getKeyFn });
  }
  return `
    <div class="field-block">
      <h4>${label} <span style="opacity:.6;font-weight:400;">(iv / ciphertext / authTag, base64)</span></h4>
      <div class="cipher-row">
        <code>${escapeHtml(blob.ciphertext.slice(0, 64))}${blob.ciphertext.length > 64 ? '…' : ''}</code>
        ${getKeyFn ? `<button class="decrypt-btn" data-decrypt-id="${id}">Decrypt</button>` : ''}
      </div>
      ${opaqueNote ? `<div class="opaque-note">${opaqueNote}</div>` : ''}
    </div>`;
}

function escapeHtml(str) {
  return str.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function setStep(id, { state: stepState, html }) {
  const li = stepListEl.querySelector(`[data-step="${id}"]`);
  li.dataset.state = stepState;
  if (html !== undefined) li.querySelector('.step-body').innerHTML = html;
  if (stepState === 'active' || stepState === 'done') li.classList.add('open');
  wizardDiagram.highlightHop(id);
  staticDiagram.highlightHop(id);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const statusEl = document.getElementById('register-status');
  statusEl.textContent = 'Registering…';
  statusEl.className = 'status-line';
  const resp = await api('/api/as/register', { username, password });
  if (resp.ok) {
    statusEl.textContent = `Registered ${username}@${resp.body.realm}. Switch to "Run the protocol" to log in.`;
    statusEl.className = 'status-line ok';
    document.getElementById('login-username').value = username;
    document.querySelector('.tab-btn[data-tab="login"]').click();
  } else {
    statusEl.textContent = resp.body.message || 'Registration failed.';
    statusEl.className = 'status-line err';
  }
});

// ---------------------------------------------------------------------------
// AS exchange (login) -- fills AS-REQ and AS-REP steps
// ---------------------------------------------------------------------------
async function runAsExchange(username, password) {
  const init = await api('/api/as/request-init', { username });
  const clientKey = await deriveKey(password, init.body.salt, init.body.iterations);
  const timestamp = new Date().toISOString();
  const encTimestamp = await encryptJson(clientKey, { timestamp });

  setStep('AS-REQ', {
    state: 'done',
    html:
      fieldBlock('Round 1 — salt discovery request', { username }) +
      fieldBlock('Round 1 — response (salt + KDF params)', { salt: init.body.salt.slice(0, 24) + '…', iterations: init.body.iterations }) +
      fieldBlock('Round 2 — pre-authentication request fields', { username, encTimestamp: '(see ciphertext below)' }) +
      cipherRow('Pre-auth encrypted timestamp <span class="tip" data-glossary="preauth">?</span>', encTimestamp,
        'This was encrypted by the client using its password-derived key. The AS will only issue a TGT if it can decrypt this with the same key it has stored — the actual point where a wrong password is caught.'),
  });

  const authResp = await api('/api/as/authenticate', { username, encTimestamp });

  if (!authResp.ok) {
    setStep('AS-REP', {
      state: 'active',
      html: `<div class="failure-result"><strong>${authResp.body.error}</strong><br>${authResp.body.message}</div>`,
    });
    return { ok: false, error: authResp.body };
  }

  const { tgt, encPart } = authResp.body;
  const asPlain = await decryptJson(clientKey, encPart);
  const tgsSessionKeyB64 = asPlain.sessionKey;
  const tgsSessionKey = await importRawKey(tgsSessionKeyB64);

  setStep('AS-REP', {
    state: 'done',
    html:
      cipherRow('Ticket Granting Ticket (TGT) <span class="tip" data-glossary="tgt">?</span>', tgt,
        'Encrypted with the TGS\'s own secret key. The client can carry this around but has no way to decrypt it — there is deliberately no decrypt button here.') +
      cipherRow('Encrypted part (readable by client)', encPart,
        null,
        async () => clientKey),
  });

  return { ok: true, username, password, clientKey, tgt, tgsSessionKeyB64, tgsSessionKey };
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const statusEl = document.getElementById('login-status');
  statusEl.textContent = 'Running AS exchange…';
  statusEl.className = 'status-line';

  document.getElementById('wizard').classList.remove('hidden');
  setStep('AS-REQ', { state: 'active', html: '' });

  const result = await runAsExchange(username, password);
  if (!result.ok) {
    statusEl.textContent = 'AS exchange failed — see the AS-REP panel below.';
    statusEl.className = 'status-line err';
    return;
  }

  Object.assign(state, result);
  statusEl.textContent = `Authenticated as ${username}. TGT acquired — request a service ticket next.`;
  statusEl.className = 'status-line ok';
  document.getElementById('btn-tgs-request').classList.remove('hidden');
});

// ---------------------------------------------------------------------------
// TGS exchange -- fills TGS-REQ and TGS-REP steps
// ---------------------------------------------------------------------------
document.getElementById('btn-tgs-request').addEventListener('click', async () => {
  const btn = document.getElementById('btn-tgs-request');
  btn.disabled = true;
  setStep('TGS-REQ', { state: 'active', html: '' });

  const timestamp = new Date().toISOString();
  const authenticator = await encryptJson(state.tgsSessionKey, { username: state.username, timestamp });
  state.lastTgsAuthenticator = authenticator;

  setStep('TGS-REQ', {
    state: 'done',
    html:
      cipherRow('TGT (forwarded, still opaque to client)', state.tgt, 'Same opaque blob from AS-REP — the client just forwards it.') +
      fieldBlock('Requested service', { serviceName: 'app-server' }) +
      cipherRow('Authenticator <span class="tip" data-glossary="authenticator">?</span>', authenticator,
        null, async () => state.tgsSessionKey),
  });

  const resp = await api('/api/tgs/request', { tgt: state.tgt, authenticator, serviceName: 'app-server' });

  if (!resp.ok) {
    setStep('TGS-REP', { state: 'active', html: `<div class="failure-result"><strong>${resp.body.error}</strong><br>${resp.body.message}</div>` });
    btn.disabled = false;
    return;
  }

  const { serviceTicket, encPart } = resp.body;
  const tgsPlain = await decryptJson(state.tgsSessionKey, encPart);
  state.serviceTicket = serviceTicket;
  state.appSessionKeyB64 = tgsPlain.sessionKey;
  state.appSessionKey = await importRawKey(tgsPlain.sessionKey);

  setStep('TGS-REP', {
    state: 'done',
    html:
      cipherRow('Service Ticket <span class="tip" data-glossary="serviceTicket">?</span>', serviceTicket,
        'Encrypted with app-server\'s own key. The client cannot decrypt this either — it can only be opened by app-server.') +
      cipherRow('Encrypted part (readable by client via TGS session key)', encPart, null, async () => state.tgsSessionKey),
  });

  document.getElementById('btn-ap-request').classList.remove('hidden');
});

// ---------------------------------------------------------------------------
// AP exchange -- fills AP-REQ and AP-REP steps
// ---------------------------------------------------------------------------
document.getElementById('btn-ap-request').addEventListener('click', async () => {
  const btn = document.getElementById('btn-ap-request');
  btn.disabled = true;
  setStep('AP-REQ', { state: 'active', html: '' });

  const timestamp = new Date().toISOString();
  const authenticator = await encryptJson(state.appSessionKey, { username: state.username, timestamp });
  state.lastApAuthenticator = authenticator;

  setStep('AP-REQ', {
    state: 'done',
    html:
      cipherRow('Service ticket (forwarded, still opaque to client)', state.serviceTicket, 'Forwarded unchanged from TGS-REP.') +
      cipherRow('Authenticator <span class="tip" data-glossary="authenticator">?</span>', authenticator, null, async () => state.appSessionKey),
  });

  const resp = await api('/api/app-server/request', { serviceTicket: state.serviceTicket, authenticator });

  if (!resp.ok) {
    setStep('AP-REP', { state: 'active', html: `<div class="failure-result"><strong>${resp.body.error}</strong><br>${resp.body.message}</div>` });
    btn.disabled = false;
    return;
  }

  const mutual = await decryptJson(state.appSessionKey, resp.body.apRep);
  const verified = mutual.timestamp === timestamp;

  setStep('AP-REP', {
    state: 'done',
    html:
      cipherRow('Mutual-auth reply <span class="tip" data-glossary="mutualAuth">?</span>', resp.body.apRep, null, async () => state.appSessionKey) +
      `<div class="plaintext-reveal" style="margin-top:0;">${verified ? '✓ Server echoed back the exact timestamp we sent, encrypted with our shared session key — this really is app-server, and the session is fully mutually authenticated.' : '✗ Timestamp mismatch!'}</div>`,
  });

  state.fullFlowComplete = true;
  document.getElementById('failure-lab').classList.remove('hidden');
  btn.textContent = 'Session established ✓';
});

// ---------------------------------------------------------------------------
// Failure demos
// ---------------------------------------------------------------------------
const failureOutput = document.getElementById('failure-output');

function showFailureResult(title, resp) {
  failureOutput.innerHTML = `
    <div class="failure-result">
      <strong>${resp.body.error || ('HTTP ' + resp.status)}</strong><br>
      ${resp.body.message || 'Request rejected.'}
    </div>`;
}

function showFailureNote(text) {
  failureOutput.innerHTML = `<div class="failure-result">${text}</div>`;
}

document.querySelectorAll('.failure-grid button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    failureOutput.innerHTML = '<div class="status-line">Running…</div>';
    const demo = btn.dataset.demo;

    if (demo === 'wrong-password') {
      const init = await api('/api/as/request-init', { username: state.username });
      const wrongKey = await deriveKey(state.password + '_WRONG', init.body.salt, init.body.iterations);
      const encTimestamp = await encryptJson(wrongKey, { timestamp: new Date().toISOString() });
      const resp = await api('/api/as/authenticate', { username: state.username, encTimestamp });
      showFailureResult('wrong password', resp);
      return;
    }

    if (!state.fullFlowComplete) {
      showFailureNote('Complete the full protocol flow above first (through AP-REP) so there\'s a live session to attack.');
      return;
    }

    if (demo === 'expired-ticket') {
      const authenticator = await encryptJson(state.tgsSessionKey, { username: state.username, timestamp: new Date().toISOString() });
      const tgsResp = await api('/api/tgs/request', { tgt: state.tgt, authenticator, serviceName: 'app-server', debugForceExpiredTicket: true });
      if (!tgsResp.ok) return showFailureResult('expired ticket (TGS step)', tgsResp);
      const plain = await decryptJson(state.tgsSessionKey, tgsResp.body.encPart);
      const appKey = await importRawKey(plain.sessionKey);
      const authenticator2 = await encryptJson(appKey, { username: state.username, timestamp: new Date().toISOString() });
      const apResp = await api('/api/app-server/request', { serviceTicket: tgsResp.body.serviceTicket, authenticator: authenticator2 });
      showFailureResult('expired ticket', apResp);
      return;
    }

    if (demo === 'replay') {
      const resp = await api('/api/app-server/request', { serviceTicket: state.serviceTicket, authenticator: state.lastApAuthenticator });
      showFailureResult('replayed authenticator', resp);
      return;
    }

    if (demo === 'tamper') {
      const tampered = { ...state.serviceTicket, ciphertext: state.serviceTicket.ciphertext.slice(0, -4) + 'AAAA' };
      const authenticator = await encryptJson(state.appSessionKey, { username: state.username, timestamp: new Date().toISOString() });
      const resp = await api('/api/app-server/request', { serviceTicket: tampered, authenticator });
      showFailureResult('tampered ciphertext', resp);
      return;
    }
  });
});

// ---------------------------------------------------------------------------
// Glossary tooltips
// ---------------------------------------------------------------------------
const tooltipEl = document.getElementById('tooltip');
document.addEventListener('mouseover', (e) => {
  const tip = e.target.closest('.tip');
  if (!tip) return;
  const text = GLOSSARY[tip.dataset.glossary];
  if (!text) return;
  tooltipEl.textContent = text;
  tooltipEl.classList.remove('hidden');
  positionTooltip(e, tip);
});
document.addEventListener('mousemove', (e) => {
  if (!tooltipEl.classList.contains('hidden')) positionTooltip(e);
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.tip')) tooltipEl.classList.add('hidden');
});
function positionTooltip(e) {
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + 280 > window.innerWidth) x = e.clientX - 280 - pad;
  if (y + 80 > window.innerHeight) y = e.clientY - 80 - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

// ---------------------------------------------------------------------------
// Smooth scroll + scroll-spy for nav links
// ---------------------------------------------------------------------------
document.documentElement.style.scrollBehavior = 'smooth';

document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
const sections = [...navLinks].map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

if (sections.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach((a) => {
            a.classList.toggle('active', a.getAttribute('href') === '#' + id);
          });
        }
      });
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
  );
  sections.forEach((s) => observer.observe(s));
}
