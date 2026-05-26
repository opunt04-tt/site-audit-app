/* ============================================================
   AuditMate — Main Application
   ============================================================ */

'use strict';

// ============================================================
// STATE
// ============================================================
const EMPTY_SITE_NOTES = () => ({
  worksCompleted: '',
  hazards: '',
  issues: '',
  holdups: '',
  materialsUsed: '',
  materialsNeeded: '',
  nextSteps: '',
  generalNotes: '',
});

// Maps state keys → textarea element IDs
const NOTE_TEXTAREA_IDS = {
  worksCompleted:  'note-works-completed',
  hazards:         'note-hazards',
  issues:          'note-issues',
  holdups:         'note-holdups',
  materialsUsed:   'note-materials-used',
  materialsNeeded: 'note-materials-needed',
  nextSteps:       'note-next-steps',
  generalNotes:    'note-general',
};

// Currently-viewed saved audit (null when browsing wizard/dashboard)
let currentAuditDetail = null;

const state = {
  currentView: 'login',
  currentStep: 1,
  totalSteps: 7,
  user: null,
  audits: [],
  formData: {
    jobDetails: {},
    siteNotes: EMPTY_SITE_NOTES(),
    observations: [],
    photos: [],
    holdups: { hasHoldup: false, reason: '', responsible: '', delay: '', formallyReported: false, notes: '' },
    materials: [],
    report: '',
    signature: null,
  },
};

// Observations checklist definitions
const OBSERVATIONS = [
  { id: 'site_access', label: 'Site safe and accessible' },
  { id: 'ppe', label: 'PPE and safety equipment in place' },
  { id: 'components', label: 'Main components in satisfactory condition' },
  { id: 'materials', label: 'Materials and workmanship acceptable' },
  { id: 'fire', label: 'Fire safety compliance met' },
  { id: 'hazards', label: 'No hazardous conditions identified' },
  { id: 'standards', label: 'Work meets regulatory requirements' },
  { id: 'docs', label: 'Documentation and certification up to date' },
];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initObservations();
  initPhotoUpload();
  initSignaturePad();
  initVoiceDictation();
  initOfflineMode();

  // Wire up all static event listeners
  bindEvents();

  // Init materials voice after bind
  initMaterialsVoice();

  // Auth-based init (replaces showView('login'))
  initAuth();
});

// ============================================================
// VIEW ROUTING
// ============================================================
function showView(name) {
  document.querySelectorAll('[data-view]').forEach(el => el.classList.remove('active'));
  const target = document.querySelector(`[data-view="${name}"]`);
  if (target) target.classList.add('active');
  state.currentView = name;
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============================================================
// EVENT BINDING
// ============================================================
function bindEvents() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  // Signup form
  document.getElementById('signup-form').addEventListener('submit', handleSignupSubmit);
  // Forgot password form
  document.getElementById('forgot-form').addEventListener('submit', handleForgotSubmit);
  // Reset password form
  document.getElementById('reset-form').addEventListener('submit', handleResetSubmit);

  // Auth navigation links
  const linkForgot = document.getElementById('link-forgot');
  if (linkForgot) linkForgot.addEventListener('click', () => showView('forgot-password'));
  const linkSignup = document.getElementById('link-signup');
  if (linkSignup) linkSignup.addEventListener('click', () => showView('signup'));
  const linkLoginFromSignup = document.getElementById('link-login-from-signup');
  if (linkLoginFromSignup) linkLoginFromSignup.addEventListener('click', () => showView('login'));
  const linkLoginFromForgot = document.getElementById('link-login-from-forgot');
  if (linkLoginFromForgot) linkLoginFromForgot.addEventListener('click', () => showView('login'));

  // Dashboard
  document.getElementById('btn-new-audit').addEventListener('click', startNewAudit);
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Admin Panel button (from dashboard)
  const btnToAdmin = document.getElementById('btn-to-admin');
  if (btnToAdmin) btnToAdmin.addEventListener('click', () => { showView('admin'); initAdminPanel(); });

  // Admin panel navigation
  const btnAdminToDashboard = document.getElementById('btn-admin-to-dashboard');
  if (btnAdminToDashboard) btnAdminToDashboard.addEventListener('click', () => showView('dashboard'));
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  if (btnAdminLogout) btnAdminLogout.addEventListener('click', logout);

  // Admin tabs — handled inline via onclick in HTML

  // Template editor
  const btnEditorBack = document.getElementById('btn-editor-back');
  if (btnEditorBack) btnEditorBack.addEventListener('click', () => showView('admin'));
  const btnSaveTemplate = document.getElementById('btn-save-template');
  if (btnSaveTemplate) btnSaveTemplate.addEventListener('click', saveTemplate);
  const btnAddSection = document.getElementById('btn-add-section');
  if (btnAddSection) btnAddSection.addEventListener('click', addSection);
  const btnNewTemplate = document.getElementById('btn-new-template');
  if (btnNewTemplate) btnNewTemplate.addEventListener('click', () => openTemplateEditor(null));

  // Wizard navigation
  document.getElementById('btn-prev').addEventListener('click', prevStep);
  document.getElementById('btn-next').addEventListener('click', nextStep);

  // Step 6 - generate / regenerate
  document.getElementById('btn-generate').addEventListener('click', generateReport);
  document.getElementById('btn-regenerate').addEventListener('click', regenerateReport);

  // Step 7 - sign off
  document.getElementById('btn-clear-sig').addEventListener('click', clearSignature);
  document.getElementById('btn-complete-audit').addEventListener('click', completeAudit);
  document.getElementById('btn-email').addEventListener('click', openEmailModal);
  document.getElementById('btn-download').addEventListener('click', downloadPDF);

  // Email modal
  document.getElementById('modal-close').addEventListener('click', closeEmailModal);
  document.getElementById('btn-modal-send').addEventListener('click', sendEmail);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeEmailModal);
  document.getElementById('email-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('email-modal-overlay')) closeEmailModal();
  });

  // Smart note textareas — auto-save on input
  Object.entries(NOTE_TEXTAREA_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      state.formData.siteNotes[key] = el.value;
      autoSave();
    });
  });

  // Step 3 — Holdup toggles
  document.querySelectorAll('#holdup-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#holdup-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isYes = btn.dataset.value === 'yes';
      const holdupDetails = document.getElementById('holdup-details');
      if (holdupDetails) holdupDetails.classList.toggle('hidden', !isYes);
      state.formData.holdups.hasHoldup = isYes;
    });
  });

  document.querySelectorAll('#holdup-reported-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#holdup-reported-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.formData.holdups.formallyReported = btn.dataset.value === 'yes';
    });
  });

  // Step 4 — Materials
  const btnAddMaterial = document.getElementById('btn-add-material');
  if (btnAddMaterial) btnAddMaterial.addEventListener('click', () => addMaterialRow());

  // Audit detail view buttons
  const btnAuditBack = document.getElementById('btn-audit-back');
  if (btnAuditBack) btnAuditBack.addEventListener('click', () => { currentAuditDetail = null; showView('dashboard'); });

  const btnAuditEmail = document.getElementById('btn-audit-email');
  if (btnAuditEmail) btnAuditEmail.addEventListener('click', () => {
    if (!currentAuditDetail) return;
    const jd = currentAuditDetail.jobDetails || {};
    document.getElementById('email-to').value = '';
    document.getElementById('email-subject').value = `Site Audit Report — ${jd.clientName || 'Client'} — ${formatDate(jd.date) || today()}`;
    document.getElementById('email-message').value = `Dear ${jd.clientName || 'Client'},\n\nPlease find your site audit report attached.\n\nKind regards,\n${jd.electricianName || 'AuditMate'}`;
    document.getElementById('email-modal-overlay').dataset.emailMode = 'audit-detail';
    document.getElementById('email-modal-overlay').classList.add('visible');
  });

  const btnAuditPdf = document.getElementById('btn-audit-pdf');
  if (btnAuditPdf) btnAuditPdf.addEventListener('click', () => downloadPDF('audit-detail'));

  const btnAuditDelete = document.getElementById('btn-audit-delete');
  if (btnAuditDelete) btnAuditDelete.addEventListener('click', () => { if (currentAuditDetail) deleteAudit(currentAuditDetail.id); });
}

