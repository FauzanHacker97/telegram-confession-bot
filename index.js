const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

// === ENVIRONMENT VARIABLES ===
const TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const BOT_USERNAME = process.env.BOT_USERNAME || "@Whisperroombot";
const BOT_ID = process.env.BOT_ID || "7141908877";

// === BAN STORAGE ===
const BAN_FILE = "banned.json";
let bannedUsers = new Set();

if (fs.existsSync(BAN_FILE)) {
  try {
    bannedUsers = new Set(JSON.parse(fs.readFileSync(BAN_FILE, "utf8")));
  } catch (err) {
    console.error("❌ Failed to read banned.json:", err.message);
  }
}

function saveBans() {
  fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedUsers]));
}

// === BOT HANDLER ===
app.get("/", (req, res) => {
  res.send("🤖 Confession Bot is running");
});

app.post("/", async (req, res) => {
  const body = req.body;

  // === BUTTON CALLBACKS ===
  if (body.callback_query) {
    const query = body.callback_query;
    const fromAdmin = query.from.id === ADMIN_ID;

    // ✅ Ban logic
    if (fromAdmin && query.data.startsWith("ban:")) {
      const [_, bannedId, bannedUsername] = query.data.split(":");
      const parsedId = parseInt(bannedId);

      if (parsedId === ADMIN_ID) {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: query.id,
          text: "❌ You cannot ban yourself!",
          show_alert: true,
        });
        return res.sendStatus(200);
      }

      bannedUsers.add(parsedId);
      saveBans();

      const banMessage = `👤 #BANNED_USER

Bot: ${BOT_USERNAME} [ ${BOT_ID} ]
User ID: ${bannedId}
Name: @${bannedUsername}`;

      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHANNEL_ID,
        text: banMessage,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔓 Unban",
                callback_data: `unban:${bannedId}`,
              },
            ],
          ],
        },
      });

      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `✅ User @${bannedUsername} has been banned.`,
      });

      return res.sendStatus(200);
    }

    // ✅ Unban logic
    if (fromAdmin && query.data.startsWith("unban:")) {
      const [, unbanId] = query.data.split(":");
      const parsedId = parseInt(unbanId);

      if (!bannedUsers.has(parsedId)) {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: query.id,
          text: "ℹ️ User is not banned.",
        });
        return res.sendStatus(200);
      }

      bannedUsers.delete(parsedId);
      saveBans();

      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: query.id,
        text: `✅ User ${parsedId} unbanned.`,
      });

      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHANNEL_ID,
        text: `🔓 #UNBANNED_USER\nUser ID: ${parsedId} has been unbanned.`,
      });

      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  }

  const msg = body.message;
  if (!msg) return res.sendStatus(200);

  const userId = msg.from?.id;
  const username = msg.from?.username || "unknown";
  const text = msg.text || msg.caption || "";

  // === /unban command ===
  if (msg.text && msg.text.startsWith("/unban") && msg.from.id === ADMIN_ID) {
    const parts = msg.text.split(" ");
    if (parts.length !== 2) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: ADMIN_ID,
        text: "❌ Usage: /unban <user_id>",
      });
      return res.sendStatus(200);
    }

    const unbanId = parseInt(parts[1]);
    if (bannedUsers.has(unbanId)) {
      bannedUsers.delete(unbanId);
      saveBans();

      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: ADMIN_ID,
        text: `✅ User ${unbanId} has been unbanned.`,
      });

      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHANNEL_ID,
        text: `🔓 #UNBANNED_USER\nUser ID: ${unbanId} has been unbanned.`,
      });
    } else {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: ADMIN_ID,
        text: `ℹ️ User ${unbanId} is not banned.`,
      });
    }

    return res.sendStatus(200);
  }

  // === BLOCK BANNED USERS ===
  if (bannedUsers.has(userId)) {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: userId,
      text: "🚫 You are banned from sending confessions.",
    });
    return res.sendStatus(200);
  }

  // === CONFESSION: TEXT ===
  if (msg.text) {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHANNEL_ID,
      text: `${msg.text}`,
    });

    if (userId !== ADMIN_ID) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: ADMIN_ID,
        text: `📬 Confession from @${username} (${userId}):\n\n${msg.text}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚫 Ban",
                callback_data: `ban:${userId}:${username}`,
              },
            ],
          ],
        },
      });
    }

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: userId,
      text: "✅ Your confession has been sent anonymously.",
    });

    return res.sendStatus(200);
  }

  // === CONFESSION: PHOTO ===
  if (msg.photo) {
    const photo = msg.photo.at(-1).file_id;

    await axios.post(`${TELEGRAM_API}/sendPhoto`, {
      chat_id: CHANNEL_ID,
      photo,
      caption: msg.caption || "",
    });

    if (userId !== ADMIN_ID) {
      await axios.post(`${TELEGRAM_API}/sendPhoto`, {
        chat_id: ADMIN_ID,
        photo,
        caption: `📷 Photo confession from @${username} (${userId})`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚫 Ban",
                callback_data: `ban:${userId}:${username}`,
              },
            ],
          ],
        },
      });
    }

    return res.sendStatus(200);
  }

  // === CONFESSION: DOCUMENT ===
  if (msg.document) {
    await axios.post(`${TELEGRAM_API}/sendDocument`, {
      chat_id: CHANNEL_ID,
      document: msg.document.file_id,
      caption: msg.caption || "",
    });

    if (userId !== ADMIN_ID) {
      await axios.post(`${TELEGRAM_API}/sendDocument`, {
        chat_id: ADMIN_ID,
        document: msg.document.file_id,
        caption: `📁 File confession from @${username} (${userId})`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚫 Ban",
                callback_data: `ban:${userId}:${username}`,
              },
            ],
          ],
        },
      });
    }

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// === RUN SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Confession Bot is running on port ${PORT}`);
});

