package dz.absorbs.app.data

import org.json.JSONObject

data class Profile(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val bio: String?,
    val verified: Boolean,
    val coverUrl: String? = null,
) {
    companion object {
        fun from(o: JSONObject) = Profile(
            id = o.optString("id"),
            username = o.optString("username"),
            displayName = o.optString("display_name", o.optString("username")),
            avatarUrl = o.optString("avatar_url").ifBlank { null },
            bio = o.optString("bio").ifBlank { null },
            verified = o.optBoolean("is_verified", false),
            coverUrl = o.optString("cover_url").ifBlank { null },
        )
    }
}

data class Post(
    val id: String,
    val authorId: String,
    val content: String,
    val imageUrl: String?,
    val mediaType: String,
    val createdAt: String,
    var author: Profile? = null,
    var likeCount: Int = 0,
    var commentCount: Int = 0,
    var likedByMe: Boolean = false,
) {
    companion object {
        fun from(o: JSONObject) = Post(
            id = o.optString("id"),
            authorId = o.optString("author_id"),
            content = o.optString("content"),
            imageUrl = o.optString("image_url").ifBlank { null },
            mediaType = o.optString("media_type", "image"),
            createdAt = o.optString("created_at"),
        )
    }
}

data class Comment(
    val id: String,
    val authorId: String,
    val parentId: String?,
    val content: String,
    val createdAt: String,
    var author: Profile? = null,
) {
    companion object {
        fun from(o: JSONObject) = Comment(
            id = o.optString("id"),
            authorId = o.optString("author_id"),
            parentId = o.optString("parent_id").ifBlank { null },
            content = o.optString("content"),
            createdAt = o.optString("created_at"),
        )
    }
}

data class StoryItem(
    val id: String,
    val authorId: String,
    val imageUrl: String,
    val caption: String?,
    val createdAt: String,
    var author: Profile? = null,
    var viewedByMe: Boolean = false,
) {
    companion object {
        fun from(o: JSONObject) = StoryItem(
            id = o.optString("id"),
            authorId = o.optString("author_id"),
            imageUrl = o.optString("image_url"),
            caption = o.optString("caption").ifBlank { null },
            createdAt = o.optString("created_at"),
        )
    }
}

/** Aggregated in-app notification (like / comment / follow on your content). */
data class NotifItem(
    val kind: String, // like | comment | follow
    val actor: Profile?,
    val postId: String?,
    val text: String,
    val createdAt: String,
)

data class ThreadItem(
    val id: String,
    val other: Profile?,
    val lastMessage: String,
    val lastAt: String,
)

data class ChatMsg(
    val id: String,
    val senderId: String,
    val content: String,
    val createdAt: String,
    val mine: Boolean,
)

/** Friendly Arabic relative time, e.g. "قبل ٥ دقائق" simplified to Latin digits. */
object TimeAr {
    private val fmts = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )

    fun ago(iso: String): String {
        val t = parse(iso) ?: return ""
        val diff = (System.currentTimeMillis() - t) / 1000
        return when {
            diff < 60 -> "الآن"
            diff < 3600 -> "قبل ${diff / 60} د"
            diff < 86400 -> "قبل ${diff / 3600} س"
            diff < 604800 -> "قبل ${diff / 86400} يوم"
            else -> "قبل ${diff / 604800} أسبوع"
        }
    }

    private fun parse(iso: String): Long? {
        for (f in fmts) {
            try {
                val sdf = java.text.SimpleDateFormat(f, java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                return sdf.parse(iso)?.time
            } catch (_: Exception) {
            }
        }
        return null
    }
}