// ============================================================
// DASHBOARD
// ============================================================
function renderAuditList() {
  const container = document.getElementById('audit-list');
  const emptyState = document.getElementById('empty-state');

  const sectionHeader = document.querySelector('.audits-section-header');
  if (state.audits.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    if (sectionHeader) sectionHeader.classList.add('hidden');
    return;
  }
  if (sectionHeader) sectionHeader.classList.remove('hidden');

  emptyState.classList.add('hidden');
  container.innerHTML = state.audits.map(audit => `
    <div class="audit-card" onclick="viewAudit('${audit.id}')">
      <div class="audit-icon">📋</div>
      <div class="audit-info">
        <div class="audit-name">${escapeHtml(audit.jobDetails?.clientName || 'Untitled Audit')}</div>
        <div class="audit-meta">${escapeHtml(audit.jobDetails?.jobType || '')} · ${escapeHtml(audit.jobDetails?.siteAddress || '')} · ${formatDate(audit.createdAt)}</div>
      </div>
      <span class="badge badge-${(audit.status || 'draft').toLowerCase().replace(/\s+/g, '_')}">${audit.status || 'Draft'}</span>
    </div>
  `).join('');

  const countBadge = document.getElementById('audit-count-badge');
  if (countBadge) countBadge.textContent = `${state.audits.length} audit${state.audits.length !== 1 ? 's' : ''}`;
}

