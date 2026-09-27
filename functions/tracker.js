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

async function fetchPublishedVersions(placeId) {
    const response = await fetchJson(
        `https://develop.roblox.com/v1/places/${encodeURIComponent(placeId)}/versions?sortOrder=Desc&limit=100`
    );
    return (response.data || [])
        .filter(version => Number.isFinite(Number(version.versionNumber)) && version.created)
        .map(version => ({
            versionNumber: Number(version.versionNumber),
            created: version.created
        }))
        .sort((left, right) => left.versionNumber - right.versionNumber);
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

async function flushUpdateBatch(channel, record, now) {
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
        ? `**${record.name}** updated ${batch.length} times within ${formatMinutes(span)} minutes! (Place Version: ${lastUpdate.versionNumber})`
        : `**${record.name}** updated <t:${Math.floor(new Date(firstUpdate.created).getTime() / 1000)}:R>! (Place Version: ${firstUpdate.versionNumber})`;

    const previousUpdateAt = record.lastNotifiedUpdateAt ? new Date(record.lastNotifiedUpdateAt).getTime() : null;
    const longEnoughSinceUpdate = previousUpdateAt !== null &&
        new Date(firstUpdate.created).getTime() - previousUpdateAt >= getUpdatePingAfterMs();
    await channel.send(`${batch.length === 1 && longEnoughSinceUpdate ? `<@&${TRACKER.roleId}> ` : ""}${message}`);

    record.lastNotifiedUpdateAt = lastUpdate.created;
    record.pendingUpdates = pending.slice(batch.length);
    return true;
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
        if (firstLaunch && typeof record.notificationsSuppressedUntil === "undefined") {
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

        const placeId = gameData.rootPlaceId;
        if (placeId) {
            const publishedVersions = await fetchPublishedVersions(placeId);
            const latestVersion = publishedVersions[publishedVersions.length - 1];
            if (latestVersion && typeof record.lastPublishedVersion === "undefined") {
                record.lastPublishedVersion = latestVersion.versionNumber;
                record.lastPublishedAt = latestVersion.created;
                record.lastNotifiedUpdateAt = firstLaunch
                    ? new Date(Date.now() - getUpdatePingAfterMs()).toISOString()
                    : latestVersion.created;
                record.pendingUpdates = [];
                hasChanges = true;
            } else if (latestVersion && latestVersion.versionNumber > Number(record.lastPublishedVersion || 0)) {
                const newVersions = publishedVersions.filter(version => version.versionNumber > Number(record.lastPublishedVersion || 0));
                record.pendingUpdates = [
                    ...(Array.isArray(record.pendingUpdates) ? record.pendingUpdates : []),
                    ...newVersions
                ].filter((version, index, versions) =>
                    index === versions.findIndex(candidate => candidate.versionNumber === version.versionNumber)
                );
                record.lastPublishedVersion = latestVersion.versionNumber;
                record.lastPublishedAt = latestVersion.created;
                hasChanges = true;
            }

            if (await flushUpdateBatch(channel, record, Date.now())) hasChanges = true;
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

        console.log(`${record.name}: ${gameData.visits} visits, Places: ${currentPlaceIds.length}, Latest Published Version: ${record.lastPublishedVersion || "unknown"}`);
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
