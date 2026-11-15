package dz.absorbs.app.domain

import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Config
import dz.absorbs.app.data.NotifItem
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.Profile
import dz.absorbs.app.data.Session
import dz.absorbs.app.data.StoryItem
import dz.absorbs.app.data.ThreadItem

/**
 * Domain layer: the only door the presentation layer uses.
 * Wraps the Supabase data source (REST + Realtime + Storage) with app semantics.
 */
object SocialRepository {
    val isLoggedIn: Boolean get() = Session.loggedIn
    val myId: String get() = Session.userId
    val siteUrl: String get() = Config.SITE_URL

    // Auth
    fun signIn(email: String, pass: String, cb: (String?) -> Unit) = Api.signIn(email, pass, cb)
    fun signUp(email: String, pass: String, username: String, display: String, cb: (String?) -> Unit) =
        Api.signUp(email, pass, username, display, cb)
    fun signOut() = Api.signOut()
    fun resetPassword(email: String, cb: (String?) -> Unit) = Api.resetPassword(email, cb)
    fun resendConfirmation(email: String, cb: (String?) -> Unit) = Api.resendConfirmation(email, cb)
    fun deleteAccount(cb: (String?) -> Unit) = Api.deleteAccount(cb)

    // Feed & content
    fun feed(limit: Int = 20, offset: Int = 0, cb: (List<Post>?, String?) -> Unit) = Api.fetchFeed(limit, offset, cb)
    fun toggleLike(post: Post, cb: (Boolean) -> Unit) = Api.toggleLike(post, cb)
    fun createPost(content: String, imageUrl: String?, type: String, cb: (String?) -> Unit) = Api.createPost(content, imageUrl, type, cb)
    fun deletePost(id: String, cb: (Boolean) -> Unit) = Api.deletePost(id, cb)
    fun comments(postId: String, cb: (List<dz.absorbs.app.data.Comment>?, String?) -> Unit) = Api.fetchComments(postId, cb)
    fun addComment(postId: String, content: String, parentId: String?, cb: (String?) -> Unit) =
        Api.addCommentReply(postId, content, parentId, cb)
    fun savedIds(cb: (Set<String>) -> Unit) = Api.fetchSavedIds(cb)
    fun savedPosts(cb: (List<Post>) -> Unit) = Api.fetchSavedIds { ids -> Api.fetchPostsByIds(ids.toList(), cb) }
    fun setSave(postId: String, save: Boolean, cb: (Boolean) -> Unit) = Api.setSave(postId, save, cb)
    fun explore(cb: (List<Post>?, String?) -> Unit) = Api.fetchExplore(cb)
    fun searchPosts(q: String, cb: (List<Post>?, String?) -> Unit) = Api.searchPosts(q, cb)
    fun searchPeople(q: String, cb: (List<Profile>?, String?) -> Unit) = Api.searchProfiles(q, cb)
    fun report(type: String, id: String, reason: String, cb: (Boolean) -> Unit) = Api.report(type, id, reason, cb)

    // Stories
    fun stories(cb: (List<StoryItem>?, String?) -> Unit) = Api.fetchStories(cb)
    fun markStoryViewed(id: String) = Api.markStoryViewed(id)
    fun createStory(bytes: ByteArray, mime: String, caption: String, cb: (String?) -> Unit) = Api.createStory(bytes, mime, caption, cb)
    fun storyReply(authorId: String, cb: (Boolean) -> Unit) = Api.storyReply(authorId, cb)

    // Profiles & social graph
    fun myProfile(cb: (Profile?, String?) -> Unit) = Api.fetchMyProfile(cb)
    fun profile(id: String, cb: (Profile?, String?) -> Unit) = Api.fetchProfileById(id, cb)
    fun counts(id: String, cb: (Int, Int, Int) -> Unit) = Api.fetchCounts(id, cb)
    fun userPosts(id: String, cb: (List<Post>?, String?) -> Unit) = Api.fetchUserPosts(id, cb)
    fun isFollowing(id: String, cb: (Boolean) -> Unit) = Api.isFollowing(id, cb)
    fun setFollow(id: String, follow: Boolean, cb: (Boolean) -> Unit) = Api.setFollow(id, follow, cb)
    fun followList(id: String, followers: Boolean, cb: (List<Profile>) -> Unit) = Api.fetchFollowList(id, followers, cb)
    fun updateProfile(name: String, bio: String, site: String, avatar: String?, cover: String?, cb: (String?) -> Unit) =
        Api.updateProfile(name, bio, site, avatar, cover, cb)
    fun blockedIds(cb: (Set<String>) -> Unit) = Api.fetchBlockedIds(cb)
    fun setBlock(id: String, block: Boolean, cb: (Boolean) -> Unit) = Api.setBlock(id, block, cb)

    // Messaging
    fun threads(cb: (List<ThreadItem>?, String?) -> Unit) = Api.fetchThreads(cb)
    fun messages(threadId: String, cb: (List<dz.absorbs.app.data.ChatMsg>?, String?) -> Unit) = Api.fetchMessages(threadId, cb)
    fun sendMessage(threadId: String, content: String, cb: (String?) -> Unit) = Api.sendMessage(threadId, content, cb)
    fun openThreadWith(otherId: String, cb: (String?, String?) -> Unit) = Api.openThreadWith(otherId, cb)

    // Notifications & AI & uploads
    fun notifications(cb: (List<NotifItem>) -> Unit) = Api.fetchNotifications(cb)
    fun aiChat(history: List<Pair<String, String>>, cb: (String?, String?) -> Unit) = Api.aiChat(history, cb)
    fun upload(bucket: String, bytes: ByteArray, mime: String, cb: (String?, String?) -> Unit) =
        Api.uploadToBucket(bucket, bytes, mime, cb)
    fun uploadPostImage(bytes: ByteArray, mime: String, cb: (String?, String?) -> Unit) = Api.uploadImage(bytes, mime, cb)
}