async function viewAudit(id) {
  try {
    const res = await authFetch(`/api/audits/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.error || 'Could not load audit.', 'error');
      return;
    }
    currentAuditDetail = await res.json();
    renderAuditDetail(currentAuditDetail);
    showView('audit-detail');
  } catch (e) {
    toast('Error loading audit: ' + e.message, 'error');
  }
}

function renderAuditDetail(audit) {
  const jd = audit.jobDetails || {};

  // Header title
  const titleEl = document.getElementById('audit-detail-title');
  if (titleEl) titleEl.textContent = jd.clientName || 'Audit';

  // Meta card
  const metaEl = document.getElementById('audit-detail-meta');
  if (metaEl) {
    const statusClass = (audit.status || 'draft').toLowerCase().replace(/\s+/g, '_');
    metaEl.innerHTML = `
      <div class="audit-detail-title-row">
        <h2 class="audit-detail-client">${escapeHtml(jd.clientName || 'Untitled Audit')}</h2>
        <span class="badge badge-${statusClass}">${escapeHtml(audit.status || 'Draft')}</span>
      </div>
      <div class="audit-detail-info-grid">
        <div class="audit-detail-info-row"><span class="adi-label">📍 Site</span><span class="adi-value">${escapeHtml(jd.siteAddress || '—')}</span></div>
        <div class="audit-detail-info-row"><span class="adi-label">🔧 Type</span><span class="adi-value">${escapeHtml(jd.jobType || '—')}</span></div>
        <div class="audit-detail-info-row"><span class="adi-label">📅 Date</span><span class="adi-value">${formatDate(jd.date) || '—'}</span></div>
        <div class="audit-detail-info-row"><span class="adi-label">👤 By</span><span class="adi-value">${escapeHtml(jd.electricianName || '—')}</span></div>
        ${jd.licenseNumber ? `<div class="audit-detail-info-row"><span class="adi-label">🪪 Lic</span><span class="adi-value">${escapeHtml(jd.licenseNumber)}</span></div>` : ''}
        ${jd.referenceNumber ? `<div class="audit-detail-info-row"><span class="adi-label">📄 Ref</span><span class="adi-value">${escapeHtml(jd.referenceNumber)}</span></div>` : ''}
        <div class="audit-detail-info-row"><span class="adi-label">🕐 Saved</span><span class="adi-value">${formatDate(audit.createdAt?.split('T')[0]) || '—'}</span></div>
        ${audit.hasSignature ? `<div class="audit-detail-info-row"><span class="adi-label">✍️ Signed</span><span class="adi-value" style="color:var(--success);font-weight:600">Yes</span></div>` : ''}
      </div>
    `;
  }

  // Report content
  const reportEl = document.getElementById('audit-detail-report');
  if (reportEl) {
    if (audit.report) {
      reportEl.innerHTML = markdownToHtml(audit.report);
    } else {
      reportEl.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:40px 0;font-size:15px">No report was generated for this audit.</p>';
    }
  }
}

async function deleteAudit(id) {
  if (!confirm('Delete this audit? This cannot be undone.')) return;
  try {
    const res = await authFetch(`/api/audits/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Delete failed');
    }
    state.audits = state.audits.filter(a => a.id !== id);
    renderAuditList();
    currentAuditDetail = null;
    showView('dashboard');
    toast('Audit deleted.', 'success');
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

// ============================================================
// LOAD AUDITS FROM SERVER
// ============================================================
async function loadAuditsFromServer() {
  try {
    const res = await authFetch('/api/audits');
    if (!res.ok) return;
    state.audits = await res.json();
    renderAuditList();
  } catch(e) { console.error(e); }
}

// ============================================================
// WIZARD
// ============================================================
function startNewAudit() {
  resetWizardState();
  showView('wizard');
  updateStep(1);
}

function resetWizardState() {
  state.currentStep = 1;
  state.formData = {
    jobDetails: {},
    siteNotes: EMPTY_SITE_NOTES(),
    observations: OBSERVATIONS.map(o => ({ ...o, status: 'N/A' })),
    photos: [],
    holdups: { hasHoldup: false, reason: '', responsible: '', delay: '', formallyReported: false, notes: '' },
    materials: [],
    report: '',
    signature: null,
  };

  // Clear form fields
  document.getElementById('client-name').value = '';
  document.getElementById('site-address').value = '';
  document.getElementById('job-type').value = '';
  document.getElementById('electrician-name').value = window.currentUser?.name || '';
  document.getElementById('license-number').value = '';
  document.getElementById('job-date').value = today();
  document.getElementById('reference-number').value = '';
  // Clear all smart note textareas
  Object.values(NOTE_TEXTAREA_IDS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const transcriptPreview = document.getElementById('transcript-preview');
  if (transcriptPreview) transcriptPreview.classList.add('hidden');

  // Reset observations
  renderObservations();

  // Clear photos
  state.formData.photos = [];
  renderPhotoGrid();

  // Reset report section
  document.getElementById('generate-section').style.display = 'block';
  document.getElementById('loading-section').classList.remove('visible');
  document.getElementById('report-preview').classList.remove('visible');
  document.getElementById('report-content').innerHTML = '';

  // Clear signature
  clearSignature();

  // Reset holdup UI
  const holdupToggle = document.querySelectorAll('#holdup-toggle .toggle-btn');
  holdupToggle.forEach(b => b.classList.toggle('active', b.dataset.value === 'no'));
  const holdupDetails = document.getElementById('holdup-details');
  if (holdupDetails) holdupDetails.classList.add('hidden');
  const holdupReason = document.getElementById('holdup-reason');
  if (holdupReason) holdupReason.value = '';
  const holdupResponsible = document.getElementById('holdup-responsible');
  if (holdupResponsible) holdupResponsible.value = '';
  const holdupDelay = document.getElementById('holdup-delay');
  if (holdupDelay) holdupDelay.value = '';
  const holdupNotes = document.getElementById('holdup-notes');
  if (holdupNotes) holdupNotes.value = '';
  document.querySelectorAll('#holdup-reported-toggle .toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.value === 'no'));

  // Reset materials
  renderMaterialsList();

  // Restore saved draft if any
  loadDraft();
}

function updateStep(step) {
  state.currentStep = step;

  // Update step count badge
  const stepCount = document.getElementById('wizard-step-count');
  if (stepCount) stepCount.textContent = `Step ${step} of ${state.totalSteps}`;

  // Update step labels
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 === step) el.classList.add('active');
    else if (i + 1 < step) el.classList.add('completed');
  });

  // Show/hide panels
  document.querySelectorAll('.step-panel').forEach((panel, i) => {
    panel.classList.toggle('active', i + 1 === step);
  });

  // Update nav buttons
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  btnPrev.style.display = step === 1 ? 'none' : 'inline-flex';
  btnNext.style.display = step === state.totalSteps ? 'none' : 'inline-flex';

  // If on step 7, populate summary and resize signature canvas
  if (step === 7) {
    populateSignOffSummary();
    setTimeout(() => resizeCanvas(), 60); // wait for panel to be visible
  }

  // Scroll to top
  document.querySelector('.wizard-body').scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() {
  if (!validateCurrentStep()) return;
  collectCurrentStepData();
  autoSave();
  if (state.currentStep < state.totalSteps) {
    updateStep(state.currentStep + 1);
  }
}

function prevStep() {
  if (state.currentStep > 1) {
    collectCurrentStepData();
    updateStep(state.currentStep - 1);
  } else {
    showView('dashboard');
  }
}

function validateCurrentStep() {
  const step = state.currentStep;

  if (step === 1) {
    const fields = [
      { id: 'client-name', name: 'Client Name' },
      { id: 'site-address', name: 'Site Address' },
      { id: 'job-type', name: 'Job Type' },
      { id: 'electrician-name', name: 'Tradesperson Name' },
      { id: 'job-date', name: 'Date' },
    ];
    for (const f of fields) {
      if (!document.getElementById(f.id).value.trim()) {
        toast(`Please fill in ${f.name}.`, 'error');
        document.getElementById(f.id).focus();
        return false;
      }
    }
  }

  if (step === 3 && state.formData.holdups.hasHoldup) {
    const reason = document.getElementById('holdup-reason')?.value.trim();
    if (!reason) {
      toast('Please describe the reason for the holdup.', 'error');
      document.getElementById('holdup-reason')?.focus();
      return false;
    }
  }

  // Step 4 (materials): always valid
  // Step 5 (photos): always valid

  if (step === 6 && !state.formData.report) {
    toast('Please generate a report before proceeding.', 'error');
    return false;
  }

  return true;
}

function collectCurrentStepData() {
  const step = state.currentStep;

  if (step === 1) {
    state.formData.jobDetails = {
      clientName: document.getElementById('client-name').value.trim(),
      siteAddress: document.getElementById('site-address').value.trim(),
      jobType: document.getElementById('job-type').value,
      electricianName: document.getElementById('electrician-name').value.trim(),
      licenseNumber: document.getElementById('license-number').value.trim(),
      date: document.getElementById('job-date').value,
      referenceNumber: document.getElementById('reference-number').value.trim(),
    };
  }

  if (step === 2) {
    Object.entries(NOTE_TEXTAREA_IDS).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) state.formData.siteNotes[key] = el.value.trim();
    });
  }

  if (step === 3) {
    collectHoldupData();
  }

  // Step 4 materials auto-update via onChange handlers
  // Step 5 photos already handled
  // Step 6 report already in state
  // Step 7 signature handled separately
}

function collectHoldupData() {
  state.formData.holdups.reason = document.getElementById('holdup-reason')?.value.trim() || '';
  state.formData.holdups.responsible = document.getElementById('holdup-responsible')?.value.trim() || '';
  state.formData.holdups.delay = document.getElementById('holdup-delay')?.value.trim() || '';
  state.formData.holdups.notes = document.getElementById('holdup-notes')?.value.trim() || '';
}

// ============================================================
// STEP 2 — OBSERVATIONS
// ============================================================
function initObservations() {
  state.formData.observations = OBSERVATIONS.map(o => ({ ...o, status: 'N/A' }));
  renderObservations();
}

