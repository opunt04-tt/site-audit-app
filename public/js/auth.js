'use strict';
const JWT_KEY = 'auditmate_jwt';

// Minimal showView — will be overridden by app.js when it loads
function showView(name) {
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === name));
}

// Token helpers
function getToken() { return localStorage.getItem(JWT_KEY); }
function setToken(t) { localStorage.setItem(JWT_KEY, t); }
function clearToken() { localStorage.removeItem(JWT_KEY); }

function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

function isTokenValid() {
  const t = getToken();
  if (!t) return false;
  const p = decodeToken(t);
  return p && (p.exp * 1000) > Date.now();
}

async function authFetch(url, opts = {}) {
  const token = getToken();
  opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch(url, opts);
  if (res.status === 401) { clearToken(); showView('login'); throw new Error('Session expired'); }
  return res;
}

// Call on app start
async function initAuth() {
  if (!isTokenValid()) { showView('login'); return; }
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) { clearToken(); showView('login'); return; }
    const data = await res.json();
    window.currentUser = data.user;
    window.currentCompany = data.company;
    document.getElementById('user-name').textContent = data.user.name;
    const adminUserName = document.getElementById('admin-user-name');
    if (adminUserName) adminUserName.textContent = data.user.name;
    const electricianName = document.getElementById('electrician-name');
    if (electricianName) electricianName.value = data.user.name;
    // Show admin button in dashboard header if admin
    const adminBtn = document.getElementById('btn-to-admin');
    if (adminBtn) adminBtn.style.display = data.user.role === 'admin' ? 'inline-flex' : 'none';
    loadAuditsFromServer();
    showView('dashboard');
  } catch (e) { showView('login'); }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) { toast('Please enter email and password.', 'error'); return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, password}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Login failed', 'error'); return; }
    setToken(data.token);
    window.currentUser = data.user;
    window.currentCompany = data.company;
    document.getElementById('user-name').textContent = data.user.name;
    const adminUserName = document.getElementById('admin-user-name');
    if (adminUserName) adminUserName.textContent = data.user.name;
    const electricianName = document.getElementById('electrician-name');
    if (electricianName) electricianName.value = data.user.name;
    const adminBtn = document.getElementById('btn-to-admin');
    if (adminBtn) adminBtn.style.display = data.user.role === 'admin' ? 'inline-flex' : 'none';
    loadAuditsFromServer();
    showView('dashboard');
    toast(`Welcome back, ${data.user.name}!`, 'success');
  } catch(err) { toast('Network error — try again', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const companyName = document.getElementById('signup-company').value.trim();
  const adminName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const confirm = document.getElementById('signup-confirm').value.trim();
  if (!companyName || !adminName || !email || !password) { toast('Please fill in all fields.', 'error'); return; }
  if (password.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
  if (password !== confirm) { toast('Passwords do not match.', 'error'); return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({companyName, adminName, email, password}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Registration failed', 'error'); return; }
    setToken(data.token);
    window.currentUser = data.user;
    window.currentCompany = data.company;
    document.getElementById('user-name').textContent = data.user.name;
    const adminBtn = document.getElementById('btn-to-admin');
    if (adminBtn) adminBtn.style.display = 'inline-flex';
    const electricianName = document.getElementById('electrician-name');
    if (electricianName) electricianName.value = data.user.name;
    loadAuditsFromServer();
    showView('dashboard');
    toast(`Welcome to AuditMate, ${data.user.name}!`, 'success');
  } catch(err) { toast('Network error — try again', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Create Account'; }
}

async function handleForgotSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { toast('Please enter your email.', 'error'); return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Error', 'error'); return; }
    // Show reset code in dev
    document.getElementById('reset-code-display').textContent = data.resetCode || '------';
    document.getElementById('forgot-success').classList.remove('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    // Pre-fill email on reset form
    document.getElementById('reset-email').value = email;
  } catch(err) { toast('Network error', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Send Reset Code'; }
}

async function handleResetSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const resetCode = document.getElementById('reset-code-input').value.trim();
  const newPassword = document.getElementById('reset-password').value.trim();
  const confirm = document.getElementById('reset-confirm').value.trim();
  if (newPassword.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
  if (newPassword !== confirm) { toast('Passwords do not match.', 'error'); return; }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Resetting…';
  try {
    const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, resetCode, newPassword}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Reset failed', 'error'); return; }
    toast('Password reset! Please log in.', 'success');
    showView('login');
  } catch(err) { toast('Network error', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Reset Password'; }
}

function logout() {
  clearToken();
  window.currentUser = null;
  window.currentCompany = null;
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  showView('login');
}
