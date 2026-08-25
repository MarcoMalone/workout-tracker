// GET /api/strava/connect — kicks off OAuth by redirecting to Strava's authorize
// page. Reads the (non-secret) client id from env and builds redirect_uri from the
// request host, so nothing app-specific is hardcoded in the client.
import { creds, appOrigin, redirect } from './_strava.js';

export default function handler(req, res) {
  const { clientId } = creds();
  if (!clientId) { res.statusCode = 500; res.end('STRAVA_CLIENT_ID not set'); return; }
  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${appOrigin(req)}/api/strava/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'activity:read_all');
  url.searchParams.set('approval_prompt', 'auto');
  redirect(res, url.toString());
}
