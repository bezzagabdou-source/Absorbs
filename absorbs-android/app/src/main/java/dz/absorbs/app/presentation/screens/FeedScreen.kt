package dz.absorbs.app.presentation.screens

import android.content.Intent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import dz.absorbs.app.R
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.Profile
import dz.absorbs.app.data.StoryItem
import dz.absorbs.app.data.TimeAr
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.LikeButton
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.components.StoryRing
import dz.absorbs.app.presentation.components.VerifiedBadge
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.AppViewModel
import dz.absorbs.app.presentation.viewmodel.CommentsViewModel
import dz.absorbs.app.presentation.viewmodel.FeedViewModel
import dz.absorbs.app.presentation.viewmodel.onMain
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    app: AppViewModel,
    vm: FeedViewModel,
    onOpenProfile: (String) -> Unit,
    onOpenComments: (Post) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenMessages: () -> Unit,
    onAddStory: () -> Unit,
    onOpenReels: () -> Unit,
) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var storyIndex by remember { mutableStateOf(-1) }
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= vm.posts.size - 3 && vm.posts.isNotEmpty()
        }
    }
    LaunchedEffect(shouldLoadMore) { if (shouldLoadMore) vm.loadMore(ctx) }

    Column(Modifier.fillMaxSize()) {
        // Header
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(38.dp).background(Dz.primaryBrush(), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) { Text("D", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 19.sp) }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    app.me?.let { "${s.home} · ${it.displayName}" } ?: "Dz connect",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface, maxLines = 1,
                )
                Text(s.appTagline, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onOpenNotifications) { DzIcon(R.drawable.ic_lucide_bell, tint = MaterialTheme.colorScheme.onSurface) }
            IconButton(onClick = onOpenMessages) { DzIcon(R.drawable.ic_lucide_message_circle, tint = MaterialTheme.colorScheme.onSurface) }
        }

        PullToRefreshBox(
            isRefreshing = vm.loading && vm.posts.isNotEmpty(),
            onRefresh = { vm.load(ctx, refresh = true) },
            modifier = Modifier.weight(1f),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 90.dp),
            ) {
                // Stories rail
                item {
                    LazyRow(
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        item {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(74.dp).clickable { onAddStory() }) {
                                Box(contentAlignment = Alignment.BottomEnd) {
                                    DzAvatar(app.me?.avatarUrl, app.me?.displayName ?: "D", 62.dp)
                                    Box(
                                        Modifier.size(22.dp).background(Dz.Emerald, CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) { DzIcon(R.drawable.ic_lucide_plus, tint = Color.White, size = 14.dp) }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(s.yourStory, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                        items(vm.stories) { story ->
                            StoryRing(story.author?.avatarUrl, story.author?.displayName ?: "", story.viewedByMe) {
                                storyIndex = vm.stories.indexOf(story)
                            }
                        }
                    }
                }

                if (vm.loading && vm.posts.isEmpty()) {
                    items(3) {
                        ShimmerBox(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), 170.dp)
                    }
                } else if (vm.posts.isEmpty()) {
                    item { EmptyState(R.drawable.ic_lucide_sparkles, vm.error ?: s.noPosts) }
                } else {
                    itemsIndexed(vm.posts, key = { _, p -> p.id }) { _, post ->
                        PostCard(
                            post = post, app = app,
                            onLike = { vm.toggleLike(post) },
                            onOpenProfile = onOpenProfile,
                            onOpenComments = { onOpenComments(post) },
                            onOpenReels = onOpenReels,
                            onDelete = { vm.posts.remove(post) },
                        )
                    }
                    if (vm.loadingMore) {
                        item { ShimmerBox(Modifier.padding(12.dp), 90.dp) }
                    }
                }
            }
        }
    }

    if (storyIndex >= 0 && storyIndex < vm.stories.size) {
        StoryViewer(
            stories = vm.stories,
            startIndex = storyIndex,
            onClose = { storyIndex = -1 },
            onViewed = { story -> Repo.markStoryViewed(story.id); story.viewedByMe = true },
        )
    }
}

