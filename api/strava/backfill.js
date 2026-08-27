// POST /api/strava/backfill — body { accessToken, expiresAt, refreshToken, after }.
// One-time history import at connect: pages through the athlete's activities (summaries
// only, so it's fast + light) over the chosen window, returns runs/walks. Capped at 10
// pages (2000 activities) as a runaway guard — far beyond a personal history.
import { creds, refreshIfNeeded, stravaGet, readJsonBody, sameOrigin } from './_strava.js';
import { mapStravaActivities } from '../../strava.js';

const MAX_PAGES = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
  if (!sameOrigin(req)) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'forbidden' })); return; }
  const body = readJsonBody(req);
  const { clientId, clientSecret } = creds();
  try {
    const tokens = await refreshIfNeeded(
      { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: body.expiresAt },
      clientId, clientSecret);
    const after = Number(body.after) > 0 ? Math.floor(Number(body.after)) : 0;
    const all = [];
    let truncated = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ per_page: '200', page: String(page) });
      if (after) params.set('after', String(after));
      const batch = await stravaGet(`/athlete/activities?${params.toString()}`, tokens.accessToken);
      all.push(...batch);
      if (batch.length < 200) break;
      if (page === MAX_PAGES) truncated = true;
    }
    const mapped = mapStravaActivities(all);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ...mapped, tokens, truncated }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = e.status === 401 ? 401 : 502;
    res.end(JSON.stringify({ error: e.status === 401 ? 'reconnect' : 'upstream_error' }));
  }
}
