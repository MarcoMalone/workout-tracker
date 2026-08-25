// GET /api/strava/callback — Strava redirects here with ?code. Exchange it for
// tokens (server-side, using the secret), then bounce back to the app with the token
// set in the URL fragment; the app stores it and clears the hash. The fragment is not
// sent to servers/logs. (If the on-device OAuth spike shows the fragment doesn't reach
// the installed PWA, this switches to rendering a paste-a-code page instead.)
import { creds, exchangeCode, appOrigin, redirect } from './_strava.js';

export default async function handler(req, res) {
  const origin = appOrigin(req);
  const { code, error, state } = req.query || {};
  if (error || !code) { redirect(res, `${origin}/#strava_error=${encodeURIComponent(error || 'no_code')}`); return; }
  try {
    const { clientId, clientSecret } = creds();
    const t = await exchangeCode(code, clientId, clientSecret);
    const athlete = t.athlete ? `${t.athlete.firstname || ''} ${t.athlete.lastname || ''}`.trim() : '';
    const frag = new URLSearchParams({
      strava_refresh: t.refresh_token || '',
      strava_access: t.access_token || '',
      strava_expires: String(t.expires_at || ''),
      athlete,
      strava_state: state || '', // echoed for the client's CSRF check
    });
    redirect(res, `${origin}/#${frag.toString()}`);
  } catch (e) {
    redirect(res, `${origin}/#strava_error=exchange_failed`);
  }
}
