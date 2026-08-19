const { BOT_NAME } = require("../config.js");
const { fetch } = require("./utils.js");
const { getPageData, linkIntroductionPageName, getFullSizeImageUrl } = require("./page.js");

const OUTFIT_BUCKET = "outfit";
const UTG_COINS_EMOJI = "1539619263609053244";

function luaString(value) {
    return JSON.stringify(String(value));
}

function valueOf(row, ...names) {
    for (const name of names) {
        if (row && row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
        const key = Object.keys(row || {}).find(candidate => candidate.toLowerCase() === name.toLowerCase());
        if (key && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
    }
    return null;
}

async function bucketQuery(query, wikiConfig) {
    const params = new URLSearchParams({
        action: "bucket",
        format: "json",
        formatversion: "2",
        query
    });
    const response = await fetch(`${wikiConfig.apiEndpoint}?${params.toString()}`, {
        headers: { "User-Agent": `${BOT_NAME} Discord bot` },
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Bucket API returned HTTP ${response.status}`);
    const json = await response.json();
    if (json.error) {
        const details = typeof json.error === "string"
            ? json.error
            : json.error.info || json.error.code || JSON.stringify(json.error);
        console.error(`Bucket query failed (${query}): ${details}`);
        throw new Error(`Bucket query failed: ${details}`);
    }
    return json.bucket || [];
}

async function findOutfit(name, game, wikiConfig) {
    if (game && game !== "Legacy" && game !== "Recode") return null;
    const where = game
        ? `{name = ${luaString(name)}, version = ${luaString(game)}}`
        : `{name = ${luaString(name)}}`;
    const rows = await bucketQuery(`mw.ext.bucket(${luaString(OUTFIT_BUCKET)}).select("name", "cost", "rarity", "description", "image", "creator", "version", "currency", "variants").where(${where}).limit(1).run()`, wikiConfig);
    return Array.isArray(rows) ? rows[0] || null : rows;
}

async function getOutfitChoices(prefix, wikiConfig) {
    const rows = await bucketQuery(`mw.ext.bucket(${luaString(OUTFIT_BUCKET)}).select("name").limit(500).run()`, wikiConfig);
    const search = String(prefix || "").trim().toLowerCase();
    const names = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const name = valueOf(row, "name");
        if (name && String(name).toLowerCase().includes(search)) names.set(String(name).toLowerCase(), String(name));
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b)).slice(0, 25).map(name => ({ name, value: name }));
}

async function getCommunityPage(creator, wikiConfig) {
    if (!creator) return null;
    const title = `Community:${creator}`;
    const params = new URLSearchParams({ action: "query", format: "json", titles: title, redirects: "1", indexpageids: "1" });
    const response = await fetch(`${wikiConfig.apiEndpoint}?${params.toString()}`, {
        headers: { "User-Agent": `${BOT_NAME} Discord bot` },
        signal: AbortSignal.timeout(3000)
    });
    const json = await response.json();
    const pageId = json.query?.pageids?.[0];
    const page = json.query?.pages?.[pageId];
    return page && page.missing === undefined ? page.title : null;
}

function pageUrl(title, wikiConfig, withUtm = true) {
    const parts = String(title).split(":").map(part => encodeURIComponent(part.replace(/ /g, "_")));
    return `${wikiConfig.articlePath}${parts.join(":")}${withUtm ? `?utm_source=${encodeURIComponent(BOT_NAME)}` : ""}`;
}

function formatCost(cost) {
    if (cost === null || cost === undefined || cost === "") return "";
    const numericCost = Number(cost);
    if (Number.isFinite(numericCost)) return numericCost.toLocaleString("en-US");
    return String(cost);
}

function formatDescription(description) {
    let text = String(description || "").replace(/\n+/g, " ").trim();
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
    return text
        .replace(/'''([^']+)'''/g, "**$1**")
        .replace(/''([^']+)''/g, "*$1*");
}

async function buildOutfitResponse(outfit, wikiConfig) {
    const name = String(valueOf(outfit, "name", "title") || "");
    const rarity = String(valueOf(outfit, "rarity") || "");
    const game = String(valueOf(outfit, "version", "game") || "");
    const rawCost = valueOf(outfit, "cost", "price");
    const cost = formatCost(rawCost);
    const creator = valueOf(outfit, "creator", "made_by", "madeBy");
    const description = formatDescription(valueOf(outfit, "description"));
    const pageName = valueOf(outfit, "page_name", "page", "article", "wiki_page") || name;
    const icon = valueOf(outfit, "image", "icon", "image_url", "imageUrl", "thumbnail");

    const pageData = await getPageData(pageName, wikiConfig);
    const canonical = pageData?.canonical || pageName;
    const lead = pageData?.extract ? linkIntroductionPageName(pageData.extract, canonical, wikiConfig) : "No content available.";
    let imageUrl = null;
    if (icon) {
        imageUrl = /^https?:\/\//i.test(String(icon)) ? String(icon) : getFullSizeImageUrl((await getPageData(String(icon).startsWith("File:") ? String(icon) : `File:${icon}`, wikiConfig))?.imageUrl || null);
    }
    imageUrl ||= pageData?.imageUrl || null;

    let creatorText = creator ? String(creator) : "";
    if (creator) {
        const communityPage = await getCommunityPage(String(creator), wikiConfig);
        if (communityPage) creatorText = `[${creator}](${pageUrl(communityPage, wikiConfig, true)})`;
    }

    const container = new (require("discord.js").ContainerBuilder)();
    const section = new (require("discord.js").SectionBuilder)();
    const metadata = `-# ${[rarity, game].filter(Boolean).join(" ")} outfit;${cost ? ` ${cost} <:utgcoins:${UTG_COINS_EMOJI}>` : ""}`;
    const header = [
        `## [${name}](${pageUrl(canonical, wikiConfig, true)})`,
        metadata,
        `-# By ${creatorText}`,
        `> "${description}"`
    ].join("\n");
    section.addTextDisplayComponents(new (require("discord.js").TextDisplayBuilder)().setContent(header));
    if (imageUrl) section.setThumbnailAccessory(thumbnail => thumbnail.setURL(imageUrl));
    container.addSectionComponents(section);
    container.addTextDisplayComponents(new (require("discord.js").TextDisplayBuilder)().setContent(lead));

    const row = new (require("discord.js").ActionRowBuilder)();
    row.addComponents(new (require("discord.js").ButtonBuilder)()
        .setLabel(name.slice(0, 80))
        .setStyle(require("discord.js").ButtonStyle.Link)
        .setURL(pageUrl(canonical, wikiConfig, true))
        .setEmoji(wikiConfig.emoji));
    container.addActionRowComponents(row);
    return container;
}

module.exports = { findOutfit, getOutfitChoices, buildOutfitResponse };
