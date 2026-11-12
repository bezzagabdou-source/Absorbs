package dz.absorbs.app.ui

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.VideoView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Post

/** Full-screen vertical reels: snap scroll, autoplay, loop, like. */
class ReelsFragment : Fragment() {
    private lateinit var pager: ViewPager2
    private lateinit var adapter: ReelsAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val v = inflater.inflate(R.layout.fragment_reels, container, false)
        pager = v.findViewById(R.id.vpReels)
        val pb = v.findViewById<ProgressBar>(R.id.pbReels)
        val empty = v.findViewById<TextView>(R.id.tvReelsEmpty)
        adapter = ReelsAdapter { post ->
            Api.toggleLike(post) { ok -> activity?.runOnUiThread { if (ok) adapter.notifyDataSetChanged() } }
        }
        pager.adapter = adapter
        pager.orientation = ViewPager2.ORIENTATION_VERTICAL
        pager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                playAt(position)
            }
        })
        Api.fetchFeed { posts, _ ->
            activity?.runOnUiThread {
                pb.visibility = View.GONE
                val reels = (posts ?: emptyList()).filter { it.mediaType == "video" && !it.imageUrl.isNullOrBlank() }
                adapter.submit(reels)
                empty.visibility = if (reels.isEmpty()) View.VISIBLE else View.GONE
                if (reels.isNotEmpty()) pager.post { playAt(0) }
            }
        }
        return v
    }

    private fun playAt(position: Int) {
        val rv = pager.getChildAt(0) as? RecyclerView ?: return
        for (i in 0 until rv.childCount) {
            val holder = rv.getChildViewHolder(rv.getChildAt(i)) as? ReelsAdapter.VH ?: continue
            if (holder.bindingAdapterPosition == position) {
                holder.vv.start()
                holder.btnPlay.visibility = View.GONE
            } else {
                if (holder.vv.isPlaying) holder.vv.pause()
                holder.btnPlay.visibility = View.VISIBLE
            }
        }
    }

    override fun onPause() {
        super.onPause()
        val rv = pager.getChildAt(0) as? RecyclerView ?: return
        for (i in 0 until rv.childCount) {
            val holder = rv.getChildViewHolder(rv.getChildAt(i)) as? ReelsAdapter.VH ?: continue
            if (holder.vv.isPlaying) holder.vv.pause()
        }
    }
}

class ReelsAdapter(private val onLike: (Post) -> Unit) : RecyclerView.Adapter<ReelsAdapter.VH>() {
    private val items = mutableListOf<Post>()

    fun submit(list: List<Post>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_reel, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val post = items[pos]
        val ctx = h.itemView.context
        h.tvName.text = post.author?.displayName ?: "مستخدم Dz connect"
        h.tvCaption.text = post.content
        val avatar = post.author?.avatarUrl
        if (!avatar.isNullOrBlank()) {
            Glide.with(ctx).load(avatar).circleCrop().into(h.ivAvatar)
            h.ivAvatar.setPadding(0, 0, 0, 0)
        }
        h.vv.setVideoPath(post.imageUrl)
        h.vv.setOnPreparedListener { mp -> mp.isLooping = true }
        h.btnPlay.setOnClickListener {
            h.vv.start(); h.btnPlay.visibility = View.GONE
        }
        h.vv.setOnClickListener {
            if (h.vv.isPlaying) { h.vv.pause(); h.btnPlay.visibility = View.VISIBLE }
            else { h.vv.start(); h.btnPlay.visibility = View.GONE }
        }
        h.tvLikeCount.text = post.likeCount.toString()
        h.ivLike.setColorFilter(Color.parseColor(if (post.likedByMe) "#059669" else "#FFFFFF"))
        h.btnLike.setOnClickListener {
            h.btnLike.animate().scaleX(1.2f).scaleY(1.2f).setDuration(110)
                .withEndAction { h.btnLike.animate().scaleX(1f).scaleY(1f).setDuration(160).start() }.start()
            onLike(post)
        }
    }

    override fun onViewRecycled(holder: VH) {
        holder.vv.stopPlayback()
        super.onViewRecycled(holder)
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val vv: VideoView = v.findViewById(R.id.vvReel)
        val btnPlay: ImageView = v.findViewById(R.id.btnReelPlay)
        val ivAvatar: ImageView = v.findViewById(R.id.ivReelAvatar)
        val tvName: TextView = v.findViewById(R.id.tvReelName)
        val tvCaption: TextView = v.findViewById(R.id.tvReelCaption)
        val btnLike: View = v.findViewById(R.id.btnReelLike)
        val ivLike: ImageView = v.findViewById(R.id.ivReelLike)
        val tvLikeCount: TextView = v.findViewById(R.id.tvReelLikeCount)
    }
}
