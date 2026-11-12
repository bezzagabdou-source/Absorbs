package dz.absorbs.app.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import dz.absorbs.app.R
import dz.absorbs.app.data.Post
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.LikeButton
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.AppViewModel

@Composable
fun ReelsScreen(app: AppViewModel, onOpenComments: (Post) -> Unit, onOpenProfile: (String) -> Unit) {
    val s = LocalStr.current
    var reels by remember { mutableStateOf<List<Post>?>(null) }
    var muted by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        Repo.feed(60, 0) { list, _ ->
            dz.absorbs.app.presentation.viewmodel.onMain {
                reels = (list ?: emptyList()).filter { it.mediaType == "video" && !it.imageUrl.isNullOrBlank() }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Dz.DarkBg)) {
        val list = reels
        when {
            list == null -> ShimmerBox(Modifier.fillMaxSize(), 600.dp)
            list.isEmpty() -> EmptyState(R.drawable.ic_lucide_clapperboard, s.noPosts)
            else -> {
                val pagerState = rememberPagerState(pageCount = { list.size })
                VerticalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    beyondViewportPageCount = 1,
                ) { page ->
                    ReelPage(
                        post = list[page],
                        active = pagerState.currentPage == page,
                        muted = muted,
                        onToggleMute = { muted = !muted },
                        onLike = {
                            Repo.toggleLike(list[page]) { ok ->
                                if (ok) reels = list.map { if (it.id == list[page].id) list[page] else it }
                            }
                        },
                        onOpenComments = { onOpenComments(list[page]) },
                        onOpenProfile = onOpenProfile,
                    )
                }
            }
        }
        Text(
            s.reels,
            color = Color.White, fontWeight = FontWeight.Bold, fontSize = 19.sp,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun ReelPage(
    post: Post,
    active: Boolean,
    muted: Boolean,
    onToggleMute: () -> Unit,
    onLike: () -> Unit,
    onOpenComments: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val ctx = LocalContext.current
    val player = remember(post.id) {
        ExoPlayer.Builder(ctx).build().apply {
            setMediaItem(MediaItem.fromUri(post.imageUrl ?: ""))
            repeatMode = ExoPlayer.REPEAT_MODE_ONE
            prepare()
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    LaunchedEffect(active, muted) {
        player.volume = if (muted) 0f else 1f
        if (active) player.play() else player.pause()
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView(
            factory = { c ->
                PlayerView(c).apply {
                    this.player = player
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            Modifier.fillMaxSize().clickable {
                if (player.isPlaying) player.pause() else player.play()
            },
        )
        Column(
            Modifier.fillMaxWidth().align(Alignment.BottomStart).padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.clickable { post.author?.id?.let(onOpenProfile) }) {
                    DzAvatar(post.author?.avatarUrl, post.author?.displayName ?: "D", 42.dp)
                }
                Spacer(Modifier.width(9.dp))
                Text(post.author?.displayName ?: "", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            if (post.content.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(post.content, color = Color(0xFFE6FFF4), fontSize = 14.sp)
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LikeButton(post.likedByMe, post.likeCount) { onLike() }
                Spacer(Modifier.width(8.dp))
                Row(
                    Modifier.background(Color(0x3DFFFFFF), CircleShape).clickable { onOpenComments() }
                        .padding(horizontal = 13.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DzIcon(R.drawable.ic_lucide_message_circle, tint = Color.White, size = 19.dp)
                    Spacer(Modifier.width(6.dp))
                    Text("${post.commentCount}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.weight(1f))
                Text(
                    if (muted) "تشغيل الصوت" else "كتم الصوت",
                    color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.background(Color(0x3DFFFFFF), CircleShape)
                        .clickable { onToggleMute() }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }
        }
    }
}
