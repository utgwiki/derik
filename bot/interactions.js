const {
    findCanonicalTitle,
    getPageData,
    getSectionContent,
    getSectionChoices,
    linkIntroductionPageName,
} = require("../functions/page.js");
const { getRandomPage } = require("../functions/random.js");
const { getUserProfile } = require("../functions/user.js");
const { handleFileRequest } = require("../functions/file.js");
const { handleContribScoresRequest } = require("../functions/contribs.js");
const {
    handleSpeedrunRequest,
} = require("../functions/speedrun.js");
const {
    WIKIS,
    COMMANDS,
    BOT_NAME,
    CONTRIBSCORES_SCORE_EMOJI
} = require("../config.js");
const { fetch, truncateToParagraphs: truncateContentToParagraphs } = require("../functions/utils.js");

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ThumbnailBuilder
} = require('discord.js');

const responseMap = new Map();
const botToAuthorMap = new Map();

function pruneMap(map, maxSize = 200) {
    if (map.size > maxSize) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
    }
}

function truncateToParagraphs(content, paragraphLimit = 2) {
    if (!content) return "";
    const cleanContent = content.replace(/\n\s*\n+/g, "\n\n").trim();
    const paragraphs = cleanContent.split("\n\n");
    return paragraphs.slice(0, paragraphLimit).join("\n\n");
}

function truncateText(str, maxLength = 1024) {
    if (!str) return '';
    return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
}

function buildPageEmbed(title, content, imageUrl, wikiConfig, gallery = null, buttonStyle = "FULL_SIZE", sectionName = null) {
    let pageUrl;
    if (title === "Special:ContributionScores") {
        pageUrl = `${wikiConfig.articlePath}Special:ContributionScores`;
    } else {
        let pageOnly = title;
        let fragment = null;
        if (title.includes('#')) {
            [pageOnly, fragment] = title.split('#');
            fragment = fragment.trim();
        }
        const encodedTitleParts = pageOnly.split(':').map(part => encodeURIComponent(part.replace(/ /g, '_')));
        const encodedTitle = encodedTitleParts.join(':');

        let anchor = '';
        if (sectionName) {
            anchor = '#' + encodeURIComponent(sectionName.replace(/ /g, '_'));
        } else if (fragment) {
            anchor = '#' + encodeURIComponent(fragment.replace(/ /g, '_'));
        }
        pageUrl = `${wikiConfig.articlePath}${encodedTitle}${anchor}`;
    }

    const cleanContent = (content || "No content available.").replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}');
    const displayContent = truncateToParagraphs(cleanContent, 2);

    const mainTextDisplay = new TextDisplayBuilder().setContent(displayContent);

    if (buttonStyle === "SECTION_TITLE_ONLY") {
        const row = new ActionRowBuilder();
        const btn = new ButtonBuilder()
            .setLabel((sectionName || title).slice(0, 80))
            .setStyle(ButtonStyle.Link)
            .setURL(pageUrl);
        if (wikiConfig.emoji) btn.setEmoji(wikiConfig.emoji);
        row.addComponents(btn);

        const section = new SectionBuilder().addTextDisplayComponents(mainTextDisplay);
        if (imageUrl) {
            const thumb = new ThumbnailBuilder().setURL(imageUrl);
            section.setThumbnailAccessory(thumb);
        }

        const container = new ContainerBuilder()
            .addSectionComponents(section)
            .addActionRowComponents(row);

        return { components: [container] };
    }

    const section = new SectionBuilder().addTextDisplayComponents(mainTextDisplay);
    if (imageUrl) {
        const thumb = new ThumbnailBuilder().setURL(imageUrl);
        section.setThumbnailAccessory(thumb);
    }

    const linkButton = new ButtonBuilder()
        .setLabel((title === "Special:ContributionScores" ? "View list" : String(title)).slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(pageUrl);

    if (wikiConfig.emoji) linkButton.setEmoji(wikiConfig.emoji);

    const actionRow = new ActionRowBuilder().addComponents(linkButton);

    const container = new ContainerBuilder().addSectionComponents(section);

    if (gallery && Array.isArray(gallery) && gallery.length > 0) {
        const galleryItems = gallery.slice(0, 3);
        const gallerySection = new SectionBuilder();

        let galleryText = "**Gallery**\n";
        galleryItems.forEach((item, index) => {
            const numEmoji = ["1️⃣", "2️⃣", "3️⃣"][index];
            const captionText = item.caption ? ` - ${item.caption}` : "";
            galleryText += `${numEmoji} [Image ${index + 1}](${item.url})${captionText}\n`;
        });

        gallerySection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(galleryText.trim())
        );

        if (galleryItems[0] && galleryItems[0].url) {
            gallerySection.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(galleryItems[0].url)
            );
        }

        container.addSectionComponents(gallerySection);
    }

    container.addActionRowComponents(actionRow);

    return { components: [container] };
}

