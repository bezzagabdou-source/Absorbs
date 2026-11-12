package dz.absorbs.app.presentation.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import coil.compose.AsyncImage
import dz.absorbs.app.R
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.Profile
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.GradientButton
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.components.VerifiedBadge
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.AppViewModel
import dz.absorbs.app.presentation.viewmodel.ProfileViewModel
import dz.absorbs.app.presentation.viewmodel.onMain

@Composable
fun ProfileScreen(
    userId: String?,
    app: AppViewModel,
    onOpenProfile: (String) -> Unit,
    onOpenComments: (Post) -> Unit,
    onEditProfile: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenChat: (dz.absorbs.app.data.ThreadItem) -> Unit,
    onBack: (() -> Unit)? = null,
) {
    val s = LocalStr.current
    val targetId = userId ?: Repo.myId
    val mine = targetId == Repo.myId
    val vm = remember(targetId) { ProfileViewModel() }
    var gridMode by remember { mutableStateOf(true) }
    var followListMode by remember { mutableStateOf<Boolean?>(null) }
    var menu by remember { mutableStateOf(false) }
    var reportOpen by remember { mutableStateOf(false) }

    LaunchedEffect(targetId) { vm.load(targetId) }

    Column(Modifier.fillMaxSize()) {
        // Cover + header
        Box(Modifier.fillMaxWidth().height(150.dp)) {
            val cover = vm.profile?.coverUrl
            if (!cover.isNullOrBlank()) {
                AsyncImage(cover, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Box(Modifier.fillMaxSize().background(Dz.ringBrush()))
            }
            Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = Color.White) }
                }
                Spacer(Modifier.weight(1f))
                if (mine) {
                    IconButton(onClick = onOpenSettings) { DzIcon(R.drawable.ic_lucide_settings, tint = Color.White) }
                } else {
                    Box {
                        IconButton(onClick = { menu = true }) { DzIcon(R.drawable.ic_lucide_ellipsis, tint = Color.White) }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text(s.report) }, onClick = { menu = false; reportOpen = true })
                            DropdownMenuItem(
                                text = { Text(s.block) },
                                onClick = {
                                    menu = false
                                    Repo.setBlock(targetId, true) { ok -> if (ok) onMain { app.blockedIds = app.blockedIds + targetId } }
                                },
                            )
                        }
                    }
                }
            }
        }

        Column(Modifier.padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Box(Modifier.offset(y = (-28).dp)) {
                    DzAvatar(vm.profile?.avatarUrl, vm.profile?.displayName ?: "D", 84.dp, ring = Dz.ringBrush())
                }
                Spacer(Modifier.weight(1f))
                if (mine) {
                    Box(
                        Modifier.padding(top = 10.dp).background(Dz.primaryBrush(), RoundedCornerShape(999.dp))
                            .clickable { onEditProfile() }
                            .padding(horizontal = 18.dp, vertical = 9.dp),
                    ) { Text(s.editProfile, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                } else {
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            Modifier
                                .then(
                                    if (vm.isFollowing) Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(999.dp))
                                    else Modifier.background(Dz.primaryBrush(), RoundedCornerShape(999.dp)),
                                )
                                .clickable { vm.toggleFollow(targetId) }
                                .padding(horizontal = 18.dp, vertical = 9.dp),
                        ) {
                            Text(
                                if (vm.isFollowing) s.following else s.follow,
                                color = if (vm.isFollowing) MaterialTheme.colorScheme.onSurface else Color.White,
                                fontWeight = FontWeight.Bold, fontSize = 13.sp,
                            )
                        }
                        Box(
                            Modifier.background(MaterialTheme.colorScheme.surface, RoundedCornerShape(999.dp))
                                .clickable {
                                    Repo.openThreadWith(targetId) { threadId, _ ->
                                        if (threadId != null) onMain {
                                            onOpenChat(dz.absorbs.app.data.ThreadItem(threadId, vm.profile, "", ""))
                                        }
                                    }
                                }
                                .padding(horizontal = 14.dp, vertical = 9.dp),
                        ) { Text(s.message, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(vm.profile?.displayName ?: "…", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                if (vm.profile?.verified == true) { Spacer(Modifier.width(5.dp)); VerifiedBadge(size = 18.dp) }
            }
            Text("@${vm.profile?.username ?: ""}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            vm.profile?.bio?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, modifier = Modifier.padding(top = 6.dp))
            }
            // Counts
            Row(
                Modifier.fillMaxWidth().padding(vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                StatBlock("${vm.postCount}", s.posts) { }
                StatBlock("${vm.followersCount}", s.followers) { followListMode = true }
                StatBlock("${vm.followingCount}", s.followingLabel) { followListMode = false }
            }
            // View toggle
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeTab("شبكة", gridMode) { gridMode = true }
                ModeTab("قائمة", !gridMode) { gridMode = false }
            }
        }

        when {
            vm.loading -> ShimmerBox(Modifier.padding(12.dp), 220.dp)
            vm.posts.isEmpty() -> EmptyState(R.drawable.ic_lucide_image, s.noPosts)
            gridMode -> LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(vm.posts.filter { !it.imageUrl.isNullOrBlank() }, key = { it.id }) { post ->
                    Box(
                        Modifier.aspectRatio(1f).clip(RoundedCornerShape(10.dp)).background(Dz.DarkBg)
                            .clickable { onOpenComments(post) },
                    ) {
                        AsyncImage(post.imageUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        if (post.mediaType == "video") {
                            DzIcon(R.drawable.ic_lucide_play, tint = Color.White, size = 18.dp, modifier = Modifier.padding(6.dp))
                        }
                    }
                }
            }
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 90.dp)) {
                items(vm.posts, key = { it.id }) { post ->
                    PostCard(
                        post = post, app = app,
                        onLike = { vm.load(targetId) },
                        onOpenProfile = onOpenProfile,
                        onOpenComments = { onOpenComments(post) },
                        onOpenReels = { },
                        onDelete = { vm.load(targetId) },
                    )
                }
            }
        }
    }

    followListMode?.let { followers ->
        FollowListDialog(targetId, followers) { followListMode = null }
    }
    if (reportOpen) {
        ReportDialog(targetId, "user") { reportOpen = false }
    }
}

