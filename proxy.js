// proxy.js — Local dev only. No npm deps. Run with: node proxy.js
// Proxies /at/* → api.at.govt.nz (injects AT API key)
//         /opensky/* → opensky-network.org (OAuth2 client credentials)

import http from 'http';
import https from 'https';

const { CONFIG } = await import('./config.local.js');

const PORT = 3001;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

// --- OpenSky OAuth2 token cache ---
let openskyToken = null;
let openskyTokenExpiry = 0;

async function getOpenSkyToken() {
  if (openskyToken && Date.now() < openskyTokenExpiry - 30_000) {
    return openskyToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONFIG.OPENSKY_CLIENT_ID,
    client_secret: CONFIG.OPENSKY_CLIENT_SECRET,
  }).toString();

  const tokenData = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'auth.opensky-network.org',
      path: '/auth/realms/opensky-network/protocol/openid-connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Token request failed: ${res.statusCode} ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Token response not JSON')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  openskyToken = tokenData.access_token;
  openskyTokenExpiry = Date.now() + (tokenData.expires_in * 1000);
  console.log(`[proxy] OpenSky token acquired, expires in ${tokenData.expires_in}s`);
  return openskyToken;
}

// --- Generic upstream proxy ---
function proxyRequest(res, targetUrl, extraHeaders = {}) {
  const parsed = new URL(targetUrl);
  const options = {
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ak-live-local-proxy/1.0',
      ...extraHeaders,
    },
  };

  const upstream = https.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, {
      ...CORS_HEADERS,
      'Content-Type': upstreamRes.headers['content-type'] || 'application/json',
    });
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    console.error('[proxy] upstream error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, CORS_HEADERS);
    }
    res.end(JSON.stringify({ error: 'Upstream request failed', detail: err.message }));
  });

  upstream.end();
}

// --- HTTP server ---
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  let parsed;
  try {
    parsed = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400, CORS_HEADERS);
    res.end(JSON.stringify({ error: 'Bad request URL' }));
    return;
  }

  const { pathname, search } = parsed;

  // AT transport API
  if (pathname.startsWith('/at/')) {
    const upstreamPath = pathname.slice('/at'.length); // e.g. /vehiclelocations
    const upstream = `https://api.at.govt.nz/realtime/legacy${upstreamPath}${search || ''}`;
    console.log(`[proxy] AT → ${upstream}`);
    proxyRequest(res, upstream, {
      'Ocp-Apim-Subscription-Key': CONFIG.AT_API_KEY,
    });
    return;
  }

  // OpenSky ADS-B API (OAuth2)
  if (pathname.startsWith('/opensky/')) {
    const upstreamPath = pathname.slice('/opensky'.length); // e.g. /states/all
    const upstream = `https://opensky-network.org/api${upstreamPath}${search || ''}`;
    console.log(`[proxy] OpenSky → ${upstream}`);
    try {
      const token = await getOpenSkyToken();
      proxyRequest(res, upstream, {
        'Authorization': `Bearer ${token}`,
      });
    } catch (err) {
      console.error('[proxy] OpenSky auth error:', err.message);
      res.writeHead(503, CORS_HEADERS);
      res.end(JSON.stringify({ error: 'OpenSky auth failed', detail: err.message }));
    }
    return;
  }

  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Unknown proxy route', path: pathname }));

}).listen(PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PORT}`);
  console.log('[proxy] Routes:');
  console.log(`  /at/*      → https://api.at.govt.nz/realtime/legacy/*`);
  console.log(`  /opensky/* → https://opensky-network.org/api/* (OAuth2)`);
});
