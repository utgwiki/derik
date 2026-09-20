// Copy this file to config.js and replace the example values.
// --- WIKI CONFIGURATION ---
const BOT_NAME = "Wiki Guy";

const WIKIS = {
    "example-wiki": {
        name: "Example Wiki",
        baseUrl: "https://example.com",
        apiEndpoint: "https://example.com/w/api.php",
        articlePath: "https://example.com/",
        prefix: "example",
        emoji: "DISCORD_EMOJI_ID"
    }
};

// Map a channel or category ID to a wiki.
const WIKI_MAP = {
    "DISCORD_CHANNEL_OR_CATEGORY_ID": "example-wiki"
};

const DEFAULT_WIKI = "example-wiki";

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
    intervalMs: 3 * 60 * 1000,
};
const SPEEDRUN_EMOJI = "DISCORD_EMOJI_ID";
const CONTRIBSCORES_SCORE_EMOJI = "DISCORD_EMOJI_ID";
const STATUS_INTERVAL_MS = 5 * 60 * 1000;
const PAGE_CACHE_MS = 30 * 60 * 1000;

// --- DISCORD STATUSES ---
const STATUS_OPTIONS = [
    { type: 4, text: "your wiki" },
];

module.exports = {
    BOT_NAME,
    WIKIS,
    WIKI_MAP,
    DEFAULT_WIKI,
    COMMANDS,
    TRACKER,
    SPEEDRUN_EMOJI,
    CONTRIBSCORES_SCORE_EMOJI,
    STATUS_INTERVAL_MS,
    PAGE_CACHE_MS,
    STATUS_OPTIONS
};
