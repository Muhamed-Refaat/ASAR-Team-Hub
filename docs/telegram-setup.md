# Connect the ASAR team Telegram group

The hub prepares announcements for newly created tasks, meetings and courses. Saving an event never posts it automatically. Members can open **Preview Telegram**; only an enabled admin can confirm **Send to Telegram**. Setup does not send a test message.

## 1. Create your bot

Open [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, and follow the prompts for its name and username. Copy the token privately. Keep the token out of chat, source files, spreadsheets and browser code. Telegram documents this process in its [bot tutorial](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

## 2. Add it to the team group

Open [your team group](https://web.telegram.org/k/#-4488318175) and add the bot by its username. Allow it to send messages. Ordinary group membership is enough if the group permits members to post; grant additional permission only if your group's restrictions require it. You do not need to disable the bot's privacy mode.

The supplied Telegram Web URL suggests chat ID **`-4488318175`**. Setup verifies that ID using Telegram's API; the URL alone does not prove the bot can access it. If Telegram says the chat is unavailable, check the bot's membership and use the discovery step below. A group converted to a supergroup can have a different ID.

## 3. Configure Apps Script

Replace your deployed project's `Code.gs` and `Index` with this repository's generated `Code.gs` and `Index.html`. Keep your live spreadsheet and existing data.

In **Apps Script → Project Settings → Script properties**, add:

| Property | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The private token from BotFather |
| `TELEGRAM_CHAT_ID` | `-4488318175`, verified during setup |
| `TELEGRAM_HUB_URL` | Your deployed hub URL ending in `/exec`; optional if Apps Script already reports the correct deployment URL |

Save the properties. In the script editor, select **`setupTelegramNotifications`** and click **Run**, signed in with an enabled admin account from the `Admins` sheet. Approve the requested Google authorization for external requests and managing the delivery trigger. Setup verifies the bot, group and posting permissions, then installs one trigger that checks the queue every minute. Use this same installer account for future setup runs; do not create a second trigger manually. [Google explains installable triggers and their account ownership](https://developers.google.com/apps-script/guides/triggers/installable).

If the returned result is not displayed by the editor, run this temporary helper in the editor to display only the safe setup result, then remove it:

```javascript
function showTelegramSetupResult() {
  console.log(JSON.stringify(setupTelegramNotifications()));
}
```

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

1. In the deployed hub, create a task, meeting or course and wait for **Saved**.
2. Choose **Preview Telegram** from the save notice or event card. The preview shows the exact message and optional **Open Team Hub** button. Closing it sends nothing.
3. Check the destination and content, then choose **Send to Telegram** as an admin.
4. The card first shows **Telegram: Queued**. The worker delivers it in the background, usually within a minute; larger queues take longer. Refresh the hub to see **Sent**, or open **Activity → Telegram announcements** for status and request details. Confirm the message appeared in the intended group.

Announcements use the event title, date/deadline, assignees, description, creator and safe meeting/course link. A message preview expires after ten minutes. Editing the event or changing the destination invalidates an unsent preview, so reopen it before confirming. Queued and sent messages retain the exact approved text; repeated clicks or retries of the same queue request do not post duplicates. Edits, completions and imported history are not automatically announced. Announcements created before this integration was installed do not appear as new events.

The existing **Activity** sheet holds the durable queue and delivery history; no new sheet or workbook import is needed. Keep Activity rows intact. Telegram errors cannot undo a saved event. The worker spaces messages, sends at most five per run, and honors Telegram's `retry_after` on rate limits. Telegram publishes its [messaging limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).

If an attempt is **Unconfirmed**, check the group before retrying: Telegram may have accepted the message before the connection failed. The hub does not automatically resend ambiguous deliveries. A retry requires opening the preview and confirming again. Failed attempts remain in Activity, and token-bearing request URLs and raw API errors are never returned to members.

Run **`pauseTelegramNotifications`** from an enabled admin account to pause delivery; queued announcements remain intact. Run setup again from the original installer account to resume. An already dispatched request can finish while delivery is being paused. Removing the installer from enabled Admins stops future delivery until setup is restored under an authorized installer.

To transfer installation to another admin, have the original installer remove their `hubTelegramWorker_` trigger from Apps Script's Triggers screen, clear `TELEGRAM_INSTALLER_EMAIL` in Script Properties, and run setup from the new enabled admin's account. The shared queue and its history remain intact.

Local HTML previews never contact Telegram. Automated tests use a fake Telegram API; a live group delivery is verified only by completing step 4 with your own bot.
