/**
 * mock-telegram.mjs — سيرفر تيليجرام وهمي للاختبار المحلي فقط.
 * يسجّل كل رسالة صادرة حتى نتحقق من سلوك البوت دون لمس تيليجرام الحقيقي.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_TG_PORT || 4001);

/** حالة قابلة للتحكم من الاختبار */
export const state = {
  sent: [],
  memberships: {}, // { "@chan": "left" | "member" }
  webhookUrl: "",
  botId: 424242,
  botUsername: "ChinwiTestBot",
  nextMessageId: 1000,
};

const json = (res, body, status = 200) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/__state" && req.method === "GET") return json(res, state);
  if (url.pathname === "/__reset" && req.method === "POST") {
    state.sent = [];
    return json(res, { ok: true });
  }
  if (url.pathname === "/__membership" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body || "{}");
    state.memberships = { ...state.memberships, ...data };
    return json(res, { ok: true, memberships: state.memberships });
  }

  const match = /^\/bot[^/]+\/([A-Za-z]+)$/.exec(url.pathname);
  if (!match) return json(res, { ok: false, description: "Not Found" }, 404);
  const method = match[1];

  let payload = {};
  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const type = req.headers["content-type"] || "";
    if (type.includes("application/json")) {
      try {
        payload = JSON.parse(raw.toString() || "{}");
      } catch {
        payload = {};
      }
    } else {
      payload = { __multipart: true, size: raw.length };
    }
  }

  switch (method) {
    case "getMe":
      return json(res, {
        ok: true,
        result: { id: state.botId, is_bot: true, first_name: "Chinwi", username: state.botUsername },
      });
    case "setWebhook":
      state.webhookUrl = payload.url || "";
      return json(res, { ok: true, result: true });
    case "deleteWebhook":
      state.webhookUrl = "";
      return json(res, { ok: true, result: true });
    case "getWebhookInfo":
      return json(res, {
        ok: true,
        result: { url: state.webhookUrl, pending_update_count: 0, has_custom_certificate: false },
      });
    case "setMyCommands":
    case "setChatMenuButton":
    case "sendChatAction":
    case "answerCallbackQuery":
      return json(res, { ok: true, result: true });
    case "getChatMember": {
      const chat = String(payload.chat_id || "");
      const status = state.memberships[chat] ?? "member";
      if (status === "__error") {
        return json(res, { ok: false, error_code: 400, description: "Bad Request: member list is inaccessible" });
      }
      return json(res, { ok: true, result: { status, user: { id: payload.user_id, is_bot: false } } });
    }
    case "getChat":
      return json(res, { ok: true, result: { id: -1001, title: `Mock ${payload.chat_id}`, username: String(payload.chat_id).replace("@", "") } });
    case "getUserProfilePhotos":
      return json(res, { ok: true, result: { total_count: 0, photos: [] } });
    case "getFile":
      return json(res, { ok: true, result: { file_id: payload.file_id, file_path: "photos/mock.jpg" } });
    case "getStickerSet":
      return json(res, {
        ok: true,
        result: {
          name: payload.name,
          title: "Mock Set",
          stickers: [
            { emoji: "🔥", custom_emoji_id: "5368324170671202286" },
            { emoji: "👑", custom_emoji_id: "5368324170671202287" },
          ],
        },
      });
    case "sendMessage": {
      const message = {
        message_id: ++state.nextMessageId,
        chat: { id: Number(payload.chat_id), type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: payload.text,
        reply_markup: payload.reply_markup,
      };
      state.sent.push({ method, chat_id: Number(payload.chat_id), text: payload.text || "", reply_markup: payload.reply_markup || null });
      return json(res, { ok: true, result: message });
    }
    case "sendPhoto": {
      const message = {
        message_id: ++state.nextMessageId,
        chat: { id: Number(payload.chat_id), type: "private" },
        date: Math.floor(Date.now() / 1000),
        caption: payload.caption,
        photo: [{ file_id: "mock-photo", file_unique_id: "u", width: 10, height: 10 }],
      };
      state.sent.push({
        method,
        chat_id: Number(payload.chat_id),
        photo: payload.photo || "uploaded",
        text: payload.caption || "",
        reply_markup: payload.reply_markup || null,
      });
      return json(res, { ok: true, result: message });
    }
    case "editMessageText": {
      state.sent.push({ method, chat_id: Number(payload.chat_id), text: payload.text || "", reply_markup: payload.reply_markup || null });
      return json(res, { ok: true, result: { message_id: payload.message_id } });
    }
    default:
      return json(res, { ok: false, description: `mock: method ${method} not implemented` }, 400);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-telegram] listening on http://127.0.0.1:${PORT}`);
});
