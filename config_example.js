// Copy this file to config.js and replace the example values.
// --- WIKI CONFIGURATION ---
const BOT_NAME = "";

const WIKIS = {
    "example-wiki": {
        name: "Example Wiki",
        baseUrl: "https://example.com",
        apiEndpoint: "https://example.com/w/api.php",
        articlePath: "https://example.com/",
        prefix: "example",
        default: true
    }
};

// optional: map channel or category IDs to a wiki.
const WIKI_MAP = undefined;

// Enable or disable slash commands. Disabled commands are not registered with Discord.
const COMMANDS = {
    speedrun: true,
    contribs: true,
    wiki: true,
    parse: true,
    user: true,
    random: true,
    cosmetic: true,
    tracker: true,
};

// Set COMMANDS.tracker to false to disable all tracker checks and pings.
const TRACKER = {
    roleId: "DISCORD_ROLE_ID",
    distribution: {
        // Each channel ID maps to one or more Roblox universe IDs.
        "DISCORD_CHANNEL_ID": ["ROBLOX_UNIVERSE_ID"],
        // "DISCORD_CHANNEL_ID_2": ["ROBLOX_UNIVERSE_ID_2", "ROBLOX_UNIVERSE_ID_3"],
    },
    frequency: 10000,
    // Updates within this window are compiled into one message without a role ping.
    updateBatchWindowMs: 5 * 60 * 1000,
    // A single update only pings the role when the previous update was at least this old.
    updatePingAfterMs: 24 * 60 * 60 * 1000,
    intervalMs: 3 * 60 * 1000,
};
const EMOJIS = {
    speedrun: "",
    contribs: ""
};
const WEB_SERVER = true;
const STATUS_INTERVAL_MS = 5 * 60 * 1000;
const PAGE_CACHE_MS = 30 * 60 * 1000;

// --- DISCORD STATUSES ---
const STATUS_OPTIONS = [
    { type: 4, text: "your wiki" },
];

module.exports = {
    BOT_NAME,
    WIKIS,
    WIKI_MAP: typeof WIKI_MAP !== "undefined" ? WIKI_MAP : undefined,
    COMMANDS,
    EMOJIS,
    WEB_SERVER,
    STATUS_INTERVAL_MS,
    PAGE_CACHE_MS,
    STATUS_OPTIONS
};
