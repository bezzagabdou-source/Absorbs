package dz.absorbs.app.presentation.viewmodel

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import dz.absorbs.app.data.ChatMsg
import dz.absorbs.app.data.Comment
import dz.absorbs.app.data.NotifItem
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.Profile
import dz.absorbs.app.data.StoryItem
import dz.absorbs.app.data.ThreadItem
import dz.absorbs.app.domain.SocialRepository as Repo
import org.json.JSONArray
import org.json.JSONObject

private val mainHandler = Handler(Looper.getMainLooper())
fun onMain(block: () -> Unit) = mainHandler.post(block)

/** Global app state: session, language, theme, connectivity, my profile. */
class AppViewModel : ViewModel() {
    var loggedIn by mutableStateOf(Repo.isLoggedIn)
    var me by mutableStateOf<Profile?>(null)
    var online by mutableStateOf(true)
    var savedIds by mutableStateOf<Set<String>>(emptySet())
    var blockedIds by mutableStateOf<Set<String>>(emptySet())

    fun refreshSessionFlags() {
        loggedIn = Repo.isLoggedIn
        if (loggedIn) {
            Repo.myProfile { p, _ -> onMain { me = p } }
            Repo.savedIds { ids -> onMain { savedIds = ids } }
            Repo.blockedIds { ids -> onMain { blockedIds = ids } }
        }
    }

    fun toggleSave(post: Post) {
        val save = !savedIds.contains(post.id)
        Repo.setSave(post.id, save) { ok ->
            if (ok) onMain { savedIds = if (save) savedIds + post.id else savedIds - post.id }
        }
    }
}

class AuthViewModel : ViewModel() {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var info by mutableStateOf<String?>(null)
    var needsActivation by mutableStateOf(false)

    fun login(email: String, pass: String, onSuccess: () -> Unit) {
        busy = true; error = null; needsActivation = false
        Repo.signIn(email, pass) { err ->
            onMain {
                busy = false
                when {
                    err == null -> onSuccess()
                    err.contains("not confirmed", true) || err.contains("تفعيل") -> needsActivation = true
                    else -> error = err
                }
            }
        }
    }

    fun signup(email: String, pass: String, username: String, display: String, onSuccess: () -> Unit) {
        busy = true; error = null; needsActivation = false
        Repo.signUp(email, pass, username, display) { err ->
            onMain {
                busy = false
                when {
                    err == null -> onSuccess()
                    err.contains("فعّل بريدك") || err.contains("confirm", true) -> needsActivation = true
                    else -> error = err
                }
            }
        }
    }

    fun resend(email: String) {
        Repo.resendConfirmation(email) { err -> onMain { info = err } }
    }

    fun reset(email: String, sentMsg: String) {
        Repo.resetPassword(email) { err -> onMain { info = err ?: sentMsg } }
    }
}

class FeedViewModel(private val app: AppViewModel) : ViewModel() {
    val posts = mutableStateListOf<Post>()
    val stories = mutableStateListOf<StoryItem>()
    var loading by mutableStateOf(true)
    var loadingMore by mutableStateOf(false)
    var endReached by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var followingOnly by mutableStateOf(false)
    /** postId -> emoji -> count (v6 post_reactions) */
    val reactionCounts = androidx.compose.runtime.mutableStateMapOf<String, Map<String, Int>>()
    /** postId -> my emoji */
    val myReactions = androidx.compose.runtime.mutableStateMapOf<String, String>()
    var reactionsSupported by mutableStateOf(true)
        private set
    private var offset = 0
    private val pageSize = 20

    fun setFollowingOnly(value: Boolean, ctx: Context) {
        if (followingOnly == value) return
        followingOnly = value
        load(ctx, refresh = true)
    }

    fun load(ctx: Context, refresh: Boolean = false) {
        if (refresh) { offset = 0; endReached = false }
        if (offset == 0) loading = true
        Repo.stories { list, _ -> onMain { stories.clear(); if (list != null) stories.addAll(list) } }
        val source = if (followingOnly) Repo::feedFollowing else Repo::feed
        source(pageSize, offset) { list, err ->
            onMain {
                loading = false; loadingMore = false
                if (list != null) {
                    val visible = list.filter { !app.blockedIds.contains(it.authorId) }
                    if (offset == 0) {
                        posts.clear()
                        saveCache(ctx, list)
                    }
                    posts.addAll(visible)
                    if (list.size < pageSize) endReached = true
                    error = null
                    refreshReactions()
                } else {
                    if (offset == 0) loadCache(ctx)
                    error = err
                }
            }
        }
    }

