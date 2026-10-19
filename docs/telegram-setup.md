# Connect the ASAR team Telegram group

The hub prepares announcements for saved courses (including courses imported from the sheet), newly created tasks and meetings. Saving an event never posts it automatically. Members can open **Preview Telegram**; only an enabled admin can confirm **Send to Telegram**. Setup does not send a test message.

Current authorized destination: **ASAR**, the production supergroup, with Bot API chat ID **`-1004488318175`**. On 2026-10-19, read-only Bot API checks verified the destination, enabled configuration and membership of **ASAR_Hub_bot**, without posting a message. The optional private test group has ID `-5382073850`.

Messages use emoji headings, bold titles and labels, readable Cairo dates, concise assignments, an event-specific closing line and a **🚀 Open Team Hub** button. Telegram formatting entities preserve literal member/event text, so angle brackets and Markdown characters cannot become formatting commands. The in-app preview shows the same styles. Historical plain-text deliveries retain their original appearance.

The production hub is [here](https://script.google.com/macros/s/AKfycby4nbyhOS4HKGrCE7ClLjXd6H3TO99Pey3qz4NSIPZutT_UDxxmolOk3bPF9ChycIrjxw/exec). Use `/exec` for the team; `/dev` runs the latest editor code and is intended for project editors.


## 1. Create your bot

Open [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, and follow the prompts for its name and username. Copy the token privately. Keep the token out of chat, source files, spreadsheets and browser code. Telegram documents this process in its [bot tutorial](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

## 2. Add it to the destination group

Open [your team group](https://web.telegram.org/k/#-4488318175) and add the bot by its username. Allow it to send messages. Ordinary group membership is enough if the group permits members to post; grant additional permission only if your group's restrictions require it. You do not need to disable the bot's privacy mode.

The testing destination is a **basic group**, so its Bot API ID is `-5382073850` with no `-100` prefix. The ASAR production group is a **supergroup**. Its verified Bot API chat ID is **`-1004488318175`**. Telegram Web shows `#-4488318175`, which is its internal peer ID; do not copy that shorter number into Script Properties. The bot must also be a member with permission to post.

## 3. Configure Apps Script

Replace your deployed project's `Code.gs` and `Index` with this repository's generated `Code.gs` and `Index.html`. Keep your live spreadsheet and existing data.

In **Apps Script → Project Settings → Script properties**, add:

| Property | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The private token from BotFather |
| `TELEGRAM_CHAT_ID` | `-1004488318175` for the authorized ASAR production group; `-5382073850` for optional isolated testing |
| `TELEGRAM_HUB_URL` | Your deployed hub URL ending in `/exec`; optional if Apps Script already reports the correct deployment URL |

Use the **gear icon in the left sidebar**, scroll to **Script Properties**, click **Add script property**, enter each property name in the left field and its value in the right field, then click **Save script properties**. These are settings, so searching for the property names in `Code.gs` does not configure them. Keep the token out of source code.

In the script editor, select **`setupTelegramNotifications`** and click **Run**, signed in with an enabled admin account from the `Admins` sheet. Approve the requested Google authorization for external requests and managing the delivery trigger. Setup verifies the bot, group and posting permissions, then installs one trigger that checks the queue every minute. Use this same installer account for future setup runs; do not create a second trigger manually. [Google explains installable triggers and their account ownership](https://developers.google.com/apps-script/guides/triggers/installable).

After setup finishes, **Execution log** prints `Telegram connected to ASAR (-1004488318175). Delivery trigger installed; no message sent during setup.` If you see an authorization prompt, review the permissions for your own ASAR script and complete authorization, then check for this success message. Setup itself sends no announcement.

Create a new deployment version after updating the files. Keep **Execute as: User accessing the web app** and the existing signed-in access settings. Reauthorize the web app if Google requests the new permissions. Never change authentication to work around a missing active-user email.

If your project's manifest lists OAuth scopes manually, include `https://www.googleapis.com/auth/script.external_request` and `https://www.googleapis.com/auth/script.scriptapp` alongside its existing scopes. Otherwise Apps Script detects the required permissions from the code.

If the group ID needs discovery, send `/start@YourBotUsername` in the group after adding the bot. Run this helper in the editor:

```javascript
function showTelegramGroups() {
  console.log(JSON.stringify(findTelegramGroups()));
}
```

It displays only group IDs/titles from recent bot updates, with no incoming message contents or token. Copy the correct group's ID into `TELEGRAM_CHAT_ID` and run setup again. This assumes a fresh bot without another application's webhook; keep an existing bot's webhook intact. Telegram describes [getUpdates](https://core.telegram.org/bots/api#getupdates) and [sendMessage](https://core.telegram.org/bots/api#sendmessage) in its Bot API reference.

## 4. Preview and send the first announcement

1. In the deployed hub, select an existing learning course, or create a task, meeting or course and wait for the small sync indicator beside **Refresh** to clear.
2. Choose **Preview Telegram** from the saved event card. Content appears immediately from the current snapshot while the server verifies the latest message, destination and sending permission. The optional **Open Team Hub** button is included. Closing it sends nothing; Send stays disabled until verification succeeds.
3. Check the destination and content, then choose **Send to Telegram** as an admin.
4. The card first shows **Telegram: Queued**. The worker delivers it in the background, usually within a minute; larger queues take longer. Refresh the hub to see **Sent**, or open **Activity → Telegram announcements** for status and request details. Confirm the message appeared in the intended group.

Announcements use the event title, date/deadline, assignees, description, recorded creator when available, and safe meeting/course link. A message preview expires after ten minutes. Editing the event or changing the destination invalidates an unsent preview, so reopen it before confirming. Queued and sent messages retain the exact approved text; repeated clicks or retries of the same queue request do not post duplicates. Edits, completions and imported history are not automatically announced. Imported learning courses are eligible for manual previews and announcements. Tasks and meetings still need their saved creation record.

The existing **Activity** sheet holds the durable queue and delivery history; no new sheet or workbook import is needed. Keep Activity rows intact. Announcements are tracked per event and destination, so testing does not consume the later production announcement. Changing destination invalidates previews and prevents old queued messages from being rerouted. Deleting an event cancels its queued announcements; messages already dispatched may finish. Telegram errors cannot undo a saved event. The worker spaces messages, sends at most five per run, and honors Telegram's `retry_after` on rate limits. Telegram publishes its [messaging limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).

If an attempt is **Unconfirmed**, check the group before retrying: Telegram may have accepted the message before the connection failed. The hub does not automatically resend ambiguous deliveries. A retry requires opening the preview and confirming again. Failed attempts remain in Activity, and token-bearing request URLs and raw API errors are never returned to members.

Run **`pauseTelegramNotifications`** from an enabled admin account to pause delivery; queued announcements remain intact. Run setup again from the original installer account to resume. An already dispatched request can finish while delivery is being paused. Removing the installer from enabled Admins stops future delivery until setup is restored under an authorized installer.

To transfer installation to another admin, have the original installer remove their `hubTelegramWorker_` trigger from Apps Script's Triggers screen, clear `TELEGRAM_INSTALLER_EMAIL` in Script Properties, and run setup from the new enabled admin's account. The shared queue and its history remain intact.

Local HTML previews never contact Telegram. Automated tests use a fake Telegram API; a live group delivery is verified only by completing step 4 with your own bot.
