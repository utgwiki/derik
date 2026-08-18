const { WIKIS, COMMANDS } = require("../config.js");
const {
    UTG_CATEGORIES,
    UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES,
    UFG_CATEGORIES
} = require("../functions/speedrun.js");

const wikiChoices = Object.entries(WIKIS).map(([key, wiki]) => ({
    name: wiki.name,
    value: key
}));

const allCommands = [
    {
        name: 'speedrun',
        description: 'View speedrun leaderboards',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'utg',
                description: 'untitled tag game\'s speedrun leaderboard',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'category',
                        description: 'The category to view',
                        type: 3, // STRING
                        required: true,
                        choices: UTG_CATEGORIES
                    },
                    {
                        name: 'subcategory',
                        description: 'The subcategory to view (if applicable)',
                        type: 3, // STRING
                        required: false,
                        choices: UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES
                    }
                ]
            },
            {
                name: 'ufg',
                description: 'untitled farming game\'s speedrun leaderboard',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'category',
                        description: 'The category to view',
                        type: 3, // STRING
                        required: true,
                        choices: UFG_CATEGORIES
                    }
                ]
            }
        ]
    },
    {
        name: 'contribs',
        description: 'View the contribution score leaderboard for a wiki',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'wiki',
                description: 'The wiki to view contribution scores for',
                type: 3, // STRING
                required: false,
                choices: wikiChoices
            }
        ]
    },
    {
        name: 'wiki',
        description: 'View or search for a page on a wiki',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'page',
                description: 'The page title to view',
                type: 3, // STRING
                required: true,
                autocomplete: true
            },
            {
                name: 'section',
                description: 'The section to jump to (optional)',
                type: 3, // STRING
                required: false,
                autocomplete: true
            },
            {
                name: 'wiki',
                description: 'The wiki to search on (optional)',
                type: 3, // STRING
                required: false,
                choices: wikiChoices
            }
        ]
    },
    {
        name: 'parse',
        description: 'Parse wikitext/templates on a wiki page',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'page',
                description: 'The page title to parse',
                type: 3, // STRING
                required: true,
                autocomplete: true
            },
            {
                name: 'wiki',
                description: 'The wiki to parse on (optional)',
                type: 3, // STRING
                required: false,
                choices: wikiChoices
            }
        ]
    },
    {
        name: 'user',
        description: 'View a wiki user profile',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'username',
                description: 'The wiki username to view',
                type: 3, // STRING
                required: true,
                autocomplete: true
            },
            {
                name: 'wiki',
                description: 'The wiki to search on (optional)',
                type: 3, // STRING
                required: false,
                choices: wikiChoices
            }
        ]
    },
    {
        name: 'random',
        description: 'Get a random wiki page',
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'wiki',
                description: 'The wiki to pick from (optional)',
                type: 3, // STRING
                required: false,
                choices: wikiChoices
            }
        ]
    }
];

const commands = allCommands.filter(command => COMMANDS[command.name] !== false);

module.exports = {
    commands
};
