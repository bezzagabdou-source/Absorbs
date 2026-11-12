package dz.absorbs.app.ui

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.bumptech.glide.Glide
import com.facebook.shimmer.ShimmerFrameLayout
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.StoryItem
import dz.absorbs.app.data.TimeAr

class FeedFragment : Fragment() {
    private lateinit var adapter: PostsAdapter
    private lateinit var storiesAdapter: StoriesAdapter
    private var swipe: SwipeRefreshLayout? = null
    private var shimmer: ShimmerFrameLayout? = null
    private var tvEmpty: TextView? = null
    private var rvStories: RecyclerView? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val v = inflater.inflate(R.layout.fragment_feed, container, false)
        swipe = v.findViewById(R.id.swipeFeed)
        shimmer = v.findViewById(R.id.shimmerFeed)
        tvEmpty = v.findViewById(R.id.tvEmpty)
        rvStories = v.findViewById(R.id.rvStories)

        val rv = v.findViewById<RecyclerView>(R.id.rvPosts)
        adapter = PostsAdapter(
            onLike = { post -> Api.toggleLike(post) { ok -> activity?.runOnUiThread { if (ok) adapter.notifyDataSetChanged() } } },
            onComment = { post ->
                val i = Intent(requireContext(), PostDetailActivity::class.java)
                i.putExtra("post_id", post.id)
                i.putExtra("post_content", post.content)
                startActivity(i)
            },
            onReport = { post -> showReport(post) },
        )
        rv.layoutManager = LinearLayoutManager(requireContext())
        rv.layoutAnimation = android.view.animation.AnimationUtils.loadLayoutAnimation(requireContext(), R.anim.layout_fall)
        rv.adapter = adapter

        storiesAdapter = StoriesAdapter(
            onAdd = {
                val i = Intent(requireContext(), ComposerActivity::class.java)
                i.putExtra("mode", "story")
                startActivity(i)
            },
            onOpen = { story ->
                Api.markStoryViewed(story.id)
                story.viewedByMe = true
                storiesAdapter.notifyDataSetChanged()
                val i = Intent(requireContext(), StoryViewActivity::class.java)
                i.putExtra("image", story.imageUrl)
                i.putExtra("caption", story.caption ?: "")
                i.putExtra("author", story.author?.displayName ?: "")
                i.putExtra("avatar", story.author?.avatarUrl ?: "")
                i.putExtra("time", story.createdAt)
                startActivity(i)
            },
        )
        rvStories?.layoutManager = LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
        rvStories?.adapter = storiesAdapter

