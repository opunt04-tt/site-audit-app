const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/templates
router.get('/', (req, res) => {
  try {
    const templates = db.read('templates');
    res.json(templates.filter(t => t.companyId === req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates.' });
  }
});

// GET /api/templates/:id
router.get('/:id', (req, res) => {
  try {
    const templates = db.read('templates');
    const template = templates.find(t => t.id === req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    if (template.companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template.' });
  }
});

// POST /api/templates — admin only
router.post('/', requireAdmin, (req, res) => {
  try {
    const templates = db.read('templates');
    const template = {
      id: uuidv4(),
      companyId: req.user.companyId,
      createdAt: new Date().toISOString(),
      ...req.body,
    };
    // Force companyId
    template.companyId = req.user.companyId;
    templates.push(template);
    db.write('templates', templates);
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template.' });
  }
});

// PUT /api/templates/:id — admin only
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const templates = db.read('templates');
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Template not found.' });
    if (templates[idx].companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    templates[idx] = { ...templates[idx], ...req.body, id: templates[idx].id, companyId: templates[idx].companyId };
    db.write('templates', templates);
    res.json(templates[idx]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template.' });
  }
});

// DELETE /api/templates/:id — admin only
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const templates = db.read('templates');
    const companyTemplates = templates.filter(t => t.companyId === req.user.companyId);
    if (companyTemplates.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only template.' });
    }
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Template not found.' });
    if (templates[idx].companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    templates.splice(idx, 1);
    db.write('templates', templates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template.' });
  }
});

// PUT /api/templates/:id/set-default — admin only
router.put('/:id/set-default', requireAdmin, (req, res) => {
  try {
    const templates = db.read('templates');
    const target = templates.find(t => t.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Template not found.' });
    if (target.companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    templates.forEach(t => {
      if (t.companyId === req.user.companyId) t.isDefault = t.id === req.params.id;
    });
    db.write('templates', templates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set default template.' });
  }
});

module.exports = router;