function renderObservations() {
  const container = document.getElementById('obs-grid');
  container.innerHTML = state.formData.observations.map((obs, i) => `
    <div class="obs-item" id="obs-item-${i}">
      <span class="obs-label">${escapeHtml(obs.label)}</span>
      <div class="obs-toggle">
        <button class="obs-btn ${obs.status === 'Pass' ? 'active-pass' : ''}" onclick="setObsStatus(${i}, 'Pass')">Pass</button>
        <button class="obs-btn ${obs.status === 'Fail' ? 'active-fail' : ''}" onclick="setObsStatus(${i}, 'Fail')">Fail</button>
        <button class="obs-btn ${obs.status === 'N/A' ? 'active-na' : ''}" onclick="setObsStatus(${i}, 'N/A')">N/A</button>
      </div>
    </div>
  `).join('');
}

function setObsStatus(index, status) {
  state.formData.observations[index].status = status;
  renderObservations();
  autoSave();
}

// ============================================================
// STEP 2 — SMART VOICE DICTATION
// ============================================================
let isRecording = false;

// Populate a single note section in state + DOM
function populateNoteSection(key, value) {
  if (!NOTE_TEXTAREA_IDS[key]) return;
  const el = document.getElementById(NOTE_TEXTAREA_IDS[key]);
  if (el) el.value = value;
  state.formData.siteNotes[key] = value;
  autoSave();
}

function initVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn    = document.getElementById('btn-voice');
  const status = document.getElementById('voice-status');

  if (!SpeechRecognition) {
    if (btn)    { btn.disabled = true; btn.style.opacity = '0.4'; btn.title = 'Voice not supported in this browser'; }
    if (status) { status.textContent = 'Voice not supported in this browser'; }
    document.querySelectorAll('.note-mic-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
    return;
  }

  // ── Big button: record → AI split ──────────────────────────────
  btn.addEventListener('click', () => {
    if (isRecording) return; // tap-to-stop handled inside startMainRecording
    startMainRecording();
  });

  // ── Small per-section mic buttons: record → append to section ──
  document.querySelectorAll('.note-mic-btn').forEach(micBtn => {
    micBtn.addEventListener('click', () => {
      if (micBtn.dataset.active) return;
      startSectionRecording(micBtn.dataset.section, micBtn);
    });
  });
}

function startMainRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec    = new SpeechRecognition();
  const btn    = document.getElementById('btn-voice');
  const status = document.getElementById('voice-status');
  rec.continuous     = false;
  rec.interimResults = true;
  rec.lang           = 'en-AU';

  isRecording = true;
  btn.classList.add('recording');
  btn.textContent = '⏹';
  status.textContent = 'Recording… tap to stop';
  status.classList.add('recording');

  btn.onclick = () => { rec.stop(); };

  let capturedTranscript = '';

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) capturedTranscript += t + ' ';
      else interim = t;
    }
    const display = (capturedTranscript + interim).trim();
    status.textContent = display ? `"${display.slice(0, 80)}${display.length > 80 ? '…' : ''}"` : 'Recording…';
  };

  rec.onend = async () => {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    btn.onclick = null;
    // re-bind the original click
    btn.addEventListener('click', startMainRecording, { once: true });

    const transcript = capturedTranscript.trim();
    if (!transcript) {
      status.textContent = 'Tap to dictate — Claude sorts it automatically';
      status.classList.remove('recording');
      return;
    }

    // Show transcript preview
    const preview = document.getElementById('transcript-preview');
    const previewText = document.getElementById('transcript-text');
    if (preview && previewText) {
      previewText.textContent = transcript;
      preview.classList.remove('hidden');
    }
    status.textContent = 'Sorting into sections…';

    try {
      const res = await authFetch('/api/parse-notes', { method: 'POST', body: { transcript } });
      if (res.ok) {
        const sections = await res.json();
        let filled = 0;
        Object.entries(sections).forEach(([key, value]) => {
          if (value && value.trim()) { populateNoteSection(key, value.trim()); filled++; }
        });
        toast(filled ? `Notes sorted into ${filled} section${filled > 1 ? 's' : ''}!` : 'Transcript added to General Notes.', 'success');
        if (!filled) populateNoteSection('generalNotes', transcript);
      } else {
        const err = await res.json().catch(() => ({}));
        // If API key missing, fall back gracefully
        populateNoteSection('generalNotes', (state.formData.siteNotes.generalNotes
          ? state.formData.siteNotes.generalNotes + '\n' : '') + transcript);
        toast(err.error || 'AI sorting unavailable — notes added to General.', 'info');
      }
    } catch (e) {
      populateNoteSection('generalNotes', (state.formData.siteNotes.generalNotes
        ? state.formData.siteNotes.generalNotes + '\n' : '') + transcript);
      toast('Notes added to General Notes (AI sorting unavailable).', 'info');
    }

    // Hide preview after 4 s
    setTimeout(() => { if (preview) preview.classList.add('hidden'); }, 4000);
    status.textContent = 'Tap to dictate — Claude sorts it automatically';
    status.classList.remove('recording');
  };

  rec.onerror = (event) => {
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    btn.onclick = null;
    status.classList.remove('recording');
    status.textContent = 'Tap to dictate — Claude sorts it automatically';
    if (event.error !== 'no-speech') toast(`Voice error: ${event.error}`, 'error');
  };

  rec.start();
}

function startSectionRecording(sectionKey, micBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous     = false;
  rec.interimResults = false;
  rec.lang           = 'en-AU';

  micBtn.dataset.active = '1';
  micBtn.classList.add('recording');
  micBtn.textContent = '⏹';

  rec.onresult = (event) => {
    const text = event.results[0][0].transcript.trim();
    if (text) {
      const existing = state.formData.siteNotes[sectionKey] || '';
      populateNoteSection(sectionKey, existing ? existing + ' ' + text : text);
    }
  };

  rec.onend = () => {
    delete micBtn.dataset.active;
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎤';
  };

  rec.onerror = () => {
    delete micBtn.dataset.active;
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎤';
  };

  rec.start();
}

// ============================================================
// STEP 3 — HOLDUPS (data handled via bindEvents toggles)
// ============================================================

// ============================================================
// STEP 4 — MATERIALS
// ============================================================
function addMaterialRow(prefilled = {}) {
  const id = 'm_' + Date.now() + Math.random();
  state.formData.materials.push({ id, name: prefilled.name || '', qty: prefilled.qty || '', unit: prefilled.unit || 'items', status: prefilled.status || 'needed' });
  renderMaterialsList();
}

