const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    MessageFlags
} = require("discord.js");

async function handleLbCompRequest(interaction, botToAuthorMap, pruneMap) {
    const CHANNEL_ID = "1489259863803428865";

    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

        const channel = await interaction.client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            return interaction.editReply({ content: "Could not find the target channel." });
        }

        const messages = await channel.messages.fetch({ limit: 2 });
        if (!messages || messages.size < 2) {
            return interaction.editReply({ content: "Not enough messages found in the target channel." });
        }

        // Messages are returned in reverse chronological order (newest first)
        // We want them in chronological order to parse them correctly (1..24 then 25..46)
        const sortedMessages = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        const combinedContent = sortedMessages.map(m => m.content).join("\n");

        // Regex to match [Username](RobloxLink)
        // Format in messages: ## 1 - [Sneffles](https://www.roblox.com/users/419612905/profile)
        const playerRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let match;
        const players = [];

        while ((match = playerRegex.exec(combinedContent)) !== null) {
            players.push({
                name: match[1],
                link: match[2]
            });
        }

        if (players.length === 0) {
            return interaction.editReply({ content: "No players found in the latest messages." });
        }

        let description = "## Competitive Leaderboard\n\n";
        players.forEach((player, index) => {
            description += `${index + 1}. [${player.name}](${player.link})\n`;
        });

        const container = new ContainerBuilder();
        const section = new SectionBuilder();
        section.addTextDisplayComponents([new TextDisplayBuilder().setContent(description.slice(0, 4000))]);
        // Optional: set a transparent thumbnail to match existing style if desired
        section.setThumbnailAccessory(thumbnail => thumbnail.setURL("https://upload.wikimedia.org/wikipedia/commons/8/89/HD_transparent_picture.png"));

        container.addSectionComponents(section);

        const response = await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

        if (response && response.id) {
            botToAuthorMap.set(response.id, interaction.user.id);
            pruneMap(botToAuthorMap);
        }

    } catch (err) {
        console.error("Error in handleLbCompRequest:", err);
        const errorMsg = { content: "An error occurred while fetching the leaderboard.", ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.deleteReply().catch(() => {});
            await interaction.followUp(errorMsg).catch(() => {});
        } else {
            await interaction.reply(errorMsg).catch(() => {});
        }
    }
}

module.exports = { handleLbCompRequest };