        swipe?.setColorSchemeColors(Color.parseColor("#059669"), Color.parseColor("#0284C7"))
        swipe?.setOnRefreshListener { loadAll() }
        v.findViewById<TextView>(R.id.btnRefresh).setOnClickListener { loadAll() }
        v.findViewById<TextView>(R.id.btnSearch).setOnClickListener {
            startActivity(Intent(requireContext(), SearchActivity::class.java))
        }
        Api.fetchMyProfile { profile, _ ->
            activity?.runOnUiThread {
                if (profile != null) v.findViewById<TextView>(R.id.tvHello).text = "أهلًا، ${profile.displayName}"
            }
        }
        loadAll()
        return v
    }

    override fun onResume() {
        super.onResume()
        if (::adapter.isInitialized && adapter.itemCount > 0) loadAll()
    }

    private fun loadAll() {
        shimmer?.visibility = View.VISIBLE
        shimmer?.startShimmer()
        Api.fetchStories { stories, _ ->
            activity?.runOnUiThread {
                if (!stories.isNullOrEmpty()) {
                    rvStories?.visibility = View.VISIBLE
                    storiesAdapter.submit(stories)
                } else rvStories?.visibility = View.GONE
            }
        }
        Api.fetchFeed { posts, err ->
            activity?.runOnUiThread {
                shimmer?.stopShimmer()
                shimmer?.visibility = View.GONE
                swipe?.isRefreshing = false
                if (posts != null) {
                    adapter.submit(posts)
                    tvEmpty?.visibility = if (posts.isEmpty()) View.VISIBLE else View.GONE
                } else {
                    Toast.makeText(requireContext(), err ?: "تعذّر تحميل الخلاصة", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showReport(post: Post) {
        val reasons = arrayOf("محتوى مسيء أو كراهية", "تحرّش أو تنمّر", "محتوى جنسي", "عنف", "معلومات مضلّلة", "بريد مزعج / احتيال", "أخرى")
        AlertDialog.Builder(requireContext())
            .setTitle("الإبلاغ عن المنشور")
            .setItems(reasons) { _, which ->
                Api.report("post", post.id, reasons[which]) { ok ->
                    activity?.runOnUiThread {
                        Toast.makeText(requireContext(), if (ok) "تم استلام بلاغك — سيُراجع قريبًا" else "تعذّر إرسال البلاغ الآن", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("إلغاء", null)
            .show()
    }
}

/** Stories rail: "your story" add-tile first, then unviewed (gradient ring) → viewed (grey ring). */
class StoriesAdapter(
    private val onAdd: () -> Unit,
    private val onOpen: (StoryItem) -> Unit,
) : RecyclerView.Adapter<StoriesAdapter.VH>() {
    private val items = mutableListOf<StoryItem>()

    fun submit(list: List<StoryItem>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun getItemCount() = items.size + 1

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_story, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(h: VH, pos: Int) {
        val ctx = h.itemView.context
        if (pos == 0) {
            h.ring.setBackgroundResource(R.drawable.bg_ring_seen)
            h.avatar.setImageResource(R.drawable.ic_plus)
            h.avatar.setColorFilter(Color.parseColor("#059669"))
            h.avatar.setPadding(16, 16, 16, 16)
            h.name.text = "قصتك"
            h.itemView.setOnClickListener { onAdd() }
            return
        }
        val story = items[pos - 1]
        h.ring.setBackgroundResource(if (story.viewedByMe) R.drawable.bg_ring_seen else R.drawable.bg_ring_new)
        h.name.text = story.author?.displayName ?: "مستخدم"
        val avatar = story.author?.avatarUrl
        if (!avatar.isNullOrBlank()) {
            Glide.with(ctx).load(avatar).circleCrop().into(h.avatar)
            h.avatar.setPadding(0, 0, 0, 0)
            h.avatar.clearColorFilter()
        } else {
            h.avatar.setImageResource(R.drawable.ic_user)
            h.avatar.setPadding(18, 18, 18, 18)
        }
        h.itemView.setOnClickListener { onOpen(story) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val ring: View = v.findViewById(R.id.storyRing)
        val avatar: ImageView = v.findViewById(R.id.ivStoryAvatar)
        val name: TextView = v.findViewById(R.id.tvStoryName)
    }
}

class PostsAdapter(
    private val onLike: (Post) -> Unit,
    private val onComment: (Post) -> Unit,
    private val onReport: (Post) -> Unit,
) : RecyclerView.Adapter<PostsAdapter.VH>() {
    private val items = mutableListOf<Post>()

    fun submit(list: List<Post>) {
        items.clear(); items.addAll(list); notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_post, parent, false)
        return VH(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, pos: Int) {
        val post = items[pos]
        val ctx = h.itemView.context
        h.tvName.text = post.author?.displayName ?: "مستخدم Dz connect"
        val user = post.author?.username ?: ""
        h.tvMeta.text = "@$user · ${TimeAr.ago(post.createdAt)}"
        h.tvContent.text = post.content
        h.tvContent.visibility = if (post.content.isBlank()) View.GONE else View.VISIBLE

        val avatar = post.author?.avatarUrl
        if (!avatar.isNullOrBlank()) {
            Glide.with(ctx).load(avatar).circleCrop().placeholder(R.drawable.ic_user).into(h.ivAvatar)
            h.ivAvatar.setPadding(0, 0, 0, 0)
        } else {
            h.ivAvatar.setImageResource(R.drawable.ic_user)
        }

        val isVideo = post.mediaType == "video" && !post.imageUrl.isNullOrBlank()
        if (isVideo) {
            h.ivImage.visibility = View.GONE
            h.videoBox.visibility = View.VISIBLE
            h.vv.setVideoPath(post.imageUrl)
            h.btnPlay.setOnClickListener {
                if (h.vv.isPlaying) { h.vv.pause(); h.btnPlay.visibility = View.VISIBLE }
                else { h.vv.start(); h.btnPlay.visibility = View.GONE }
            }
            h.vv.setOnCompletionListener { h.btnPlay.visibility = View.VISIBLE }
        } else if (!post.imageUrl.isNullOrBlank()) {
            h.videoBox.visibility = View.GONE
            h.ivImage.visibility = View.VISIBLE
            Glide.with(ctx).load(post.imageUrl).centerCrop().into(h.ivImage)
        } else {
            h.ivImage.visibility = View.GONE
            h.videoBox.visibility = View.GONE
        }

        h.tvLikeCount.text = post.likeCount.toString()
        h.tvCommentCount.text = post.commentCount.toString()
        h.ivLike.setColorFilter(Color.parseColor(if (post.likedByMe) "#059669" else "#3D5750"))
        h.btnLike.setOnClickListener {
            h.btnLike.animate().scaleX(1.25f).scaleY(1.25f).setDuration(110)
                .withEndAction { h.btnLike.animate().scaleX(1f).scaleY(1f).setDuration(160).start() }.start()
            onLike(post)
        }
        h.btnComment.setOnClickListener { onComment(post) }
        h.btnReport.setOnClickListener { onReport(post) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val ivAvatar: ImageView = v.findViewById(R.id.ivAvatar)
        val tvName: TextView = v.findViewById(R.id.tvName)
        val tvMeta: TextView = v.findViewById(R.id.tvMeta)
        val tvContent: TextView = v.findViewById(R.id.tvContent)
        val ivImage: ImageView = v.findViewById(R.id.ivPostImage)
        val videoBox: View = v.findViewById(R.id.videoBox)
        val vv: VideoView = v.findViewById(R.id.vvPost)
        val btnPlay: ImageView = v.findViewById(R.id.btnPlay)
        val btnLike: View = v.findViewById(R.id.btnLike)
        val ivLike: ImageView = v.findViewById(R.id.ivLike)
        val tvLikeCount: TextView = v.findViewById(R.id.tvLikeCount)
        val btnComment: View = v.findViewById(R.id.btnComment)
        val tvCommentCount: TextView = v.findViewById(R.id.tvCommentCount)
        val btnReport: ImageView = v.findViewById(R.id.btnReport)
    }
}
