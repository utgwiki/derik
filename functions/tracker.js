const fs = require("fs");
const path = require("path");
const { COMMANDS, TRACKER } = require("../config.js");

const statePath = path.join(__dirname, "..", "tracker", "visitchecker.json");
let lastAnnouncedVisits = {};
let firstLaunch = false;
const activeChecks = new Set();
const channelCache = new Map();

function loadState() {
    if (!fs.existsSync(statePath)) {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, "{}\n");
    }

    lastAnnouncedVisits = JSON.parse(fs.readFileSync(statePath, "utf8"));
    firstLaunch = Object.keys(lastAnnouncedVisits).length === 0;
}

function saveState() {
    fs.writeFileSync(statePath, `${JSON.stringify(lastAnnouncedVisits, null, 2)}\n`);
}

// Old state entries only had a name/lastVisit/lastUpdatedTimestamp. They have
// no baselines for places, notifications or update history, so treat them like
// a first launch instead of announcing everything as new.
function isLegacyRecord(record) {
    return record &&
        typeof record.placeIds === "undefined" &&
        typeof record.lastObservedUpdateTimestamp === "undefined" &&
        typeof record.notificationsSuppressedUntil === "undefined";
}

function isConfigured() {
    const games = getGames();
    return TRACKER &&
        TRACKER.roleId && !TRACKER.roleId.startsWith("DISCORD_") &&
        games.length > 0 &&
        games.every(game =>
            game.channelId && !game.channelId.startsWith("DISCORD_") &&
            game.universeId && !game.universeId.startsWith("ROBLOX_")
        );
}

// Distribution entries can be a plain universe ID string or an object with an
// optional `ping: false` to suppress role pings for that universe.
function normalizeGame(channelId, entry) {
    const isObject = entry && typeof entry === "object";
    const universeId = isObject ? (entry.universeId || entry.id) : entry;
    return {
        channelId: String(channelId),
        universeId: String(universeId || ""),
        ping: isObject ? entry.ping !== false : true
    };
}

