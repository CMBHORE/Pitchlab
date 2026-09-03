// One-time setup helper: visit this page's URL directly in your browser.
// It sends you to Google to approve access, then shows you your refresh
// token directly on screen — no OAuth Playground needed at all.

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in Vercel first.");
  }

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const redirectUri = `${protocol}://${req.headers.host}/api/oauth-setup`;

  const { code } = req.query;

  if (!code) {
    // Step 1: send the admin to Google to approve access.
    const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/drive",
    });
    return res.redirect(authUrl);
  }

  // Step 2: Google sent us back here with a code — exchange it for tokens.
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.status(400).send(
        "<h2>Google rejected the request</h2><pre>" + JSON.stringify(data, null, 2) + "</pre>"
      );
    }

    if (!data.refresh_token) {
      return res.status(200).send(
        "<h2>No refresh token was returned</h2>" +
        "<p>This usually means you've already authorized this app before. Go to " +
        "<a href='https://myaccount.google.com/permissions' target='_blank'>myaccount.google.com/permissions</a>, " +
        "remove this app's access, then reload this page to try again.</p>"
      );
    }

    return res.status(200).send(
      "<h2>✅ Success — copy this value</h2>" +
      "<p>Paste this into Vercel as <b>GOOGLE_OAUTH_REFRESH_TOKEN</b>:</p>" +
      "<textarea readonly style='width:100%;height:80px;font-size:14px;padding:10px'>" + data.refresh_token + "</textarea>" +
      "<p style='color:#666'>You can close this page after copying the value above.</p>"
    );
  } catch (e) {
    return res.status(500).send("Error: " + (e.message || e));
  }
}
