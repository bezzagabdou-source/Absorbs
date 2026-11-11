import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { checkChannels, handleUpdate } from "../src/lib/bot";
import { balanceOf, listRequests, saveRewards, setBalance, type Reward } from "../src/lib/rewards";
import { getSettings, saveSettings } from "../src/lib/settings";
import { clearMockLog, getMockLog, getTrace, runWithBotToken, tgCall, type TgUpdate } from "../src/lib/telegram";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=";
const items: Reward[] = [
  { id: "r280", title: "حساب بيس", emoji: "🎁", desc: "حساب كامل", cost: 280, stock: null, active: true, order: 1, delivery: "التسليم بعد الموافقة", section: "accounts", image },
  { id: "r55", title: "حساب آخر", emoji: "🎁", desc: "", cost: 55, stock: 0, active: true, order: 2, delivery: "", section: "accounts" },
];
const envNames = ["TELEGRAM_MOCK", "TG_DRY_RUN", "VERCEL", "POSTGRES_URL", "DATABASE_URL", "POSTGRES_PRISMA_URL", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN", "REDIS_REST_TOKEN"];
const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const oldFetch = globalThis.fetch;
const globals = globalThis as unknown as { __ftStore?: unknown; __ftMem?: unknown };
let n = 1;
function update(data: string): TgUpdate {
  return { update_id: n++, callback_query: { id: String(n), from: { id: 1001, first_name: "User" }, data, message: { message_id: 9, chat: { id: 1001, type: "private" } } } };
}
before(async () => {
  for (const name of envNames) delete process.env[name];
  process.env.VERCEL = "1"; // isolated memory store; never write local or production data
  process.env.TELEGRAM_MOCK = "1";
  globals.__ftStore = undefined;
  globals.__ftMem = { kv: {}, counters: {}, sets: {}, zsets: {}, lists: {} };
  await saveSettings({ requireJoin: false, requiredChannels: [] });
  await saveRewards(items);
});
after(() => {
  globalThis.fetch = oldFetch;
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
});

test("each prize has green name and red points buttons in both lists", async () => {
  for (const action of ["home_list", "sec:accounts"]) {
    clearMockLog();
    await handleUpdate(update(action));
    const screen = getMockLog().find(call => call.method === "editMessageText");
    assert.ok(screen);
    const keyboard = (screen.payload.reply_markup as { inline_keyboard: any[][] }).inline_keyboard;
    const row = keyboard.find(row => row.some(button => button.callback_data === "buy:r280"));
    assert.equal(row?.length, 2);
    assert.match(row![0].text, /حساب بيس/);
    assert.equal(row![0].style, "success");
    assert.match(row![1].text, /280/);
    assert.equal(row![1].style, "danger");
    assert.equal(row![0].callback_data, "buy:r280");
    assert.equal(row![1].callback_data, "buy:r280");
    const soldOut = keyboard.find(row => row.some(button => button.callback_data === "buy:r55"));
    assert.equal(soldOut?.[0].style, "success");
    assert.equal(soldOut?.[1].style, "danger");
    assert.match(soldOut?.[0].text, /🚫/);
  }
});

test("either button immediately sends the stored image and retains normal purchase behavior", async () => {
  for (const callback of ["buy:r280", "buy:r280"]) {
    clearMockLog();
    await handleUpdate(update(callback));
    const calls = getMockLog();
    const photo = calls.find(call => call.method === "sendPhoto");
    assert.ok(photo, "a text list must lead to a new photo, not editMessageMedia");
    assert.equal(photo.payload.photo, "[inline image]", "do not retain image bytes in logs");
    assert.match(String(photo.payload.caption), /280/);
    assert.match(String(photo.payload.caption), /التسليم/);
    assert.ok(calls.some(call => call.method === "editMessageReplyMarkup"), "old list keyboard is disabled");
    assert.ok(!calls.some(call => call.method === "editMessageMedia"));
    const kb = photo.payload.reply_markup as { inline_keyboard: any[][] };
    assert.equal(kb.inline_keyboard[0][0].style, "danger", "insufficient points remain locked");
  }
  await setBalance("1001", 300);
  clearMockLog();
  await handleUpdate(update("buy:r280"));
  const photo = getMockLog().find(call => call.method === "sendPhoto")!;
  const kb = photo.payload.reply_markup as { inline_keyboard: any[][] };
  assert.equal(kb.inline_keyboard[0][0].style, "success");
  assert.equal(kb.inline_keyboard[0][0].callback_data, "confirm:r280");
  await handleUpdate(update("confirm:r280"));
  assert.equal(await balanceOf("1001"), 20);
  assert.ok((await listRequests(10)).some(request => request.rewardId === "r280" && request.cost === 280));

  clearMockLog();
  await handleUpdate(update("buy:r55"));
  assert.ok(getMockLog().some(call => call.method === "editMessageText"), "no image uses the normal text detail");
  assert.ok(!getMockLog().some(call => call.method === "sendPhoto"));
  clearMockLog();
  await handleUpdate(update("pts:r280"));
  assert.ok(getMockLog().some(call => call.method === "editMessageText"), "old points callbacks remain compatible");
});

test("inline images are uploaded as multipart bytes; URL photos remain JSON", async () => {
  process.env.TELEGRAM_MOCK = "0";
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  try {
    const kb = { inline_keyboard: [[{ text: "Prize", callback_data: "buy:r280", style: "success" }, { text: "280", callback_data: "buy:r280", style: "danger" }]] };
    const result = await runWithBotToken("test-token", () => tgCall("sendPhoto", { chat_id: 1001, photo: image, caption: "Test", reply_markup: kb }));
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    const form = calls[0].init?.body as FormData;
    assert.ok(form instanceof FormData);
    assert.equal(form.get("chat_id"), "1001");
    assert.equal(form.get("caption"), "Test");
    assert.deepEqual(JSON.parse(String(form.get("reply_markup"))), kb);
    const file = form.get("photo") as File;
    assert.equal(file.type, "image/png");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(image.split(",")[1], "base64"));
    assert.equal(getTrace().find(trace => trace.method === "sendPhoto")?.payload.photo, "[inline image]");
    assert.equal((await runWithBotToken("test-token", () => tgCall("sendPhoto", { chat_id: 1, photo: "data:image/png;base64,%%%" }))).ok, false);
    assert.equal(calls.length, 1, "invalid data does not reach Telegram");
    await runWithBotToken("test-token", () => tgCall("sendPhoto", { chat_id: 1, photo: "https://images.example/prize.jpg" }));
    assert.equal(JSON.parse(String(calls[1].init?.body)).photo, "https://images.example/prize.jpg");
  } finally { globalThis.fetch = oldFetch; process.env.TELEGRAM_MOCK = "1"; }
});

