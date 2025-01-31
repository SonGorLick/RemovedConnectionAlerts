/**
 * @name RemovedConnectionAlerts
 * @author iris!
 * @authorId 102528230413578240
 * @version 0.5.8
 * @description Keep track which friends and servers remove you (original by Metalloriff)
 * @website https://github.com/iyu46/RemovedConnectionAlerts
 * @source https://raw.githubusercontent.com/iyu46/RemovedConnectionAlerts/main/RemovedConnectionAlerts.plugin.js
 * @updateUrl https://raw.githubusercontent.com/iyu46/RemovedConnectionAlerts/main/RemovedConnectionAlerts.plugin.js
 */
/* eslint-disable */
/*@cc_on
@if (@_jscript)

    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();
@else@*/
/* eslint-enable */
/* eslint-disable max-len, global-require, consistent-return, no-promise-executor-return, import/no-unresolved */
const config = {
    info: {
        name: 'RemovedConnectionAlerts',
        authors: [
            {
                name: 'iris!',
                discord_id: '102528230413578240',
                github_username: 'iyu46',
            },
        ],
        version: '0.5.8',
        description: 'Keep track which friends and servers remove you (original by Metalloriff)',
        github: 'https://github.com/iyu46/RemovedConnectionAlerts',
        github_raw: 'https://raw.githubusercontent.com/iyu46/RemovedConnectionAlerts/main/RemovedConnectionAlerts.plugin.js',
    },
    changelog: [
        {
            title: '0.5.8',
            type: 'fixed',
            items: [
                'Fixed plugin icon appearing bugged due to new Discord styling',
            ],
        },
        {
            title: '0.5.7',
            type: 'improved',
            items: [
                'Fixed 24-hour entry splitting algorithm',
            ],
        },
        {
            title: '0.5.0 - 0.5.6',
            type: 'added',
            items: [
                'Condensed changelog',
                'Added auto-patcher',
                'Refactored internals by pulling up constants',
                'Added changelog modal',
                'Added automatic checking through dispatcher',
                'Added proper UI button with icon next to Inbox (thanks programmer2514!)',
                'Keep UI button on the UI via observer',
                'Added tooltip on hover for UI button',
                'Added chronological sorting when displaying history in modal',
                'Added delete buttons for entries in UI modal',
                'Added a message when there is no history',
                'Added user id in config file name for multi-user support',
                'Added check for ZeresPluginLibrary on launch',
                'Added check for direct file execution on launch',
                'Restructure internals',
                'Renamed to RemovedConnectionAlerts',
                'Added ESLint internally',
            ],
        },
    ],
};

let NoZLibrary;
if (!global.ZeresPluginLibrary) {
    const { BdApi } = window;
    NoZLibrary = () => ({
        getName() { return config.info.name; },
        getAuthor() { return config.info.authors.map((a) => a.name).join(', '); },
        getDescription() { return config.info.description; },
        getVersion() { return config.info.version; },
        load() {
            BdApi.UI.showConfirmationModal(
                'Library Missing',
                `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`,
                {
                    confirmText: 'Download Now',
                    cancelText: 'Cancel',
                    onConfirm: () => {
                        require('request').get('https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js', async (error, response, body) => {
                            if (error) return require('electron').shell.openExternal('https://betterdiscord.app/Download?id=9');
                            await new Promise((r) => require('fs').writeFile(require('path').join(BdApi.Plugins.folder, '0PluginLibrary.plugin.js'), body, r));
                        });
                    },
                },
            );
        },
        start() {},
        stop() {},
    });
}
/* eslint-enable max-len, global-require, consistent-return, no-promise-executor-return, import/no-unresolved */

