require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const crypto = require("crypto");

const app = express();
const settings = new Map();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const configured = () => process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_REDIRECT_URI;
app.get("/health", (_req, res) => res.json({ ok: true, app: "HANU", storage: "temporary-memory" }));
app.get("/auth/discord", (req, res) => {
  if (!configured()) return res.status(503).send("Discord login is not configured yet. Add the Discord OAuth environment variables in Render.");
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, redirect_uri: process.env.DISCORD_REDIRECT_URI, response_type: "code", scope: "identify guilds", state });
  res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
});
app.get("/auth/discord/callback", async (req, res) => {
  try {
    if (!configured()) return res.status(503).send("Discord login is not configured.");
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) return res.status(400).send("Invalid login state. Please try again.");
    delete req.session.oauthState;
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: req.query.code, redirect_uri: process.env.DISCORD_REDIRECT_URI }) });
    const token = await tokenRes.json();
    if (!tokenRes.ok) return res.status(400).send("Discord token exchange failed. Check OAuth settings.");
    const headers = { Authorization: "Bearer " + token.access_token };
    const [userRes, guildRes] = await Promise.all([fetch("https://discord.com/api/users/@me", { headers }), fetch("https://discord.com/api/users/@me/guilds", { headers })]);
    if (!userRes.ok || !guildRes.ok) return res.status(400).send("Could not load your Discord profile.");
    req.session.user = await userRes.json();
    req.session.guilds = (await guildRes.json()).filter(g => (BigInt(g.permissions) & 0x20n) === 0x20n || (BigInt(g.permissions) & 0x8n) === 0x8n);
    res.redirect("/#dashboard");
  } catch (e) { console.error("OAuth callback:", e); res.status(500).send("Login failed. Please try again."); }
});
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null, guilds: req.session.guilds || [] }));
app.get("/api/guild/:id/settings", (req, res) => {
  if (!(req.session.guilds || []).some(g => g.id === req.params.id)) return res.sendStatus(403);
  res.json(settings.get(req.params.id) || {});
});
app.put("/api/guild/:id/settings", (req, res) => {
  if (!(req.session.guilds || []).some(g => g.id === req.params.id)) return res.sendStatus(403);
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  settings.set(req.params.id, body);
  res.json({ ok: true, storage: "temporary-memory" });
});
app.post("/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.use(express.static("public"));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("HANU web listening on", port));