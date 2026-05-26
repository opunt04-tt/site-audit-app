/* ============================================================
   AuditMate — PDF route (Puppeteer)
   Mounted at: POST /api/pdf  (protected by authenticateToken in server.js)
   ============================================================ */
'use strict';

const router = require('express').Router();

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { puppeteer = null; }

// POST /api/pdf
router.post('/', async (req, res) => {
  if (!puppeteer) {
    return res.status(500).json({ error: 'PDF generation unavailable — puppeteer not installed.' });
  }

  const { report, jobDetails, materials, observations, signature } = req.body;
  if (!report) return res.status(400).json({ error: 'report is required' });

  const html = buildPdfHtml({ report, jobDetails, materials, observations, signature });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '22mm', left: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center;font-family:Arial,sans-serif;padding:0 14mm;">
        AuditMate — Professional Site Audit — <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
    });

    const jd = jobDetails || {};
    const filename = `AuditMate-${(jd.clientName || 'Report').replace(/[^a-zA-Z0-9]/g, '-')}-${jd.date || new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    console.error('Puppeteer PDF error:', err);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// ── HTML builder ─────────────────────────────────────────────
function buildPdfHtml({ report, jobDetails, materials, observations, signature }) {
  const jd = jobDetails || {};

  const obsRows = Array.isArray(observations) && observations.length
    ? observations.map(o => {
        const colour = o.status === 'Pass' ? '#16a34a' : o.status === 'Fail' ? '#dc2626' : '#64748b';
        return `<tr><td>${esc(o.label || '')}</td><td style="text-align:center;font-weight:700;color:${colour}">${esc(o.status || 'N/A')}</td></tr>`;
      }).join('')
    : '<tr><td colspan="2" style="color:#94a3b8">No observations recorded</td></tr>';

  const matRows = Array.isArray(materials) && materials.length
    ? materials.map(m => `<tr><td>${esc(m.name||'')}</td><td>${esc(String(m.qty||''))} ${esc(m.unit||'')}</td><td>${esc(m.status||'')}</td></tr>`).join('')
    : '<tr><td colspan="3" style="color:#94a3b8">No materials logged</td></tr>';

  const sigHtml = signature
    ? `<img src="${signature}" style="max-width:220px;max-height:90px;border:1px solid #e2e8f0;border-radius:6px;display:block;margin-top:6px;">`
    : '<em style="color:#94a3b8;font-size:11px">No signature captured</em>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1e293b;line-height:1.55;background:#fff}
  .hdr{background:#1e3a5f;color:#fff;padding:18px 22px 16px;margin-bottom:18px}
  .hdr h1{font-size:18px;margin-bottom:3px}
  .hdr p{font-size:10px;opacity:.85}
  .summary-box{display:grid;grid-template-columns:1fr 1fr;gap:7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:18px}
  .sr{display:flex;gap:8px;align-items:baseline}
  .sl{font-weight:700;color:#64748b;text-transform:uppercase;font-size:9px;letter-spacing:.5px;min-width:80px;flex-shrink:0}
  .sv{color:#1e293b;font-size:11px}
  h1{font-size:15px;color:#1e3a5f;margin:14px 0 6px}
  h2{font-size:13px;color:#1e3a5f;border-bottom:1.5px solid #e2e8f0;padding-bottom:4px;margin:16px 0 7px}
  h3{font-size:12px;color:#334155;margin:12px 0 4px}
  p{margin-bottom:8px}
  ul{margin:4px 0 8px 18px}
  li{margin-bottom:2px}
  strong{font-weight:700}
  em{font-style:italic}
  hr{border:none;border-top:1px solid #e2e8f0;margin:10px 0}
  blockquote{border-left:3px solid #2563eb;padding-left:10px;color:#475569;margin:8px 0}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:10.5px}
  th{background:#1e3a5f;color:#fff;padding:6px 9px;text-align:left;font-size:10px}
  td{border:1px solid #e2e8f0;padding:5px 9px}
  tr:nth-child(even) td{background:#f8fafc}
  .section{margin-top:18px;page-break-inside:avoid}
  .sig-area{margin-top:22px;padding-top:14px;border-top:1px solid #e2e8f0;page-break-inside:avoid}
</style>
</head>
<body>

<div class="hdr">
  <h1>📋 AuditMate — Site Audit Report</h1>
  <p>Generated ${new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'long',year:'numeric'})}</p>
</div>

<div class="summary-box">
  <div class="sr"><span class="sl">Client</span><span class="sv">${esc(jd.clientName||'—')}</span></div>
  <div class="sr"><span class="sl">Address</span><span class="sv">${esc(jd.siteAddress||'—')}</span></div>
  <div class="sr"><span class="sl">Job Type</span><span class="sv">${esc(jd.jobType||'—')}</span></div>
  <div class="sr"><span class="sl">Date</span><span class="sv">${esc(jd.date||'—')}</span></div>
  <div class="sr"><span class="sl">Tradesperson</span><span class="sv">${esc(jd.electricianName||'—')}</span></div>
  <div class="sr"><span class="sl">Licence</span><span class="sv">${esc(jd.licenseNumber||'—')}</span></div>
  ${jd.referenceNumber ? `<div class="sr"><span class="sl">Reference</span><span class="sv">${esc(jd.referenceNumber)}</span></div>` : ''}
</div>

${mdToHtml(report)}

${Array.isArray(observations) && observations.length ? `
<div class="section">
  <h2>Observations Summary</h2>
  <table><thead><tr><th>Item</th><th style="width:80px;text-align:center">Status</th></tr></thead>
  <tbody>${obsRows}</tbody></table>
</div>` : ''}

${Array.isArray(materials) && materials.length ? `
<div class="section">
  <h2>Materials Log</h2>
  <table><thead><tr><th>Material</th><th>Quantity</th><th>Status</th></tr></thead>
  <tbody>${matRows}</tbody></table>
</div>` : ''}

<div class="sig-area">
  <h3>Tradesperson Signature</h3>
  ${sigHtml}
  <p style="margin-top:8px;color:#475569;font-size:10px">${esc(jd.electricianName||'')}${jd.licenseNumber ? ' — Lic: ' + esc(jd.licenseNumber) : ''}</p>
</div>

</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mdToHtml(md) {
  if (!md) return '';
  let h = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,  '<h1>$1</h1>')
    .replace(/---+/g,'<hr>')
    .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^[\*\-] (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g,'<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g,'')
    .replace(/\|(.+)\|/g, m => '<tr>' + m.split('|').filter(Boolean).map(c=>`<td>${c.trim()}</td>`).join('') + '</tr>')
    .replace(/(<tr>[\s\S]+?<\/tr>)/g,'<table>$1</table>')
    .replace(/<\/table>\s*<table>/g,'')
    .replace(/\n\n+/g,'</p><p>')
    .replace(/\n/g,'<br>');
  if (!h.startsWith('<h') && !h.startsWith('<ul') && !h.startsWith('<table') && !h.startsWith('<hr')) h = '<p>' + h + '</p>';
  return h;
}

module.exports = router;