    fun loadMore(ctx: Context) {
        if (loadingMore || endReached || loading) return
        loadingMore = true
        offset += pageSize
        load(ctx)
    }

    fun toggleLike(post: Post) {
        Repo.toggleLike(post) { ok -> if (ok) onMain { /* state mutated in place */ refreshPost(post) } }
    }

    fun refreshReactions() {
        val ids = posts.map { it.id }
        if (ids.isEmpty()) return
        Repo.reactionsFor(ids) { counts, mine, supported ->
            onMain {
                reactionsSupported = supported
                if (supported) {
                    reactionCounts.clear(); reactionCounts.putAll(counts)
                    myReactions.clear(); myReactions.putAll(mine)
                }
            }
        }
    }

    /** Facebook-style: one emoji per user per post; tapping mine again removes it. */
    fun toggleReaction(postId: String, emoji: String) {
        val previous = myReactions[postId]
        val removing = previous == emoji
        // optimistic
        val byPost = reactionCounts[postId]?.toMutableMap() ?: mutableMapOf()
        if (previous != null) byPost[previous] = maxOf(0, (byPost[previous] ?: 1) - 1)
        if (!removing) byPost[emoji] = (byPost[emoji] ?: 0) + 1
        reactionCounts[postId] = byPost.filterValues { it > 0 }
        if (removing) myReactions.remove(postId) else myReactions[postId] = emoji
        Repo.setPostReaction(postId, if (removing) null else emoji) { ok, missing ->
            onMain {
                if (missing) reactionsSupported = false
                if (!ok && !missing) {
                    // roll back
                    val rb = reactionCounts[postId]?.toMutableMap() ?: mutableMapOf()
                    if (previous != null) rb[previous] = (rb[previous] ?: 0) + 1
                    if (!removing) rb[emoji] = maxOf(0, (rb[emoji] ?: 1) - 1)
                    reactionCounts[postId] = rb.filterValues { it > 0 }
                    if (previous != null) myReactions[postId] = previous else myReactions.remove(postId)
                }
            }
        }
    }

    private fun refreshPost(post: Post) {
        val i = posts.indexOfFirst { it.id == post.id }
        if (i >= 0) { posts[i] = post.copy(likeCount = post.likeCount, likedByMe = post.likedByMe) }
    }

    private fun saveCache(ctx: Context, list: List<Post>) {
        try {
            val arr = JSONArray()
            list.forEach { p ->
                val o = JSONObject()
                    .put("id", p.id).put("author_id", p.authorId).put("content", p.content)
                    .put("image_url", p.imageUrl ?: "").put("media_type", p.mediaType)
                    .put("created_at", p.createdAt)
                    .put("likeCount", p.likeCount).put("commentCount", p.commentCount)
                p.author?.let { a ->
                    o.put("author", JSONObject().put("id", a.id).put("username", a.username)
                        .put("display_name", a.displayName).put("avatar_url", a.avatarUrl ?: "")
                        .put("is_verified", a.verified))
                }
                arr.put(o)
            }
            ctx.getSharedPreferences("dz_cache", Context.MODE_PRIVATE).edit()
                .putString("feed_json", arr.toString()).apply()
        } catch (_: Exception) {
        }
    }

    private fun loadCache(ctx: Context) {
        try {
            val raw = ctx.getSharedPreferences("dz_cache", Context.MODE_PRIVATE).getString("feed_json", null) ?: return
            val arr = JSONArray(raw)
            val list = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val p = Post.from(o)
                p.likeCount = o.optInt("likeCount"); p.commentCount = o.optInt("commentCount")
                o.optJSONObject("author")?.let { p.author = Profile.from(it) }
                p
            }
            posts.clear(); posts.addAll(list)
        } catch (_: Exception) {
        }
    }
}

class CommentsViewModel : ViewModel() {
    val comments = mutableStateListOf<Comment>()
    var loading by mutableStateOf(true)
    var error by mutableStateOf<String?>(null)
    lateinit var post: Post

