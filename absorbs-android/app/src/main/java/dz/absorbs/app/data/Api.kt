package dz.absorbs.app.data

import android.content.Context
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Session storage (tokens for Supabase Auth). */
object Session {
    private const val PREF = "dz_native_session"
    var access: String = ""
    var refresh: String = ""
    var userId: String = ""
    var expiresAt: Long = 0L

    fun load(ctx: Context) {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        access = p.getString("access", "") ?: ""
        refresh = p.getString("refresh", "") ?: ""
        userId = p.getString("uid", "") ?: ""
        expiresAt = p.getLong("exp", 0L)
    }

    fun save(ctx: Context) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString("access", access).putString("refresh", refresh)
            .putString("uid", userId).putLong("exp", expiresAt).apply()
    }

    fun clear(ctx: Context) {
        access = ""; refresh = ""; userId = ""; expiresAt = 0L
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply()
    }

    val loggedIn: Boolean get() = access.isNotBlank() && userId.isNotBlank()
}

/** Native Supabase client (Auth + PostgREST + Storage) — no WebView, no HTML. */
object Api {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    private lateinit var appCtx: Context
    fun init(ctx: Context) {
        appCtx = ctx.applicationContext
        Session.load(appCtx)
    }

    private fun enqueue(req: Request, cb: (body: String?, code: Int) -> Unit) {
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = cb(null, -1)
            override fun onResponse(call: Call, response: Response) {
                val b = try { response.body?.string() } catch (_: Exception) { null }
                cb(b, response.code)
            }
        })
    }

    private fun errMsg(body: String?, fallback: String): String {
        if (body == null) return fallback
        return try {
            val o = JSONObject(body)
            o.optString("msg", "").ifBlank { o.optString("message", "") }
                .ifBlank { o.optString("error_description", "") }
                .ifBlank { o.optString("error", "") }.ifBlank { fallback }
        } catch (_: Exception) { fallback }
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    private fun saveSession(o: JSONObject) {
        Session.access = o.optString("access_token")
        Session.refresh = o.optString("refresh_token")
        Session.userId = o.optJSONObject("user")?.optString("id") ?: Session.userId
        Session.expiresAt = System.currentTimeMillis() + o.optLong("expires_in", 3600) * 1000
        Session.save(appCtx)
    }

    /** Save a session arriving via the dzconnect://auth deep link (Google OAuth). */
    fun saveSessionFromDeepLink(accessToken: String, refreshToken: String, expiresInSec: Long) {
        Session.access = accessToken
        Session.refresh = refreshToken
        Session.userId = jwtUserId(accessToken) ?: Session.userId
        Session.expiresAt = System.currentTimeMillis() + expiresInSec * 1000
        Session.save(appCtx)
    }

    private fun jwtUserId(jwt: String): String? {
        return try {
            val payload = jwt.split(".").getOrNull(1) ?: return null
            val decoded = android.util.Base64.decode(
                payload, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
            )
            JSONObject(String(decoded, Charsets.UTF_8)).optString("sub").ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    fun signIn(email: String, password: String, cb: (String?) -> Unit) {
        val body = JSONObject().put("email", email).put("password", password).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/token?grant_type=password")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .post(body).build()
        enqueue(req) { b, code ->
            if (code in 200..299 && b != null) { saveSession(JSONObject(b)); cb(null) }
            else cb(errMsg(b, "بيانات الدخول غير صحيحة"))
        }
    }

    fun signUp(email: String, password: String, username: String, displayName: String, cb: (String?) -> Unit) {
        val body = JSONObject().put("email", email).put("password", password).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/signup?redirect_to=${Config.SITE_URL}/auth/confirm")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .post(body).build()
        enqueue(req) { b, code ->
            if (code !in 200..299 || b == null) { cb(errMsg(b, "تعذّر إنشاء الحساب")); return@enqueue }
            val o = JSONObject(b)
            if (o.optString("access_token").isBlank()) {
                cb("تم إنشاء الحساب — فعّل بريدك الإلكتروني ثم سجّل الدخول")
                return@enqueue
            }
            saveSession(o)
            // Create the public profile row (RLS: users insert their own profile).
            val p = JSONObject()
                .put("id", Session.userId).put("username", username).put("display_name", displayName)
            restRaw("POST", "profiles", p) { _, pcode ->
                if (pcode in 200..299) cb(null) else cb("اسم المستخدم مأخوذ — سجّل الدخول واختر اسمًا آخر من الموقع")
            }
        }
    }

    fun signOut() {
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/logout")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .addHeader("Authorization", "Bearer ${Session.access}")
            .post("{}".toRequestBody(JSON)).build()
        enqueue(req) { _, _ -> }
        Session.clear(appCtx)
    }

    private fun refreshToken(cb: (Boolean) -> Unit) {
        if (Session.refresh.isBlank()) return cb(false)
        val body = JSONObject().put("refresh_token", Session.refresh).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .post(body).build()
        enqueue(req) { b, code ->
            if (code in 200..299 && b != null) { saveSession(JSONObject(b)); cb(true) } else cb(false)
        }
    }

    /** REST call with one automatic token-refresh retry on 401. */
    private fun restRaw(method: String, path: String, body: JSONObject?, retried: Boolean = false, cb: (String?, Int) -> Unit) {
        val url = "${Config.SUPABASE_URL}/rest/v1/$path"
        val builder = Request.Builder().url(url)
            .addHeader("apikey", Config.SUPABASE_KEY)
            .addHeader("Authorization", "Bearer ${Session.access}")
            .addHeader("Prefer", "return=representation")
        when (method) {
            "POST" -> builder.post((body ?: JSONObject()).toString().toRequestBody(JSON))
            "PATCH" -> builder.patch((body ?: JSONObject()).toString().toRequestBody(JSON))
            "DELETE" -> builder.delete()
            else -> builder.get()
        }
        enqueue(builder.build()) { b, code ->
            if (code == 401 && !retried) {
                refreshToken { ok -> if (ok) restRaw(method, path, body, true, cb) else cb(b, code) }
            } else cb(b, code)
        }
    }

    private fun rest(method: String, path: String, body: JSONObject? = null, cb: (JSONArray?, String?) -> Unit) {
        restRaw(method, path, body) { b, code ->
            if (code in 200..299) {
                val arr = try { if (b.isNullOrBlank()) JSONArray() else JSONArray(b) } catch (_: Exception) { JSONArray() }
                cb(arr, null)
            } else cb(null, errMsg(b, "حدث خطأ ($code)"))
        }
    }

    // ── Feed ────────────────────────────────────────────────────────────────
    fun fetchFeed(limit: Int = 40, offset: Int = 0, cb: (List<Post>?, String?) -> Unit) {
        rest("GET", "posts?select=*&order=created_at.desc&limit=$limit&offset=$offset") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val posts = (0 until arr.length()).map { Post.from(arr.getJSONObject(it)) }
            if (posts.isEmpty()) return@rest cb(emptyList(), null)
            val ids = posts.joinToString(",") { it.authorId }
            val postIds = posts.joinToString(",") { it.id }
            rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                posts.forEach { it.author = byId[it.authorId] }
                rest("GET", "comments?select=post_id&post_id=in.($postIds)") { carr, _ ->
                    if (carr != null) {
                        val counts = mutableMapOf<String, Int>()
                        for (i in 0 until carr.length()) {
                            val pid = carr.getJSONObject(i).optString("post_id")
                            counts[pid] = (counts[pid] ?: 0) + 1
                        }
                        posts.forEach { it.commentCount = counts[it.id] ?: 0 }
                    }
                    rest("GET", "likes?select=post_id,user_id&post_id=in.($postIds)") { larr, _ ->
                        if (larr != null) {
                            val counts = mutableMapOf<String, Int>()
                            val mine = mutableSetOf<String>()
                            for (i in 0 until larr.length()) {
                                val o = larr.getJSONObject(i)
                                val pid = o.optString("post_id")
                                counts[pid] = (counts[pid] ?: 0) + 1
                                if (o.optString("user_id") == Session.userId) mine.add(pid)
                            }
                            posts.forEach { it.likeCount = counts[it.id] ?: 0; it.likedByMe = mine.contains(it.id) }
                        }
                        cb(posts, null)
                    }
                }
            }
        }
    }

    fun toggleLike(post: Post, cb: (Boolean) -> Unit) {
        if (post.likedByMe) {
            restRaw("DELETE", "likes?post_id=eq.${post.id}&user_id=eq.${Session.userId}", null) { _, code ->
                if (code in 200..299) { post.likedByMe = false; post.likeCount--; cb(true) } else cb(false)
            }
        } else {
            val b = JSONObject().put("post_id", post.id).put("user_id", Session.userId)
            restRaw("POST", "likes", b) { _, code ->
                if (code in 200..299) { post.likedByMe = true; post.likeCount++; cb(true) } else cb(false)
            }
        }
    }

    fun createPost(content: String, imageUrl: String?, mediaType: String, cb: (String?) -> Unit) {
        val b = JSONObject().put("author_id", Session.userId).put("content", content)
        if (imageUrl != null) { b.put("image_url", imageUrl); b.put("media_type", mediaType) }
        restRaw("POST", "posts", b) { body, code ->
            if (code in 200..299) cb(null) else cb(errMsg(body, "تعذّر نشر المنشور"))
        }
    }

    fun uploadImage(bytes: ByteArray, mime: String, cb: (String?, String?) -> Unit) {
        val ext = if (mime.contains("png")) "png" else "jpg"
        val path = "${Session.userId}/${System.currentTimeMillis()}.$ext"
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/storage/v1/object/post-images/$path")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .addHeader("Authorization", "Bearer ${Session.access}")
            .addHeader("Content-Type", mime)
            .post(bytes.toRequestBody(mime.toMediaType())).build()
        enqueue(req) { b, code ->
            if (code in 200..299) cb("${Config.SUPABASE_URL}/storage/v1/object/public/post-images/$path", null)
            else cb(null, errMsg(b, "تعذّر رفع الصورة"))
        }
    }

    // ── Comments ────────────────────────────────────────────────────────────
    fun fetchComments(postId: String, cb: (List<Comment>?, String?) -> Unit) {
        rest("GET", "comments?select=*&post_id=eq.$postId&order=created_at.asc&limit=200") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val comments = (0 until arr.length()).map { Comment.from(arr.getJSONObject(it)) }
            val authorIds = comments.map { it.authorId }.distinct()
            if (authorIds.isEmpty()) return@rest cb(comments, null)
            rest("GET", "profiles?select=*&id=in.(${authorIds.joinToString(",")})") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                comments.forEach { it.author = byId[it.authorId] }
                cb(comments, null)
            }
        }
    }

    fun addComment(postId: String, content: String, cb: (String?) -> Unit) {
        val b = JSONObject().put("post_id", postId).put("author_id", Session.userId).put("content", content)
        restRaw("POST", "comments", b) { body, code ->
            if (code in 200..299) cb(null) else cb(errMsg(body, "تعذّر إرسال التعليق"))
        }
    }

    // ── Messages ────────────────────────────────────────────────────────────
    fun fetchThreads(cb: (List<ThreadItem>?, String?) -> Unit) {
        val me = Session.userId
        rest("GET", "dm_threads?select=*&or=(user_low.eq.$me,user_high.eq.$me)&order=created_at.desc&limit=50") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            if (arr.length() == 0) return@rest cb(emptyList(), null)
            val otherIds = mutableSetOf<String>()
            val threadIds = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                threadIds.add(o.optString("id"))
                val low = o.optString("user_low"); val high = o.optString("user_high")
                otherIds.add(if (low == me) high else low)
            }
            rest("GET", "profiles?select=*&id=in.(${otherIds.joinToString(",")})") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                rest("GET", "messages?select=*&thread_id=in.(${threadIds.joinToString(",")})&order=created_at.desc&limit=200") { marr, _ ->
                    val last = mutableMapOf<String, JSONObject>()
                    if (marr != null) for (i in 0 until marr.length()) {
                        val m = marr.getJSONObject(i)
                        val tid = m.optString("thread_id")
                        if (!last.containsKey(tid)) last[tid] = m
                    }
                    val items = (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        val low = o.optString("user_low"); val high = o.optString("user_high")
                        val otherId = if (low == me) high else low
                        val lm = last[o.optString("id")]
                        ThreadItem(
                            id = o.optString("id"),
                            other = byId[otherId],
                            lastMessage = lm?.optString("content") ?: "",
                            lastAt = lm?.optString("created_at") ?: o.optString("created_at"),
                        )
                    }
                    cb(items, null)
                }
            }
        }
    }

    fun fetchMessages(threadId: String, cb: (List<ChatMsg>?, String?) -> Unit) {
        rest("GET", "messages?select=*&thread_id=eq.$threadId&order=created_at.asc&limit=200") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val msgs = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                ChatMsg(o.optString("id"), o.optString("sender_id"), o.optString("content"), o.optString("created_at"), o.optString("sender_id") == Session.userId)
            }
            cb(msgs, null)
        }
    }

    fun sendMessage(threadId: String, content: String, cb: (String?) -> Unit) {
        val b = JSONObject().put("thread_id", threadId).put("sender_id", Session.userId).put("content", content)
        restRaw("POST", "messages", b) { body, code ->
            if (code in 200..299) cb(null) else cb(errMsg(body, "تعذّر إرسال الرسالة"))
        }
    }

    // ── Profile / account ───────────────────────────────────────────────────
    fun fetchMyProfile(cb: (Profile?, String?) -> Unit) {
        rest("GET", "profiles?select=*&id=eq.${Session.userId}") { arr, err ->
            if (arr == null || arr.length() == 0) cb(null, err ?: "لا يوجد ملف شخصي بعد")
            else cb(Profile.from(arr.getJSONObject(0)), null)
        }
    }

    fun deleteAccount(cb: (String?) -> Unit) {
        restRaw("POST", "rpc/delete_own_account", JSONObject()) { body, code ->
            if (code in 200..299) { Session.clear(appCtx); cb(null) }
            else cb(errMsg(body, "الحذف داخل التطبيق غير مفعّل بعد — استعمل صفحة حذف الحساب على الموقع"))
        }
    }

    fun report(targetType: String, targetId: String, reason: String, cb: (Boolean) -> Unit) {
        val b = JSONObject().put("reporter_id", Session.userId).put("target_type", targetType)
            .put("target_id", targetId).put("reason", reason)
        restRaw("POST", "reports", b) { _, code -> cb(code in 200..299) }
    }

    /** Resend the signup confirmation email (lands on /auth/confirm). */
    fun resendConfirmation(email: String, cb: (String?) -> Unit) {
        val body = JSONObject().put("type", "signup").put("email", email).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/resend?redirect_to=${Config.SITE_URL}/auth/confirm")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .post(body).build()
        enqueue(req) { b, code ->
            if (code in 200..299) cb(null) else cb(errMsg(b, "تعذّر إعادة الإرسال — حاول بعد دقيقة"))
        }
    }

    // ── Stories (24h) ───────────────────────────────────────────────────────
    fun fetchStories(cb: (List<StoryItem>?, String?) -> Unit) {
        val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
            .format(java.util.Date())
        rest("GET", "stories?select=*&expires_at=gt.$now&order=created_at.desc&limit=60") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val stories = (0 until arr.length()).map { StoryItem.from(arr.getJSONObject(it)) }
            if (stories.isEmpty()) return@rest cb(emptyList(), null)
            val ids = stories.joinToString(",") { it.authorId }
            val storyIds = stories.joinToString(",") { it.id }
            rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                stories.forEach { it.author = byId[it.authorId] }
                rest("GET", "story_views?select=story_id&viewer_id=eq.${Session.userId}&story_id=in.($storyIds)") { varr, _ ->
                    if (varr != null) {
                        val seen = mutableSetOf<String>()
                        for (i in 0 until varr.length()) seen.add(varr.getJSONObject(i).optString("story_id"))
                        stories.forEach { it.viewedByMe = seen.contains(it.id) }
                    }
                    // Unviewed first (server order = newest first inside each group).
                    cb(stories.sortedBy { it.viewedByMe }, null)
                }
            }
        }
    }

    fun markStoryViewed(storyId: String) {
        val b = JSONObject().put("story_id", storyId).put("viewer_id", Session.userId)
        restRaw("POST", "story_views", b) { _, _ -> }
    }

    fun createStory(imageBytes: ByteArray, mime: String, caption: String, cb: (String?) -> Unit) {
        uploadImage(imageBytes, mime) { url, err ->
            if (url == null) return@uploadImage cb(err)
            val b = JSONObject().put("author_id", Session.userId).put("image_url", url)
            if (caption.isNotBlank()) b.put("caption", caption)
            restRaw("POST", "stories", b) { body, code ->
                if (code in 200..299) cb(null) else cb(errMsg(body, "تعذّر نشر القصة"))
            }
        }
    }

    // ── Search people ───────────────────────────────────────────────────────
    fun searchProfiles(query: String, cb: (List<Profile>?, String?) -> Unit) {
        val q = java.net.URLEncoder.encode(query.trim(), "UTF-8")
        rest("GET", "profiles?select=*&or=(username.ilike.*$q*,display_name.ilike.*$q*)&limit=25") { arr, err ->
            if (arr == null) cb(null, err)
            else cb((0 until arr.length()).map { Profile.from(arr.getJSONObject(it)) }, null)
        }
    }

    // ── Password reset ──────────────────────────────────────────────────────
    fun resetPassword(email: String, cb: (String?) -> Unit) {
        val body = JSONObject().put("email", email).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/auth/v1/recover?redirect_to=${Config.SITE_URL}/auth/confirm")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .post(body).build()
        enqueue(req) { b, code ->
            if (code in 200..299) cb(null) else cb(errMsg(b, "تعذّر إرسال رابط الاستعادة"))
        }
    }

    // ── Profiles / follows ──────────────────────────────────────────────────
    fun fetchProfileById(id: String, cb: (Profile?, String?) -> Unit) {
        rest("GET", "profiles?select=*&id=eq.$id") { arr, err ->
            if (arr == null || arr.length() == 0) cb(null, err ?: "المستخدم غير موجود")
            else cb(Profile.from(arr.getJSONObject(0)), null)
        }
    }

    fun fetchCounts(userId: String, cb: (posts: Int, followers: Int, following: Int) -> Unit) {
        var p = 0; var f1 = 0; var f2 = 0; var done = 0
        fun tick() { done++; if (done == 3) cb(p, f1, f2) }
        rest("GET", "posts?select=id&author_id=eq.$userId&limit=1000") { a, _ -> p = a?.length() ?: 0; tick() }
        rest("GET", "follows?select=follower_id&following_id=eq.$userId&limit=1000") { a, _ -> f1 = a?.length() ?: 0; tick() }
        rest("GET", "follows?select=following_id&follower_id=eq.$userId&limit=1000") { a, _ -> f2 = a?.length() ?: 0; tick() }
    }

    fun isFollowing(targetId: String, cb: (Boolean) -> Unit) {
        rest("GET", "follows?select=follower_id&follower_id=eq.${Session.userId}&following_id=eq.$targetId") { a, _ ->
            cb((a?.length() ?: 0) > 0)
        }
    }

    fun setFollow(targetId: String, follow: Boolean, cb: (Boolean) -> Unit) {
        if (follow) {
            val b = JSONObject().put("follower_id", Session.userId).put("following_id", targetId)
            restRaw("POST", "follows", b) { _, code -> cb(code in 200..299) }
        } else {
            restRaw("DELETE", "follows?follower_id=eq.${Session.userId}&following_id=eq.$targetId", null) { _, code -> cb(code in 200..299) }
        }
    }

    fun fetchFollowList(userId: String, followers: Boolean, cb: (List<Profile>) -> Unit) {
        val col = if (followers) "follower_id" else "following_id"
        val filterCol = if (followers) "following_id" else "follower_id"
        rest("GET", "follows?select=$col&$filterCol=eq.$userId&limit=200") { arr, _ ->
            if (arr == null || arr.length() == 0) return@rest cb(emptyList())
            val ids = (0 until arr.length()).joinToString(",") { arr.getJSONObject(it).optString(col) }
            rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                val list = if (parr == null) emptyList() else (0 until parr.length()).map { Profile.from(parr.getJSONObject(it)) }
                cb(list)
            }
        }
    }

    fun updateProfile(displayName: String, bio: String, website: String, avatarUrl: String?, coverUrl: String?, cb: (String?) -> Unit) {
        val b = JSONObject().put("display_name", displayName).put("bio", bio).put("website", website)
        if (avatarUrl != null) b.put("avatar_url", avatarUrl)
        if (coverUrl != null) b.put("cover_url", coverUrl)
        restRaw("PATCH", "profiles?id=eq.${Session.userId}", b) { body, code ->
            if (code in 200..299) cb(null) else cb(errMsg(body, "تعذّر حفظ التعديلات"))
        }
    }

    fun uploadToBucket(bucket: String, bytes: ByteArray, mime: String, cb: (String?, String?) -> Unit) {
        val ext = when {
            mime.contains("png") -> "png"
            mime.contains("webp") -> "webp"
            mime.startsWith("video") -> "mp4"
            else -> "jpg"
        }
        val path = "${Session.userId}/${System.currentTimeMillis()}.$ext"
        val req = Request.Builder()
            .url("${Config.SUPABASE_URL}/storage/v1/object/$bucket/$path")
            .addHeader("apikey", Config.SUPABASE_KEY)
            .addHeader("Authorization", "Bearer ${Session.access}")
            .addHeader("Content-Type", mime)
            .post(bytes.toRequestBody(mime.toMediaType())).build()
        enqueue(req) { b, code ->
            if (code in 200..299) cb("${Config.SUPABASE_URL}/storage/v1/object/public/$bucket/$path", null)
            else cb(null, errMsg(b, "تعذّر رفع الملف"))
        }
    }

    fun fetchUserPosts(userId: String, cb: (List<Post>?, String?) -> Unit) {
        rest("GET", "posts?select=*&author_id=eq.$userId&order=created_at.desc&limit=60") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val posts = (0 until arr.length()).map { Post.from(arr.getJSONObject(it)) }
            fetchProfileById(userId) { profile, _ ->
                posts.forEach { it.author = profile }
                if (posts.isEmpty()) return@fetchProfileById cb(posts, null)
                val postIds = posts.joinToString(",") { it.id }
                rest("GET", "likes?select=post_id,user_id&post_id=in.($postIds)") { larr, _ ->
                    if (larr != null) {
                        val counts = mutableMapOf<String, Int>(); val mine = mutableSetOf<String>()
                        for (i in 0 until larr.length()) {
                            val o = larr.getJSONObject(i); val pid = o.optString("post_id")
                            counts[pid] = (counts[pid] ?: 0) + 1
                            if (o.optString("user_id") == Session.userId) mine.add(pid)
                        }
                        posts.forEach { it.likeCount = counts[it.id] ?: 0; it.likedByMe = mine.contains(it.id) }
                    }
                    cb(posts, null)
                }
            }
        }
    }

    // ── Saves ───────────────────────────────────────────────────────────────
    fun fetchSavedIds(cb: (Set<String>) -> Unit) {
        rest("GET", "saves?select=post_id&user_id=eq.${Session.userId}&limit=500") { arr, _ ->
            val ids = mutableSetOf<String>()
            if (arr != null) for (i in 0 until arr.length()) ids.add(arr.getJSONObject(i).optString("post_id"))
            cb(ids)
        }
    }

    fun setSave(postId: String, save: Boolean, cb: (Boolean) -> Unit) {
        if (save) {
            val b = JSONObject().put("post_id", postId).put("user_id", Session.userId)
            restRaw("POST", "saves", b) { _, code -> cb(code in 200..299) }
        } else {
            restRaw("DELETE", "saves?post_id=eq.$postId&user_id=eq.${Session.userId}", null) { _, code -> cb(code in 200..299) }
        }
    }

    // ── Explore / search posts ──────────────────────────────────────────────
    fun fetchExplore(cb: (List<Post>?, String?) -> Unit) {
        rest("GET", "posts?select=*&image_url=not.is.null&order=created_at.desc&limit=48") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val posts = (0 until arr.length()).map { Post.from(arr.getJSONObject(it)) }
            if (posts.isEmpty()) return@rest cb(posts, null)
            val ids = posts.joinToString(",") { it.authorId }
            rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                posts.forEach { it.author = byId[it.authorId] }
                cb(posts, null)
            }
        }
    }

    fun searchPosts(query: String, cb: (List<Post>?, String?) -> Unit) {
        val q = java.net.URLEncoder.encode(query.trim(), "UTF-8")
        rest("GET", "posts?select=*&content=ilike.*$q*&order=created_at.desc&limit=30") { arr, err ->
            if (arr == null) return@rest cb(null, err)
            val posts = (0 until arr.length()).map { Post.from(arr.getJSONObject(it)) }
            if (posts.isEmpty()) return@rest cb(posts, null)
            val ids = posts.joinToString(",") { it.authorId }
            rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                posts.forEach { it.author = byId[it.authorId] }
                cb(posts, null)
            }
        }
    }

    fun fetchPostsByIds(ids: List<String>, cb: (List<Post>) -> Unit) {
        if (ids.isEmpty()) return cb(emptyList())
        rest("GET", "posts?select=*&id=in.(${ids.joinToString(",")})&order=created_at.desc&limit=100") { arr, _ ->
            if (arr == null) return@rest cb(emptyList())
            val posts = (0 until arr.length()).map { Post.from(arr.getJSONObject(it)) }
            val authorIds = posts.joinToString(",") { it.authorId }
            rest("GET", "profiles?select=*&id=in.($authorIds)") { parr, _ ->
                val byId = mutableMapOf<String, Profile>()
                if (parr != null) for (i in 0 until parr.length()) {
                    val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                }
                posts.forEach { it.author = byId[it.authorId] }
                cb(posts)
            }
        }
    }

    fun deletePost(postId: String, cb: (Boolean) -> Unit) {
        restRaw("DELETE", "posts?id=eq.$postId&author_id=eq.${Session.userId}", null) { _, code -> cb(code in 200..299) }
    }

    /** Comment with optional reply (parent_id added by upgrade-v5; graceful fallback). */
    fun addCommentReply(postId: String, content: String, parentId: String?, cb: (String?) -> Unit) {
        val b = JSONObject().put("post_id", postId).put("author_id", Session.userId).put("content", content)
        if (parentId != null) b.put("parent_id", parentId)
        restRaw("POST", "comments", b) { body, code ->
            if (code in 200..299) cb(null)
            else if (parentId != null) {
                val b2 = JSONObject().put("post_id", postId).put("author_id", Session.userId).put("content", content)
                restRaw("POST", "comments", b2) { body2, code2 ->
                    if (code2 in 200..299) cb(null) else cb(errMsg(body2, "تعذّر إرسال التعليق"))
                }
            } else cb(errMsg(body, "تعذّر إرسال التعليق"))
        }
    }

    // ── Blocks ──────────────────────────────────────────────────────────────
    fun fetchBlockedIds(cb: (Set<String>) -> Unit) {
        rest("GET", "blocks?select=blocked_id&blocker_id=eq.${Session.userId}&limit=500") { arr, _ ->
            val ids = mutableSetOf<String>()
            if (arr != null) for (i in 0 until arr.length()) ids.add(arr.getJSONObject(i).optString("blocked_id"))
            cb(ids)
        }
    }

    fun setBlock(targetId: String, block: Boolean, cb: (Boolean) -> Unit) {
        if (block) {
            val b = JSONObject().put("blocker_id", Session.userId).put("blocked_id", targetId)
            restRaw("POST", "blocks", b) { _, code -> cb(code in 200..299) }
        } else {
            restRaw("DELETE", "blocks?blocker_id=eq.${Session.userId}&blocked_id=eq.$targetId", null) { _, code -> cb(code in 200..299) }
        }
    }

    // ── Notifications (aggregated from likes / comments / follows) ─────────
    fun fetchNotifications(cb: (List<NotifItem>) -> Unit) {
        rest("GET", "posts?select=id&author_id=eq.${Session.userId}&limit=200") { myPosts, _ ->
            val myIds = mutableListOf<String>()
            if (myPosts != null) for (i in 0 until myPosts.length()) myIds.add(myPosts.getJSONObject(i).optString("id"))
            val items = mutableListOf<NotifItem>()
            var pending = 3
            fun finish() { pending--; if (pending == 0) cb(items.sortedByDescending { it.createdAt }) }
            // follows on me
            rest("GET", "follows?select=follower_id,created_at&following_id=eq.${Session.userId}&order=created_at.desc&limit=30") { arr, _ ->
                if (arr != null && arr.length() > 0) {
                    val ids = (0 until arr.length()).joinToString(",") { arr.getJSONObject(it).optString("follower_id") }
                    rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                        val byId = mutableMapOf<String, Profile>()
                        if (parr != null) for (i in 0 until parr.length()) {
                            val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                        }
                        for (i in 0 until arr.length()) {
                            val o = arr.getJSONObject(i)
                            items.add(NotifItem("follow", byId[o.optString("follower_id")], null, "", o.optString("created_at")))
                        }
                        finish()
                    }
                } else finish()
            }
            if (myIds.isEmpty()) { finish(); finish() }
            else {
                val inList = myIds.joinToString(",")
                rest("GET", "likes?select=post_id,user_id,created_at&post_id=in.($inList)&order=created_at.desc&limit=40") { arr, _ ->
                    if (arr != null && arr.length() > 0) {
                        val ids = (0 until arr.length()).joinToString(",") { arr.getJSONObject(it).optString("user_id") }
                        rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                            val byId = mutableMapOf<String, Profile>()
                            if (parr != null) for (i in 0 until parr.length()) {
                                val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                            }
                            for (i in 0 until arr.length()) {
                                val o = arr.getJSONObject(i)
                                items.add(NotifItem("like", byId[o.optString("user_id")], o.optString("post_id"), "", o.optString("created_at")))
                            }
                            finish()
                        }
                    } else finish()
                }
                rest("GET", "comments?select=post_id,author_id,content,created_at&post_id=in.($inList)&order=created_at.desc&limit=40") { arr, _ ->
                    if (arr != null && arr.length() > 0) {
                        val ids = (0 until arr.length()).joinToString(",") { arr.getJSONObject(it).optString("author_id") }
                        rest("GET", "profiles?select=*&id=in.($ids)") { parr, _ ->
                            val byId = mutableMapOf<String, Profile>()
                            if (parr != null) for (i in 0 until parr.length()) {
                                val p = Profile.from(parr.getJSONObject(i)); byId[p.id] = p
                            }
                            for (i in 0 until arr.length()) {
                                val o = arr.getJSONObject(i)
                                if (o.optString("author_id") == Session.userId) continue
                                items.add(NotifItem("comment", byId[o.optString("author_id")], o.optString("post_id"), o.optString("content"), o.optString("created_at")))
                            }
                            finish()
                        }
                    } else finish()
                }
            }
        }
    }

    /** Open (or create) a DM thread with a user via the DB RPC. */
    fun openThreadWith(otherId: String, cb: (String?, String?) -> Unit) {
        val b = JSONObject().put("p_other", otherId)
        restRaw("POST", "rpc/get_or_create_thread", b) { body, code ->
            if (code !in 200..299 || body == null) return@restRaw cb(null, "تعذّر فتح المحادثة")
            val tid = try {
                val t = body.trim()
                when {
                    t.startsWith("[") -> {
                        val a = JSONArray(t)
                        val o = a.optJSONObject(0)
                        o?.optString("id")?.ifBlank { o.optString("get_or_create_thread") } ?: ""
                    }
                    t.startsWith("{") -> JSONObject(t).optString("id")
                    else -> t.trim('"')
                }
            } catch (_: Exception) { "" }
            if (tid.isBlank()) cb(null, "تعذّر فتح المحادثة") else cb(tid, null)
        }
    }

    fun storyReply(authorId: String, cb: (Boolean) -> Unit) {
        if (authorId == Session.userId) return cb(false)
        openThreadWith(authorId) { threadId, _ ->
            if (threadId == null) cb(false)
            else sendMessage(threadId, "↩ ردّ على قصتك") { err -> cb(err == null) }
        }
    }

    // ── Dz connect ai (site API, Bearer = Supabase access token) ────────────
    fun aiChat(history: List<Pair<String, String>>, cb: (String?, String?) -> Unit) {
        val msgs = JSONArray()
        history.forEach { (role, content) -> msgs.put(JSONObject().put("role", role).put("content", content)) }
        val body = JSONObject().put("messages", msgs).toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url("${Config.SITE_URL}/api/ai/chat")
            .addHeader("Authorization", "Bearer ${Session.access}")
            .post(body).build()
        enqueue(req) { b, code ->
            if (b == null) return@enqueue cb(null, "لا يوجد اتصال بالإنترنت")
            try {
                val o = JSONObject(b)
                if (o.optBoolean("ok")) cb(o.optString("text"), null)
                else cb(null, o.optString("error", "المساعد غير متاح الآن"))
            } catch (_: Exception) { cb(null, "المساعد غير متاح الآن ($code)") }
        }
    }
}
