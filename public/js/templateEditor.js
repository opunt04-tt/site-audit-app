'use strict';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const FIELD_TYPES = [
  { value: 'text',         label: 'Text Input' },
  { value: 'yes_no',       label: 'Yes / No' },
  { value: 'pass_fail_na', label: 'Pass / Fail / N/A' },
  { value: 'number',       label: 'Number' },
  { value: 'dropdown',     label: 'Dropdown' },
  { value: 'date',         label: 'Date' },
  { value: 'textarea',     label: 'Notes' },
];

let editorTemplate = null;
let editorDirty = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initTemplateEditor(templateId) {
  editorTemplate = null;
  editorDirty = false;

  if (templateId) {
    try {
      const res = await authFetch(`/api/templates/${templateId}`);
      if (!res.ok) throw new Error('Not found');
      editorTemplate = await res.json();
    } catch (e) {
      toast('Failed to load template', 'error');
      return;
    }
  } else {
    editorTemplate = { id: null, name: 'New Template', isDefault: false, sections: [] };
  }

  document.getElementById('template-name-input').value = editorTemplate.name || '';
  document.getElementById('template-is-default').checked = !!editorTemplate.isDefault;
  renderEditorSections();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderEditorSections() {
  const container = document.getElementById('editor-sections');
  if (!container) return;
  container.innerHTML = '';

  const sections = (editorTemplate?.sections || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  sections.forEach(section => container.appendChild(buildSectionEl(section)));
  initDragDrop();
}

function buildSectionEl(section) {
  const isSpecial = ['holdups', 'materials_list', 'photos', 'signoff'].includes(section.type);
  const div = document.createElement('div');
  div.className = 'editor-section';
  div.dataset.sectionId = section.id;
  div.draggable = true;

  const bodyHtml = isSpecial
    ? `<div class="built-in-note">This section is handled automatically by the wizard.</div>`
    : `<div class="editor-field-list" id="fields-${section.id}">
         ${(section.fields || [])
           .slice()
           .sort((a, b) => (a.order || 0) - (b.order || 0))
           .map(f => buildFieldRowHtml(section.id, f))
           .join('')}
       </div>
       <div class="add-field-row">
         <button class="add-field-btn" onclick="addField('${section.id}')">+ Add Field</button>
       </div>`;

  div.innerHTML = `
    <div class="editor-section-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <input class="editor-section-name" type="text"
        value="${escapeHtml(section.name)}"
        ${isSpecial ? 'readonly' : ''}
        oninput="updateSectionName('${section.id}', this.value)"
        placeholder="Section name…">
      ${isSpecial ? '<span class="built-in-badge">built-in</span>' : ''}
      <button class="section-delete-btn" onclick="deleteSection('${section.id}')" title="Delete section">✕</button>
    </div>
    ${bodyHtml}
  `;
  return div;
}

function buildFieldRowHtml(sectionId, field) {
  const typeOptions = FIELD_TYPES
    .map(ft => `<option value="${ft.value}"${field.type === ft.value ? ' selected' : ''}>${ft.label}</option>`)
    .join('');

  return `
    <div class="editor-field-row" draggable="true" data-field-id="${field.id}">
      <span class="drag-handle-field" title="Drag to reorder">⠿</span>
      <input class="field-name-input" type="text"
        value="${escapeHtml(field.name)}"
        oninput="updateField('${sectionId}','${field.id}','name',this.value)"
        placeholder="Field name…">
      <select class="field-type-select"
        onchange="updateField('${sectionId}','${field.id}','type',this.value)">
        ${typeOptions}
      </select>
      <label class="field-required-toggle" title="Mark as required">
        <input type="checkbox"
          ${field.required ? 'checked' : ''}
          onchange="updateField('${sectionId}','${field.id}','required',this.checked)"> Req
      </label>
      <button class="btn btn-ghost btn-sm" style="color:var(--error);flex-shrink:0"
        onclick="deleteField('${sectionId}','${field.id}')" title="Delete field">✕</button>
    </div>
  `;
}

// ─── Section ops ──────────────────────────────────────────────────────────────
function addSection() {
  if (!editorTemplate) { toast('Template not loaded yet.', 'error'); return; }
  if (!editorTemplate.sections) editorTemplate.sections = [];

  const id = 'sec_' + Date.now();
  editorTemplate.sections.push({
    id,
    name: 'New Section',
    order: editorTemplate.sections.length,
    fields: [],
  });
  editorDirty = true;
  renderEditorSections();

  // Auto-focus the new section's name input for instant rename
  setTimeout(() => {
    const input = document.querySelector(`[data-section-id="${id}"] .editor-section-name`);
    if (input) { input.focus(); input.select(); }
  }, 40);
}

function deleteSection(sectionId) {
  if (!editorTemplate) return;
  if (!confirm('Delete this section and all its fields?')) return;
  editorTemplate.sections = editorTemplate.sections.filter(s => s.id !== sectionId);
  editorTemplate.sections.forEach((s, i) => { s.order = i; });
  editorDirty = true;
  renderEditorSections();
}

function updateSectionName(sectionId, name) {
  if (!editorTemplate) return;
  const s = editorTemplate.sections.find(s => s.id === sectionId);
  if (s) { s.name = name; editorDirty = true; }
}

// ─── Field ops ────────────────────────────────────────────────────────────────
function addField(sectionId) {
  if (!editorTemplate) return;
  const s = editorTemplate.sections.find(s => s.id === sectionId);
  if (!s) return;
  if (!s.fields) s.fields = [];

  const field = {
    id: 'fld_' + Date.now(),
    name: 'New Field',
    type: 'text',
    required: false,
    order: s.fields.length,
  };
  s.fields.push(field);
  editorDirty = true;
  renderEditorSections();

  // Auto-focus the new field name
  setTimeout(() => {
    const input = document.querySelector(`[data-field-id="${field.id}"] .field-name-input`);
    if (input) { input.focus(); input.select(); }
  }, 40);
}

function deleteField(sectionId, fieldId) {
  if (!editorTemplate) return;
  const s = editorTemplate.sections.find(s => s.id === sectionId);
  if (!s) return;
  s.fields = s.fields.filter(f => f.id !== fieldId);
  s.fields.forEach((f, i) => { f.order = i; });
  editorDirty = true;
  renderEditorSections();
}

function updateField(sectionId, fieldId, key, value) {
  if (!editorTemplate) return;
  const s = editorTemplate.sections.find(s => s.id === sectionId);
  if (!s) return;
  const f = s.fields.find(f => f.id === fieldId);
  if (f) { f[key] = value; editorDirty = true; }
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────
function initDragDrop() {
  const container = document.getElementById('editor-sections');
  if (!container) return;

  // ── Section DnD ──
  let sectionDragSrc = null;

  container.querySelectorAll('.editor-section').forEach(el => {
    el.addEventListener('dragstart', e => {
      // Only start a section drag from the header handle, not a field row
      if (e.target.closest('.editor-field-row')) return;
      sectionDragSrc = el;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      sectionDragSrc = null;
    });
    el.addEventListener('dragover', e => {
      if (!sectionDragSrc) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', e => {
      if (!sectionDragSrc || sectionDragSrc === el) return;
      e.preventDefault();
      e.stopPropagation();
      const els = [...container.querySelectorAll(':scope > .editor-section')];
      const srcIdx = els.indexOf(sectionDragSrc);
      const dstIdx = els.indexOf(el);
      if (srcIdx < dstIdx) container.insertBefore(sectionDragSrc, el.nextSibling);
      else container.insertBefore(sectionDragSrc, el);
      // Sync order into state
      [...container.querySelectorAll(':scope > .editor-section')].forEach((el, i) => {
        const sec = editorTemplate.sections.find(s => s.id === el.dataset.sectionId);
        if (sec) sec.order = i;
      });
      editorDirty = true;
    });
  });

  // ── Field DnD (per section) ──
  container.querySelectorAll('.editor-field-list').forEach(fieldList => {
    const sectionId = fieldList.id.replace('fields-', '');
    let fieldDragSrc = null;

    fieldList.querySelectorAll('.editor-field-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        e.stopPropagation(); // prevent triggering section drag
        fieldDragSrc = row;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        fieldDragSrc = null;
      });
      row.addEventListener('dragover', e => {
        if (!fieldDragSrc) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', e => {
        if (!fieldDragSrc || fieldDragSrc === row) return;
        e.preventDefault();
        e.stopPropagation();
        const rows = [...fieldList.querySelectorAll('.editor-field-row')];
        const srcIdx = rows.indexOf(fieldDragSrc);
        const dstIdx = rows.indexOf(row);
        if (srcIdx < dstIdx) fieldList.insertBefore(fieldDragSrc, row.nextSibling);
        else fieldList.insertBefore(fieldDragSrc, row);
        // Sync order into state
        [...fieldList.querySelectorAll('.editor-field-row')].forEach((el, i) => {
          const sec = editorTemplate.sections.find(s => s.id === sectionId);
          if (sec) {
            const f = sec.fields.find(f => f.id === el.dataset.fieldId);
            if (f) f.order = i;
          }
        });
        editorDirty = true;
      });
    });
  });
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveTemplate() {
  if (!editorTemplate) { toast('Nothing to save.', 'error'); return; }

  editorTemplate.name = (document.getElementById('template-name-input').value || '').trim() || 'Untitled Template';
  editorTemplate.isDefault = document.getElementById('template-is-default').checked;

  const btn = document.getElementById('btn-save-template');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const isNew = !editorTemplate.id;
    const url    = isNew ? '/api/templates' : `/api/templates/${editorTemplate.id}`;
    const method = isNew ? 'POST' : 'PUT';

    const res = await authFetch(url, { method, body: editorTemplate });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'Save failed', 'error');
      return;
    }

    const saved = await res.json();
    editorTemplate = saved;
    editorDirty = false;

    // Honour "set as default" flag
    if (editorTemplate.isDefault) {
      await authFetch(`/api/templates/${editorTemplate.id}/set-default`, { method: 'PUT' });
    }

    toast('Template saved!', 'success');

    // Navigate back to admin → Templates tab
    setTimeout(() => {
      showView('admin');
      if (typeof switchAdminTab === 'function') switchAdminTab('templates');
      if (typeof loadTemplateListAdmin === 'function') loadTemplateListAdmin();
      if (typeof loadAdminStats === 'function') loadAdminStats();
    }, 600);

  } catch (e) {
    toast('Network error — please try again', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Template';
  }
}
