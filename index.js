const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHANNEL_ID;

app.get("/", (req, res) => {
  res.send("Confession bot is running 🔥");
});

app.post("/", async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  try {
    if (msg.photo) {
      const photo = msg.photo.at(-1).file_id;
      await axios.post(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
        chat_id: CHAT_ID,
        photo: photo,
        caption: msg.caption || "",
      });
    } else if (msg.document) {
      await axios.post(`https://api.telegram.org/bot${TOKEN}/sendDocument`, {
        chat_id: CHAT_ID,
        document: msg.document.file_id,
        caption: msg.caption || "",
      });
    } else if (msg.text) {
      await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: msg.text,
      });
    }
  } catch (error) {
    console.error("Error sending to Telegram:", error.message);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Confession Bot running on port " + PORT);
});
