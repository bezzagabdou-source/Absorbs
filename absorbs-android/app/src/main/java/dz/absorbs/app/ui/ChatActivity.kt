package dz.absorbs.app.ui

import android.os.Bundle
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api

class ChatActivity : AppCompatActivity() {
    private lateinit var adapter: MsgAdapter
    private lateinit var rv: RecyclerView
    private var threadId: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        threadId = intent.getStringExtra("thread_id") ?: ""
        findViewById<TextView>(R.id.tvChatName).text = intent.getStringExtra("name") ?: "محادثة"
        val avatar = intent.getStringExtra("avatar") ?: ""
        if (avatar.isNotBlank()) {
            val iv = findViewById<ImageView>(R.id.ivChatAvatar)
            Glide.with(this).load(avatar).circleCrop().into(iv)
            iv.setPadding(0, 0, 0, 0)
        }
        findViewById<ImageView>(R.id.btnBack).setOnClickListener { finish() }

        rv = findViewById(R.id.rvChat)
        adapter = MsgAdapter()
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = adapter
        load()

        val et = findViewById<EditText>(R.id.etChat)
        findViewById<ImageView>(R.id.btnSendChat).setOnClickListener {
            val text = et.text.toString().trim()
            if (text.isBlank() || threadId.isBlank()) return@setOnClickListener
            et.text.clear()
            Api.sendMessage(threadId, text) { err ->
                runOnUiThread {
                    if (err == null) load() else Toast.makeText(this, err, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun load() {
        if (threadId.isBlank()) return
        Api.fetchMessages(threadId) { msgs, _ ->
            runOnUiThread {
                if (msgs != null) {
                    adapter.items.clear()
                    msgs.forEach { m ->
                        val label = when {
                            m.content.startsWith("[image]") -> "صورة مرفقة"
                            m.content.startsWith("[voice]") -> "رسالة صوتية"
                            m.content.startsWith("[call|") -> "مكالمة"
                            else -> m.content
                        }
                        adapter.items.add(AiMsg(if (m.mine) "user" else "other", label))
                    }
                    adapter.notifyDataSetChanged()
                    if (adapter.itemCount > 0) rv.scrollToPosition(adapter.itemCount - 1)
                }
            }
        }
    }
}
