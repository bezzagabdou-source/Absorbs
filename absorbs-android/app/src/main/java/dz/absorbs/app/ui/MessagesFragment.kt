package dz.absorbs.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.ThreadItem
import dz.absorbs.app.data.TimeAr

class MessagesFragment : Fragment() {
    private lateinit var adapter: ThreadsAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val v = inflater.inflate(R.layout.fragment_messages, container, false)
        val rv = v.findViewById<RecyclerView>(R.id.rvThreads)
        val pb = v.findViewById<ProgressBar>(R.id.pbThreads)
        val empty = v.findViewById<TextView>(R.id.tvEmptyThreads)
        adapter = ThreadsAdapter { thread ->
            val i = Intent(requireContext(), ChatActivity::class.java)
            i.putExtra("thread_id", thread.id)
            i.putExtra("name", thread.other?.displayName ?: "مستخدم")
            i.putExtra("avatar", thread.other?.avatarUrl ?: "")
            startActivity(i)
        }
        rv.layoutManager = LinearLayoutManager(requireContext())
        rv.adapter = adapter
        Api.fetchThreads { threads, err ->
            activity?.runOnUiThread {
                pb.visibility = View.GONE
                if (threads != null) {
                    adapter.submit(threads)
                    empty.visibility = if (threads.isEmpty()) View.VISIBLE else View.GONE
                } else Toast.makeText(requireContext(), err ?: "تعذّر تحميل الرسائل", Toast.LENGTH_SHORT).show()
            }
        }
        return v
    }
}

class ThreadsAdapter(private val onClick: (ThreadItem) -> Unit) : RecyclerView.Adapter<ThreadsAdapter.VH>() {
    private val items = mutableListOf<ThreadItem>()

    fun submit(list: List<ThreadItem>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_thread, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val t = items[pos]
        h.name.text = t.other?.displayName ?: "مستخدم Dz connect"
        h.last.text = when {
            t.lastMessage.startsWith("[image]") -> "صورة"
            t.lastMessage.startsWith("[voice]") -> "رسالة صوتية"
            t.lastMessage.startsWith("[call|") -> "مكالمة"
            else -> t.lastMessage
        }
        h.time.text = TimeAr.ago(t.lastAt)
        val avatar = t.other?.avatarUrl
        if (!avatar.isNullOrBlank()) {
            Glide.with(h.itemView.context).load(avatar).circleCrop().into(h.avatar)
            h.avatar.setPadding(0, 0, 0, 0)
        }
        h.itemView.setOnClickListener { onClick(t) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val avatar: ImageView = v.findViewById(R.id.ivThreadAvatar)
        val name: TextView = v.findViewById(R.id.tvThreadName)
        val last: TextView = v.findViewById(R.id.tvThreadLast)
        val time: TextView = v.findViewById(R.id.tvThreadTime)
    }
}
