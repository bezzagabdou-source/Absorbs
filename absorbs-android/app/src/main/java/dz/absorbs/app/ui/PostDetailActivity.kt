package dz.absorbs.app.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Comment
import dz.absorbs.app.data.TimeAr

class PostDetailActivity : AppCompatActivity() {
    private lateinit var adapter: CommentsAdapter
    private lateinit var rv: RecyclerView
    private var postId: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_post_detail)
        postId = intent.getStringExtra("post_id") ?: ""
        findViewById<TextView>(R.id.tvDetailContent).text = intent.getStringExtra("post_content") ?: ""
        findViewById<ImageView>(R.id.btnDetailBack).setOnClickListener { finish() }
        rv = findViewById(R.id.rvComments)
        adapter = CommentsAdapter()
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = adapter
        load()

        val et = findViewById<EditText>(R.id.etComment)
        findViewById<ImageView>(R.id.btnSendComment).setOnClickListener {
            val text = et.text.toString().trim()
            if (text.isBlank() || postId.isBlank()) return@setOnClickListener
            et.text.clear()
            Api.addComment(postId, text) { err ->
                runOnUiThread {
                    if (err == null) load() else Toast.makeText(this, err, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun load() {
        if (postId.isBlank()) return
        Api.fetchComments(postId) { comments, err ->
            runOnUiThread {
                if (comments != null) adapter.submit(comments)
                else if (err != null) Toast.makeText(this, err, Toast.LENGTH_SHORT).show()
            }
        }
    }
}

class CommentsAdapter : RecyclerView.Adapter<CommentsAdapter.VH>() {
    private val items = mutableListOf<Comment>()

    fun submit(list: List<Comment>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_comment, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val c = items[pos]
        val name = c.author?.displayName ?: "مستخدم"
        h.name.text = "$name · ${TimeAr.ago(c.createdAt)}"
        h.body.text = c.content
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.tvCommentName)
        val body: TextView = v.findViewById(R.id.tvCommentBody)
    }
}
