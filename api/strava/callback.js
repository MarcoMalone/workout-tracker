// GET /api/strava/callback — Strava redirects here with ?code. Exchange it for
// tokens (server-side, using the secret), then render a terminal page that shows a
// copyable connection code. On desktop/Safari the "Open the app" link returns with
// the token in the URL fragment (auto-captured); on an installed iOS PWA the OAuth
// round-trip runs in a separate in-app browser that can't hand the fragment back to
// the standalone app, so the user copies the code and pastes it in Settings → Strava.
import { creds, exchangeCode } from './_strava.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Strava · Workout Tracker</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
    background:#0F1923; color:#E8EDF2; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .card { width:100%; max-width:420px; background:#16222E; border:1px solid #24344a; border-radius:16px; padding:24px; }
  h1 { font-size:20px; margin:0 0 6px; }
  p { color:#9FB0C0; margin:0 0 16px; }
  .ok { color:#4ADE80; }
  .step { background:#0F1923; border:1px solid #24344a; border-radius:10px; padding:12px 14px; margin:0 0 14px; color:#C7D2DE; font-size:14px; }
  textarea { width:100%; height:92px; resize:none; border-radius:10px; border:1px solid #2b3d55; background:#0F1923;
    color:#E8EDF2; padding:12px; font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; }
  button { width:100%; margin-top:12px; padding:14px; border:0; border-radius:12px; font-size:16px; font-weight:700;
    background:#0377E8; color:#fff; -webkit-tap-highlight-color:transparent; }
  .sub { display:block; text-align:center; margin-top:16px; color:#6b8299; font-size:13px; }
  a { color:#4C9EEB; }
</style></head><body><div class="card">${inner}</div></body></html>`;
}

function successPage({ code, athlete }) {
  return shell(`
    <h1><span class="ok">✓</span> Connected to Strava${athlete ? `, ${esc(athlete)}` : ''}</h1>
    <p>One last step:</p>
    <div class="step">1. Tap <b>Copy code</b> below.<br>2. Return to the <b>Workout</b> app.<br>3. <b>Settings → Strava → Paste connection code</b>, and paste.</div>
    <textarea id="code" readonly>${esc(code)}</textarea>
    <button id="copy">Copy code</button>
    <script>
      var b=document.getElementById('copy'), t=document.getElementById('code');
      b.addEventListener('click',function(){
        t.focus(); t.select(); t.setSelectionRange(0,99999);
        var done=function(){ b.textContent='Copied ✓'; setTimeout(function(){b.textContent='Copy code';},2000); };
        if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t.value).then(done,function(){try{document.execCommand('copy');done();}catch(e){}}); }
        else { try{document.execCommand('copy');done();}catch(e){} }
      });
    </script>`);
}

function errorPage(msg) {
  return shell(`
    <h1>Couldn't connect to Strava</h1>
    <p>${esc(msg)}. Head back to the Workout app and tap <b>Connect Strava</b> to try again.</p>`);
}

export default async function handler(req, res) {
  const { code, error, state } = req.query || {};
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); // never cache/store the token-bearing page
  if (error || !code) { res.end(errorPage(error === 'access_denied' ? 'You declined access' : (error || 'No authorization code'))); return; }
  try {
    const { clientId, clientSecret } = creds();
    const t = await exchangeCode(code, clientId, clientSecret);
    const athlete = t.athlete ? `${t.athlete.firstname || ''} ${t.athlete.lastname || ''}`.trim() : '';
    const fragment = new URLSearchParams({
      strava_refresh: t.refresh_token || '',
      strava_access: t.access_token || '',
      strava_expires: String(t.expires_at || ''),
      athlete,
      strava_state: state || '', // echoed for the client's CSRF check
    }).toString();
    const code64 = Buffer.from(fragment, 'utf8').toString('base64url');
    res.end(successPage({ code: code64, athlete }));
  } catch (e) {
    res.end(errorPage('Strava rejected the sign-in'));
  }
}
