/*
Copyright 2019 New Vector Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { LogService, MatrixClient, MentionPill, RichConsoleLogger, SimpleFsStorageProvider } from "matrix-bot-sdk";
import * as path from "path";
import config from "./config";
import * as GitHub from "github-api";
import "moment-recur";
import moment = require("moment");

// @ts-ignore
const INTERVAL = moment(config.startDate).recur().every(config.recurWeeks).weeks();
const SPAM_HOUR = 10;
const LAST_SPAM_EVENT_TYPE = "im.vector.last_spam";

LogService.setLogger(new RichConsoleLogger());

const github = new GitHub({token: config.githubToken});
const ghOrg = github.getOrganization(config.projectOwner);

const storage = new SimpleFsStorageProvider(path.join(config.dataPath, "bot.json"));
const client = new MatrixClient(config.homeserverUrl, config.accessToken, storage);
let noticeRoomId = null;

let userId = null;
let displayName = null;
let localpart = null;
let retroProject;

(async function () {
    const {data: projects} = await ghOrg.listProjects();
    for (const project of projects) {
        if (project.html_url.endsWith("/" + config.projectId)) {
            retroProject = github.getProject(project.id);
            break;
        }
    }
    if (!retroProject) {
        throw new Error("Missing retro project");
    }

    noticeRoomId = await client.resolveRoom(config.noticeRoom);
    const joinedRooms = await client.getJoinedRooms();
    if (!joinedRooms.includes(noticeRoomId)) {
        noticeRoomId = await client.joinRoom(config.noticeRoom);
    }

    setInterval(onTick, 30 * 60 * 1000); // 30 min
    onTick(); // call immediately

    client.on("room.message", onMessage);

    userId = await client.getUserId();
    localpart = userId.split(':')[0].substring(1);

    const profile = await client.getUserProfile(userId);
    displayName = profile ? profile['displayname'] : null;

    client.start().then(() => LogService.info("index", "Bot started"));
})();

async function onTick() {
    const now = moment();
    if (now.hour() === SPAM_HOUR && INTERVAL.matches(now)) {
        let doSpam = true;
        try {
            const event = await client.getAccountData(LAST_SPAM_EVENT_TYPE);
            const last = moment(event['last_timestamp']);
            if (moment().diff(last, 'days') < 5) {
                doSpam = false;
            }
        } catch (e) {
            console.error(e);
            // Assume we want to spam
        }
        if (!doSpam) return;
        const actions = await convertActionsToMessages(await getActionTexts());
        for (const action of actions) {
            await client.sendMessage(noticeRoomId, action);
        }
        await client.setAccountData(LAST_SPAM_EVENT_TYPE, {last_timestamp: moment().format()})
    }
}

async function onMessage(roomId: string, event: any) {
    if (roomId !== noticeRoomId) return;
    if (!event['content']) return;

    const content = event['content'];
    if (content['msgtype'] === "m.text" && content['body']) {
        const prefixes = ["!retro", localpart + ":", displayName + ":", userId + ":"];
        const prefixUsed = prefixes.find(p => content['body'].startsWith(p));
        if (!prefixUsed) return;

        // rewrite the command for easier parsing
        event['content']['body'] = "!retro" + content['body'].substring(prefixUsed.length);

        await client.sendReadReceipt(roomId, event['event_id']);
        return handleCommand(roomId, event);
    }
}

async function handleCommand(roomId: string, event: any) {
    const args = event['content']['body'].split(' ');

    if (args.length > 0) {
        if (args[1] === 'actions') {
            const actions = await convertActionsToMessages(await getActionTexts());
            if (actions.length > 0) {
                for (const action of actions) {
                    action['msgtype'] = 'm.notice'; // to prevent spam from commands
                    await client.sendMessage(roomId, action);
                }
            } else {
                await client.sendNotice(roomId, "No actions 🎉");
            }
            return;
        }
    }

    // else, show help
    const help = "Help:\n" +
        "!retro actions - Print current retro actions\n";
    await client.sendNotice(roomId, help);
}

async function getActionTexts(): Promise<string[]> {
    const {data: columns} = await retroProject.listProjectColumns();
    const column = columns.find(c => c.name === config.columnName);
    const {data: cards} = await retroProject.listColumnCards(column.id);
    return cards.map(c => c.note);
}

async function convertActionsToMessages(actions: string[]): Promise<any[]> {
    const messages = [];
    for (const action of actions) {
        const parts = action.replace(/:/g, '').split(' ');
        const pills = [];
        let partsTaken = 0;
        for (const part of parts) {
            // TODO: Enable this feature?
            // if (part.toUpperCase() === 'ALL' || part.toUpperCase() === 'ALL.') {
            //     for (const userId of Object.values(config.initials)) {
            //         pills.push(await MentionPill.forUser(userId, noticeRoomId, client));
            //     }
            //     partsTaken++;
            //     continue;
            // }
            const userId = config.initials[part.toUpperCase()];
            if (!userId) break;
            pills.push(await MentionPill.forUser(userId, noticeRoomId, client));
            partsTaken++;
        }

        const rebuiltMessage = action.split(' ').slice(partsTaken).join(' ');

        if (pills.length <= 0) pills.push({text: "⚠ UNASSIGNED ⚠", html: "⚠ UNASSIGNED ⚠"});

        const actionHtml = `${pills.map(p => p.html).join(' ')} ${rebuiltMessage}`;
        const actionText = `${pills.map(p => p.text).join(' ')} ${rebuiltMessage}`;

        const msgtype = rebuiltMessage.includes('✔') ? 'm.notice' : 'm.text';

        messages.push({
            body: actionText,
            msgtype: msgtype,
            format: "org.matrix.custom.html",
            formatted_body: actionHtml,
        });
    }
    return messages;
}