function renderMaterialsList() {
  const container = document.getElementById('materials-list');
  if (!container) return;
  if (state.formData.materials.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:15px;padding:12px 0;">No materials added yet.</p>';
    return;
  }
  container.innerHTML = state.formData.materials.map((m, i) => `
    <div class="material-row" data-id="${m.id}">
      <input class="material-name-input" type="text" placeholder="Material name" value="${escapeHtml(m.name)}"
        oninput="updateMaterial('${m.id}','name',this.value)">
      <input class="material-qty-input" type="number" placeholder="Qty" value="${escapeHtml(String(m.qty))}" min="0"
        oninput="updateMaterial('${m.id}','qty',this.value)">
      <input class="material-unit-input" type="text" placeholder="Unit" value="${escapeHtml(m.unit)}"
        oninput="updateMaterial('${m.id}','unit',this.value)" list="unit-suggestions">
      <div class="material-status-toggle">
        <button class="material-status-btn ${m.status==='used'?'active-used':''}" onclick="setMaterialStatus('${m.id}','used')">Used</button>
        <button class="material-status-btn ${m.status==='needed'?'active-needed':''}" onclick="setMaterialStatus('${m.id}','needed')">Needed</button>
      </div>
      <button class="material-delete-btn" onclick="deleteMaterial('${m.id}')" title="Remove">✕</button>
    </div>
  `).join('');
}

function updateMaterial(id, field, value) {
  const m = state.formData.materials.find(m => m.id === id);
  if (m) { m[field] = value; autoSave(); }
}

function setMaterialStatus(id, status) {
  const m = state.formData.materials.find(m => m.id === id);
  if (m) { m.status = status; renderMaterialsList(); autoSave(); }
}

function deleteMaterial(id) {
  state.formData.materials = state.formData.materials.filter(m => m.id !== id);
  renderMaterialsList();
  autoSave();
}

// ============================================================
// STEP 4 — MATERIALS VOICE
// ============================================================
let materialsRecognition = null;
let materialsRecording = false;

function initMaterialsVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-materials-voice');
  const status = document.getElementById('materials-voice-status');
  if (!SpeechRecognition) {
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
    if (status) status.textContent = 'Voice not supported';
    return;
  }
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (materialsRecording) {
      materialsRecognition.stop();
      materialsRecording = false;
      btn.classList.remove('recording');
      btn.textContent = '🎤';
      if (status) { status.textContent = 'Tap to start dictating'; status.classList.remove('recording'); }
    } else {
      materialsRecognition = new SpeechRecognition();
      materialsRecognition.continuous = false;
      materialsRecognition.interimResults = false;
      materialsRecognition.lang = 'en-AU';
      materialsRecording = true;
      btn.classList.add('recording'); btn.textContent = '⏹';
      if (status) { status.textContent = 'Recording…'; status.classList.add('recording'); }
      materialsRecognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        if (status) status.textContent = `Parsing: "${text}"`;
        try {
          const res = await authFetch('/api/parse-material', { method: 'POST', body: { text } });
          const data = await res.json();
          if (data.name) {
            addMaterialRow(data);
            toast(`Added: ${data.qty} ${data.unit} of ${data.name}`, 'success');
          } else {
            toast('Could not parse — please add manually', 'info');
          }
        } catch(e) { toast('Parse error', 'error'); }
        materialsRecording = false;
        btn.classList.remove('recording'); btn.textContent = '🎤';
        if (status) { status.textContent = 'Tap to start dictating'; status.classList.remove('recording'); }
      };
      materialsRecognition.onerror = () => {
        materialsRecording = false;
        btn.classList.remove('recording'); btn.textContent = '🎤';
      };
      materialsRecognition.start();
    }
  });
}

// ============================================================
// STEP 5 — PHOTOS
// ============================================================
function initPhotoUpload() {
  const dropZone = document.getElementById('photo-drop-zone');
  const fileInput = document.getElementById('photo-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    fileInput.value = '';
  });
}

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  const remaining = 10 - state.formData.photos.length;

  if (remaining <= 0) {
    toast('Maximum 10 photos reached.', 'error');
    return;
  }

  const toProcess = imageFiles.slice(0, remaining);
  if (imageFiles.length > remaining) {
    toast(`Only ${remaining} more photo(s) can be added (max 10).`, 'info');
  }

  const captureTimestamp = new Date().toISOString();
  const batchId = captureTimestamp; // used to match GPS to photos from same batch

  // Start GPS request in the background — update photos when/if it resolves
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = {
          lat: pos.coords.latitude.toFixed(5),
          lng: pos.coords.longitude.toFixed(5),
        };
        // Attach GPS to any photo from this batch that still lacks it
        let updated = false;
        state.formData.photos.forEach(p => {
          if (p._batchId === batchId && !p.gps) { p.gps = gps; updated = true; }
        });
        if (updated) { renderPhotoGrid(); autoSave(); }
      },
      () => {} // silently ignore if denied or unavailable
    );
  }

  toProcess.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      state.formData.photos.push({
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dataUrl: e.target.result,
        caption: '',
        fileName: file.name,
        timestamp: captureTimestamp,
        gps: null,
        _batchId: batchId,
      });
      renderPhotoGrid();
      updatePhotoCount();
      autoSave();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  updatePhotoCount();

  if (state.formData.photos.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = state.formData.photos.map((photo, i) => `
    <div class="photo-item" data-photo-id="${photo.id}">
      <img src="${photo.dataUrl}" alt="Photo ${i + 1}">
      <button class="photo-delete-btn" onclick="deletePhoto(${i})" title="Delete photo">×</button>
      ${(photo.timestamp || photo.gps) ? `
      <div class="photo-meta">
        ${photo.timestamp ? `<span class="photo-timestamp">🕐 ${formatPhotoTime(photo.timestamp)}</span>` : ''}
        ${photo.gps ? `<a class="photo-gps" href="https://maps.google.com/?q=${photo.gps.lat},${photo.gps.lng}" target="_blank" rel="noopener" title="Open in Maps">📍 ${photo.gps.lat}, ${photo.gps.lng}</a>` : ''}
      </div>` : ''}
      <div class="photo-caption-wrap">
        <input
          class="photo-caption-input"
          type="text"
          placeholder="Add caption..."
          value="${escapeHtml(photo.caption)}"
          onchange="updateCaption(${i}, this.value)"
          oninput="updateCaption(${i}, this.value)"
        >
      </div>
      <div class="photo-ai-row">
        <button class="btn-photo-analyze" onclick="analyzePhoto('${photo.id}')" type="button">🤖 Analyse with AI</button>
        <div class="photo-ai-result hidden" id="photo-ai-${photo.id}"></div>
      </div>
    </div>
  `).join('');
}