@Composable
fun PostCard(
    post: Post,
    app: AppViewModel,
    onLike: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenComments: () -> Unit,
    onOpenReels: () -> Unit,
    onDelete: () -> Unit,
) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    var reportOpen by remember { mutableStateOf(false) }
    var heartBurst by remember { mutableStateOf(0) }
    val heartScale = remember { Animatable(0f) }
    val saved = app.savedIds.contains(post.id)
    val mine = post.authorId == Repo.myId

    LaunchedEffect(heartBurst) {
        if (heartBurst > 0) {
            heartScale.snapTo(0.2f)
            heartScale.animateTo(1.15f, spring(dampingRatio = 0.4f, stiffness = 300f))
            delay(350)
            heartScale.animateTo(0f, spring(stiffness = 200f))
        }
    }

    GlassCard(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.clickable { post.author?.id?.let(onOpenProfile) }) {
                    DzAvatar(post.author?.avatarUrl, post.author?.displayName ?: "D", 44.dp)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f).clickable { post.author?.id?.let(onOpenProfile) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(post.author?.displayName ?: "Dz connect", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
                        if (post.author?.verified == true) { Spacer(Modifier.width(4.dp)); VerifiedBadge() }
                    }
                    Text(
                        "@${post.author?.username ?: ""} · ${TimeAr.ago(post.createdAt)}",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Box {
                    IconButton(onClick = { menu = true }) {
                        DzIcon(R.drawable.ic_lucide_ellipsis, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 20.dp)
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text(if (saved) "✓ ${s.saved}" else s.save) },
                            onClick = { menu = false; app.toggleSave(post) },
                        )
                        if (!mine) {
                            DropdownMenuItem(text = { Text(s.report) }, onClick = { menu = false; reportOpen = true })
                            DropdownMenuItem(
                                text = { Text(s.block) },
                                onClick = {
                                    menu = false
                                    post.author?.id?.let { Repo.setBlock(it, true) { ok -> if (ok) onMain { onDelete() } } }
                                },
                            )
                        }
                        if (mine) {
                            DropdownMenuItem(
                                text = { Text(s.delete, color = Dz.Danger) },
                                onClick = { menu = false; Repo.deletePost(post.id) { ok -> if (ok) onMain(onDelete) } },
                            )
                        }
                    }
                }
            }

            if (post.content.isNotBlank()) {
                Text(
                    post.content,
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            if (!post.imageUrl.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier.fillMaxWidth().height(300.dp).background(Dz.DarkBg)
                        .pointerInput(post.id) {
                            detectTapGestures(
                                onDoubleTap = {
                                    if (!post.likedByMe) onLike()
                                    heartBurst++
                                },
                                onTap = { if (post.mediaType == "video") onOpenReels() },
                            )
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    AsyncImage(
                        model = post.imageUrl, contentDescription = null,
                        modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop,
                    )
                    if (post.mediaType == "video") {
                        Box(
                            Modifier.size(62.dp).background(Color(0x59000000), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { DzIcon(R.drawable.ic_lucide_play, tint = Color.White, size = 28.dp) }
                    }
                    if (heartScale.value > 0f) {
                        DzIcon(
                            R.drawable.ic_lucide_heart,
                            tint = Color.White,
                            size = 92.dp,
                            modifier = Modifier.scale(heartScale.value),
                        )
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LikeButton(post.likedByMe, post.likeCount) { onLike() }
                Spacer(Modifier.width(8.dp))
                Row(
                    Modifier.clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                        .clickable { onOpenComments() }
                        .padding(horizontal = 13.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DzIcon(R.drawable.ic_lucide_message_circle, tint = Dz.Sky, size = 19.dp)
                    Spacer(Modifier.width(6.dp))
                    Text("${post.commentCount}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { app.toggleSave(post) }) {
                    DzIcon(
                        R.drawable.ic_lucide_bookmark,
                        tint = if (saved) Dz.Gold else MaterialTheme.colorScheme.onSurfaceVariant, size = 21.dp,
                    )
                }
                IconButton(onClick = {
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "${post.content}\n${Repo.siteUrl}/post/${post.id}")
                    }
                    ctx.startActivity(Intent.createChooser(share, s.share))
                }) {
                    DzIcon(R.drawable.ic_lucide_share_2, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 21.dp)
                }
            }
        }
    }

    if (reportOpen) {
        ReportDialog(post.id, "post") { reportOpen = false }
    }
}

@Composable
fun ReportDialog(targetId: String, targetType: String, onDone: () -> Unit) {
    val s = LocalStr.current
    val reasons = listOf("محتوى مسيء / Abusif", "تحرّش / Harcèlement", "محتوى جنسي", "عنف / Violence", "معلومات مضلّلة", "احتيال / Spam", "أخرى / Autre")
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(s.report) },
        text = {
            Column {
                reasons.forEach { reason ->
                    Text(
                        reason,
                        modifier = Modifier.fillMaxWidth().clickable {
                            Repo.report(targetType, targetId, reason) { }
                            onDone()
                        }.padding(vertical = 10.dp),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = onDone) { Text(s.cancel) } },
    )
}

/** Full-screen story viewer with auto-advance + progress segments + reply. */
@Composable
fun StoryViewer(
    stories: List<StoryItem>,
    startIndex: Int,
    onClose: () -> Unit,
    onViewed: (StoryItem) -> Unit,
) {
    val s = LocalStr.current
    var index by remember { mutableStateOf(startIndex) }
    var reply by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    val story = stories.getOrNull(index) ?: return

    LaunchedEffect(index) {
        onViewed(story)
        sent = false
        delay(6000)
        if (index < stories.size - 1) index++ else onClose()
    }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Dz.DarkBg)) {
            AsyncImage(story.imageUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            // tap zones
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f).fillMaxSize().clickable { if (index > 0) index-- })
                Box(Modifier.weight(1f).fillMaxSize().clickable { if (index < stories.size - 1) index++ else onClose() })
            }
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.fillMaxWidth().padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    stories.forEachIndexed { i, _ ->
                        Box(
                            Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(99.dp))
                                .background(if (i <= index) Color.White else Color(0x55FFFFFF)),
                        )
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DzAvatar(story.author?.avatarUrl, story.author?.displayName ?: "D", 40.dp)
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f)) {
                        Text(story.author?.displayName ?: "", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(TimeAr.ago(story.createdAt), color = Color(0xFFBFE8D8), fontSize = 12.sp)
                    }
                    IconButton(onClick = onClose) { DzIcon(R.drawable.ic_lucide_x, tint = Color.White) }
                }
                story.caption?.let {
                    Text(it, color = Color.White, modifier = Modifier.padding(16.dp), fontSize = 15.sp)
                }
                Spacer(Modifier.weight(1f))
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = reply, onValueChange = { reply = it },
                        placeholder = { Text(s.replyToStory, color = Color(0xAAFFFFFF)) },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(999.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.size(50.dp).background(Dz.primaryBrush(), CircleShape).clickable {
                            val authorId = story.authorId
                            Repo.storyReply(authorId) { ok -> onMain { if (ok) { sent = true; reply = "" } } }
                        },
                        contentAlignment = Alignment.Center,
                    ) { DzIcon(R.drawable.ic_lucide_send, tint = Color.White, size = 21.dp) }
                }
                if (sent) {
                    Text(s.storyReplySent, color = Color(0xFF8CF5C8), fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp, bottom = 10.dp))
                }
            }
        }
    }
}

