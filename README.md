# HANU

A separate Discord bot + web dashboard starter. This repository is intentionally independent of the existing Synapse services and database.

## Included in this starter
- Express website with a HANU landing page and health endpoint
- Discord OAuth2 login (identify + guilds), state validation, and server filtering for Manage Server/Administrator
- PostgreSQL-backed sessions and per-guild JSON settings
- Separate Discord gateway worker with /ping, /help, /serverinfo and basic `hanu` prefix commands

## Not implemented yet
Ticket panel builder/transcripts, advanced moderation, automod, welcome/autoroles, leveling, economy, giveaways, logging and full dashboard controls are future modules. The feature cards describe the product direction, not completed functionality.

## Environment
Copy `.env.example` values into the private environment settings for the web service and bot worker. Never commit real tokens or secrets. Set the Discord OAuth redirect URL to `https://YOUR-HANU-SITE.onrender.com/auth/discord/callback`.

## Run locally
`npm install`, configure environment variables, then run `npm start` for the website and `npm run bot` in a separate process for the Discord worker. Both require the dedicated HANU PostgreSQL database; the worker also requires a Discord bot token.

## Discord setup
Enable the bot's required intents in the Discord Developer Portal. For prefix commands, enable Message Content Intent. Invite the bot with the bot and applications.commands scopes and only the permissions needed for enabled features.

## Render
Deploy the web app as a Web Service and the persistent Discord client as a separate Background Worker. Provision a new HANU PostgreSQL database; do not reuse or alter Synapse resources.