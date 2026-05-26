require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const { authenticateToken, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper: check if API key is usable
function apiKeyReady() {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!(key && key !== 'your_key_here' && key.length > 20);
}

// ============================================================
// AUTH ROUTES (unauthenticated)
// ============================================================
app.use('/api/auth', require('./routes/auth'));

// ============================================================
// PROTECTED ROUTES
// ============================================================
app.use('/api/audits',    authenticateToken, require('./routes/audits'));
app.use('/api/templates', authenticateToken, require('./routes/templates'));
app.use('/api/team',      authenticateToken, requireAdmin, require('./routes/team'));
app.use('/api/email',     authenticateToken, require('./routes/email'));
app.use('/api/pdf',       authenticateToken, require('./routes/pdf'));

// ============================================================
// GET /api/health — public, for diagnostics
// ============================================================
app.get('/api/health', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const ready = apiKeyReady();
  res.json({
    status: 'ok',
    anthropicApiKey: ready
      ? `configured (${key.slice(0, 12)}…)`
      : key
        ? `placeholder value set — please replace "your_key_here" in .env`
        : 'not set — add ANTHROPIC_API_KEY to .env',
    apiKeyConfigured: ready,
    timestamp: new Date().toISOString(),
    node: process.version,
  });
});

// ============================================================
// POST /api/analyze-photo — protected, Claude vision
// ============================================================
app.post('/api/analyze-photo', authenticateToken, async (req, res) => {
  const { dataUrl, caption } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl is required' });

  if (!apiKeyReady()) {
    return res.status(500).json({
      error: 'Anthropic API key not configured. Please add a valid ANTHROPIC_API_KEY to your .env file and restart the server.',
    });
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: 'Invalid image data URL' });

  const [, mediaType, base64Data] = match;
  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!supported.includes(mediaType)) {
    return res.status(400).json({ error: `Unsupported image type: ${mediaType}. Use JPEG, PNG, GIF, or WebP.` });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          {
            type: 'text',
            text: `You are a professional site safety auditor reviewing a photo taken during a site audit.${caption ? ` Photo caption: "${caption}".` : ''} List 1–5 concise, specific observations relevant to trade safety and compliance.

Return ONLY a JSON array of observation strings — no markdown, no explanation:
["specific observation 1", "specific observation 2"]

Good examples: "Exposed cabling visible near switchboard", "No visible RCD protection on portable equipment", "Work area unsecured — no barrier or signage present", "PPE not being worn in active work area".`,
          },
        ],
      }],
    });

    const raw = message.content[0]?.text || '[]';
    let observations = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      observations = m ? JSON.parse(m[0]) : [];
    } catch { observations = []; }

    res.json({ observations: observations.filter(o => typeof o === 'string').slice(0, 5) });
  } catch (error) {
    console.error('Photo analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyse photo' });
  }
});

// ============================================================
// POST /api/parse-material — protected
// ============================================================
app.post('/api/parse-material', authenticateToken, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  if (!apiKeyReady()) {
    return res.status(500).json({
      error: 'Anthropic API key not configured. Please add a valid ANTHROPIC_API_KEY to your .env file and restart the server.',
    });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      system: 'Parse a spoken material entry into JSON. Return ONLY valid JSON with keys: name (string), qty (number), unit (string, default "items"), status ("used" or "needed", default "needed"). If you cannot parse it, return {"error": "Could not parse"}',
      messages: [{ role: 'user', content: text }],
    });

    const raw = message.content[0]?.text || '{}';
    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { error: 'Could not parse' };
    } catch {
      parsed = { error: 'Could not parse' };
    }
    res.json(parsed);
  } catch (error) {
    console.error('Parse material error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse material' });
  }
});

// ============================================================
// POST /api/parse-notes — protected, smart note categorisation
// ============================================================
app.post('/api/parse-notes', authenticateToken, async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });

  if (!apiKeyReady()) {
    return res.status(500).json({
      error: 'Anthropic API key not configured. Please add a valid ANTHROPIC_API_KEY to your .env file and restart the server.',
    });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: `You are a site audit assistant for tradespeople. Analyse a spoken transcript and categorise the content into the appropriate sections of a site audit report.

Return ONLY a valid JSON object with these exact keys (include all keys, use empty string "" if nothing was mentioned for that category):
{
  "worksCompleted": "what was actually done on site today",
  "hazards": "any safety issues or hazards spotted",
  "issues": "anything that went wrong or needs attention",
  "holdups": "delays and their reasons",
  "materialsUsed": "materials consumed today",
  "materialsNeeded": "materials still to be ordered",
  "nextSteps": "what needs to happen on the next visit",
  "generalNotes": "anything that does not fit the above categories"
}

Return ONLY the JSON object — no explanation, no markdown fences, just the raw JSON.`,
      messages: [{
        role: 'user',
        content: `Categorise this site audit transcript into the appropriate sections:\n\n"${transcript}"`,
      }],
    });

    const raw = message.content[0]?.text || '{}';
    let parsed = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      parsed = {};
    }

    // Ensure all keys are present
    const result = {
      worksCompleted:  parsed.worksCompleted  || '',
      hazards:         parsed.hazards         || '',
      issues:          parsed.issues          || '',
      holdups:         parsed.holdups         || '',
      materialsUsed:   parsed.materialsUsed   || '',
      materialsNeeded: parsed.materialsNeeded || '',
      nextSteps:       parsed.nextSteps       || '',
      generalNotes:    parsed.generalNotes    || '',
    };

    res.json(result);
  } catch (error) {
    console.error('Parse notes error:', error);
    res.status(500).json({ error: error.message || 'Failed to categorise notes' });
  }
});