@Composable
private fun StatBlock(value: String, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() }.padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurface)
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ModeTab(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(999.dp))
            .then(if (active) Modifier.background(Dz.primaryBrush()) else Modifier.background(MaterialTheme.colorScheme.surface))
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(text, color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun FollowListDialog(userId: String, followers: Boolean, onClose: () -> Unit) {
    val s = LocalStr.current
    var people by remember { mutableStateOf<List<Profile>?>(null) }
    LaunchedEffect(userId, followers) {
        Repo.followList(userId, followers) { list -> onMain { people = list } }
    }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (followers) s.followers else s.followingLabel) },
        text = {
            val list = people
            if (list == null) ShimmerBox(height = 120.dp)
            else if (list.isEmpty()) Text(s.noResults)
            else LazyColumn(Modifier.height(320.dp)) {
                items(list, key = { it.id }) { person ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        DzAvatar(person.avatarUrl, person.displayName, 40.dp)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(person.displayName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
                            Text("@${person.username}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(s.cancel) } },
    )
}

@Composable
fun SettingsScreen(
    app: AppViewModel,
    dark: Boolean,
    onToggleDark: (Boolean) -> Unit,
    lang: dz.absorbs.app.presentation.i18n.Lang,
    onSetLang: (dz.absorbs.app.presentation.i18n.Lang) -> Unit,
    onOpenSaved: () -> Unit,
    onBack: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var confirmDelete by remember { mutableStateOf(false) }
    var blocked by remember { mutableStateOf<List<Profile>>(emptyList()) }

    fun reloadBlocked() {
        Repo.blockedIds { ids ->
            if (ids.isEmpty()) { onMain { blocked = emptyList() }; return@blockedIds }
            val results = mutableListOf<Profile>()
            var done = 0
            ids.forEach { id ->
                Repo.profile(id) { p, _ ->
                    onMain {
                        if (p != null) results.add(p)
                        done++
                        if (done == ids.size) blocked = results.toList()
                    }
                }
            }
        }
    }
    LaunchedEffect(Unit) { reloadBlocked() }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 30.dp)) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface) }
                Text(s.settings, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
            }
        }
        item {
            GlassCard(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
                Column {
                    Text(s.language, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        dz.absorbs.app.presentation.i18n.Lang.entries.forEach { l ->
                            val active = l == lang
                            Box(
                                Modifier.clip(RoundedCornerShape(999.dp))
                                    .then(if (active) Modifier.background(Dz.primaryBrush()) else Modifier.background(MaterialTheme.colorScheme.surface))
                                    .clickable { onSetLang(l) }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                            ) {
                                Text(l.label, color = if (active) Color.White else MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DzIcon(if (dark) R.drawable.ic_lucide_moon else R.drawable.ic_lucide_sun, tint = Dz.Gold, size = 20.dp)
                        Spacer(Modifier.width(10.dp))
                        Text(s.darkMode, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                        Switch(checked = dark, onCheckedChange = onToggleDark)
                    }
                }
            }
        }
        item {
            GlassCard(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
                Column {
                    SettingsRow(R.drawable.ic_lucide_bookmark, s.saved) { onOpenSaved() }
                    SettingsRow(R.drawable.ic_lucide_shield_check, s.privacy) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Repo.siteUrl}/privacy")))
                    }
                    SettingsRow(R.drawable.ic_lucide_globe, s.terms) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Repo.siteUrl}/terms")))
                    }
                }
            }
        }
        if (blocked.isNotEmpty()) {
            item {
                Text(
                    s.blockedUsers, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 4.dp),
                )
            }
            items(blocked, key = { it.id }) { person ->
                GlassCard(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                    contentPadding = PaddingValues(10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DzAvatar(person.avatarUrl, person.displayName, 38.dp)
                        Spacer(Modifier.width(10.dp))
                        Text(person.displayName, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text(
                            s.unblock, color = Dz.Sky, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                            modifier = Modifier.clickable {
                                Repo.setBlock(person.id, false) { ok ->
                                    if (ok) onMain {
                                        app.blockedIds = app.blockedIds - person.id
                                        blocked = blocked - person
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
        item {
            Column(Modifier.padding(16.dp)) {
                GradientButton(s.logout, Modifier.fillMaxWidth()) {
                    Repo.signOut()
                    onLoggedOut()
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    s.deleteAccount, color = Dz.Danger, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { confirmDelete = true }.padding(6.dp),
                )
                Spacer(Modifier.height(10.dp))
                Text("${s.version} 3.0.0 · Dz connect", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(s.deleteAccount) },
            text = { Text(s.deleteAccountConfirm) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    Repo.deleteAccount { err -> if (err == null) onLoggedOut() }
                }) { Text(s.delete, color = Dz.Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(s.cancel) } },
        )
    }
}

@Composable
private fun SettingsRow(icon: Int, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DzIcon(icon, tint = Dz.Teal, size = 20.dp)
        Spacer(Modifier.width(11.dp))
        Text(label, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, modifier = Modifier.weight(1f))
        DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 18.dp)
    }
}

@Composable
fun SavedScreen(app: AppViewModel, onOpenComments: (Post) -> Unit, onBack: () -> Unit) {
    val s = LocalStr.current
    var posts by remember { mutableStateOf<List<Post>?>(null) }
    LaunchedEffect(Unit) {
        Repo.savedPosts { list -> onMain { posts = list } }
    }
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface) }
            Text(s.saved, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        }
        val list = posts
        when {
            list == null -> ShimmerBox(Modifier.padding(12.dp), 200.dp)
            list.isEmpty() -> EmptyState(R.drawable.ic_lucide_bookmark, s.noPosts)
            else -> LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(list.filter { !it.imageUrl.isNullOrBlank() }, key = { it.id }) { post ->
                    Box(
                        Modifier.aspectRatio(1f).clip(RoundedCornerShape(10.dp)).background(Dz.DarkBg)
                            .clickable { onOpenComments(post) },
                    ) {
                        AsyncImage(post.imageUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    }
                }
            }
        }
    }
}

@Composable
fun EditProfileScreen(app: AppViewModel, onDone: () -> Unit, onBack: () -> Unit) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var name by remember { mutableStateOf("") }
    var bio by remember { mutableStateOf("") }
    var website by remember { mutableStateOf("") }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var coverUrl by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        app.me?.let {
            name = it.displayName; bio = it.bio ?: ""; avatarUrl = it.avatarUrl; coverUrl = it.coverUrl
        }
        Repo.myProfile { p, _ ->
            onMain {
                if (p != null) { name = p.displayName; bio = p.bio ?: ""; avatarUrl = p.avatarUrl; coverUrl = p.coverUrl }
            }
        }
    }

    fun uploadAndSet(uri: Uri, isCover: Boolean) {
        busy = true
        fun runUpload() {
            val bytes = ctx.contentResolver.openInputStream(uri)?.readBytes()
            if (bytes == null) { onMain { busy = false }; return }
            Repo.upload("avatars", bytes, ctx.contentResolver.getType(uri) ?: "image/jpeg") { url, err ->
                onMain {
                    busy = false
                    if (url != null) { if (isCover) coverUrl = url else avatarUrl = url } else error = err
                }
            }
        }
        Thread { runUpload() }.start()
    }

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) uploadAndSet(uri, false)
    }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) uploadAndSet(uri, true)
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface) }
            Text(s.editProfile, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.clickable { avatarPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                DzAvatar(avatarUrl, name.ifBlank { "D" }, 74.dp, ring = Dz.ringBrush())
            }
            Column {
                Text(s.profile, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text("اضغط لتغيير الصورة · الغلاف من الزر التالي", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "تغيير الغلاف", color = Dz.Sky, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                    modifier = Modifier.clickable { coverPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.padding(top = 4.dp),
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(name, { name = it }, label = { Text(s.fullName) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(bio, { bio = it }, label = { Text(s.bio) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), maxLines = 3)
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(website, { website = it }, label = { Text(s.website) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(18.dp))
        GradientButton(if (busy) "…" else s.saveChanges, Modifier.fillMaxWidth(), enabled = !busy) {
            if (name.isBlank()) { error = s.fullName; return@GradientButton }
            busy = true
            Repo.updateProfile(name.trim(), bio.trim(), website.trim(), avatarUrl, coverUrl) { err ->
                onMain {
                    busy = false
                    if (err == null) { app.refreshSessionFlags(); onDone() } else error = err
                }
            }
        }
    }
}
