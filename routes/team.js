const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');

// GET /api/team
router.get('/', (req, res) => {
  try {
    const users = db.read('users');
    const members = users
      .filter(u => u.companyId === req.user.companyId)
      .map(({ passwordHash, resetCode, resetExpiry, ...u }) => u);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team.' });
  }
});

// POST /api/team/invite
router.post('/invite', async (req, res) => {
  try {
    const { name, email, tempPassword } = req.body;
    if (!name || !email || !tempPassword) {
      return res.status(400).json({ error: 'Name, email, and temporary password are required.' });
    }
    if (tempPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = db.read('users');
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const newUser = {
      id: uuidv4(),
      name,
      email: email.toLowerCase(),
      passwordHash,
      companyId: req.user.companyId,
      role: 'field_worker',
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    db.write('users', users);

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json(safeUser);
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to invite member.' });
  }
});

// DELETE /api/team/:userId
router.delete('/:userId', (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself.' });
    }
    const users = db.read('users');
    const idx = users.findIndex(u => u.id === req.params.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found.' });
    if (users[idx].companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    users.splice(idx, 1);
    db.write('users', users);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member.' });
  }
});

// PUT /api/team/:userId/role
router.put('/:userId/role', (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }
    const users = db.read('users');
    const idx = users.findIndex(u => u.id === req.params.userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found.' });
    if (users[idx].companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    users[idx].role = users[idx].role === 'admin' ? 'field_worker' : 'admin';
    db.write('users', users);
    const { passwordHash, resetCode, resetExpiry, ...safeUser } = users[idx];
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

module.exports = router;