// ============================================================
// POST /api/generate-audit — protected, streaming SSE
// ============================================================
app.post('/api/generate-audit', authenticateToken, async (req, res) => {
  if (!apiKeyReady()) {
    return res.status(500).json({
      error: 'Anthropic API key not configured. Please add a valid ANTHROPIC_API_KEY to your .env file and restart the server.',
    });
  }

  const { jobDetails, siteNotes, observations, photos, holdups, materials } = req.body;

  if (!jobDetails) {
    return res.status(400).json({ error: 'jobDetails is required' });
  }

  // Build observations list (guard against missing/malformed)
  const observationsList = Array.isArray(observations) && observations.length
    ? observations.map(obs => `- ${obs.label}: ${obs.status}`).join('\n')
    : 'No observations recorded.';

  const photosList = Array.isArray(photos) && photos.length
    ? photos.map((p, i) => `${i + 1}. ${p.caption || 'No caption provided'}`).join('\n')
    : 'No photos provided.';

  const holdupSection = holdups?.hasHoldup
    ? `Yes — Reason: ${holdups.reason || 'Not specified'}. Responsible: ${holdups.responsible || 'N/A'}. Estimated delay: ${holdups.delay || 'N/A'}. Formally reported: ${holdups.formallyReported ? 'Yes' : 'No'}. Notes: ${holdups.notes || 'None'}`
    : 'No holdups reported.';

  const materialsSection = Array.isArray(materials) && materials.length
    ? materials.map(m => `- ${m.name}: ${m.qty} ${m.unit} (${m.status})`).join('\n')
    : 'No materials logged.';

  // Handle both old string format and new structured object format
  let notesSection;
  if (!siteNotes) {
    notesSection = 'No site notes provided.';
  } else if (typeof siteNotes === 'string') {
    notesSection = siteNotes || 'No site notes provided.';
  } else {
    const parts = [
      siteNotes.worksCompleted  && `**Works Completed Today:**\n${siteNotes.worksCompleted}`,
      siteNotes.hazards         && `**Hazards Identified:**\n${siteNotes.hazards}`,
      siteNotes.issues          && `**Issues and Problems:**\n${siteNotes.issues}`,
      siteNotes.holdups         && `**Holdups:**\n${siteNotes.holdups}`,
      siteNotes.materialsUsed   && `**Materials Used:**\n${siteNotes.materialsUsed}`,
      siteNotes.materialsNeeded && `**Materials Needed:**\n${siteNotes.materialsNeeded}`,
      siteNotes.nextSteps       && `**Next Steps:**\n${siteNotes.nextSteps}`,
      siteNotes.generalNotes    && `**General Notes:**\n${siteNotes.generalNotes}`,
    ].filter(Boolean);
    notesSection = parts.length ? parts.join('\n\n') : 'No site notes provided.';
  }

  const userPrompt = `Generate a professional site audit report with the following details:

## JOB DETAILS
- Client Name: ${jobDetails.clientName || 'N/A'}
- Site Address: ${jobDetails.siteAddress || 'N/A'}
- Job Type: ${jobDetails.jobType || 'N/A'}
- Tradesperson: ${jobDetails.electricianName || 'N/A'}
- License Number: ${jobDetails.licenseNumber || 'N/A'}
- Date: ${jobDetails.date || 'N/A'}
- Reference/Job Number: ${jobDetails.referenceNumber || 'N/A'}

## SITE NOTES
${notesSection}

## OBSERVATIONS CHECKLIST
${observationsList}

## HOLDUPS
${holdupSection}

## MATERIALS
${materialsSection}

## PHOTOGRAPHIC EVIDENCE
${photosList}

Please generate a complete, formal audit report in markdown format. The report must include:
1. Header with all job details
2. Executive Summary (2–3 paragraphs)
3. Site Observations (detailed findings based on the checklist)
4. Works Completed (what was done on site)
5. Holdups section (summarise any delays or blockers)
6. Materials table (Used/Needed columns listing all materials)
7. Hazards & Safety (safety issues and actions taken)
8. Photographic Evidence section (reference all photo captions)
9. Compliance Assessment (overall compliance status)
10. Recommendations (specific action items based on findings)
11. Next Steps
12. Conclusion

Use professional trade industry language. Format with proper markdown headings, bullet points, and tables where appropriate.`;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullReport = '';

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: 'You are a professional audit report writer with extensive knowledge of trade safety standards, compliance requirements, and industry best practices. Generate formal, professional audit reports for tradespeople that are clear, detailed, and actionable.',
      messages: [{ role: 'user', content: userPrompt }],
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullReport += text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
      } else if (event.type === 'message_stop') {
        res.write(`data: ${JSON.stringify({ type: 'done', report: fullReport })}\n\n`);
      }
    }

    res.end();
  } catch (error) {
    console.error('Claude API error:', error);
    const errMsg = error.status === 401
      ? 'Invalid Anthropic API key — please check your ANTHROPIC_API_KEY in .env'
      : error.status === 429
      ? 'Anthropic rate limit reached — please wait a moment and try again'
      : error.message || 'Failed to generate report';

    if (!res.headersSent) {
      res.status(500).json({ error: errMsg });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
      res.end();
    }
  }
});

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AuditMate server running at http://localhost:${PORT}`);
  if (!apiKeyReady()) {
    console.warn('⚠️  ANTHROPIC_API_KEY is not configured — AI features will be unavailable.');
    console.warn('   Add your key to .env and restart the server.');
  }
});
