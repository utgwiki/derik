const { fetch } = require("./utils.js");
const { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const { WIKIS, SPEEDRUN_EMOJI } = require("../config.js");

const UTG_CATEGORY_IDS = {
    FIRST_TO_THE_TOKEN: 'w2077y8k',
    NOTHING_LEFT_BEHIND_PT1: '02qn6lj2'
};

const UTG_CATEGORIES = [
    { name: 'First to the Token', value: UTG_CATEGORY_IDS.FIRST_TO_THE_TOKEN },
    { name: 'Nothing Left Behind Part 1', value: UTG_CATEGORY_IDS.NOTHING_LEFT_BEHIND_PT1 }
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
    const totalMs = Math.round(seconds * 1000);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    const mm = String(m + h * 60).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    const mss = String(ms).padStart(3, '0');
    return `${mm}:${ss}:${mss}`;
}

async function getLeaderboardData(gameId, categoryId, levelId = null, variables = {}) {
    let url = `https://www.speedrun.com/api/v1/leaderboards/${gameId}`;
    if (levelId) {
        url += `/level/${levelId}/${categoryId}`;
    } else {
        url += `/category/${categoryId}`;
    }
    url += `?top=10&embed=players,category${levelId ? ',level' : ''}`;

    for (const [key, value] of Object.entries(variables)) {
        if (value) {
            url += `&var-${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
    }

    const res = await fetch(url, {
        headers: { "User-Agent": "DiscordBot/Derik" },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData.message || `Speedrun.com API returned ${res.status}`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return await res.json();
}

async function handleSpeedrunRequest(interaction, gameKey, categoryId, levelId = null, variables = {}) {
    const game = GAMES[gameKey];

    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
        const responseJson = await getLeaderboardData(game.id, categoryId, levelId, variables);
        const leaderboard = responseJson.data;

        if (!leaderboard.runs || leaderboard.runs.length === 0) {
            const noRunsMsg = { content: `No runs found for this category.`, ephemeral: true };
            await interaction.deleteReply().catch(e => console.warn("Failed to delete reply:", e.message));
            return await interaction.followUp(noRunsMsg);
        }

        const forceMinutes = leaderboard.runs.some(runItem => runItem.run.times.primary_t >= 60);

        const playersMap = new Map();
        leaderboard.players.data.forEach(p => {
            if (p.rel === "user") {
                playersMap.set(p.id, p.names.international);
            } else {
                playersMap.set(p.id, p.name); // Guest
            }
        });

        const categoryName = leaderboard.category.data.name;
        const levelName = leaderboard.level?.data?.name;

        const mainTitle = levelName ? levelName : game.name;
        let titleLine = `## ${mainTitle}\n`;
        titleLine += `-# ${categoryName}`;
        
        if (levelName) {
            titleLine += ` @ ${game.name}`;
        }
        
        titleLine += `\n\n`;

        let description = titleLine;

        leaderboard.runs.forEach((runItem) => {
            const place = runItem.place;
            const run = runItem.run;
            const players = run.players.map(p => {
                if (p.rel === "user") return playersMap.get(p.id) || "Unknown";
                return p.name || "Guest";
            }).join(" @");
            const time = formatTime(run.times.primary_t, forceMinutes);
            description += `${place}. <:flag:1477323785366540439> \`${time}\`    [**@${players}**](${run.weblink})\n`;
        });

        const container = new ContainerBuilder();
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));

        const row = new ActionRowBuilder();
        const button = new ButtonBuilder()
            .setLabel("View full leaderboard")
            .setStyle(ButtonStyle.Link)
            .setURL(leaderboard.weblink);

        const wikiKey = GAME_WIKI_MAP[gameKey];
        const wikiConfig = WIKIS[wikiKey];
        if (SPEEDRUN_EMOJI || (wikiConfig && wikiConfig.emoji)) {
            button.setEmoji(SPEEDRUN_EMOJI || wikiConfig.emoji);
        }

        row.addComponents(button);

        container.addActionRowComponents(row);

        return await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

    } catch (err) {
        console.error("Error fetching speedrun leaderboard:", err);
        const errorMessage = err.status === 400 ? `Speedrun.com: ${err.message}` : "An error occurred while fetching the leaderboard.";
        const errorMsg = { content: errorMessage, ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.deleteReply().catch(() => {});
            return await interaction.followUp(errorMsg).catch(() => null);
        } else {
            return await interaction.reply(errorMsg).catch(() => null);
        }
    }
}

module.exports = {
    handleSpeedrunRequest,
    UTG_CATEGORIES,
    UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES,
    UFG_CATEGORIES
};
