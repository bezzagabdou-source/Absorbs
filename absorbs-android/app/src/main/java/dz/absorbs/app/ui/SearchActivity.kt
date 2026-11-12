package dz.absorbs.app.ui

import android.content.Intent
import android.net.Uri
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
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Config
import dz.absorbs.app.data.Profile

class SearchActivity : AppCompatActivity() {
    private lateinit var adapter: PeopleAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_search)
        findViewById<ImageView>(R.id.btnSearchBack).setOnClickListener { finish() }
        val et = findViewById<EditText>(R.id.etSearch)
        val rv = findViewById<RecyclerView>(R.id.rvSearch)
        adapter = PeopleAdapter { profile ->
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.SITE_URL}/u/${profile.username}")))
        }
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = adapter
        findViewById<TextView>(R.id.btnDoSearch).setOnClickListener {
            val q = et.text.toString().trim()
            if (q.length < 2) {
                Toast.makeText(this, "اكتب حرفين على الأقل", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            Api.searchProfiles(q) { people, err ->
                runOnUiThread {
                    if (people != null) {
                        adapter.submit(people)
                        if (people.isEmpty()) Toast.makeText(this, "لا نتائج", Toast.LENGTH_SHORT).show()
                    } else Toast.makeText(this, err ?: "تعذّر البحث", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

class PeopleAdapter(private val onClick: (Profile) -> Unit) : RecyclerView.Adapter<PeopleAdapter.VH>() {
    private val items = mutableListOf<Profile>()

    fun submit(list: List<Profile>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_thread, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val p = items[pos]
        h.name.text = p.displayName
        h.last.text = "@${p.username}${p.bio?.let { " · $it" } ?: ""}"
        h.time.text = if (p.verified) "موثّق" else ""
        if (!p.avatarUrl.isNullOrBlank()) {
            Glide.with(h.itemView.context).load(p.avatarUrl).circleCrop().into(h.avatar)
            h.avatar.setPadding(0, 0, 0, 0)
        }
        h.itemView.setOnClickListener { onClick(p) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val avatar: ImageView = v.findViewById(R.id.ivThreadAvatar)
        val name: TextView = v.findViewById(R.id.tvThreadName)
        val last: TextView = v.findViewById(R.id.tvThreadLast)
        val time: TextView = v.findViewById(R.id.tvThreadTime)
    }
}