async function handleUserRequest(wikiConfig, rawPageName, messageOrInteraction, targetMessageToEdit = null) {
    if (!rawPageName) return null;

    let sectionName = null;
    let pageTitle = rawPageName;

    if (rawPageName.includes("#")) {
        const parts = rawPageName.split("#");
        pageTitle = parts[0].trim();
        sectionName = parts.slice(1).join("#").trim();
    }

    const isInteraction = !!messageOrInteraction.isCommand;
    const sendReply = async (payload) => {
        if (targetMessageToEdit) {
            return await targetMessageToEdit.edit(payload);
        }
        if (isInteraction) {
            if (messageOrInteraction.deferred || messageOrInteraction.replied) {
                return await messageOrInteraction.followUp(payload);
            } else {
                return await messageOrInteraction.reply(payload);
            }
        }
        return await messageOrInteraction.reply(payload);
    };

    if (pageTitle.toLowerCase().startsWith("file:")) {
        const payload = await handleFileRequest(pageTitle, wikiConfig);
        return await sendReply(payload);
    }

    if (pageTitle.toLowerCase() === "special:contributionscores") {
        const payload = await handleContribScoresRequest(wikiConfig);
        return await sendReply(payload);
    }

    const canonicalTitle = await findCanonicalTitle(pageTitle, wikiConfig);

    if (!canonicalTitle) {
        const notFoundText = `The page "${pageTitle}" does not exist on ${wikiConfig.name}.`;
        if (isInteraction) {
            return await sendReply({ content: notFoundText, ephemeral: true });
        }
        return await sendReply({ content: notFoundText });
    }

    if (sectionName) {
        const sectionData = await getSectionContent(canonicalTitle, sectionName, wikiConfig);
        if (sectionData) {
            const pageData = await getPageData(canonicalTitle, wikiConfig);
            const imageUrl = pageData ? pageData.imageUrl : null;
            const payload = buildPageEmbed(
                canonicalTitle,
                sectionData.content,
                imageUrl,
                wikiConfig,
                sectionData.gallery,
                "FULL_SIZE",
                sectionData.displayTitle || sectionName
            );
            return await sendReply(payload);
        }
    }

    const pageData = await getPageData(canonicalTitle, wikiConfig);
    if (!pageData) {
        const notFoundText = `Could not fetch data for "${canonicalTitle}".`;
        if (isInteraction) {
            return await sendReply({ content: notFoundText, ephemeral: true });
        }
        return await sendReply({ content: notFoundText });
    }

    const displayTitle = linkIntroductionPageName(pageData.title, pageData.extract);
    const payload = buildPageEmbed(
        displayTitle,
        pageData.extract,
        pageData.imageUrl,
        wikiConfig,
        pageData.gallery
    );

    return await sendReply(payload);
}

