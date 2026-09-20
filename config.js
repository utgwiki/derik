// --- WIKI CONFIGURATION ---
const BOT_NAME = "Derik";

const WIKIS = {
    "untitled-tag-game": {
        name: "untitled tag game",
        baseUrl: "https://tagging.wiki",
        apiEndpoint: "https://tagging.wiki/w/api.php",
        articlePath: "https://tagging.wiki/",
        prefix: "utg",
        emoji: "1488793151027155017"
    },
    "untitled-farming-game": {
        name: "untitled farming game",
        baseUrl: "https://farm.miraheze.org",
        apiEndpoint: "https://farm.miraheze.org/w/api.php",
        articlePath: "https://farm.miraheze.org/",
        prefix: "ufg",
        emoji: "1538200099190997153"
    }
};

// Map a channel or category ID to a wiki.
const WIKI_MAP = {
    "1335895166292332585": "untitled-farming-game"
};

const DEFAULT_WIKI = "untitled-tag-game";

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

// The tracker is enabled by COMMANDS.tracker. These values are kept here so
// the tracker shares Derik's Discord client instead of running a second bot.
const TRACKER = {
    roleId: "1360880411114209340",
    distribution: {
        "1061009952199692410": [
            "4864117649", // utg recode
            "3202699936", // utg legacy
            "5581729181", // ufg
        ],
    },
    frequency: 10000,
    intervalMs: 3 * 60 * 1000,
};

const SPEEDRUN_EMOJI = "1488791940622454835";
const CONTRIBSCORES_SCORE_EMOJI = "1488794096548974592";
const STATUS_INTERVAL_MS = 5 * 60 * 1000;
const PAGE_CACHE_MS = 30 * 60 * 1000;

// --- DISCORD STATUSES ---
const STATUS_OPTIONS = [
    { type: 4, text: "just send [[a page]] or {{a page}}!" },
    { type: 4, text: "now supporting 2 wikis!" },
    { type: 4, text: "use [[utg:Page]] for untitled tag game embedding" },
    { type: 4, text: "use [[ufg:Page]] for untitled farming game embedding" },
    { type: 4, text: "farm.miraheze.org" },
    { type: 4, text: "farm.miraheze.org" },
    { type: 0, text: "untitled tag game" },
    { type: 0, text: "untitled farming game" },
    { type: 5, text: "untitled tag game" },
    { type: 5, text: "untitled farming game" },
    { type: 4, text: "edit your message and my embed will too!" },
    { type: 4, text: "react with :wastebasket: on my messages & i'll delete!" },
    { type: 4, text: 'Yeah heres a "Fun fact" for you. shut up.' },
    { type: 4, text: "Hi" },
    { type: 4, text: "ashkdjhafhakfh askkj fkfh jka hskfh ka hjkashf kashfjsf kahskjfhajks" },
    { type: 4, text: "Theres an extra .02 to my height, let that sink in" },
    { type: 4, text: "I have a contribution score of 0.01, beat that nerds" },
    { type: 4, text: "Hes optimus lime, LOL" },
    { type: 4, text: "Did you know: MARKIPLIER IS IN THIS GAME RIGHT NOW!" },
    { type: 4, text: "Fact: not only did utg copy evade. They also copied gorilla tag" },
    { type: 4, text: "Fact: utg copied evade entirely" },
    { type: 4, text: "The pit is waiting for you" },
    { type: 4, text: "Did you know: There are things called runners. GO FOR THEM!" },
    { type: 4, text: "Yeah I have a #submission. a bomb role at your doorstep" },
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
