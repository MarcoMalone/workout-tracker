// POST /api/strava/sync — body { accessToken, expiresAt, refreshToken, after }.
// Refreshes the token if needed, lists recent activities, filters to runs/walks, and
// returns them plus the (possibly rotated) token set for the app to persist.
import { creds, refreshIfNeeded, stravaGet, readJsonBody, sameOrigin } from './_strava.js';
import { mapStravaActivities } from '../../strava.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
  if (!sameOrigin(req)) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'forbidden' })); return; }
  const body = readJsonBody(req);
  const { clientId, clientSecret } = creds();
  try {
    const tokens = await refreshIfNeeded(
      { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: body.expiresAt },
      clientId, clientSecret);
    const params = new URLSearchParams({ per_page: '200' });
    if (Number(body.after) > 0) params.set('after', String(Math.floor(Number(body.after))));
    const activities = await stravaGet(`/athlete/activities?${params.toString()}`, tokens.accessToken);
    const mapped = mapStravaActivities(activities);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ...mapped, tokens }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = e.status === 401 ? 401 : 502;
    res.end(JSON.stringify({ error: e.status === 401 ? 'reconnect' : 'upstream_error' }));
  }
}