async function handleInteraction(interaction) {
    if (interaction.isCommand() && COMMANDS[interaction.commandName] === false) {
        return interaction.reply({ content: 'This command is currently disabled.', ephemeral: true }).catch(() => {});
    }

    if (interaction.isButton() && interaction.customId === 'contribs:help') {
        return interaction.reply({
            content: `In contribution score lists, <:playerpoint:${CONTRIBSCORES_SCORE_EMOJI}> is the score: \`unique pages edited + 2 × √(total edits − unique pages edited)\`. ✏️ is the number of edits (revisions) counted for the selected period.`,
            ephemeral: true
        }).catch(() => {});
    }

    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'parse' || interaction.commandName === 'wiki' || interaction.commandName === 'user') {
            const focusedOption = interaction.options.getFocused(true);
            const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
            const wikiConfig = WIKIS[wikiKey];

            if (focusedOption.name === 'section') {
                const pageTitle = interaction.options.getString('page');
                if (!pageTitle) return interaction.respond([]);
                const choices = await getSectionChoices(pageTitle, focusedOption.value, wikiConfig);
                return interaction.respond(choices);
            }

            if (!focusedOption.value.trim()) return interaction.respond([]);

            const isUser = interaction.commandName === 'user' || focusedOption.name === 'username';
            const endpoint = `${wikiConfig.apiEndpoint}?action=opensearch&search=${encodeURIComponent(focusedOption.value)}&limit=5&format=json${isUser ? '&namespace=2' : ''}`;

            try {
                const res = await fetch(endpoint, {
                    headers: { "User-Agent": `${BOT_NAME} Discord bot` }
                });
                const data = await res.json();
                const results = data[1] || [];
                const choices = results.map(item => {
                    let val = item;
                    if (isUser) val = val.replace(/^User\s*:\s*/i, '');
                    return { name: val, value: val };
                });
                await interaction.respond(choices);
            } catch (err) {
                console.error('Autocomplete error:', err);
                await interaction.respond([]);
            }
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'speedrun') {
            try {
                const subCommand = interaction.options.getSubcommand();
                let response;
                if (subCommand === 'utg') {
                    const categoryId = interaction.options.getString('category');
                    const subcategoryId = interaction.options.getString('subcategory');
                    const variables = (subcategoryId && categoryId === 'w2077y8k') ? { 'ql6mr2j8': subcategoryId } : {};
                    response = await handleSpeedrunRequest(interaction, 'utg', categoryId, null, variables);
                } else if (subCommand === 'ufg') {
                    const categoryId = interaction.options.getString('category');
                    response = await handleSpeedrunRequest(interaction, 'ufg', categoryId);
                } else {
                    return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true }).catch(() => {});
                }

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /speedrun command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to fetch speedrun data.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to fetch speedrun data.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (commandName === 'contribs') {
            try {
                await interaction.deferReply();
                const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
                const wikiConfig = WIKIS[wikiKey];
                const response = await handleContribScoresRequest(wikiConfig, interaction);

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /contribs command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to fetch contribution scores.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to fetch contribution scores.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (commandName === 'wiki') {
            try {
                const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
                const wikiConfig = WIKIS[wikiKey];
                const pageTitle = interaction.options.getString('page');
                const sectionName = interaction.options.getString('section');

                const fullRequest = sectionName ? `${pageTitle}#${sectionName}` : pageTitle;
                const response = await handleUserRequest(wikiConfig, fullRequest, interaction);

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /wiki command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to fetch wiki page.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to fetch wiki page.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (commandName === 'parse') {
            try {
                await interaction.deferReply();
                const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
                const wikiConfig = WIKIS[wikiKey];
                const pageTitle = interaction.options.getString('page');

                const canonicalTitle = await findCanonicalTitle(pageTitle, wikiConfig);
                if (!canonicalTitle) {
                    return interaction.editReply({ content: `The page "${pageTitle}" does not exist on ${wikiConfig.name}.` });
                }

                const { parseTemplates, parseWikiLinks } = require('../functions/page.js');
                const rawContent = `[[${canonicalTitle}]]`;
                const parsedTemplates = await parseTemplates(rawContent, wikiConfig);
                const finalOutput = await parseWikiLinks(parsedTemplates, wikiConfig);

                const response = await interaction.editReply({ content: finalOutput });

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /parse command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to parse page.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to parse page.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (commandName === 'user') {
            try {
                await interaction.deferReply();
                const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
                const wikiConfig = WIKIS[wikiKey];
                const username = interaction.options.getString('username');

                const profile = await getUserProfile(username, wikiConfig);
                if (!profile) {
                    return interaction.editReply({ content: `User "${username}" was not found on ${wikiConfig.name}.` });
                }

                const container = new ContainerBuilder();
                const section = new SectionBuilder();

                let body = `### [**User:${profile.username}**](${profile.profileUrl})\n`;
                if (profile.groups.length > 0) {
                    body += `**Groups:** ${profile.groups.join(', ')}\n`;
                }
                if (profile.editCount !== null) {
                    body += `**Edit count:** ${profile.editCount.toLocaleString()}\n`;
                }
                if (profile.content) {
                    body += `\n${truncateToParagraphs(profile.content, 2)}`;
                }

                section.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

                if (profile.avatarUrl) {
                    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(profile.avatarUrl));
                }

                container.addSectionComponents(section);

                const row = new ActionRowBuilder();
                const btn = new ButtonBuilder()
                    .setLabel(`User:${profile.username}`)
                    .setStyle(ButtonStyle.Link)
                    .setURL(profile.profileUrl);
                if (wikiConfig.emoji) btn.setEmoji(wikiConfig.emoji);

                const contribsBtn = new ButtonBuilder()
                    .setLabel("Contributions")
                    .setStyle(ButtonStyle.Link)
                    .setURL(profile.contribsUrl);

                row.addComponents(btn, contribsBtn);
                container.addActionRowComponents(row);

                const response = await interaction.editReply({ components: [container] });

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /user command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to fetch user profile.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to fetch user profile.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (commandName === 'random') {
            try {
                await interaction.deferReply();
                const wikiKey = interaction.options.getString('wiki') || Object.keys(WIKIS)[0];
                const wikiConfig = WIKIS[wikiKey];

                const randomTitle = await getRandomPage(wikiConfig);
                if (!randomTitle) {
                    return interaction.editReply({ content: `Failed to fetch a random page from ${wikiConfig.name}.` });
                }

                const response = await handleUserRequest(wikiConfig, randomTitle, interaction);

                if (response && response.id) {
                    botToAuthorMap.set(response.id, interaction.user.id);
                    pruneMap(botToAuthorMap);
                }
            } catch (err) {
                console.error("Error running /random command:", err);
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: 'Failed to fetch random page.', ephemeral: true }).catch(() => {});
                } else {
                    await interaction.reply({ content: 'Failed to fetch random page.', ephemeral: true }).catch(() => {});
                }
            }
            return;
        }
    }
}

module.exports = {
    handleInteraction,
    handleUserRequest,
    responseMap,
    botToAuthorMap,
    pruneMap
};
