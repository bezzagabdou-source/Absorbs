import http from "node:http";

/**
 * سيرفر وهمي متوافق مع OpenAI Chat Completions — للاختبار المحلي فقط.
 * يحاكي النموذج: يطلب أداة، يستقبل نتيجتها، ثم يجيب بالعربية.
 */
export function startMockAI({ port = 9911 } = {}) {
  const log = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const payload = (() => {
        try {
          return JSON.parse(body);
        } catch {
          return {};
        }
      })();
      log.push({ url: req.url, auth: req.headers.authorization, payload });

      const messages = payload.messages ?? [];
      const toolMsgs = messages.filter((m) => m.role === "tool");
      const hasImage = JSON.stringify(messages).includes("image_url");
      const userText = JSON.stringify(messages.filter((m) => m.role === "user").slice(-1));

      if (!toolMsgs.length) {
        // الجولة الأولى: نطلب أداة مناسبة حسب الطلب
        const name = /احصائ|إحصائ|قداش|stats/i.test(userText)
          ? "get_stats"
          : /مستخدم|users/i.test(userText)
          ? "list_users"
          : /حماية|security/i.test(userText)
          ? "get_security"
          : null;
        if (name) {
          return respond(res, {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call_${Math.random().toString(36).slice(2, 8)}`,
                type: "function",
                function: { name, arguments: "{}" },
              },
            ],
          });
        }
        return respond(res, { role: "assistant", content: hasImage ? "شفت الصورة ✅ — نقدر نستعملها في المسابقة." : "أهلا بيك! أنا عقل برق، اطلب أي شيء ⚡" });
      }

      // الجولة الثانية: نلخّص نتيجة الأداة
      const last = toolMsgs[toolMsgs.length - 1];
      let parsed = {};
      try {
        parsed = JSON.parse(last.content);
      } catch {}
      return respond(res, {
        role: "assistant",
        content: `تم ✅ ${last.name}: ${String(JSON.stringify(parsed)).slice(0, 160)}`,
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, log, close: () => server.close() }));
  });
}

function respond(res, message) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "chatcmpl-mock",
      model: "mock-model",
      choices: [{ index: 0, message, finish_reason: "stop" }],
      usage: { total_tokens: 42 },
    })
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockAI({ port: Number(process.env.AI_MOCK_PORT ?? 9911) }).then(() => console.log("mock AI on 9911"));
}
