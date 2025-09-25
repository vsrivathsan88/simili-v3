import dotenv from 'dotenv';
import http from 'http';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const PORT = process.env.PORT || 3001;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendNoContent(res, status = 204) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

async function handleTokenRequest(req, res) {
  if (req.method === 'OPTIONS') {
    return sendNoContent(res, 204);
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log('[DEBUG] GEMINI_API_KEY exists:', !!apiKey);
  console.log('[DEBUG] All env keys:', Object.keys(process.env).filter(k => k.includes('GEMINI')));
  if (!apiKey) {
    return sendJson(res, 500, { error: 'Server misconfigured: missing GEMINI_API_KEY' });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    console.log('[DEBUG] GoogleGenAI instance created, tokens available:', !!ai.tokens);
    
    if (!ai.tokens || typeof ai.tokens.create !== 'function') {
      console.log('[WARN] Tokens API not available, falling back to direct API key (not recommended for production)');
      // Fallback: return the API key directly (not ephemeral, but gets us moving)
      const expireTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      return sendJson(res, 200, {
        token: apiKey,
        expireTime: expireTime,
        fallback: true
      });
    }

    const expireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const uses = 1;
    const token = await ai.tokens.create({ expireTime, uses });

    // Return only the token name (used as apiKey on the client) and expiry
    return sendJson(res, 200, {
      token: token?.name,
      expireTime: token?.expireTime || expireTime,
    });
  } catch (err) {
    console.error('Failed to create ephemeral token', err);
    return sendJson(res, 500, { error: 'Failed to create token' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/token') {
      return handleTokenRequest(req, res);
    }
    if (req.method === 'OPTIONS') {
      return sendNoContent(res, 204);
    }
    sendJson(res, 404, { error: 'Not Found' });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});