@Composable
fun CommentsScreen(post: Post, app: AppViewModel, onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val s = LocalStr.current
    val vm = remember { CommentsViewModel() }
    var input by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<dz.absorbs.app.data.Comment?>(null) }

    LaunchedEffect(post.id) { vm.load(post.id) }

    val parents = vm.comments.filter { it.parentId == null }
    val repliesByParent = vm.comments.filter { it.parentId != null }.groupBy { it.parentId }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface) }
            Text(s.comments, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        }
        if (post.content.isNotBlank()) {
            GlassCard(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                Text(post.content, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            }
        }
        Spacer(Modifier.height(8.dp))
        when {
            vm.loading -> ShimmerBox(Modifier.padding(12.dp), 120.dp)
            vm.comments.isEmpty() -> EmptyState(R.drawable.ic_lucide_message_circle, s.noComments)
            else -> LazyColumn(
                Modifier.weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 12.dp),
            ) {
                items(parents, key = { it.id }) { comment ->
                    CommentRow(comment, depth = 0, onReply = { replyTo = comment }, onOpenProfile = onOpenProfile)
                    repliesByParent[comment.id]?.forEach { reply ->
                        CommentRow(reply, depth = 1, onReply = { replyTo = comment }, onOpenProfile = onOpenProfile)
                    }
                }
            }
        }
        replyTo?.let { target ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${s.reply}: ${target.author?.displayName ?: ""}", fontSize = 12.sp, color = Dz.Sky, modifier = Modifier.weight(1f))
                Text(s.cancel, fontSize = 12.sp, color = Dz.Danger, modifier = Modifier.clickable { replyTo = null })
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input, onValueChange = { input = it },
                placeholder = { Text(s.addComment) },
                modifier = Modifier.weight(1f), shape = RoundedCornerShape(999.dp), maxLines = 3,
            )
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(50.dp).background(Dz.primaryBrush(), CircleShape).clickable {
                    val text = input.trim()
                    if (text.isNotBlank()) {
                        vm.add(post.id, text, replyTo?.id) { input = ""; replyTo = null }
                    }
                },
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_send, tint = Color.White, size = 21.dp) }
        }
    }
}

@Composable
private fun CommentRow(
    comment: dz.absorbs.app.data.Comment,
    depth: Int,
    onReply: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val s = LocalStr.current
    Row(
        Modifier.fillMaxWidth().padding(start = (12 + depth * 34).dp, end = 12.dp, top = 8.dp),
    ) {
        Box(Modifier.clickable { comment.author?.id?.let(onOpenProfile) }) {
            DzAvatar(comment.author?.avatarUrl, comment.author?.displayName ?: "D", if (depth == 0) 36.dp else 30.dp)
        }
        Spacer(Modifier.width(8.dp))
        Column(
            Modifier.weight(1f)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                .padding(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(comment.author?.displayName ?: "", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                if (comment.author?.verified == true) { Spacer(Modifier.width(4.dp)); VerifiedBadge(size = 13.dp) }
                Spacer(Modifier.width(6.dp))
                Text(TimeAr.ago(comment.createdAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(comment.content, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
            Text(
                s.reply, fontSize = 12.sp, color = Dz.Sky, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 4.dp).clickable { onReply() },
            )
        }
    }
}
