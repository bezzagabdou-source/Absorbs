package dz.absorbs.app.ui

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import dz.absorbs.app.R
import dz.absorbs.app.data.Api

data class AiMsg(val role: String, val content: String)

/** Shared bubble adapter for AI chat and DM chat. */
class MsgAdapter(private val myColor: Boolean = true) : RecyclerView.Adapter<MsgAdapter.VH>() {
    val items = mutableListOf<AiMsg>()

    fun add(m: AiMsg) {
        items.add(m); notifyItemInserted(items.size - 1)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_msg, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val m = items[pos]
        val mine = m.role == "user"
        h.tv.text = m.content
        val params = h.tv.layoutParams as LinearLayout.LayoutParams
        params.gravity = if (mine) Gravity.START else Gravity.END
        h.tv.layoutParams = params
        h.tv.setBackgroundResource(if (mine) R.drawable.bg_bubble_me else R.drawable.bg_bubble_other)
        h.tv.setTextColor(Color.parseColor(if (mine) "#FFFFFF" else "#0B1F1A"))
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val tv: TextView = v.findViewById(R.id.tvMsg)
    }
}

class AiFragment : Fragment() {
    private lateinit var adapter: MsgAdapter
    private lateinit var rv: RecyclerView

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val v = inflater.inflate(R.layout.fragment_ai, container, false)
        rv = v.findViewById(R.id.rvAi)
        adapter = MsgAdapter()
        rv.layoutManager = LinearLayoutManager(requireContext())
        rv.adapter = adapter
        adapter.add(AiMsg("assistant", "أهلًا بك في Dz connect ai — اسألني عن أي شيء، أو اطلب أفكار منشورات وتحسين نصوصك."))
        val et = v.findViewById<EditText>(R.id.etAi)
        v.findViewById<ImageView>(R.id.btnAiSend).setOnClickListener {
            val text = et.text.toString().trim()
            if (text.isBlank()) return@setOnClickListener
            et.text.clear()
            adapter.add(AiMsg("user", text))
            rv.scrollToPosition(adapter.itemCount - 1)
            val history = adapter.items.takeLast(12).map { it.role to it.content }
            Api.aiChat(history) { reply, err ->
                activity?.runOnUiThread {
                    if (reply != null) {
                        adapter.add(AiMsg("assistant", reply))
                        rv.scrollToPosition(adapter.itemCount - 1)
                    } else {
                        Toast.makeText(requireContext(), err ?: "المساعد غير متاح", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        return v
    }
}
