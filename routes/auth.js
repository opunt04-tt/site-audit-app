const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');
const { createDefaultTemplate } = require('../lib/defaultTemplate');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { companyName, adminName, email, password } = req.body;
    if (!companyName || !adminName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = db.read('users');
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const companies = db.read('companies');
    const company = { id: uuidv4(), name: companyName, createdAt: new Date().toISOString() };
    companies.push(company);
    db.write('companies', companies);

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name: adminName,
      email: email.toLowerCase(),
      passwordHash,
      companyId: company.id,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    db.write('users', users);

    // Create default template
    const templates = db.read('templates');
    const template = createDefaultTemplate(company.id);
    templates.push(template);
    db.write('templates', templates);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, companyId: user.companyId, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ token, user: safeUser, company });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = db.read('users');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const companies = db.read('companies');
    const company = companies.find(c => c.id === user.companyId);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, companyId: user.companyId, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { passwordHash: _, resetCode: __, resetExpiry: ___, ...safeUser } = user;
    res.json({ token, user: safeUser, company });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const users = db.read('users');
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      // Don't reveal whether account exists
      return res.json({ message: 'If that email exists, a reset code has been sent.' });
    }

    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const resetExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    users[idx].resetCode = resetCode;
    users[idx].resetExpiry = resetExpiry;
    db.write('users', users);

    res.json({ message: 'Reset code generated.', resetCode }); // dev mode — include code
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = db.read('users');
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return res.status(400).json({ error: 'Invalid reset request.' });

    const user = users[idx];
    if (!user.resetCode || user.resetCode !== resetCode) {
      return res.status(400).json({ error: 'Invalid or expired reset code.' });
    }
    if (!user.resetExpiry || new Date(user.resetExpiry) < new Date()) {
      return res.status(400).json({ error: 'Reset code has expired.' });
    }

    users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
    delete users[idx].resetCode;
    delete users[idx].resetExpiry;
    db.write('users', users);

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const users = db.read('users');
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const companies = db.read('companies');
    const company = companies.find(c => c.id === user.companyId);

    const { passwordHash, resetCode, resetExpiry, ...safeUser } = user;
    res.json({ user: safeUser, company });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;
