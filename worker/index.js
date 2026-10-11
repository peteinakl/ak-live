// worker/index.js — Production API proxy for the shared demo.
// Static files are served by Workers static assets; this only handles /api/*.
//
// Every viewer shares one Durable Object per feed, so upstream calls are fixed
// by the TTL and daily budget regardless of how many people have the page open.
//   /api/at/vehiclelocations      → AT GTFS-RT (subscription key)
//   /api/traffic/{z}/{x}/{y}.png  → TomTom flow tiles, Auckland only

import { DurableObject } from 'cloudflare:workers';
import { isAllowedTrafficTile, budgetDay, isFresh } from './limits.js';

// Upstream URLs are fixed server-side; client query strings are ignored so the
// endpoints cannot be used as an open proxy for the keys. There is no flights
// feed: OpenSky, adsb.lol and adsb.fi all refuse requests from Cloudflare's
// network, so the shared demo builds with FLIGHTS: false.
const FEEDS = {
  at: {
    url: 'https://api.at.govt.nz/realtime/legacy/vehiclelocations',
    ttl: 'AT_TTL_S', budget: 'AT_DAILY_BUDGET',
  },
};

const ROUTES = {
  '/api/at/vehiclelocations': 'at',
};

// 1×1 transparent PNG, served once the tile budget is spent.
const EMPTY_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
), c => c.charCodeAt(0));

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function stub(env, name) {
  return env.FEED_CACHE.get(env.FEED_CACHE.idFromName(name));
}

export class FeedCache extends DurableObject {
  last = null;        // { status, body, contentType, fetchedAt } — last good response
  attemptedAt = 0;    // last upstream attempt, success or not
  failure = { status: 503, error: 'Feed unavailable' };  // shown until first success
  inflight = null;

  async getFeed(name) {
    // Single flight: concurrent viewers share one upstream request.
    if (this.inflight) return this.inflight;
    if (isFresh(this.attemptedAt, Number(this.env[FEEDS[name].ttl]))) return this.serve('HIT');
    this.inflight = this.refresh(name).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async takeTile() {
    return this.take('tiles', Number(this.env.TILE_DAILY_BUDGET));
  }

  serve(cache, failure) {
    if (failure) this.failure = failure;
    if (this.last) return { ...this.last, cache };
    return {
      status: this.failure.status, contentType: 'application/json', fetchedAt: 0, cache,
      body: JSON.stringify({ error: this.failure.error }),
    };
  }

  async refresh(name) {
    const feed = FEEDS[name];
    // Failed attempts also wait out the TTL, so an upstream outage cannot
    // turn viewer traffic into a retry storm against the quota.
    this.attemptedAt = Date.now();
    if (!(await this.take(name, Number(this.env[feed.budget])))) {
      console.log(`[feed] ${name} daily budget reached`);
      return this.serve('BUDGET', { status: 503, error: 'Daily data budget reached — back tomorrow' });
    }
    try {
      const headers = { Accept: 'application/json', 'User-Agent': 'ak-live-worker/1.0' };
      if (name === 'at') headers['Ocp-Apim-Subscription-Key'] = this.env.AT_API_KEY;
      const res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(12_000) });
      const body = await res.text();
      console.log(`[feed] ${name} upstream ${res.status}`);
      if (!res.ok) return this.serve('ERROR', { status: 502, error: `Upstream ${res.status}` });
      this.last = {
        status: 200, body, fetchedAt: Date.now(),
        contentType: res.headers.get('content-type') || 'application/json',
      };
      return this.serve('MISS');
    } catch (err) {
      console.error(`[feed] ${name} upstream error:`, err.message);
      return this.serve('ERROR', { status: 502, error: 'Upstream request failed' });
    }
  }

  // Counts upstream calls per UTC day in durable storage; false once spent.
  async take(key, limit) {
    const day = budgetDay();
    const storageKey = `${key}:${day}`;
    const used = (await this.ctx.storage.get(storageKey)) ?? 0;
    if (used >= limit) return false;
    await this.ctx.storage.put(storageKey, used + 1);
    if (used === 0) {
      const old = [...(await this.ctx.storage.list({ prefix: `${key}:` })).keys()].filter(k => k !== storageKey);
      if (old.length) await this.ctx.storage.delete(old);
    }
    return true;
  }
}

async function handleFeed(env, name) {
  const result = await stub(env, name).getFeed(name);
  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'no-store',
      'X-Feed-Cache': result.cache,
      'X-Feed-Age': result.fetchedAt ? String(Math.round((Date.now() - result.fetchedAt) / 1000)) : '',
    },
  });
}

async function handleTraffic(env, path) {
  const match = path.match(/^\/api\/traffic\/(\d+)\/(\d+)\/(\d+)\.png$/);
  const [z, x, y] = match ? match.slice(1).map(Number) : [];
  if (!match || !isAllowedTrafficTile(z, x, y)) return json(404, { error: 'Tile outside demo area' });

  const empty = () => new Response(EMPTY_PNG, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600' },
  });
  if (!(await stub(env, 'tiles').takeTile())) return empty();

  const upstream = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${env.TOMTOM_API_KEY}&tileSize=256`;
  const res = await fetch(upstream, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) return empty();
  return new Response(res.body, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=180' },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json(405, { error: 'GET only' });
    if (ROUTES[pathname]) return handleFeed(env, ROUTES[pathname]);
    if (pathname.startsWith('/api/traffic/')) return handleTraffic(env, pathname);
    return json(404, { error: 'Unknown API route' });
  },
};
