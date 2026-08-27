// POST /api/strava/activity — body { accessToken, expiresAt, refreshToken, id }.
// Fetches one activity's rich detail + streams (splits, HR/pace/cadence series, route)
// for the run-detail view. Called lazily, only for a run you actually open.
import { creds, refreshIfNeeded, stravaGet, readJsonBody } from './_strava.js';
import { mapStravaDetail } from '../../strava.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
  const body = readJsonBody(req);
  const { clientId, clientSecret } = creds();
  try {
    const tokens = await refreshIfNeeded(
      { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: body.expiresAt },
      clientId, clientSecret);
    const id = encodeURIComponent(body.id);
    const detail = await stravaGet(`/activities/${id}`, tokens.accessToken);
    let streams = {};
    try {
      streams = await stravaGet(`/activities/${id}/streams?keys=distance,heartrate,cadence,velocity_smooth&key_by_type=true`, tokens.accessToken);
    } catch { /* streams optional (some activities have none) */ }
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ detail: mapStravaDetail(detail, streams), tokens }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = e.status === 401 ? 401 : 502;
    res.end(JSON.stringify({ error: e.status === 401 ? 'reconnect' : String(e.message || e) }));
  }
}
