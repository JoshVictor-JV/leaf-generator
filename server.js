const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

// ─── CALL GROQ ────────────────────────────────────────────────────
async function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      reject(new Error('GROQ_API_KEY is not set. Please add it in your Railway environment variables.'));
      return;
    }

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8000,
      temperature: 0.85,
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'Groq API error'));
            return;
          }
          const text = parsed.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse Groq response'));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Network error: ' + err.message)));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

// ─── BUILD PROMPT ─────────────────────────────────────────────────
function buildPrompt(data) {
  const { idea, tone, numVideos, scriptStyle } = data;
  const n = Math.min(parseInt(numVideos) || 1, 10);
  const scriptCount = Math.min(n * 3, 9);

  return `You are an expert viral content strategist trained in the Hook Point methodology from Brendan Kane's book "Hook Point". You create content for LEAF — a motivational brand covering Leadership, Excellence, Accountability, and Faith.

CONTENT IDEA: ${idea}
TONE: ${tone}
SCRIPT STYLE: ${scriptStyle}
NUMBER OF VIDEOS: ${n}

---

## SECTION 1 — HOOK GENERATOR

Generate exactly 5 hooks using Hook Point principles (scroll-stopping, broad appeal, curiosity gap, emotional tension, pattern interrupt).

One of each type:
1. [CONTRARIAN HOOK] — challenges a widely-held belief
2. [CURIOSITY HOOK] — opens a loop that must be closed
3. [WARNING/FEAR HOOK] — creates urgency or warns of danger
4. [RELATABLE HOOK] — mirrors the viewer's exact pain
5. [AUTHORITY HOOK] — leads with a surprising fact or truth

After each hook include:
HOOK STRENGTH: X/10
REASON: (one sentence)

---

## SECTION 2 — HOOK TESTING LAB

Generate exactly 50 hook variations for: "${idea}"
Number each 1–50. Each one distinct. Vary lengths, emotions, angles.

---

## SECTION 3 — SHORT FORM VIDEO SCRIPTS

Generate exactly ${scriptCount} scripts for 30–45 second videos.

Each script:
**SCRIPT #X — [TITLE]**
🎬 HOOK (0–3 sec): [opening line]
🧲 CURIOSITY BUILDER (3–10 sec): [tension or problem]
💡 MAIN INSIGHT (10–30 sec): [core idea]
🥊 PUNCHLINE (30–40 sec): [lesson]
📣 CTA (40–45 sec): [engagement prompt]

Style: ${scriptStyle}. Natural, direct-to-camera. LEAF philosophy throughout.

---

## SECTION 4 — SKIT MODE
${scriptStyle === 'Skit' ? `
Generate 2 skit scripts. Characters: PRESENT SELF vs FUTURE SELF.
6–8 exchanges showing conflict and lesson from: "${idea}"

**SKIT #1**
PRESENT SELF: ...
FUTURE SELF: ...
` : `[SKIT MODE NOT SELECTED — ${scriptStyle} style chosen]`}

---

## SECTION 5 — CAPTION GENERATOR

Generate ${scriptCount} TikTok-style captions.
Rules: Each line 5–10 words max. 5–8 lines. End with question or CTA. Add 5 hashtags.

**CAPTION #X**
[line]
[line]
#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5

---

## SECTION 6 — VISUAL HOOK IDEAS

For each of the 5 hooks in Section 1:
**[HOOK TYPE] — Visual Idea:**
[what to do physically on camera in first 1–2 seconds]
[why it interrupts the scroll]

---

## SECTION 7 — BATCH SUMMARY

Total hooks: ${n * 5} | Scripts: ${scriptCount} | Captions: ${scriptCount}

Top 3 hooks to test first (by strength score):
1.
2.
3.

Recommended ${n}-video posting schedule:
[day by day]

---

Be specific, natural, and powerful. Use exact section headers above.`;
}

// ─── HTTP SERVER ──────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (!data.idea || !data.idea.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Content idea is required' }));
          return;
        }
        console.log(`[LEAF] Generating for: "${data.idea}"`);
        const result = await callGroq(buildPrompt(data));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (err) {
        console.error('[LEAF Error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n🌿 LEAF Generator running on port ${PORT}`);
  if (!GROQ_API_KEY) console.warn('   ⚠️  GROQ_API_KEY not set — add it in Railway environment variables\n');
});
