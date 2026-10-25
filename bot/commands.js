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
const hasMultipleWikis = Object.keys(WIKIS).length > 1;
const wikiOption = (required = true) => ({
    name: 'wiki',
    description: 'The wiki to search in',
    type: 3,
    required,
    choices: wikiChoices
});
const ephemeralOption = {
    name: 'ephemeral',
    description: 'Only show the response to you',
    type: 5,
    required: false
};

const allCommands = [
    {
        name: 'speedrun',
        description: 'View speedrun leaderboards',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            { name: 'utg', description: "untitled tag game's speedrun leaderboard", type: 1, options: [
                { name: 'category', description: 'The category to view', type: 3, required: true, choices: UTG_CATEGORIES },
                { name: 'subcategory', description: 'The subcategory to view (if applicable)', type: 3, required: false, choices: UTG_FIRST_TO_THE_TOKEN_SUBCATEGORIES },
                ephemeralOption
            ] },
            { name: 'ufg', description: "untitled farming game's speedrun leaderboard", type: 1, options: [
                { name: 'category', description: 'The category to view', type: 3, required: true, choices: UFG_CATEGORIES },
                ephemeralOption
            ] }
        ]
    },
    {
        name: 'contribs',
        description: 'View wiki contribution scores',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            ...(hasMultipleWikis ? [wikiOption(true)] : []),
            ephemeralOption
        ]
    },
    {
        name: 'wiki',
        description: 'Get a link to a wiki',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            ...(hasMultipleWikis ? [wikiOption(true)] : []),
            ephemeralOption
        ]
    },
    {
        name: 'parse',
        description: 'Search for a page or file on a wiki',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'page',
                description: 'Search for a wiki page',
                type: 1, // SUB_COMMAND
                options: [
                    ...(hasMultipleWikis ? [wikiOption(true)] : []),
                    {
                        name: 'page',
                        description: 'The page to search for',
                        type: 3, // STRING
                        required: true,
                        autocomplete: true
                    },
                    {
                        name: 'section',
                        description: 'An optional section to search for',
                        type: 3, // STRING
                        required: false,
                        autocomplete: true
                    },
                    ephemeralOption
                ]
            },
            {
                name: 'file',
                description: 'Search for a wiki file',
                type: 1, // SUB_COMMAND
                options: [
                    ...(hasMultipleWikis ? [wikiOption(true)] : []),
                    {
                        name: 'file',
                        description: 'The file to search for',
                        type: 3, // STRING
                        required: true,
                        autocomplete: true
                    },
                    ephemeralOption
                ]
            }
        ]
    },
    {
        name: 'cosmetic',
        description: 'View game cosmetics',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'outfit',
                description: 'View an outfit',
                type: 1,
                options: [
                    { name: 'name', description: 'The outfit to view', type: 3, required: true, autocomplete: true },
                    { name: 'game', description: 'Filter by game', type: 3, required: false, choices: [{ name: 'Legacy', value: 'Legacy' }, { name: 'Recode', value: 'Recode' }] }
                ]
            },
            ephemeralOption
        ]
    },
    {
        name: 'cosmetic',
        description: 'View game cosmetics',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            {
                name: 'outfit',
                description: 'View an outfit',
                type: 1,
                options: [
                    { name: 'name', description: 'The outfit to view', type: 3, required: true, autocomplete: true },
                    { name: 'game', description: 'Filter by game', type: 3, required: false, choices: [{ name: 'Legacy', value: 'Legacy' }, { name: 'Recode', value: 'Recode' }] }
                ]
            },
            ephemeralOption
        ]
    },
    {
        name: 'user',
        description: 'View a wiki user profile',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            ...(hasMultipleWikis ? [wikiOption(true)] : []),
            { name: 'username', description: 'The wiki username', type: 3, required: true, autocomplete: true },
            ephemeralOption
        ]
    },
    {
        name: 'random',
        description: 'View a random wiki page',
        integrationTypes: [0, 1],
        contexts: [0, 1, 2],
        options: [
            ...(hasMultipleWikis ? [wikiOption(false)] : []),
            {
                name: 'rootpage',
                description: 'Only choose pages without subpages',
                type: 5,
                required: false
            },
            ephemeralOption
        ]
    }
];

const commands = allCommands.filter(command => COMMANDS[command.name] !== false);

module.exports = { commands };
