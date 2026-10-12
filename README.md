<p align="center">
  <img src="https://files.catbox.moe/e37ipu.png" width="400" alt="banner">
</p>

<h3 align="center">the all-in-one wiki bot</h3>

<p align="center">
  <a href="https://discord.com/oauth2/authorize?client_id=1487822524808040669">Add to server</a>
</p>

## Setup

### Requirements

- Node.js 17.3 or newer
- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

1. Clone the repository and enter its directory:

   ```bash
   git clone https://github.com/utgwiki/derik.git
   cd derik
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create your environment file from the example:

   ```bash
   cp .env.example .env
   ```

4. Open `.env` and replace `your_discord_token_here` with the bot token from the Discord Developer Portal. If `WEB_SERVER` is enabled, the web server uses port `3000` by default; set `PORT` to a different value if needed.

5. Start the bot:

   ```bash
   npm start
   ```

## Configuration

Most bot behavior is configured in [`config.js`](config.js). Restart the bot after making changes.

| Setting | Description |
| --- | --- |
| `BOT_NAME` | Optional display name. If empty or omitted, the bot’s Discord name is used. |
| `WIKIS` | Defines the supported wikis. Each entry contains the wiki name, MediaWiki API endpoint, article URL, message prefix, optional emoji, and optionally `default: true`. |
| `WIKI_MAP` | Optional map of Discord channel or category IDs to wiki keys. Without a channel/category match, the wiki marked `default: true` is used. If none is marked, the first wiki is used. |
| `COMMANDS` | Enables or disables slash commands. Set a command to `false` to prevent registration. Available commands are `speedrun`, `contribs`, `wiki`, `parse`, `user`, and `random`. |
| `EMOJIS` | Optional feature emojis: `speedrun` is used on speedrun buttons and `contribs` is used in contribution score leaderboards. Leave either value empty or unset to omit that emoji. |
| `WEB_SERVER` | Starts the small status web server when `true`. Set it to `false` to disable the server; `PORT` is then not required. |
| `STATUS_OPTIONS` | Customizes the bot’s rotating Discord status messages and activity types. |
| `STATUS_INTERVAL_MS` | Controls how often the bot rotates its status. The default is five minutes. |
| `PAGE_CACHE_MS` | Controls how long page lookups stay cached in memory. The default is 30 minutes. |
| `TRACKER` | Configure the Roblox tracker. Set `roleId` to the role that should be pinged, `distribution` to map Discord channel IDs to one or more Roblox universe IDs (not place IDs), and `frequency` to the visit milestone interval. `updatePingAfterMs` controls the quiet period before a single update can ping the role, while `updateBatchWindowMs` controls how updates within five minutes are compiled. `intervalMs` controls how often Roblox is checked and defaults to three minutes. |

The tracker announces visit milestones, public game updates, and newly added subplaces. Visit milestone messages never ping a role. On its first launch with no tracker state, it silently records the current baselines and waits `updatePingAfterMs` before announcing new milestones or updates. Cookie-free update detection uses the public `games.roblox.com` `updated` field, which is universe metadata and may not represent an actual place publish. Detected bursts of updates are compiled without pinging the role, and last-seen values are stored in [`tracker/visitchecker.json`](tracker/visitchecker.json). Set `COMMANDS.tracker` to `false` to disable all tracker checks and role pings; the tracker will not start at all in that mode.

Messages can also use interwiki links configured by the channel’s wiki, such as `[[wikipedia:Chicken]]` or `[[commons:Main page]]`. The bot reads the source wiki’s MediaWiki interwiki map, verifies that the destination page exists through its API, and then creates the usual extract embed with a link to the destination wiki. Prefixes configured in `config.js` take precedence over interwiki prefixes.

When adding a wiki, add its configuration to `WIKIS` and update `WIKI_MAP` or the relevant status messages as needed. Discord channel, category, and emoji IDs can be copied using Discord’s Developer Mode. Emoji values are optional; unset values are omitted from buttons and contribution score lists.

## Web server and Instatus

`bot/server.js` starts a small web server so Instatus can check whether the bot is active. It listens on `0.0.0.0` and uses the `PORT` value from `.env` (or port `3000` when it is unset). Set `WEB_SERVER` to `false` to skip starting it; in that case, `PORT` is not required.