function deletePhoto(index) {
  state.formData.photos.splice(index, 1);
  renderPhotoGrid();
  autoSave();
}

function updateCaption(index, value) {
  if (state.formData.photos[index]) {
    state.formData.photos[index].caption = value;
    autoSave();
  }
}

function updatePhotoCount() {
  const count = state.formData.photos.length;
  document.getElementById('photo-count').textContent =
    count === 0 ? 'No photos added' : `${count} photo${count !== 1 ? 's' : ''} (max 10)`;
}

// ============================================================
// STEP 6 — AI REPORT GENERATION
// ============================================================
async function generateReport() {
  collectCurrentStepData();

  const btn = document.getElementById('btn-generate');
  const generateSection = document.getElementById('generate-section');
  const loadingSection = document.getElementById('loading-section');
  const reportPreview = document.getElementById('report-preview');
  const reportContent = document.getElementById('report-content');

  btn.disabled = true;
  generateSection.style.display = 'none';
  loadingSection.classList.add('visible');
  reportPreview.classList.remove('visible');

  const payload = {
    jobDetails: state.formData.jobDetails,
    siteNotes: state.formData.siteNotes,
    observations: state.formData.observations,
    photos: state.formData.photos.map(p => ({ caption: p.caption || p.fileName || 'Untitled photo' })),
    holdups: state.formData.holdups,
    materials: state.formData.materials,
  };

  try {
    const response = await authFetch('/api/generate-audit', {
      method: 'POST',
      body: payload,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    // Handle SSE streaming
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReport = '';

    loadingSection.classList.remove('visible');
    reportPreview.classList.add('visible');
    reportContent.innerHTML = '<span class="cursor"></span>';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'delta') {
              fullReport += data.text;
              reportContent.innerHTML = markdownToHtml(fullReport) + '<span class="cursor"></span>';
              reportContent.scrollTop = reportContent.scrollHeight;
            } else if (data.type === 'done') {
              fullReport = data.report || fullReport;
              reportContent.innerHTML = markdownToHtml(fullReport);
              state.formData.report = fullReport;
              autoSave();
              toast('Report generated successfully!', 'success');
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (parseErr) {
            // Ignore malformed SSE lines
          }
        }
      }
    }

    if (fullReport && !state.formData.report) {
      state.formData.report = fullReport;
      reportContent.innerHTML = markdownToHtml(fullReport);
    }

  } catch (err) {
    loadingSection.classList.remove('visible');
    generateSection.style.display = 'block';
    btn.disabled = false;
    toast(`Failed to generate report: ${err.message}`, 'error');
  }
}

function regenerateReport() {
  state.formData.report = '';
  document.getElementById('generate-section').style.display = 'block';
  document.getElementById('report-preview').classList.remove('visible');
  document.getElementById('report-content').innerHTML = '';
  document.getElementById('btn-generate').disabled = false;
}

// ============================================================
// STEP 7 — SIGN OFF
// ============================================================
function populateSignOffSummary() {
  const jd = state.formData.jobDetails;
  const summary = document.getElementById('signoff-summary');
  summary.innerHTML = `
    <div class="signoff-row"><span class="signoff-label">Client:</span><span class="signoff-value">${escapeHtml(jd.clientName || '—')}</span></div>
    <div class="signoff-row"><span class="signoff-label">Address:</span><span class="signoff-value">${escapeHtml(jd.siteAddress || '—')}</span></div>
    <div class="signoff-row"><span class="signoff-label">Job Type:</span><span class="signoff-value">${escapeHtml(jd.jobType || '—')}</span></div>
    <div class="signoff-row"><span class="signoff-label">Date:</span><span class="signoff-value">${formatDate(jd.date) || '—'}</span></div>
    <div class="signoff-row"><span class="signoff-label">Tradesperson:</span><span class="signoff-value">${escapeHtml(jd.electricianName || '—')}</span></div>
    <div class="signoff-row"><span class="signoff-label">License #:</span><span class="signoff-value">${escapeHtml(jd.licenseNumber || '—')}</span></div>
  `;

  document.getElementById('sig-info').textContent =
    `${jd.electricianName || ''}${jd.licenseNumber ? ' — Lic: ' + jd.licenseNumber : ''} | ${formatDate(jd.date) || today()}`;
}

// Signature pad
let sigCanvas, sigCtx, sigDrawing = false, sigHasContent = false;

