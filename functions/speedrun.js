const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { getPageData } = require("./page.js");
const { fetch } = require("./utils.js");
const { WIKIS, SPEEDRUN_EMOJI, BOT_NAME } = require("../config.js");

const UTG_CATEGORY_IDS = {
    FIRST_TO_THE_TOKEN: 'w2077y8k',
    RUNNER_LEVELS: 'xd1mpy69',
    TAGGER_LEVELS: 'k20p5zxd'
};

const UTG_CATEGORIES = [
    { name: 'First to the Token', value: UTG_CATEGORY_IDS.FIRST_TO_THE_TOKEN },
    { name: 'Runner Levels', value: UTG_CATEGORY_IDS.RUNNER_LEVELS },
    { name: 'Tagger Levels', value: UTG_CATEGORY_IDS.TAGGER_LEVELS }
];

const UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES = [
    { name: 'Runthrough', value: 'q75wzdp1' },
    { name: 'Intended Route', value: 'qked60dq' },
    { name: 'No Limits', value: '1gn7od6l' }
];

const UFG_CATEGORY_IDS = {
    BEAT_UNTITLED_FARMING: '5dw3wr52',
    ANY_PERCENT: 'wk6qlzo2'
};

const UFG_CATEGORIES = [
    { name: 'Beat untitled farming%', value: UFG_CATEGORY_IDS.BEAT_UNTITLED_FARMING },
    { name: 'Any%', value: UFG_CATEGORY_IDS.ANY_PERCENT }
];

const GAMES = {
    utg: {
        id: "m1zy4336",
        name: "untitled tag game"
    },
    ufg: {
        id: "nd27z731",
        name: "untitled farming game"
    }
};

const GAME_WIKI_MAP = {
    utg: 'untitled-tag-game',
    ufg: 'untitled-farming-game'
};

function formatTime(seconds, forceMinutes = false) {
    if (seconds == null || isNaN(seconds)) return "N/A";
    const totalMs = Math.round(seconds * 1000);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    const mss = String(ms).padStart(3, '0');

    if (h > 0) {
        const hh = String(h).padStart(2, '0');
        return `${hh}:${mm}:${ss}:${mss}`;
    }
    return `${mm}:${ss}:${mss}`;
}

async function getLeaderboardData(gameId, categoryId, levelId = null, variables = {}) {
    let url = levelId
        ? `https://www.speedrun.com/api/v1/leaderboards/${gameId}/level/${levelId}/${categoryId}?top=10&embed=category,level,players`
        : `https://www.speedrun.com/api/v1/leaderboards/${gameId}/category/${categoryId}?top=10&embed=category,level,players`;

    const varParams = [];
    for (const [varId, valId] of Object.entries(variables)) {
        if (valId) varParams.push(`var-${varId}=${valId}`);
    }
    if (varParams.length > 0) {
        url += `&${varParams.join('&')}`;
    }

    const res = await fetch(url, {
        headers: { "User-Agent": `${BOT_NAME} Discord bot` },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
        throw new Error(`Speedrun API responded with status ${res.status}`);
    }
    const json = await res.json();
    return json.data;
}

async function handleSpeedrunRequest(interaction, gameKey, categoryId, levelId = null, variables = {}) {
    const game = GAMES[gameKey];

    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
        const responseJson = await getLeaderboardData(game.id, categoryId, levelId, variables);

        if (!responseJson || !responseJson.runs || responseJson.runs.length === 0) {
            return await interaction.editReply("No speedrun data found for this category.");
        }

        const leaderboard = responseJson;
        const runs = leaderboard.runs.slice(0, 10);
        const playersMap = new Map();

        if (leaderboard.players && leaderboard.players.data) {
            leaderboard.players.data.forEach(player => {
                if (player.id) {
                    playersMap.set(player.id, player.names ? player.names.international : player.name);
                }
            });
        }

        const categoryName = leaderboard.category.data.name;
        const levelName = leaderboard.level?.data?.name;

        const mainTitle = levelName ? levelName : game.name;
        const forceMinutes = mainTitle === "untitled farming game" || categoryName.includes("World");

        let description = `### [**${mainTitle}**](${leaderboard.weblink})\n**Category:** ${categoryName}\n\n`;

        runs.forEach(runData => {
            const place = runData.place;
            const run = runData.run;
            const players = run.players.map(p => {
                if (p.rel === 'user') return playersMap.get(p.id) || "Unknown User";
                return p.name || "Guest";
            }).join(" @");
            const time = formatTime(run.times.primary_t, forceMinutes);
            description += `${place}. \`${time}\`   [**@${players}**](${run.weblink})\n`;
        });

        const container = new ContainerBuilder();
        const leaderboardSection = new SectionBuilder();
        leaderboardSection.addTextDisplayComponents([new TextDisplayBuilder().setContent(description)]);

        const wikiConfig = WIKIS[GAME_WIKI_MAP[gameKey]];
        const mapPage = await getPageData(mainTitle, wikiConfig);
        if (mapPage?.imageUrl) {
            leaderboardSection.setThumbnailAccessory(thumbnail => thumbnail.setURL(mapPage.imageUrl));
        }
        container.addSectionComponents(leaderboardSection);

        const row = new ActionRowBuilder();
        const button = new ButtonBuilder()
            .setLabel("View list")
            .setStyle(ButtonStyle.Link)
            .setURL(leaderboard.weblink);
        if (SPEEDRUN_EMOJI) button.setEmoji(SPEEDRUN_EMOJI);
        row.addComponents(button);

        container.addActionRowComponents(row);

        return await interaction.editReply({ components: [container] });
    } catch (err) {
        console.error(`Error fetching speedrun leaderboard for ${gameKey}:`, err);
        const errorMessage = "Failed to load speedrun leaderboard. Please try again later.";
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(errorMessage);
        } else {
            return await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

module.exports = {
    handleSpeedrunRequest,
    UTG_CATEGORY_IDS,
    UTG_CATEGORIES,
    UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES,
    UFG_CATEGORY_IDS,
    UFG_CATEGORIES
};