test("a failed photo upload falls back to text; channel checks preserve gate behavior", async () => {
  process.env.TELEGRAM_MOCK = "0";
  const methods: string[] = [];
  let simultaneous = 0, maxSimultaneous = 0;
  const oldError = console.error;
  console.error = () => {};
  globalThis.fetch = async (input) => {
    const method = String(input).split("/").at(-1)!;
    methods.push(method);
    if (method === "sendPhoto") return Response.json({ ok: false, description: "test photo failure" });
    if (method === "getChatMember") {
      simultaneous++;
      maxSimultaneous = Math.max(maxSimultaneous, simultaneous);
      await new Promise(resolve => setTimeout(resolve, 10));
      simultaneous--;
      return Response.json({ ok: true, result: { status: "member" } });
    }
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  try {
    await runWithBotToken("test-token", () => handleUpdate(update("buy:r280")));
    assert.ok(methods.includes("sendPhoto"));
    assert.ok(methods.includes("editMessageText"), "text fallback if Telegram rejects the photo");
    const settings = { ...await getSettings(), requireJoin: true, requiredChannels: ["@one", "@two", "@three"] };
    const checked = await runWithBotToken("test-token", () => checkChannels(settings, 1001));
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.missing, []);
    assert.equal(maxSimultaneous, 3, "independent channel checks run concurrently");
  } finally { globalThis.fetch = oldFetch; process.env.TELEGRAM_MOCK = "1"; console.error = oldError; }
});


test("navigation from photo to text clears the old purchase keyboard after a successful fallback", async () => {
  process.env.TELEGRAM_MOCK = "0";
  const methods: { method: string; payload: any }[] = [];
  globalThis.fetch = async (input, init) => {
    const method = String(input).split("/").at(-1)!;
    const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    methods.push({ method, payload });
    if (method === "editMessageText") return Response.json({ ok: false, description: "Bad Request: there is no text in the message to edit" });
    return Response.json({ ok: true, result: { message_id: 10 } });
  };
  try {
    await setBalance("1001", 300);
    await runWithBotToken("test-token", () => handleUpdate(update("confirm:r280")));
    assert.equal(await balanceOf("1001"), 20, "one confirmed purchase deducts points once");
    assert.ok(methods.some(call => call.method === "sendMessage"), "new text message replaces photo detail");
    const cleared = methods.find(call => call.method === "editMessageReplyMarkup");
    assert.equal(cleared?.payload.message_id, 9);
    assert.deepEqual(cleared?.payload.reply_markup, { inline_keyboard: [] }, "old confirm button must be removed");
  } finally { globalThis.fetch = oldFetch; process.env.TELEGRAM_MOCK = "1"; }
});
