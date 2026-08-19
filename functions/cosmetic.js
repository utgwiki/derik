const { BOT_NAME } = require("../config.js");
const { fetch } = require("./utils.js");
const { getPageData, linkIntroductionPageName, getFullSizeImageUrl } = require("./page.js");

const OUTFIT_BUCKET = "outfit";
const UTG_COINS_EMOJI = "1539619263609053244";
const RARITY_ACCENT_COLORS = {
    Common: 0xD7EEFA,
    Uncommon: 0x73FF88,
    Rare: 0x0051FF,
    Epic: 0x9972FC,
    Legendary: 0xFFEF42,
    Mythic: 0xFF4242,
    Outrageous: 0x42F2FF,
    Special: 0xFF20AA,
    Initiation: 0xFB5C00,
    Hallows: 0xA550D3,
    Holiday: 0x46AACF,
    Valentines: 0xFF50BC,
    DOORS: 0x131431,
    "Slap Battles": 0xC3FF00,
    Transcendental: 0xE57EFF,
    Admin: 0x4C4C4C
};

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
    const rows = await bucketQuery(`mw.ext.bucket(${luaString(OUTFIT_BUCKET)}).select("name", "page_name", "cost", "rarity", "description", "image", "creator", "version", "currency", "variants").where(${where}).limit(1).run()`, wikiConfig);
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

function cleanCreatorName(creator) {
    const match = String(creator).trim().match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    return (match ? (match[2] || match[1]) : String(creator)).trim();
}

async function formatCreators(creator, wikiConfig) {
    if (!creator) return "";
    const creators = String(creator).split(/\s*&\s*/).map(cleanCreatorName).filter(Boolean);
    const formatted = await Promise.all(creators.map(async name => {
        const communityPage = await getCommunityPage(name, wikiConfig);
        return communityPage ? `[${name}](${pageUrl(communityPage, wikiConfig, true)})` : name;
    }));
    return formatted.join(" & ");
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
    if (description === null || description === undefined) return null;
    let text = String(description).replace(/\n+/g, " ").trim();
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim();
    if (!text || text === "''''") return null;
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

    const creatorText = await formatCreators(creator, wikiConfig);

    const container = new (require("discord.js").ContainerBuilder)();
    const accentColor = RARITY_ACCENT_COLORS[rarity];
    if (accentColor) container.setAccentColor(accentColor);
    const section = new (require("discord.js").SectionBuilder)();
    const metadata = `-# ${[rarity, game].filter(Boolean).join(" ")} outfit${cost ? `; <:utgcoins:${UTG_COINS_EMOJI}> ${cost}` : ""}`;
    const header = [
        `## [${name}](${pageUrl(canonical, wikiConfig, true)})`,
        metadata,
        creatorText ? `-# By ${creatorText}` : "",
        description ? `> "${description}"` : ""
    ].filter(Boolean).join("\n");
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