function getGames() {
    if (TRACKER?.distribution && typeof TRACKER.distribution === "object") {
        return Object.entries(TRACKER.distribution).flatMap(([channelId, universes]) => {
            const entries = Array.isArray(universes) ? universes : [universes];
            return entries.map(entry => normalizeGame(channelId, entry));
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
        // A single channel can be shared by every configured universe.
        .map((universeId, index) => normalizeGame(
            channelIds[index] || (channelIds.length === 1 ? channelIds[0] : "") || "",
            universeId
        ))
        .filter(game => game.universeId && game.channelId);
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
    return response.json();
}

function formatMinutes(milliseconds) {
    return Math.max(1, Math.ceil(milliseconds / 60_000));
}

function getUpdateBatchWindowMs() {
    const value = Number(TRACKER.updateBatchWindowMs);
    return Number.isFinite(value) && value > 0 ? value : 5 * 60 * 1000;
}

function getUpdatePingAfterMs() {
    const value = Number(TRACKER.updatePingAfterMs);
    return Number.isFinite(value) && value > 0 ? value : 24 * 60 * 60 * 1000;
}

async function flushUpdateBatch(channel, record, now, canPing = true) {
    const pending = Array.isArray(record.pendingUpdates) ? record.pendingUpdates : [];
    if (pending.length === 0) return false;

    const notificationsSuppressedUntil = new Date(record.notificationsSuppressedUntil || 0).getTime();
    if (Number.isFinite(notificationsSuppressedUntil) && now < notificationsSuppressedUntil) return false;

    const latestObservedAt = new Date(pending[pending.length - 1].created).getTime();
    const batchWindow = getUpdateBatchWindowMs();
    if (Number.isFinite(latestObservedAt) && now - latestObservedAt < batchWindow) return false;

    const batch = [];
    let batchStart = null;
    for (const update of pending) {
        const updateTime = new Date(update.created).getTime();
        if (batchStart !== null && updateTime - batchStart > batchWindow) break;
        if (batchStart === null) batchStart = updateTime;
        batch.push(update);
    }

    const firstUpdate = batch[0];
    const lastUpdate = batch[batch.length - 1];
    const span = Math.max(0, new Date(lastUpdate.created).getTime() - new Date(firstUpdate.created).getTime());
    const message = batch.length > 1
        ? `**${record.name}** updated ${batch.length} times within ${formatMinutes(span)} minutes!`
        : `**${record.name}** updated <t:${Math.floor(new Date(firstUpdate.created).getTime() / 1000)}:R>!`;

    const previousUpdateAt = record.lastNotifiedUpdateAt ? new Date(record.lastNotifiedUpdateAt).getTime() : null;
    const longEnoughSinceUpdate = previousUpdateAt !== null &&
        new Date(firstUpdate.created).getTime() - previousUpdateAt >= getUpdatePingAfterMs();
    await channel.send(`${canPing && batch.length === 1 && longEnoughSinceUpdate ? `<@&${TRACKER.roleId}> ` : ""}${message}`);

    record.lastNotifiedUpdateAt = lastUpdate.created;
    record.pendingUpdates = pending.slice(batch.length);
    return true;
}

async function checkTracker(client, game) {
    const { universeId, channelId, ping = true } = game;
    if (activeChecks.has(universeId)) return;
    activeChecks.add(universeId);

    try {
        const gameResponse = await fetchJson(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(universeId)}`);
        const gameData = gameResponse.data?.[0];
        if (!gameData) {
            console.error(`No game data for Universe ID ${universeId}`);
            return;
        }

        const placesResponse = await fetchJson(`https://develop.roblox.com/v2/universes/${encodeURIComponent(universeId)}/places`);
        const places = placesResponse.data || [];
        const currentPlaceMap = places.reduce((map, place) => {
            map[place.id] = place.name;
            return map;
        }, {});
        const currentPlaceIds = Object.keys(currentPlaceMap).map(Number);
        // The v2 endpoint gives each place its own `updated` timestamp. Root place
        // changes drive the usual "game updated" message; subplace changes get
        // their own no-ping announcement, so they are compared per place.
        const currentPlaceUpdates = places.reduce((map, place) => {
            if (place.updated) map[place.id] = place.updated;
            return map;
        }, {});
        const rootPlace = places.find(place => place.isRootPlace === true);
        const latestRootUpdate = rootPlace?.updated || null;

        let record = lastAnnouncedVisits[universeId] || {};
        let hasChanges = false;
        const seedBaseline = firstLaunch || isLegacyRecord(record);
        if (seedBaseline && typeof record.lastUpdatedTimestamp !== "undefined") {
            delete record.lastUpdatedTimestamp;
            hasChanges = true;
        }
        // When seeding, adopt the current places and their timestamps as the
        // baseline so they are not announced as new/updated.
        const previousPlaceIds = seedBaseline ? currentPlaceIds : (record.placeIds || []);
        const newPlaceIds = currentPlaceIds.filter(id => !previousPlaceIds.includes(id));
        const seedPlaceUpdates = typeof record.placeUpdates === "undefined";
        const previousPlaceUpdates = seedPlaceUpdates ? currentPlaceUpdates : (record.placeUpdates || {});
        const updatedPlaces = (seedBaseline || seedPlaceUpdates) ? [] : places.filter(place =>
            place.updated &&
            typeof previousPlaceUpdates[place.id] === "string" &&
            new Date(place.updated).getTime() > new Date(previousPlaceUpdates[place.id]).getTime()
        );
        const rootUpdates = updatedPlaces.filter(place => place.isRootPlace === true);
        const subplaceUpdates = updatedPlaces.filter(place => place.isRootPlace !== true);
        record.placeUpdates = currentPlaceUpdates;
        if (seedPlaceUpdates) hasChanges = true;

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
        if (seedBaseline && typeof record.notificationsSuppressedUntil === "undefined") {
            record.lastVisit = Math.floor(gameData.visits / Number(TRACKER.frequency || 10000)) * Number(TRACKER.frequency || 10000);
            record.notificationsSuppressedUntil = new Date(Date.now() + getUpdatePingAfterMs()).toISOString();
            hasChanges = true;
        }
        if (newPlaceIds.length > 0) {
            record.placeIds = currentPlaceIds;
            hasChanges = true;
            const newPlacesList = newPlaceIds.map(id => {
                const name = currentPlaceMap[id] || `Unknown Place (${id})`;
                return `- [${name}](<https://www.roblox.com/games/${id}>)`;
            }).join("\n");
            await channel.send(`**${record.name}** has ${newPlaceIds.length} new subplace${newPlaceIds.length > 1 ? "s" : ""}!\n${newPlacesList}`);
        } else {
            record.placeIds = currentPlaceIds;
        }

        if (latestRootUpdate && typeof record.lastObservedUpdateTimestamp === "undefined") {
            record.lastObservedUpdateTimestamp = latestRootUpdate;
            record.lastNotifiedUpdateAt = seedBaseline
                ? new Date(Date.now() - getUpdatePingAfterMs()).toISOString()
                : latestRootUpdate;
            record.pendingUpdates = [];
            hasChanges = true;
        }

        if (rootUpdates.length > 0) {
            record.pendingUpdates = rootUpdates.reduce((pending, place) => [
                ...pending,
                { created: place.updated }
            ].filter((version, index, versions) =>
                index === versions.findIndex(candidate => candidate.created === version.created)
            ), Array.isArray(record.pendingUpdates) ? record.pendingUpdates : []);
            record.lastObservedUpdateTimestamp = rootUpdates.reduce((latest, place) =>
                !latest || new Date(place.updated).getTime() > new Date(latest).getTime()
                    ? place.updated
                    : latest
            , record.lastObservedUpdateTimestamp);
            hasChanges = true;
        }

        if (Array.isArray(record.pendingUpdates) && record.pendingUpdates.length > 0) {
            if (await flushUpdateBatch(channel, record, Date.now(), ping)) hasChanges = true;
        }

        if (subplaceUpdates.length > 0) {
            for (const place of subplaceUpdates) {
                const when = `<t:${Math.floor(new Date(place.updated).getTime() / 1000)}:R>`;
                await channel.send(`**${record.name}**'s subplace [${place.name || `Place ${place.id}`}](<https://www.roblox.com/games/${place.id}>) updated ${when}!`);
            }
            hasChanges = true;
        }

        const frequency = Number(TRACKER.frequency);
        const notificationsSuppressedUntil = new Date(record.notificationsSuppressedUntil || 0).getTime();
        const notificationsReady = !Number.isFinite(notificationsSuppressedUntil) || Date.now() >= notificationsSuppressedUntil;
        if (notificationsReady && Number.isFinite(frequency) && frequency > 0 && gameData.visits >= record.lastVisit + frequency) {
            const nextMilestone = Math.floor(gameData.visits / frequency) * frequency;
            record.lastVisit = nextMilestone;
            hasChanges = true;
            await channel.send(`**${record.name}** has reached **${nextMilestone.toLocaleString()}** visits!`);
        }

        if (hasChanges) {
            lastAnnouncedVisits[universeId] = record;
            saveState();
        }

        console.log(`${record.name}: ${gameData.visits} visits, Places: ${currentPlaceIds.length}, Root Updated: ${latestRootUpdate || "n/a"}`);
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
