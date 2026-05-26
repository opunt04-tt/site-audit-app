'use strict';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function initAdminPanel() {
  const adminUserName = document.getElementById('admin-user-name');
  if (adminUserName) adminUserName.textContent = window.currentUser?.name || '';
  await Promise.all([loadAdminStats(), loadTeamList(), loadTemplateListAdmin()]);
}

async function loadAdminStats() {
  try {
    const [auditsRes, teamRes, templatesRes] = await Promise.all([
      authFetch('/api/audits'),
      authFetch('/api/team'),
      authFetch('/api/templates'),
    ]);
    const audits = await auditsRes.json();
    const team = await teamRes.json();
    const templates = await templatesRes.json();
    document.getElementById('stat-total-audits').textContent = Array.isArray(audits) ? audits.length : 0;
    document.getElementById('stat-team-size').textContent = Array.isArray(team) ? team.length : 0;
    document.getElementById('stat-templates').textContent = Array.isArray(templates) ? templates.length : 0;
  } catch(e) { console.error(e); }
}

async function loadTeamList() {
  try {
    const res = await authFetch('/api/team');
    if (!res.ok) return;
    const members = await res.json();
    const container = document.getElementById('team-list');
    if (!container) return;
    container.innerHTML = members.map(m => `
      <div class="team-card">
        <div class="team-avatar">${(m.name || 'U')[0].toUpperCase()}</div>
        <div class="team-info">
          <div class="team-name">${escapeHtml(m.name)}</div>
          <div class="team-email">${escapeHtml(m.email)}</div>
        </div>
        <span class="role-badge ${m.role}">${m.role === 'admin' ? 'Admin' : 'Field Worker'}</span>
        ${m.id !== window.currentUser?.id ? `<button class="btn btn-ghost btn-sm" onclick="removeTeamMember('${m.id}')">Remove</button>` : '<span class="team-you-badge">You</span>'}
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

async function removeTeamMember(userId) {
  if (!confirm('Remove this team member?')) return;
  try {
    const res = await authFetch(`/api/team/${userId}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); toast(d.error || 'Error', 'error'); return; }
    toast('Member removed.', 'success');
    loadTeamList();
    loadAdminStats();
  } catch(e) { toast('Network error', 'error'); }
}

async function loadTemplateListAdmin() {
  try {
    const res = await authFetch('/api/templates');
    if (!res.ok) return;
    const templates = await res.json();
    const container = document.getElementById('template-list');
    if (!container) return;
    container.innerHTML = templates.map(t => `
      <div class="template-card">
        <div class="template-info">
          <div class="template-name">${escapeHtml(t.name)}</div>
          <div class="template-meta">${t.sections?.length || 0} sections</div>
        </div>
        ${t.isDefault ? '<span class="template-default-badge">Default</span>' : `<button class="btn btn-ghost btn-sm" onclick="setDefaultTemplate('${t.id}')">Set Default</button>`}
        <button class="btn btn-secondary btn-sm" onclick="openTemplateEditor('${t.id}')">Edit</button>
        ${templates.length > 1 && !t.isDefault ? `<button class="btn btn-ghost btn-sm" onclick="deleteTemplate('${t.id}')">Delete</button>` : ''}
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

async function setDefaultTemplate(id) {
  try {
    const res = await authFetch(`/api/templates/${id}/set-default`, { method: 'PUT' });
    if (!res.ok) return;
    toast('Default template updated.', 'success');
    loadTemplateListAdmin();
  } catch(e) {}
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  try {
    const res = await authFetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); toast(d.error || 'Error', 'error'); return; }
    toast('Template deleted.', 'success');
    loadTemplateListAdmin();
    loadAdminStats();
  } catch(e) {}
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tabPanel === tabName));
}

// Invite modal (simple prompt approach)
async function inviteMember() {
  const name = prompt('Team member name:');
  if (!name) return;
  const email = prompt('Their email address:');
  if (!email) return;
  const tempPassword = prompt('Set a temporary password (min 8 chars):');
  if (!tempPassword || tempPassword.length < 8) { toast('Password must be at least 8 chars.', 'error'); return; }
  try {
    const res = await authFetch('/api/team/invite', { method: 'POST', body: { name, email, tempPassword } });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Error', 'error'); return; }
    toast(`${name} added to your team!`, 'success');
    loadTeamList();
    loadAdminStats();
  } catch(e) { toast('Network error', 'error'); }
}

function openTemplateEditor(templateId) {
  window._editingTemplateId = templateId || null;
  showView('template-editor');
  initTemplateEditor(templateId);
}