module.exports = (!global.ZeresPluginLibrary) ? NoZLibrary : () => {
    const { Data, UI, Utils } = window.BdApi;
    const { createTooltip, showConfirmationModal } = UI;

    const {
        DiscordModules, DOMTools, Modals, Logger, PluginUpdater, Utilities,
    } = window.ZLibrary;
    const {
        React, Dispatcher, GuildStore, RelationshipStore, UserStore,
    } = DiscordModules;

    const subscribeTargets = [
        'FRIEND_REQUEST_ACCEPTED',
        'RELATIONSHIP_ADD',
        'RELATIONSHIP_UPDATE',
        'RELATIONSHIP_REMOVE',
        'GUILD_CREATE',
        'GUILD_UPDATE',
        'GUILD_DELETE',
    ];

    let rcaModalBtn;
    let rcaModalBtnRemoveObserver;
    let rcaModalEmptyMessage;
    let currentSavedData;
    let isUpdating = false;
    let hasViewErrorTriggered = false;
    let doDeleteBtnTooltipsExist = false;
    const isOlderFriendsShadeOpen = false;
    const isOlderGuildsShadeOpen = false;

    DOMTools.addStyle(config.info.name, `
    .rcaHistoryContainer {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 8px;
        overflow: auto;
        max-height: 75vh;
    }
    .rcaHistoryContainer::-webkit-scrollbar {
        display: none;
    }
    .rcaHistoryItem { /* avatar + item */
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        gap: 4px;
        padding: 4px 2px 4px 2px;
        /* border: 2px solid var(--header-primary); */
        /* border-radius: 5px; */
        margin: 1px;
    }
    .rcaHistoryAvatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 3px solid var(--header-primary);
        margin-right: 6px;
    }
    .rcaHistoryInfo {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        color: var(--header-primary);
    }
    .rcaHistoryHeader {
        font-size: 1.1rem;
        font-weight: 500;
        color: var(--header-primary);
    }
    .rcaHistoryDeleteBtn {
        display: flex;
        flex-direction: row-reverse;
        justify-content: end;
        align-items: center;
        flex-grow: 1;
        padding-right: 8px;
    }
    .rcaHistoryDeleteBtnIcon {
        top: 0px;
        width: 22px;
        border: var(--interactive-normal) solid 2px;
        border-radius: 50%;
    }
    .rcaModalEmptyMessage {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 16px;
    }
    .rcaModalEmptyMessageText {
        color: var(--header-primary);
        font-size: 1.5rem;
    }
    `);

    /* eslint-disable max-len */
    const CssClasses = {
        container: 'rcaHistoryContainer',
        item: 'rcaHistoryItem',
        avatar: 'rcaHistoryAvatar',
        info: 'rcaHistoryInfo',
        header: 'rcaHistoryHeader',
        logDeleteBtn: 'rcaHistoryDeleteBtn',
        logDeleteBtnIconLabel: 'rcaHistoryDeleteBtnIcon',
        logDeleteBtnIconClass: 'winButtonClose-3Q8ZH5 winButton-3UMjdg flexCenter-1Mwsxg flex-3BkGQD justifyCenter-rrurWZ alignCenter-14kD11 rcaHistoryDeleteBtnIcon',
        emptyMessage: 'rcaModalEmptyMessage',
        emptyMessageText: 'rcaModalEmptyMessageText',
        recentsIcon: 'recentsIcon-F3eO1o',
        toolbarIcon: 'iconWrapper-2awDjA clickable-ZD7xvu',
        voiceButton: 'button-1fGHAH',
    };

    const CssClassObjects = {
        logDeleteBtnSvg: {
            'aria-hidden': 'true',
            role: 'img',
            width: '12',
            height: '12',
            viewBox: '0 0 12 12',
        },
        logDeleteBtnPolygon: {
            fill: 'currentColor',
            'fill-rule': 'evenodd',
            points: '11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1',
        },
        modalBtn: {
            role: 'button',
            'aria-label': 'Removed Connection History',
            tabindex: '0',
        },
        modalBtnIcon: {
            x: '0',
            y: '0',
            class: 'icon-2xnN2Y',
            'aria-hidden': 'true',
            role: 'img',
            width: '24',
            height: '24',
            viewBox: '0 0 16 16',
        },
        modalBtnPath: {
            fill: 'currentColor',
            d: 'M1 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.146-2.854a.5.5 0 0 1 .708 0L14 6.293l1.146-1.147a.5.5 0 0 1 .708.708L14.707 7l1.147 1.146a.5.5 0 0 1-.708.708L14 7.707l-1.146 1.147a.5.5 0 0 1-.708-.708L13.293 7l-1.147-1.146a.5.5 0 0 1 0-.708z',
        },
    };

    const Constants = {
        emptyMessageText: 'Nothing to see here for now!',
        deleteBtnTooltipText: 'Ctrl+Shift+Click to permanently delete!',
        recentFriends: 'Recently removed friends',
        recentServers: 'Recently removed servers',
        olderFriends: 'History of removed friends',
        olderServers: 'History of removed servers',
        modalConfirm: 'Okay',
        modalCancel: 'Update cache',
        modalBtnTooltipText: 'Removal History',
        svgSourceSadge: 'http://www.w3.org/2000/svg',
        defaultdiscordAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
        changelogTitle: 'RemovedConnectionHistory Changelog',
    };

    /* eslint-enable max-len */

    const getCurrentUserId = () => UserStore.getCurrentUser().id;

    const getLastSavedVersion = () => {
        const savedConfig = Data.load(config.info.name, 'config');

        // if there is no savedConfig or local version is more up to date than last-seen version
        if (!savedConfig || PluginUpdater.defaultComparator(savedConfig?.version, config.info.version)) {
            const newConfig = {
                version: config.info.version,
            };

            Data.save(config.info.name, 'config', newConfig);
            return { version: config.info.version, showChangelog: true };
        }

        return { version: savedConfig.version, showChangelog: false };
    };

    const getSavedData = (currentUserId) => {
        const savedData = Data.load(`${config.info.name}_${currentUserId}`, 'savedData');
        if (!savedData) return undefined;

        const currentSavedDataInterpret = {
            friendCache: savedData.friendCache,
            guildCache: savedData.guildCache,
            friendCacheSet: new Set(savedData.friendCacheSet),
            guildCacheSet: new Set(savedData.guildCacheSet),
            removedFriendHistory: savedData.removedFriendHistory,
            removedGuildHistory: savedData.removedGuildHistory,
        };

        return currentSavedDataInterpret;
    };

    const setSavedData = (currentUserId) => {
        const currentSavedDataSnapshot = {
            friendCache: currentSavedData.friendCache,
            guildCache: currentSavedData.guildCache,
            friendCacheSet: Array.from(currentSavedData.friendCacheSet),
            guildCacheSet: Array.from(currentSavedData.guildCacheSet),
            removedFriendHistory: currentSavedData.removedFriendHistory,
            removedGuildHistory: currentSavedData.removedGuildHistory,
        };
        return Data.save(`${config.info.name}_${currentUserId}`, 'savedData', currentSavedDataSnapshot);
    };

    const getFriendsList = () => {
        const relationships = RelationshipStore.getFriendIDs();
        const friendsArr = {};
        const friendsSet = new Set();

        relationships.forEach((relationship) => {
            const user = UserStore.getUser(relationship.toString());
            if (user) {
                const animatedAvatarURL = user.getAvatarURL(null, null, true);
                const hasAnimatedAvatarURL = animatedAvatarURL.includes('gif');
                const filteredUser = {
                    id: user.id,
                    tag: `${user.username}#${user.discriminator}`,
                    avatar: user.avatar,
                    avatarURL: user.getAvatarURL(null, 40, false),
                    animatedAvatarURL: (hasAnimatedAvatarURL) ? animatedAvatarURL : undefined,
                };
                friendsArr[user.id] = filteredUser;
                friendsSet.add(user.id);
            }
        });

        return { friendsArr, friendsSet };
    };

    const getGuildsList = () => {
        const guilds = Object.values(GuildStore.getGuilds());
        const guildsArr = {};
        const guildsSet = new Set();

        guilds.forEach((guild) => {
            const owner = UserStore.getUser(guild.ownerId);
            const ownerName = (owner) ? `${owner.username}#${owner.discriminator}` : '';
            const filteredGuild = {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                avatarURL: guild.getIconURL(40, false),
                animatedAvatarURL: guild.getIconURL(null, true),
                joinedAt: guild.joinedAt,
                owner: ownerName,
                ownerId: guild.ownerId,
            };
            guildsArr[guild.id] = filteredGuild;
            guildsSet.add(guild.id);
        });

        return { guildsArr, guildsSet };
    };

    const populateEmptyCurrentSavedData = () => {
        const friendsList = getFriendsList();
        const guildsList = getGuildsList();
        currentSavedData.friendCache = friendsList.friendsArr;
        currentSavedData.guildCache = guildsList.guildsArr;
        currentSavedData.friendCacheSet = friendsList.friendsSet;
        currentSavedData.guildCacheSet = guildsList.guildsSet;

        // eslint-disable-next-line max-len
        Logger.info(config.info.name, `Caching ${friendsList.friendsSet.size} friends and ${guildsList.guildsSet.size} guilds`);
    };

    const initializeCurrentSavedData = (currentUserId) => {
        const savedDataInFile = getSavedData(currentUserId);
        const savedData = {
            friendCache: [],
            guildCache: [],
            friendCacheSet: new Set(),
            guildCacheSet: new Set(),
            removedFriendHistory: [],
            removedGuildHistory: [],
        };

        if (!savedDataInFile) {
            currentSavedData = savedData;
            populateEmptyCurrentSavedData();
        } else {
            currentSavedData = savedDataInFile;
        }
    };

    const compareAndUpdateCurrentSavedData = (currentUserId) => {
        if (isUpdating === true) return null;
        isUpdating = true;
        const removedFriends = [];
        const removedGuilds = [];
        try {
            const friends = getFriendsList();
            const guilds = getGuildsList();
            const cachedFriends = currentSavedData.friendCache;
            const cachedGuilds = currentSavedData.guildCache;
            const cachedFriendsSet = currentSavedData.friendCacheSet;
            const cachedGuildsSet = currentSavedData.guildCacheSet;
            const cachedFriendsDiffSet = new Set(cachedFriendsSet);
            const cachedGuildsDiffSet = new Set(cachedGuildsSet);

            // Find the IDs in OldSet but not in NewSet
            friends.friendsSet.forEach((id) => cachedFriendsDiffSet.delete(id));

            // contains all friends that are now not on the new list
            cachedFriendsDiffSet.forEach((oldFriendId) => {
                const oldFriend = cachedFriends[oldFriendId];
                if (oldFriend) {
                    const time = new Date();
                    oldFriend.timeRemoved = time;
                    removedFriends.push(oldFriend);
                }
            });

            // Find the IDs in OldSet but not in NewSet
            guilds.guildsSet.forEach((id) => cachedGuildsDiffSet.delete(id));

            // contains all friends that are now not on the new list
            cachedGuildsDiffSet.forEach((oldGuildId) => {
                const oldGuild = cachedGuilds[oldGuildId];
                if (oldGuild) {
                    const time = new Date();
                    oldGuild.timeRemoved = time;
                    removedGuilds.push(oldGuild);
                }
            });

            currentSavedData.friendCache = friends.friendsArr;
            currentSavedData.guildCache = guilds.guildsArr;
            currentSavedData.friendCacheSet = friends.friendsSet;
            currentSavedData.guildCacheSet = guilds.guildsSet;
            currentSavedData.removedFriendHistory.push(...removedFriends);
            currentSavedData.removedGuildHistory.push(...removedGuilds);
            setSavedData(currentUserId);

            const logStringFriends = `${removedFriends.length} new removed friends`;
            const logStringGuilds = `${removedGuilds.length} new removed guilds`;
            if (removedFriends.length && removedGuilds.length) {
                Logger.info(config.info.name, `Found ${logStringFriends} and ${logStringGuilds}`);
            } else if (removedFriends.length || removedGuilds.length) {
                const logStringVar = (removedFriends.length) ? logStringFriends : logStringGuilds;
                Logger.info(config.info.name, `Found ${logStringVar}`);
            }
        } catch (e) {
            Logger.stacktrace(config.info.name, 'Exception occurred while updating cache', e);
            throw e;
        } finally {
            isUpdating = false;
        }

        return { removedFriends, removedGuilds };
    };

    const createEmptyMessageElem = () => {
        rcaModalEmptyMessage = document.createElement('div');
        rcaModalEmptyMessage.setAttribute('class', CssClasses.emptyMessage);
        const rcaModalEmptyMessageText = document.createElement('p');
        rcaModalEmptyMessageText.setAttribute('class', CssClasses.emptyMessageText);
        rcaModalEmptyMessageText.innerHTML = Constants.emptyMessageText;
        rcaModalEmptyMessage.appendChild(rcaModalEmptyMessageText);
    };

    const deleteLogEntry = (deleteId, removedDate, isFriend) => {
        const workingHistory = (isFriend)
            ? currentSavedData.removedFriendHistory
            : currentSavedData.removedGuildHistory;

        const getTruncatedMsTime = (date) => {
            const dateInMsAsString = new Date(date).getTime().toString();
            return dateInMsAsString.substring(0, dateInMsAsString.length - 3);
        };

        const item = workingHistory.find(
            (i) => (i.id === deleteId)
            && (getTruncatedMsTime(i.timeRemoved) === getTruncatedMsTime(removedDate)),
        );
        workingHistory.splice(workingHistory.indexOf(item), 1);
        setSavedData(getCurrentUserId());

        const logEntry = document.getElementById(deleteId).parentElement;
        const prevEntry = logEntry.previousSibling;
        const nextEntry = logEntry.nextSibling;

        if (
            prevEntry.className === CssClasses.header
            && (!nextEntry || nextEntry.className === CssClasses.header)
        ) {
            if (logEntry.parentElement.children.length === 2) {
                if (!rcaModalEmptyMessage) createEmptyMessageElem();
                logEntry.parentElement.appendChild(rcaModalEmptyMessage);
            }
            prevEntry.remove();
        }
        logEntry.remove();
    };

    const createLogEntryDeleteBtn = (deleteId, removedDate, isFriend) => React.createElement('div', {
        className: CssClasses.logDeleteBtn,
        id: deleteId,
        onMouseEnter: () => {
            if (!doDeleteBtnTooltipsExist) {
                doDeleteBtnTooltipsExist = true;
                const deleteBtns = document.querySelectorAll(`.${CssClasses.logDeleteBtnIconLabel}`) || [];

                deleteBtns.forEach(
                    (elem) => createTooltip(elem, Constants.deleteBtnTooltipText, { style: 'info', side: 'right' }),
                );
            }
        },
    }, React.createElement('div', {
        className: CssClasses.logDeleteBtnIconClass,
        onClick: (e) => {
            if (e.ctrlKey && e.shiftKey) {
                deleteLogEntry(deleteId, removedDate, isFriend);
            }
        },
    }, React.createElement(
        'svg',
        CssClassObjects.logDeleteBtnSvg,
        React.createElement(
            'polygon',
            CssClassObjects.logDeleteBtnPolygon,
        ),
    )));

    const createServerLogEntry = ({
        avatarURL = Constants.defaultdiscordAvatar,
        serverName = 'error',
        ownerName = '',
        removedDate = '',
        id = '',
    }) => React.createElement(
        'div',
        {
            className: CssClasses.item,
        },
        React.createElement('img', {
            src: avatarURL,
            className: CssClasses.avatar,
        }),
        React.createElement(
            'div',
            {
                className: CssClasses.info,
            },
            React.createElement('h4', null, serverName),
            React.createElement('h4', null, `Owner: ${ownerName}`),
            React.createElement('h4', null, `Removed at: ${removedDate}`),
        ),
        createLogEntryDeleteBtn(id, removedDate, false),
    );

    const createFriendLogEntry = ({
        avatarURL = Constants.defaultdiscordAvatar,
        friendName = '',
        removedDate = '',
        id = '',
    }) => React.createElement(
        'div',
        {
            className: CssClasses.item,
        },
        React.createElement('img', {
            src: avatarURL,
            className: CssClasses.avatar,
        }),
        React.createElement(
            'div',
            {
                className: CssClasses.info,
            },
            React.createElement('h4', null, friendName),
            React.createElement('h4', null, `Removed at: ${removedDate}`),
        ),
        createLogEntryDeleteBtn(id, removedDate, true),
    );

    const createRecentServerEntries = (removedGuilds = []) => {
        if (removedGuilds.length === 0) return null;
        const removedGuildsAsElements = removedGuilds.map((g) => {
            let avatarURL = g.animatedAvatarURL || g.avatarURL;
            if (!g.icon) avatarURL = undefined;
            return createServerLogEntry({
                avatarURL,
                serverName: g.name,
                ownerName: g.owner,
                removedDate: new Date(g.timeRemoved).toLocaleString('ja-JP', {
                    timeZoneName: 'short',
                }),
                id: g.id,
            });
        });

        return removedGuildsAsElements;
    };

    const createRecentFriendEntries = (removedFriends = []) => {
        if (removedFriends.length === 0) return null;
        const removedFriendsAsElements = removedFriends.map((f) => {
            let avatarURL = f.animatedAvatarURL || f.avatarURL;
            if (!f.avatar) avatarURL = undefined;
            return createFriendLogEntry({
                avatarURL,
                friendName: f.tag,
                removedDate: new Date(f.timeRemoved).toLocaleString('ja-JP', {
                    timeZoneName: 'short',
                }),
                id: f.id,
            });
        });

        return removedFriendsAsElements;
    };

    const createOlderFriendEntries = (removedFriends = []) => {
        // wrap createRecentFriendEntries and h4 header in a collapsible div?
    };

    const splitHistoryBasedOnTimeRemoved = (history = [], time = 0) => {
        let elemsMoreThan24HoursIndex = 0;
        let wasCurrOlderThan24Hours = false;

        if (history.length === 0) return { recentElems: [], olderElems: [] };

        const yesterdayTimestamp = new Date().getTime() - time;
        while (elemsMoreThan24HoursIndex < history.length) {
            const curr = new Date(history[elemsMoreThan24HoursIndex].timeRemoved);
            const currTimestamp = curr.getTime();
            wasCurrOlderThan24Hours = (yesterdayTimestamp > currTimestamp);
            if (wasCurrOlderThan24Hours) break;
            elemsMoreThan24HoursIndex += 1;
        }

        let recentElems = [];
        let olderElems = [];
        if (history.length > 1) {
            recentElems = history.slice(0, elemsMoreThan24HoursIndex);

            // if there is a history and the loop didn't repeat till the end of the array (found an element older than 24 hours)
            if (elemsMoreThan24HoursIndex !== history.length) {
                olderElems = history.slice(elemsMoreThan24HoursIndex);
            }

            return { recentElems, olderElems };
        }

        // history is length 1
        if (wasCurrOlderThan24Hours) {
            olderElems = history;
        } else {
            recentElems = history;
        }

        return { recentElems, olderElems };
    };

    const openHistoryWindow = () => {
        const recentFriendHistory = [...currentSavedData.removedFriendHistory];
        const recentGuildHistory = [...currentSavedData.removedGuildHistory];

        let element;

        if (recentFriendHistory.length === 0 && recentGuildHistory.length === 0) {
            if (!rcaModalEmptyMessage) createEmptyMessageElem();
            element = document.createElement('div');
            element.setAttribute('class', CssClasses.container);
            element.appendChild(rcaModalEmptyMessage);

            element = React.createElement(
                'div',
                {
                    className: CssClasses.container,
                    dangerouslySetInnerHTML: { __html: element.outerHTML },
                },
            );
        } else {
            Utilities.stableSort(recentFriendHistory, (a, b) => (new Date(b.timeRemoved) - new Date(a.timeRemoved)));
            Utilities.stableSort(recentGuildHistory, (a, b) => (new Date(b.timeRemoved) - new Date(a.timeRemoved)));

            const DAY_IN_MS = (24 * 60 * 60 * 1000); // TODO: variable?
            const recentFriends = splitHistoryBasedOnTimeRemoved(recentFriendHistory, DAY_IN_MS);
            const recentGuilds = splitHistoryBasedOnTimeRemoved(recentGuildHistory, DAY_IN_MS);

            element = React.createElement(
                'div',
                {
                    className: CssClasses.container,
                },
                recentFriends.recentElems.length
                    ? [
                        React.createElement('h3', {
                            className: CssClasses.header,
                        }, Constants.recentFriends),
                        createRecentFriendEntries(recentFriends.recentElems),
                    ]
                    : null,
                recentGuilds.recentElems.length
                    ? [
                        React.createElement('h3', {
                            className: CssClasses.header,
                        }, Constants.recentServers),
                        createRecentServerEntries(recentGuilds.recentElems),
                    ]
                    : null,

                recentFriends.olderElems.length
                    ? [
                        React.createElement('h4', {
                            className: CssClasses.header,
                        }, Constants.olderFriends),
                        ...createRecentFriendEntries(recentFriends.olderElems),
                    ]
                    : null,
                recentGuilds.olderElems.length
                    ? [
                        React.createElement('h4', {
                            className: CssClasses.header,
                        }, Constants.olderServers),
                        ...createRecentServerEntries(recentGuilds.olderElems),
                    ]
                    : null,
            );
        }

        showConfirmationModal(config.info.name, element, {
            confirmText: Constants.modalConfirm,
            cancelText: Constants.modalCancel,
            onConfirm: () => {},
            onCancel: () => {
                try {
                    const res = compareAndUpdateCurrentSavedData(getCurrentUserId());
                    UI.showToast('Updated cache successfully!', { type: 'success' });
                } catch (e) {
                    UI.showToast('Cache failed to update', { type: 'error' });
                }
            },
        });

        doDeleteBtnTooltipsExist = false;
    };

    // original code from https://github.com/BetterDiscord/BetterDiscord/blob/9e0f274b504d155b73c4c3148df5173bd8fad3bc/renderer/src/modules/dommanager.js#L182
    const onRemovedPersistent = (node, callback) => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((_, m) => {
                const mutation = mutations[m];
                const nodes = Array.from(mutation.removedNodes);
                const directMatch = nodes.indexOf(node) > -1;
                const parentMatch = nodes.some((parent) => parent.contains(node));
                if (directMatch || parentMatch) {
                    callback();
                }
            });
        });

        observer.observe(document.body, { subtree: true, childList: true });
        return () => { observer.disconnect(); };
    };

    const getChannelHeaderInboxIcon = () => document.querySelector(`.${CssClasses.recentsIcon}`);

    const isHelpIconInChannelHeader = (inboxIcon) => inboxIcon.nextSibling?.className.includes('anchor');

    const insertButtonAtLocationWithStyle = () => {
        try {
            const channelHeaderInboxIcon = getChannelHeaderInboxIcon();
            const isHelpIconPresent = isHelpIconInChannelHeader(channelHeaderInboxIcon);
            const rcaModalBtnClassName = Utils.className(
                { [CssClasses.voiceButton]: (!isHelpIconPresent) },
                CssClasses.toolbarIcon,
            );
            rcaModalBtn.setAttribute('class', rcaModalBtnClassName);
            channelHeaderInboxIcon.parentElement.insertBefore(rcaModalBtn, channelHeaderInboxIcon);
            hasViewErrorTriggered = false;
        } catch (e) {
            Logger.stacktrace(config.info.name, 'View does not contain anchorable elements', e);
            hasViewErrorTriggered = true;
        }
    };

    const setupButtonUI = () => {
        rcaModalBtn = document.createElement('div');
        Object.entries(CssClassObjects.modalBtn).forEach(([key, value]) => rcaModalBtn.setAttribute(key, value));
        const rcaModalBtnIcon = document.createElementNS(Constants.svgSourceSadge, 'svg');
        Object.entries(CssClassObjects.modalBtnIcon).forEach(
            ([key, value]) => rcaModalBtnIcon.setAttribute(key, value),
        );
        const rcaModalBtnPath = document.createElementNS(Constants.svgSourceSadge, 'path');
        Object.entries(CssClassObjects.modalBtnPath).forEach(
            ([key, value]) => rcaModalBtnPath.setAttribute(key, value),
        );

        rcaModalBtn.addEventListener('click', () => openHistoryWindow());

        rcaModalBtnIcon.appendChild(rcaModalBtnPath);
        rcaModalBtn.appendChild(rcaModalBtnIcon);

        insertButtonAtLocationWithStyle();
        createTooltip(rcaModalBtn, Constants.modalBtnTooltipText, { side: 'bottom' });
    };

    const update = () => {
        const res = compareAndUpdateCurrentSavedData(getCurrentUserId());
        if (res && (res.removedFriends.length > 0 || res.removedGuilds.length > 0)) {
            openHistoryWindow();
        }
    };

    return ({
        getName() { return config.info.name; },
        getAuthor() { return config.info.authors.map((a) => a.name).join(', '); },
        getDescription() { return config.info.description; },
        getVersion() { return config.info.version; },
        start() {
            Logger.info(config.info.name, `version ${config.info.version} has started.`);
            const lastSavedVersion = getLastSavedVersion();
            if (lastSavedVersion.showChangelog) {
                Modals.showChangelogModal(
                    Constants.changelogTitle,
                    lastSavedVersion.version,
                    config.changelog,
                );
            }
            PluginUpdater.checkForUpdate(config.info.name, lastSavedVersion.version, config.info.github_raw);

            initializeCurrentSavedData(getCurrentUserId());

            setupButtonUI();

            rcaModalBtnRemoveObserver = onRemovedPersistent(rcaModalBtn, () => {
                insertButtonAtLocationWithStyle();
            });

            subscribeTargets.forEach((e) => Dispatcher.subscribe(e, update));
        },
        stop() {
            rcaModalBtnRemoveObserver();
            rcaModalBtn.remove();
            rcaModalBtnRemoveObserver = undefined;
            rcaModalEmptyMessage = undefined;
            currentSavedData = undefined;
            isUpdating = undefined;
            hasViewErrorTriggered = undefined;
            doDeleteBtnTooltipsExist = undefined;

            subscribeTargets.forEach((e) => Dispatcher.unsubscribe(e, update));
        },
        onSwitch() {
            if (hasViewErrorTriggered === false) return;
            Logger.warn(config.info.name, 'Attempting to re-render button');
            insertButtonAtLocationWithStyle();
        },
    });
};
// eslint-disable-next-line spaced-comment
/*@end@*/
