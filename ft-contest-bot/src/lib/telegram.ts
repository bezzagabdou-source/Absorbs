import { getSettings, saveSettings } from "./settings";

export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TgChat = { id: number; type: string; title?: string; username?: string };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  date?: number;
  /** أعضاء جدد أُضيفوا للمجموعة */
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
};

/** رابط دعوة أنشأه البوت لعضو معيّن داخل المجموعة */
export type TgChatInviteLink = {
  invite_link: string;
  name?: string;
  creates_join_request?: boolean;
  is_primary?: boolean;
  is_revoked?: boolean;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: {
    chat: TgChat;
    from: TgUser;
    new_chat_member: { status: string; user: TgUser };
  };
  /** طلب انضمام لمجموعة عبر رابط دعوة (يحمل صاحب الرابط) */
  chat_join_request?: {
    chat: TgChat;
    from: TgUser;
    user_chat_id?: number;
    date?: number;
    invite_link?: TgChatInviteLink;
  };
};

export type TgResult<T = unknown> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type MockCall = { at: number; method: string; payload: Record<string, unknown> };

const mockGlobal = globalThis as unknown as {
  __ftMockLog?: MockCall[];
  __ftMockSeq?: number;
};

export function isMock(): boolean {
  return process.env.TELEGRAM_MOCK === "1";
}

export function getMockLog(): MockCall[] {
  return mockGlobal.__ftMockLog || [];
}

export function clearMockLog() {
  mockGlobal.__ftMockLog = [];
}

export type InlineKeyboard = { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] };

export async function tgCall<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<TgResult<T>> {
  const settings = await getSettings();
  const token = settings.botToken;

  if (isMock()) {
    mockGlobal.__ftMockLog ||= [];
    mockGlobal.__ftMockLog.unshift({ at: Date.now(), method, payload });
    if (mockGlobal.__ftMockLog.length > 400) mockGlobal.__ftMockLog.length = 400;
    mockGlobal.__ftMockSeq = (mockGlobal.__ftMockSeq || 0) + 1;
    if (method === "getMe") {
      return {
        ok: true,
        result: {
          id: 7000000001,
          is_bot: true,
          first_name: "FT Contest (mock)",
          username: "ft_contest_mock_bot",
        } as unknown as T,
      };
    }
    if (method === "getChatMember") {
      const status = process.env.MOCK_NOT_MEMBER === "1" ? "left" : "member";
      return { ok: true, result: { status } as unknown as T };
    }
    if (method === "createChatInviteLink") {
      const seq = mockGlobal.__ftMockSeq;
      const link = `https://t.me/+ftmock${seq}`;
      return {
        ok: true,
        result: {
          invite_link: link,
          name: String(payload.name || ""),
          creates_join_request: Boolean(payload.creates_join_request),
          is_primary: false,
          is_revoked: false,
        } as unknown as T,
      };
    }
    if (method === "getChat") {
      return {
        ok: true,
        result: {
          id: Number(payload.chat_id) || -1000000000000,
          type: "supergroup",
          title: "مجموعة FT (mock)",
          username: "ft_mock_group",
        } as unknown as T,
      };
    }
    return { ok: true, result: { message_id: 1000 + mockGlobal.__ftMockSeq, ok: true } as unknown as T };
  }

  if (!token) return { ok: false, description: "لا يوجد توكن للبوت" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as TgResult<T>;
    if (!json.ok) console.error(`[tg] ${method}`, json.description);
    return json;
  } catch (error) {
    console.error(`[tg] ${method} network error`, error);
    return { ok: false, description: "تعذّر الاتصال بتلغرام" };
  }
}

export async function getBotIdentity(): Promise<{ id: number | null; username: string }> {
  const settings = await getSettings();
  if (settings.botUsername) {
    return { id: settings.botId, username: settings.botUsername };
  }
  const me = await tgCall<TgUser>("getMe");
  if (me.ok && me.result?.username) {
    await saveSettings({ botUsername: me.result.username, botId: me.result.id });
    return { id: me.result.id, username: me.result.username };
  }
  return { id: null, username: settings.botUsername || "" };
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  extra: Record<string, unknown> = {},
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
    ...extra,
  });
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
) {
  const res = await tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  if (!res.ok) {
    return sendMessage(chatId, text, keyboard);
  }
  return res;
}

export async function answerCallback(id: string, text?: string) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text, show_alert: false } : {}),
  });
}

/* ────────────────────── دعوات المجموعة (أسرع ضيف) ────────────────────── */

/** ينشئ رابط دعوة خاص بعضو واحد داخل المجموعة (بطلب انضمام حتى نعرف صاحب الرابط) */
export async function createChatInviteLink(
  chatId: number | string,
  name: string,
): Promise<TgChatInviteLink | null> {
  const res = await tgCall<TgChatInviteLink>("createChatInviteLink", {
    chat_id: chatId,
    name: name.slice(0, 32),
    creates_join_request: true,
  });
  if (!res.ok || !res.result?.invite_link) {
    console.error("[tg] createChatInviteLink failed", res.description);
    return null;
  }
  return res.result;
}

export async function approveJoinRequest(chatId: number | string, userId: number | string) {
  return tgCall("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export async function declineJoinRequest(chatId: number | string, userId: number | string) {
  return tgCall("declineChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export async function getChatInfo(chatId: number | string) {
  return tgCall<TgChat>("getChat", { chat_id: chatId });
}
