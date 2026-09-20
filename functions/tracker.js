const fs = require("fs");
const path = require("path");
const { COMMANDS, TRACKER } = require("../config.js");

const statePath = path.join(__dirname, "..", "tracker", "visitchecker.json");
let lastAnnouncedVisits = {};
const activeChecks = new Set();
const channelCache = new Map();

function loadState() {
    if (!fs.existsSync(statePath)) {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, "{}\n");
    }

    lastAnnouncedVisits = JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState() {
    fs.writeFileSync(statePath, `${JSON.stringify(lastAnnouncedVisits, null, 2)}\n`);
}

function isConfigured() {
    const games = getGames();
    return TRACKER &&
        TRACKER.roleId && !TRACKER.roleId.startsWith("DISCORD_") &&
        games.length > 0 &&
        games.every(game =>
            game.channelId && !game.channelId.startsWith("DISCORD_") &&
            game.universeId && !game.universeId.startsWith("ROBLOX_")
        ) &&
        Number.isFinite(Number(TRACKER.frequency)) && Number(TRACKER.frequency) > 0;
}

function getGames() {
    if (TRACKER?.distribution && typeof TRACKER.distribution === "object") {
        return Object.entries(TRACKER.distribution).flatMap(([channelId, universeIds]) => {
            const ids = Array.isArray(universeIds) ? universeIds : [universeIds];
            return ids.map(universeId => ({
                channelId: String(channelId),
                universeId: String(universeId || "")
            }));
        }).filter(game => game.universeId && game.channelId);
    }

    // Backward-compatible support for the original channelId/universeId format.
    const universeIds = Array.isArray(TRACKER?.universeId)
        ? TRACKER.universeId
        : [TRACKER?.universeId];
    const channelIds = Array.isArray(TRACKER?.channelId)
        ? TRACKER.channelId
        : [TRACKER?.channelId];

    return universeIds
        .map((universeId, index) => ({
            universeId: String(universeId || ""),
            // A single channel can be shared by every configured universe.
            channelId: String(channelIds[index] || (channelIds.length === 1 ? channelIds[0] : "") || "")
        }))
        .filter(game => game.universeId && game.channelId);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
}

async function checkTracker(client, game) {
    const { universeId, channelId } = game;
    if (activeChecks.has(universeId)) return;
    activeChecks.add(universeId);

    try {
        const gameResponse = await fetchJson(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`);
        const gameData = gameResponse.data?.[0];
        if (!gameData) {
            console.error(`No game data for Universe ID ${universeId}`);
            return;
        }

        const placesResponse = await fetchJson(`https://develop.roblox.com/v1/universes/${encodeURIComponent(universeId)}/places?sortOrder=Asc&limit=100`);
        const currentPlaceMap = (placesResponse.data || []).reduce((map, place) => {
            map[place.id] = place.name;
            return map;
        }, {});
        const currentPlaceIds = Object.keys(currentPlaceMap).map(Number);

        let record = lastAnnouncedVisits[universeId] || {};
        let hasChanges = false;
        const previousPlaceIds = record.placeIds || [];
        const newPlaceIds = currentPlaceIds.filter(id => !previousPlaceIds.includes(id));

        let channel = channelCache.get(channelId);
        if (!channel) {
            channel = await client.channels.fetch(channelId);
            channelCache.set(channelId, channel);
        }

        if (record.name !== gameData.name) {
            record.name = gameData.name;
            hasChanges = true;
        }
        if (typeof record.lastVisit === "undefined") {
            record.lastVisit = 0;
            hasChanges = true;
        }

        if (newPlaceIds.length > 0) {
            record.placeIds = currentPlaceIds;
            hasChanges = true;
            const newPlacesList = newPlaceIds.map(id => {
                const name = currentPlaceMap[id] || `Unknown Place (${id})`;
                return `- [${name}](<https://www.roblox.com/games/${id}>)`;
            }).join("\n");
            await channel.send(`<@&${TRACKER.roleId}> **${record.name}** has ${newPlaceIds.length} new subplace${newPlaceIds.length > 1 ? "s" : ""}!\n${newPlacesList}`);
        } else {
            record.placeIds = currentPlaceIds;
        }

        const previousUpdated = record.lastUpdatedTimestamp;
        const isNewUpdate = previousUpdated && gameData.updated && new Date(gameData.updated) > new Date(previousUpdated);
        if (isNewUpdate) {
            record.lastUpdatedTimestamp = gameData.updated;
            hasChanges = true;
            const timestamp = Math.floor(new Date(gameData.updated).getTime() / 1000);
            await channel.send(`<@&${TRACKER.roleId}> **${record.name}** updated <t:${timestamp}:R>!`);
        } else if (typeof previousUpdated === "undefined") {
            record.lastUpdatedTimestamp = gameData.updated;
            hasChanges = true;
        }

        const frequency = Number(TRACKER.frequency);
        const nextMilestone = Math.floor(gameData.visits / frequency) * frequency;
        if (gameData.visits >= record.lastVisit + frequency) {
            record.lastVisit = nextMilestone;
            hasChanges = true;
            await channel.send(`<@&${TRACKER.roleId}> **${record.name}** has reached **${nextMilestone.toLocaleString()}** visits!`);
        }

        if (hasChanges) {
            lastAnnouncedVisits[universeId] = record;
            saveState();
        }

        console.log(`${record.name}: ${gameData.visits} visits, Places: ${currentPlaceIds.length}, Last Updated: ${gameData.updated}`);
    } catch (error) {
        console.error(`Error checking Universe ID ${universeId}:`, error.message);
    } finally {
        activeChecks.delete(universeId);
    }
}

function startTracker(client) {
    if (COMMANDS.tracker === false) return;
    if (!isConfigured()) {
        console.warn("Tracker is enabled, but TRACKER in config.js is not configured; tracker checks are disabled.");
        return;
    }

    client.once("ready", () => {
        loadState();
        const games = getGames();
        games.forEach(game => checkTracker(client, game));
        setInterval(() => games.forEach(game => checkTracker(client, game)), TRACKER.intervalMs);
    });
}

module.exports = { startTracker };
