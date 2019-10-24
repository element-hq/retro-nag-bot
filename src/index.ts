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

import { LogService, MatrixClient, RichConsoleLogger, SimpleFsStorageProvider } from "matrix-bot-sdk";
import * as path from "path";
import config from "./config";

LogService.setLogger(new RichConsoleLogger());

const storage = new SimpleFsStorageProvider(path.join(config.dataPath, "bot.json"));
const client = new MatrixClient(config.homeserverUrl, config.accessToken, storage);
let noticeRoomId = null;

let userId = null;
let displayName = null;
let localpart = null;

(async function () {
    noticeRoomId = await client.resolveRoom(config.noticeRoom);
    const joinedRooms = await client.getJoinedRooms();
    if (!joinedRooms.includes(noticeRoomId)) {
        noticeRoomId = await client.joinRoom(config.noticeRoom);
    }

    client.on("room.message", onMessage);

    userId = await client.getUserId();
    localpart = userId.split(':')[0].substring(1);

    const profile = await client.getUserProfile(userId);
    displayName = profile ? profile['displayname'] : null;

    client.start().then(() => LogService.info("index", "Bot started"));
})();

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
        if (args[1] === 'status') {
            // TODO
        }
    }

    // else, show help
    const help = "Help:\n" +
        "!retro actions - Print current retro actions\n";
    await client.sendNotice(roomId, help);
}
