const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');

// GET /api/audits
router.get('/', (req, res) => {
  try {
    const audits = db.read('audits');
    const companyAudits = audits
      .filter(a => a.companyId === req.user.companyId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(companyAudits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audits.' });
  }
});

// POST /api/audits
router.post('/', (req, res) => {
  try {
    const audits = db.read('audits');
    const audit = {
      id: uuidv4(),
      companyId: req.user.companyId,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      ...req.body,
    };
    audits.unshift(audit);
    db.write('audits', audits);
    res.status(201).json(audit);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create audit.' });
  }
});

// GET /api/audits/:id
router.get('/:id', (req, res) => {
  try {
    const audits = db.read('audits');
    const audit = audits.find(a => a.id === req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });
    if (audit.companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit.' });
  }
});

// PUT /api/audits/:id
router.put('/:id', (req, res) => {
  try {
    const audits = db.read('audits');
    const idx = audits.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Audit not found.' });
    if (audits[idx].companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    audits[idx] = { ...audits[idx], ...req.body, id: audits[idx].id, companyId: audits[idx].companyId, createdBy: audits[idx].createdBy, createdAt: audits[idx].createdAt };
    db.write('audits', audits);
    res.json(audits[idx]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update audit.' });
  }
});

// DELETE /api/audits/:id
router.delete('/:id', (req, res) => {
  try {
    const audits = db.read('audits');
    const idx = audits.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Audit not found.' });
    const audit = audits[idx];
    if (audit.companyId !== req.user.companyId) return res.status(403).json({ error: 'Forbidden.' });
    if (req.user.role !== 'admin' && audit.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own audits.' });
    }
    audits.splice(idx, 1);
    db.write('audits', audits);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete audit.' });
  }
});

module.exports = router;
