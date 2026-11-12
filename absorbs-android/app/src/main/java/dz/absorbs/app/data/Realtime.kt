package dz.absorbs.app.data

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Timer
import java.util.TimerTask
import java.util.concurrent.TimeUnit

/**
 * Minimal Supabase Realtime client (Phoenix channels over OkHttp WebSocket).
 * One room per DM thread: postgres_changes (new messages) + broadcast (typing)
 * + presence (online). All failures are silent — callers keep a polling fallback.
 */
class ChatRealtime(
    private val threadId: String,
    private val onMessage: (ChatMsg) -> Unit,
    private val onTyping: (userId: String) -> Unit,
    private val onPresence: (onlineUserIds: Set<String>) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private var ws: WebSocket? = null
    private var heartbeat: Timer? = null
    private var ref = 0
    private val topic = "realtime:room:$threadId"

    fun connect() {
        try {
            val url = Config.SUPABASE_URL.replace("https://", "wss://") +
                "/realtime/v1/websocket?apikey=${Config.SUPABASE_KEY}&vsn=1.0.0"
            val req = Request.Builder().url(url).build()
            ws = client.newWebSocket(req, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) = join()
                override fun onMessage(webSocket: WebSocket, text: String) = handle(text)
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    stopHeartbeat()
                }
            })
        } catch (_: Exception) {
        }
    }

    private fun nextRef() = (++ref).toString()

    private fun join() {
        val pg = JSONArray().put(
            JSONObject()
                .put("event", "INSERT").put("schema", "public")
                .put("table", "messages").put("filter", "thread_id=eq.$threadId")
        )
        val config = JSONObject()
            .put("broadcast", JSONObject().put("ack", false).put("self", false))
            .put("presence", JSONObject().put("key", Session.userId))
            .put("postgres_changes", pg)
        val payload = JSONObject().put("config", config).put("access_token", Session.access)
        send(JSONObject().put("topic", topic).put("event", "phx_join").put("payload", payload).put("ref", nextRef()))
        // Track my presence in the room.
        val track = JSONObject()
            .put("type", "presence").put("event", "track")
            .put("payload", JSONObject().put("online_at", System.currentTimeMillis()))
        send(JSONObject().put("topic", topic).put("event", "presence").put("payload", track).put("ref", nextRef()))
        startHeartbeat()
    }

    fun sendTyping() {
        val payload = JSONObject()
            .put("type", "broadcast").put("event", "typing")
            .put("payload", JSONObject().put("user", Session.userId))
        send(JSONObject().put("topic", topic).put("event", "broadcast").put("payload", payload).put("ref", nextRef()))
    }

    private fun handle(text: String) {
        try {
            val msg = JSONObject(text)
            val payload = msg.optJSONObject("payload") ?: return
            when (msg.optString("event")) {
                "postgres_changes" -> {
                    val data = payload.optJSONArray("data") ?: return
                    for (i in 0 until data.length()) {
                        val d = data.getJSONObject(i)
                        val rec = d.optJSONObject("record") ?: continue
                        onMessage(
                            ChatMsg(
                                rec.optString("id"),
                                rec.optString("sender_id"),
                                rec.optString("content"),
                                rec.optString("created_at"),
                                rec.optString("sender_id") == Session.userId,
                            )
                        )
                    }
                }
                "broadcast" -> {
                    if (payload.optString("event") == "typing") {
                        val uid = payload.optJSONObject("payload")?.optString("user") ?: ""
                        if (uid.isNotBlank() && uid != Session.userId) onTyping(uid)
                    }
                }
                "presence_state" -> {
                    val keys = mutableSetOf<String>()
                    val names = payload.names()
                    if (names != null) for (i in 0 until names.length()) keys.add(names.getString(i))
                    onPresence(keys)
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun send(obj: JSONObject) {
        try { ws?.send(obj.toString()) } catch (_: Exception) {
        }
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeat = Timer().apply {
            schedule(object : TimerTask() {
                override fun run() {
                    send(
                        JSONObject().put("topic", "phoenix").put("event", "heartbeat")
                            .put("payload", JSONObject()).put("ref", nextRef())
                    )
                }
            }, 25000, 25000)
        }
    }

    private fun stopHeartbeat() {
        heartbeat?.cancel()
        heartbeat = null
    }

    fun close() {
        stopHeartbeat()
        try { ws?.close(1000, "bye") } catch (_: Exception) {
        }
        ws = null
    }
}
