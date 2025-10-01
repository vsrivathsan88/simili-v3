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
  if (!apiKey) {
    console.error('[ERROR] GEMINI_API_KEY not found in environment variables');
    return sendJson(res, 500, { error: 'Server misconfigured: missing GEMINI_API_KEY' });
  }

  console.log('[INFO] Token request received, API key present:', !!apiKey);

  try {
    // Initialize GoogleGenAI with v1alpha API version for Live API support
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    // Check if ephemeral tokens API is available (correct property: authTokens)
    if (!ai.authTokens || typeof ai.authTokens.create !== 'function') {
      console.log('[WARN] Ephemeral tokens API not available in @google/genai package');
      console.log('[INFO] Using direct API key as fallback (suitable for development)');
      
      // Fallback: return the API key directly with expiry metadata
      const expireTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      return sendJson(res, 200, {
        token: apiKey,
        expireTime: expireTime,
        fallback: true,
        message: 'Using direct API key - consider updating @google/genai for ephemeral token support'
      });
    }

    // Create ephemeral token with correct format per docs
    console.log('[INFO] Creating ephemeral token (correct API format)...');
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
    const newSessionExpireTime = new Date(Date.now() + (10 * 60 * 1000)).toISOString(); // 10 minutes
    
    const token = await ai.authTokens.create({
      config: {
        uses: 10,  // FIXED: Allow multiple uses for reconnections (was 1)
        expireTime: expireTime,
        newSessionExpireTime: newSessionExpireTime,
        httpOptions: { apiVersion: 'v1alpha' }
      }
    });
    
    if (!token || !token.name) {
      throw new Error('Token creation returned empty response');
    }

    console.log('[SUCCESS] Ephemeral token created successfully');
    
    return sendJson(res, 200, {
      token: token.name,
      expireTime: token.expireTime || expireTime,
      ephemeral: true
    });
  } catch (err) {
    console.error('[ERROR] Token creation failed:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    
    // Fallback to API key on error
    console.log('[FALLBACK] Returning direct API key due to error');
    const expireTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return sendJson(res, 200, {
      token: process.env.GEMINI_API_KEY,
      expireTime: expireTime,
      fallback: true,
      error: err.message
    });
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
  console.log(`[server] Gemini ephemeral token endpoint: /token`);
});


