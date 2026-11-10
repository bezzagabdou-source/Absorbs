import http from "node:http";
const srv = http.createServer((req, res) => {
  const ch = [];
  req.on("data", (c) => ch.push(c));
  req.on("end", () => {
    const p = JSON.parse(Buffer.concat(ch).toString() || "{}");
    const hasTool = p.messages.some((m) => m.role === "tool");
    const lastUser = [...p.messages].reverse().find((m) => m.role === "user");
    const txt = JSON.stringify(lastUser?.content ?? "");
    let message;
    if (!hasTool && /إحصائ|احصائي|stats/.test(txt))
      message = { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_stats", arguments: "{}" } }] };
    else if (!hasTool && /حظر/.test(txt))
      message = { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "block_user", arguments: JSON.stringify({ user_id: "100001111" }) } }] };
    else if (!hasTool && /سؤال/.test(txt))
      message = { role: "assistant", content: null, tool_calls: [{ id: "c3", type: "function", function: { name: "add_question", arguments: JSON.stringify({ text: "عاصمة الجزائر؟", options: ["الجزائر", "وهران", "قسنطينة", "عنابة"], correct: 0 }) } }] };
    else message = { role: "assistant", content: "تمّ ✅ نفّذت الطلب على البوت." };
    const d = JSON.stringify({ model: "mock/grok", choices: [{ message }] });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(d);
  });
});
srv.listen(9912, "127.0.0.1", () => console.log("mock ai على 9912"));