    fun load(postId: String) {
        loading = true
        Repo.comments(postId) { list, err ->
            onMain {
                loading = false
                comments.clear()
                if (list != null) comments.addAll(list) else error = err
            }
        }
    }

    fun add(postId: String, content: String, parentId: String?, onDone: () -> Unit) {
        Repo.addComment(postId, content, parentId) { err ->
            onMain {
                if (err == null) { load(postId); onDone() } else error = err
            }
        }
    }
}

class ProfileViewModel : ViewModel() {
    var profile by mutableStateOf<Profile?>(null)
    val posts = mutableStateListOf<Post>()
    var postCount by mutableStateOf(0)
    var followersCount by mutableStateOf(0)
    var followingCount by mutableStateOf(0)
    var isFollowing by mutableStateOf(false)
    var loading by mutableStateOf(true)
    var error by mutableStateOf<String?>(null)

    fun load(userId: String) {
        loading = true
        Repo.profile(userId) { p, err ->
            onMain {
                profile = p; error = err
                if (p == null) loading = false
            }
        }
        Repo.counts(userId) { p, f1, f2 ->
            onMain { postCount = p; followersCount = f1; followingCount = f2 }
        }
        Repo.userPosts(userId) { list, _ ->
            onMain {
                posts.clear(); if (list != null) posts.addAll(list)
                loading = false
            }
        }
        if (userId != Repo.myId) {
            Repo.isFollowing(userId) { f -> onMain { isFollowing = f } }
        }
    }

    fun toggleFollow(userId: String) {
        val target = !isFollowing
        Repo.setFollow(userId, target) { ok ->
            if (ok) onMain {
                isFollowing = target
                followersCount += if (target) 1 else -1
            }
        }
    }
}

class ChatViewModel(val threadId: String) : ViewModel() {
    val messages = mutableStateListOf<ChatMsg>()
    var peerTyping by mutableStateOf(false)
    var peerOnline by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    private var typingClearAt = 0L

    fun load() {
        Repo.messages(threadId) { list, err ->
            onMain {
                if (list != null) {
                    val existing = messages.map { it.id }.toSet()
                    list.forEach { if (!existing.contains(it.id)) messages.add(it) }
                    messages.sortBy { it.createdAt }
                } else error = err
            }
        }
    }

    fun onRealtimeMessage(msg: ChatMsg) {
        onMain {
            if (messages.none { it.id == msg.id }) {
                messages.add(msg)
                messages.sortBy { it.createdAt }
            }
        }
    }

    fun onTyping() {
        onMain {
            peerTyping = true
            typingClearAt = System.currentTimeMillis() + 2600
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (System.currentTimeMillis() >= typingClearAt) peerTyping = false
            }, 2700)
        }
    }

    fun onPresence(ids: Set<String>) {
        onMain { peerOnline = ids.any { it != Repo.myId } }
    }

    fun send(content: String) {
        Repo.sendMessage(threadId, content) { err ->
            onMain { if (err == null) load() else error = err }
        }
    }
}

class NotificationsViewModel : ViewModel() {
    val items = mutableStateListOf<NotifItem>()
    var loading by mutableStateOf(true)
    var usingRealTable by mutableStateOf(false)
        private set
    var unread by mutableStateOf(0)
        private set

    fun load() {
        loading = true
        Repo.notificationsV6 { list, err ->
            if (list != null) {
                // Real table: mark everything read, clear the badge locally too.
                onMain {
                    usingRealTable = true
                    items.clear(); items.addAll(list); loading = false
                    unread = 0
                }
                Repo.markAllNotificationsRead { }
            } else if (Repo.isMissingSchema(err)) {
                // upgrade-v6 not installed yet → legacy aggregated feed
                Repo.notifications { legacy ->
                    onMain {
                        usingRealTable = false
                        items.clear(); items.addAll(legacy); loading = false
                    }
                }
                Repo.unreadNotifications { n -> onMain { if (n >= 0) unread = n } }
            } else {
                onMain { loading = false }
                Repo.unreadNotifications { n -> onMain { if (n >= 0) unread = n } }
            }
        }
    }

    /** Header action: mark everything read (server + local badge). */
    fun markAllShown() {
        Repo.markAllNotificationsRead { }
        unread = 0
    }

    fun refreshUnreadOnly() {
        Repo.unreadNotifications { n -> onMain { if (n >= 0) unread = n } }
    }
}