function initSignaturePad() {
  sigCanvas = document.getElementById('sig-canvas');
  sigCtx = sigCanvas.getContext('2d');

  function getPos(e) {
    const rect = sigCanvas.getBoundingClientRect();
    const scaleX = sigCanvas.width / rect.width;
    const scaleY = sigCanvas.height / rect.height;
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  }

  const startDrawing = (e) => {
    e.preventDefault();
    sigDrawing = true;
    const pos = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
    document.getElementById('sig-placeholder').style.display = 'none';
  };

  const draw = (e) => {
    if (!sigDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#0f172a';
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
    sigHasContent = true;
  };

  const stopDrawing = (e) => {
    sigDrawing = false;
    if (sigHasContent) {
      state.formData.signature = sigCanvas.toDataURL();
    }
  };

  sigCanvas.addEventListener('mousedown', startDrawing);
  sigCanvas.addEventListener('mousemove', draw);
  sigCanvas.addEventListener('mouseup', stopDrawing);
  sigCanvas.addEventListener('mouseleave', stopDrawing);

  sigCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  sigCanvas.addEventListener('touchmove', draw, { passive: false });
  sigCanvas.addEventListener('touchend', stopDrawing);

  resizeCanvas();
}

function resizeCanvas() {
  const rect = sigCanvas.getBoundingClientRect();
  sigCanvas.width = rect.width * window.devicePixelRatio || rect.width;
  sigCanvas.height = 160 * (window.devicePixelRatio || 1);
  sigCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
}

function clearSignature() {
  sigCtx && sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigHasContent = false;
  state.formData.signature = null;
  const ph = document.getElementById('sig-placeholder');
  if (ph) ph.style.display = 'block';
}

// ============================================================
// COMPLETE AUDIT
// ============================================================
async function completeAudit() {
  if (!sigHasContent) {
    toast('Please sign before completing the audit.', 'error');
    return;
  }

  state.formData.signature = sigCanvas.toDataURL();

  const btn = document.getElementById('btn-complete-audit');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const auditPayload = {
    jobDetails: state.formData.jobDetails,
    siteNotes: state.formData.siteNotes,
    observations: state.formData.observations,
    // Strip dataUrl to keep DB small; preserve GPS/timestamp metadata
    photos: state.formData.photos.map(p => ({
      caption: p.caption,
      fileName: p.fileName,
      timestamp: p.timestamp || null,
      gps: p.gps || null,
    })),
    holdups: state.formData.holdups,
    materials: state.formData.materials,
    report: state.formData.report,
    signature: state.formData.signature, // save signature dataUrl
    hasSignature: true,
    status: 'Signed',
  };

  try {
    const resp = await authFetch('/api/audits', {
      method: 'POST',
      body: auditPayload,
    });

    if (!resp.ok) throw new Error('Failed to save audit');

    const saved = await resp.json();
    state.audits.unshift(saved);
    renderAuditList();

    toast('Audit completed and saved!', 'success');
    clearDraft();

    setTimeout(() => {
      showView('dashboard');
    }, 1500);
  } catch (err) {
    toast(`Error saving: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Complete Audit';
  }
}

// ============================================================
// EMAIL MODAL
// ============================================================
function openEmailModal() {
  const jd = state.formData.jobDetails;
  const subject = `Site Audit Report - ${jd.clientName || 'Client'} - ${formatDate(jd.date) || today()}`;
  const message = `Dear ${jd.clientName || 'Client'},\n\nPlease find attached the site audit report for your property at ${jd.siteAddress || 'your site'}.\n\nThis audit was conducted on ${formatDate(jd.date) || today()} by ${jd.electricianName || 'our tradesperson'} (Licence: ${jd.licenseNumber || 'N/A'}).\n\nPlease do not hesitate to contact us if you have any questions regarding this report.\n\nKind regards,\n${jd.electricianName || 'AuditMate'}`;

  document.getElementById('email-to').value = '';
  document.getElementById('email-subject').value = subject;
  document.getElementById('email-message').value = message;

  document.getElementById('email-modal-overlay').classList.add('visible');
}

function closeEmailModal() {
  document.getElementById('email-modal-overlay').classList.remove('visible');
}

async function sendEmail() {
  const to      = document.getElementById('email-to').value.trim();
  const subject = document.getElementById('email-subject').value.trim();
  const message = document.getElementById('email-message').value.trim();

  if (!to)           { toast('Please enter a recipient email.', 'error'); return; }
  if (!to.includes('@')) { toast('Please enter a valid email address.', 'error'); return; }

  // Determine data source: wizard state vs. saved audit detail
  const overlay    = document.getElementById('email-modal-overlay');
  const emailMode  = overlay.dataset.emailMode;
  const sourceData = emailMode === 'audit-detail' ? currentAuditDetail : null;
  const report     = sourceData ? sourceData.report     : state.formData.report;
  const jobDetails = sourceData ? sourceData.jobDetails : state.formData.jobDetails;

  const btn = document.getElementById('btn-modal-send');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await authFetch('/api/email', {
      method: 'POST',
      body: { to, subject, message, report, jobDetails },
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.notConfigured) {
        toast('Email not configured — add SENDGRID_API_KEY to .env and restart the server.', 'error', 6000);
      } else {
        throw new Error(data.error || 'Failed to send email');
      }
      return;
    }
    closeEmailModal();
    toast(`Report sent to ${to}!`, 'success');
  } catch (err) {
    toast('Send failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Email';
    delete overlay.dataset.emailMode;
  }
}

// ============================================================
// DOWNLOAD PDF (server-side Puppeteer, with print fallback)
// ============================================================
async function downloadPDF(mode = 'wizard') {
  const sourceData = mode === 'audit-detail' ? currentAuditDetail : null;
  const report     = sourceData ? sourceData.report     : state.formData.report;
  const jobDetails = sourceData ? sourceData.jobDetails : state.formData.jobDetails;
  const materials  = sourceData ? sourceData.materials  : state.formData.materials;
  const observations = sourceData ? sourceData.observations : state.formData.observations;
  const signature  = sourceData ? (sourceData.signature || null) : state.formData.signature;

  if (!report) { toast('No report available to download.', 'error'); return; }

  const btnId = mode === 'audit-detail' ? 'btn-audit-pdf' : 'btn-download';
  const btn   = document.getElementById(btnId);
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  try {
    const res = await authFetch('/api/pdf', {
      method: 'POST',
      body: { report, jobDetails, materials, observations, signature },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'PDF generation failed');
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    const jd   = jobDetails || {};
    a.download = `AuditMate-${(jd.clientName || 'Report').replace(/[^a-zA-Z0-9]/g, '-')}-${jd.date || today()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('PDF downloaded!', 'success');
  } catch (err) {
    // Fallback to browser print dialog
    toast(`Server PDF unavailable — opening print dialog instead.`, 'info');
    printFallback(report, jobDetails);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

function printFallback(report, jobDetails) {
  const jd = jobDetails || {};
  const pw = window.open('', '_blank');
  if (!pw) { toast('Pop-up blocked — allow pop-ups to use print.', 'error'); return; }
  pw.document.write(`<!DOCTYPE html><html><head>
    <title>Site Audit — ${jd.clientName || 'Report'}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b}
      h1,h2,h3{color:#1e3a5f}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
      th{background:#f1f5f9}
      @media print{body{margin:0}}
    </style>
  </head><body>${markdownToHtml(report)}</body></html>`);
  pw.document.close();
  pw.onload = () => pw.print();
}

// ============================================================
// AUTOSAVE & DRAFT
// ============================================================
const DRAFT_KEY = 'auditmate_draft_v4';

function autoSave() {
  try {
    const draft = {
      ...state.formData,
      photos: state.formData.photos.map(p => ({ ...p, dataUrl: '' })),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    // Storage might be full — ignore
  }
}

function loadDraft() {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    const draft = JSON.parse(saved);

    if (draft.jobDetails) {
      const jd = draft.jobDetails;
      if (jd.clientName) document.getElementById('client-name').value = jd.clientName;
      if (jd.siteAddress) document.getElementById('site-address').value = jd.siteAddress;
      if (jd.jobType) document.getElementById('job-type').value = jd.jobType;
      if (jd.electricianName) document.getElementById('electrician-name').value = jd.electricianName;
      if (jd.licenseNumber) document.getElementById('license-number').value = jd.licenseNumber;
      if (jd.date) document.getElementById('job-date').value = jd.date;
      if (jd.referenceNumber) document.getElementById('reference-number').value = jd.referenceNumber;
      state.formData.jobDetails = jd;
    }

    if (draft.siteNotes) {
      if (typeof draft.siteNotes === 'object') {
        // v4 format: structured object
        state.formData.siteNotes = { ...EMPTY_SITE_NOTES(), ...draft.siteNotes };
        Object.entries(NOTE_TEXTAREA_IDS).forEach(([key, id]) => {
          const el = document.getElementById(id);
          if (el && draft.siteNotes[key]) el.value = draft.siteNotes[key];
        });
      } else if (typeof draft.siteNotes === 'string' && draft.siteNotes) {
        // v3 backward compat: single string → general notes
        state.formData.siteNotes.generalNotes = draft.siteNotes;
        const el = document.getElementById('note-general');
        if (el) el.value = draft.siteNotes;
      }
    }

    if (draft.observations && draft.observations.length) {
      state.formData.observations = draft.observations;
      renderObservations();
    }

    if (draft.holdups) {
      state.formData.holdups = draft.holdups;
      if (draft.holdups.hasHoldup) {
        document.querySelectorAll('#holdup-toggle .toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.value === 'yes'));
        const holdupDetails = document.getElementById('holdup-details');
        if (holdupDetails) holdupDetails.classList.remove('hidden');
        if (draft.holdups.reason) document.getElementById('holdup-reason') && (document.getElementById('holdup-reason').value = draft.holdups.reason);
        if (draft.holdups.responsible) document.getElementById('holdup-responsible') && (document.getElementById('holdup-responsible').value = draft.holdups.responsible);
        if (draft.holdups.delay) document.getElementById('holdup-delay') && (document.getElementById('holdup-delay').value = draft.holdups.delay);
        if (draft.holdups.notes) document.getElementById('holdup-notes') && (document.getElementById('holdup-notes').value = draft.holdups.notes);
      }
    }

    if (draft.materials && draft.materials.length) {
      state.formData.materials = draft.materials;
      renderMaterialsList();
    }

    if (draft.report) {
      state.formData.report = draft.report;
      document.getElementById('generate-section').style.display = 'none';
      document.getElementById('report-preview').classList.add('visible');
      document.getElementById('report-content').innerHTML = markdownToHtml(draft.report);
    }
  } catch (e) {
    // Ignore corrupt draft
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

// ============================================================
// MARKDOWN TO HTML (simple converter)
// ============================================================
function markdownToHtml(md) {
  if (!md) return '';

  let html = escapeHtml(md);

  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
    return `<pre style="background:#1e293b;padding:12px;border-radius:6px;overflow-x:auto"><code>${code}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code style="background:#1e293b;padding:2px 6px;border-radius:3px;font-size:0.9em">$1</code>');

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/^---+$/gm, '<hr>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #fbbf24;padding-left:12px;margin:8px 0;color:#94a3b8">$1</blockquote>');

  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, (match) => {
    if (!match.startsWith('<ul>')) return `<ul>${match}</ul>`;
    return match;
  });
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(Boolean);
    return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>[\s\S]+?<\/tr>)/g, '<table>$1</table>');
  html = html.replace(/<\/table>\s*<table>/g, '');

  html = html.replace(/\n\n+/g, '</p><p>');

  if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<table') && !html.startsWith('<pre')) {
    html = '<p>' + html + '</p>';
  }

  html = html.replace(/\n/g, '<br>');

  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)/g, '$1');
  html = html.replace(/(<hr>)<\/p>/g, '$1');

  return html;
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function formatPhotoTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-AU', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch (e) { return ts; }
}

// ============================================================
// OFFLINE MODE
// ============================================================
function initOfflineMode() {
  function update() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = navigator.onLine ? 'none' : 'flex';
  }
  window.addEventListener('offline', () => {
    update();
    toast('You\'re offline — AI features and sync are unavailable.', 'info');
  });
  window.addEventListener('online', () => {
    update();
    toast('Back online!', 'success');
  });
  update();
}

// ============================================================
// AI PHOTO ANALYSIS
// ============================================================
async function analyzePhoto(photoId) {
  const photo = state.formData.photos.find(p => String(p.id) === String(photoId));
  if (!photo) return;

  if (!photo.dataUrl) {
    toast('Photo data unavailable — re-add the photo to analyse it.', 'error');
    return;
  }

  const resultEl = document.getElementById(`photo-ai-${photoId}`);
  if (!resultEl) return;

  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="photo-ai-loading"><span class="spinner-sm"></span> Analysing…</div>';

  try {
    const res = await authFetch('/api/analyze-photo', {
      method: 'POST',
      body: { dataUrl: photo.dataUrl, caption: photo.caption || '' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      resultEl.innerHTML = `<div class="photo-ai-error">⚠ ${escapeHtml(err.error || 'Analysis failed')}</div>`;
      return;
    }

    const { observations } = await res.json();

    if (!observations || !observations.length) {
      resultEl.innerHTML = '<div class="photo-ai-empty">No specific observations identified in this photo.</div>';
      return;
    }

    // Store on photo object so acceptPhotoObs can read them
    photo._aiObs = observations;

    resultEl.innerHTML = `
      <div class="photo-ai-header">🤖 AI found ${observations.length} observation${observations.length > 1 ? 's' : ''} — tap to add:</div>
      ${observations.map((obs, j) => `
        <div class="photo-ai-obs-item" id="pobs-${photoId}-${j}">
          <span class="photo-ai-obs-text">${escapeHtml(obs)}</span>
          <button class="btn-obs-accept" type="button" onclick="acceptPhotoObs('${photoId}', ${j})">+ Add</button>
        </div>
      `).join('')}
    `;
  } catch (e) {
    resultEl.innerHTML = `<div class="photo-ai-error">⚠ ${escapeHtml(e.message)}</div>`;
  }
}

function acceptPhotoObs(photoId, obsIndex) {
  const photo = state.formData.photos.find(p => String(p.id) === String(photoId));
  if (!photo || !photo._aiObs) return;
  const obs = photo._aiObs[obsIndex];
  if (!obs) return;

  // Append to General Notes with source attribution
  const existing = state.formData.siteNotes.generalNotes || '';
  const note = `[AI photo obs] ${obs}`;
  populateNoteSection('generalNotes', existing ? existing + '\n' + note : note);

  // Mark item as accepted
  const item = document.getElementById(`pobs-${photoId}-${obsIndex}`);
  if (item) {
    item.classList.add('accepted');
    const acceptBtn = item.querySelector('.btn-obs-accept');
    if (acceptBtn) { acceptBtn.textContent = '✓ Added'; acceptBtn.disabled = true; }
  }
  toast('Observation added to General Notes.', 'success');
}
