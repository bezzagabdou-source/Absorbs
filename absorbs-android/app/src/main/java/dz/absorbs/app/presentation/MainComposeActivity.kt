package dz.absorbs.app.presentation

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.R
import dz.absorbs.app.data.Config
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.ThreadItem
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.OfflineBar
import dz.absorbs.app.presentation.i18n.Lang
import dz.absorbs.app.presentation.i18n.LocalLang
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.i18n.stringsFor
import dz.absorbs.app.presentation.screens.AiScreen
import dz.absorbs.app.presentation.screens.AuthScreen
import dz.absorbs.app.presentation.screens.ChatScreen
import dz.absorbs.app.presentation.screens.CommentsScreen
import dz.absorbs.app.presentation.screens.CreateScreen
import dz.absorbs.app.presentation.screens.EditProfileScreen
import dz.absorbs.app.presentation.screens.ExploreScreen
import dz.absorbs.app.presentation.screens.FeedScreen
import dz.absorbs.app.presentation.screens.NotificationsScreen
import dz.absorbs.app.presentation.screens.ProfileScreen
import dz.absorbs.app.presentation.screens.ReelsScreen
import dz.absorbs.app.presentation.screens.SavedScreen
import dz.absorbs.app.presentation.screens.SettingsScreen
import dz.absorbs.app.presentation.screens.ThreadsScreen
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.theme.DzTheme
import dz.absorbs.app.presentation.viewmodel.AppViewModel
import dz.absorbs.app.presentation.viewmodel.FeedViewModel
import dz.absorbs.app.presentation.viewmodel.onMain

data class NavState(
    val tab: Int = 0,
    val commentsPost: Post? = null,
    val profileUserId: String? = null,
    val chatThread: ThreadItem? = null,
    val editProfile: Boolean = false,
    val settings: Boolean = false,
    val saved: Boolean = false,
    val notifications: Boolean = false,
)

class MainComposeActivity : ComponentActivity() {
    private var deepLinkUser = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        dz.absorbs.app.data.Api.init(this)
        handleIntent(intent)
        setContent {
            val prefs = getSharedPreferences("dz_prefs", Context.MODE_PRIVATE)
            var dark by remember { mutableStateOf(prefs.getBoolean("dark", false)) }
            var lang by remember {
                val saved = prefs.getString("lang", null)
                mutableStateOf(
                    when (saved) {
                        "FR" -> Lang.FR
                        "EN" -> Lang.EN
                        else -> Lang.AR
                    }
                )
            }
            val strings = stringsFor(lang)
            val dir = if (lang == Lang.AR) LayoutDirection.Rtl else LayoutDirection.Ltr

            CompositionLocalProvider(
                LocalStr provides strings,
                LocalLang provides lang,
                LocalLayoutDirection provides dir,
            ) {
                DzTheme(dark = dark, lang = lang) {
                    val app = remember { AppViewModel() }
                    val feedVm = remember { FeedViewModel(app) }
                    var splash by remember { mutableStateOf(true) }
                    var nav by remember { mutableStateOf(NavState()) }
                    var createOpen by remember { mutableStateOf(false) }
                    var createStory by remember { mutableStateOf(false) }

                    // Connectivity observer
                    LaunchedEffect(Unit) {
                        val cm = getSystemService(ConnectivityManager::class.java)
                        val cb = object : ConnectivityManager.NetworkCallback() {
                            override fun onAvailable(network: Network) { onMain { app.online = true } }
                            override fun onLost(network: Network) { onMain { app.online = false } }
                        }
                        try { cm.registerNetworkCallback(NetworkRequest.Builder().build(), cb) } catch (_: Exception) {}
                        app.online = cm.activeNetwork != null
                    }

                    LaunchedEffect(app.loggedIn) {
                        if (app.loggedIn) {
                            app.refreshSessionFlags()
                            feedVm.load(this@MainComposeActivity.applicationContext)
                        }
                    }
                    LaunchedEffect(Unit) {
                        kotlinx.coroutines.delay(1400)
                        splash = false
                    }

                    Box(
                        Modifier.fillMaxSize()
                            .background(Dz.appBrush(dark))
                            .statusBarsPadding(),
                    ) {
                        when {
                            splash -> SplashView(lang)
                            !app.loggedIn -> AuthScreen(app)
                            else -> MainShell(
                                app = app, feedVm = feedVm, nav = nav,
                                onNav = { nav = it },
                                onCreate = { story ->
                                    createStory = story
                                    createOpen = true
                                },
                                dark = dark,
                                lang = lang,
                                onToggleDark = { v ->
                                    dark = v
                                    prefs.edit().putBoolean("dark", v).apply()
                                },
                                onSetLang = { l ->
                                    lang = l
                                    prefs.edit().putString("lang", l.name).apply()
                                },
                                deepLinkUser = deepLinkUser.value,
                                onConsumeDeepLink = { deepLinkUser.value = null },
                            )
                        }
                        AnimatedVisibility(
                            visible = createOpen,
                            enter = fadeIn(tween(220)),
                            exit = slideOutVertically(tween(220)) { it },
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                                CreateScreen(
                                    storyModeInitial = createStory,
                                    onDone = {
                                        createOpen = false
                                        feedVm.load(this@MainComposeActivity.applicationContext, refresh = true)
                                    },
                                    onCancel = { createOpen = false },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        // dzconnect://auth#access_token=...&refresh_token=...
        if (data.scheme == "dzconnect") {
            val frag = data.fragment ?: return
            val params = frag.split("&").mapNotNull {
                val p = it.split("=", limit = 2)
                if (p.size == 2) p[0] to p[1] else null
            }.toMap()
            val access = params["access_token"]?.let { android.net.Uri.decode(it) } ?: return
            val refresh = params["refresh_token"]?.let { android.net.Uri.decode(it) } ?: access
            dz.absorbs.app.data.Api.saveSessionFromDeepLink(access, refresh, params["expires_in"]?.toLongOrNull() ?: 3600)
            return
        }
        if (data.scheme == "https" || data.scheme == "dzconnect") {
            val seg = data.pathSegments
            if (seg.size >= 2 && (seg[0] == "u" || seg[0] == "profile")) {
                deepLinkUser.value = seg[1]
            }
        }
    }
}

@Composable
private fun SplashView(lang: Lang) {
    val s = stringsFor(lang)
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            AnimatedVisibility(shown, enter = scaleIn(tween(600)) + fadeIn(tween(500))) {
                Box(
                    Modifier.size(96.dp).background(Dz.primaryBrush(), RoundedCornerShape(28.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text("D", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 44.sp) }
            }
            Spacer(Modifier.height(16.dp))
            Text("Dz connect", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onSurface)
            Text(s.appTagline, color = Dz.Emerald, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(26.dp))
            val composition = com.airbnb.lottie.compose.rememberLottieComposition(
                com.airbnb.lottie.compose.LottieCompositionSpec.Asset("AndroidWave.json"),
            ).value
            com.airbnb.lottie.compose.LottieAnimation(
                composition = composition,
                iterations = com.airbnb.lottie.compose.LottieConstants.IterateForever,
                modifier = Modifier.size(110.dp),
            )
        }
    }
}

@Composable
private fun MainShell(
    app: AppViewModel,
    feedVm: FeedViewModel,
    nav: NavState,
    onNav: (NavState) -> Unit,
    onCreate: (Boolean) -> Unit,
    dark: Boolean,
    lang: Lang,
    onToggleDark: (Boolean) -> Unit,
    onSetLang: (Lang) -> Unit,
    deepLinkUser: String?,
    onConsumeDeepLink: () -> Unit,
) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var aiOpen by remember { mutableStateOf(false) }

    LaunchedEffect(deepLinkUser) {
        deepLinkUser?.let { uid ->
            onNav(nav.copy(profileUserId = uid, tab = 4))
            onConsumeDeepLink()
        }
    }

    fun haptic() {
        try {
            val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(18, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") v.vibrate(18)
            }
        } catch (_: Exception) {
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            if (!app.online) OfflineBar(s.offlineBanner)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    nav.notifications -> NotificationsScreen(
                        onBack = { onNav(nav.copy(notifications = false)) },
                        onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid, notifications = false)) },
                    )
                    nav.settings -> SettingsScreen(
                        app = app, dark = dark, onToggleDark = onToggleDark,
                        lang = lang, onSetLang = onSetLang,
                        onOpenSaved = { onNav(nav.copy(saved = true, settings = false)) },
                        onBack = { onNav(nav.copy(settings = false)) },
                        onLoggedOut = { app.refreshSessionFlags() },
                    )
                    nav.saved -> SavedScreen(
                        app = app,
                        onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                        onBack = { onNav(nav.copy(saved = false)) },
                    )
                    nav.editProfile -> EditProfileScreen(
                        app = app,
                        onDone = { onNav(nav.copy(editProfile = false)) },
                        onBack = { onNav(nav.copy(editProfile = false)) },
                    )
                    nav.chatThread != null -> ChatScreen(
                        thread = nav.chatThread!!, app = app,
                        onBack = { onNav(nav.copy(chatThread = null)) },
                    )
                    nav.commentsPost != null -> CommentsScreen(
                        post = nav.commentsPost!!, app = app,
                        onBack = { onNav(nav.copy(commentsPost = null)) },
                        onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid, commentsPost = null)) },
                    )
                    nav.profileUserId != null -> ProfileScreen(
                        userId = nav.profileUserId, app = app,
                        onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid)) },
                        onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                        onEditProfile = { onNav(nav.copy(editProfile = true)) },
                        onOpenSettings = { onNav(nav.copy(settings = true)) },
                        onOpenChat = { thread -> onNav(nav.copy(chatThread = thread, profileUserId = null)) },
                        onBack = { onNav(nav.copy(profileUserId = null)) },
                    )
                    else -> when (nav.tab) {
                        0 -> FeedScreen(
                            app = app, vm = feedVm,
                            onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid)) },
                            onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                            onOpenNotifications = { onNav(nav.copy(notifications = true)) },
                            onOpenMessages = { onNav(nav.copy(tab = 3)) },
                            onAddStory = { onCreate(true) },
                            onOpenReels = { onNav(nav.copy(tab = 1)) },
                        )
                        1 -> ReelsScreen(
                            app = app,
                            onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                            onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid)) },
                        )
                        2 -> ExploreScreen(
                            onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid)) },
                            onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                        )
                        3 -> ThreadsScreen(
                            onOpenChat = { thread -> onNav(nav.copy(chatThread = thread)) },
                        )
                        else -> ProfileScreen(
                            userId = null, app = app,
                            onOpenProfile = { uid -> onNav(nav.copy(profileUserId = uid)) },
                            onOpenComments = { post -> onNav(nav.copy(commentsPost = post)) },
                            onEditProfile = { onNav(nav.copy(editProfile = true)) },
                            onOpenSettings = { onNav(nav.copy(settings = true)) },
                            onOpenChat = { thread -> onNav(nav.copy(chatThread = thread)) },
                            onBack = null,
                        )
                    }
                }
            }
            // Bottom navigation
            GlassCard(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(6.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    NavItem(R.drawable.ic_lucide_house, s.home, nav.tab == 0, Modifier.weight(1f)) {
                        haptic(); onNav(NavState(tab = 0))
                    }
                    NavItem(R.drawable.ic_lucide_clapperboard, s.reels, nav.tab == 1, Modifier.weight(1f)) {
                        haptic(); onNav(nav.copy(tab = 1))
                    }
                    // Create FAB
                    Box(
                        Modifier.size(52.dp).clip(CircleShape).background(Dz.primaryBrush())
                            .clickable { haptic(); onCreate(false) },
                        contentAlignment = Alignment.Center,
                    ) { DzIcon(R.drawable.ic_lucide_plus, tint = Color.White, size = 26.dp) }
                    NavItem(R.drawable.ic_lucide_compass, s.explore, nav.tab == 2, Modifier.weight(1f)) {
                        haptic(); onNav(nav.copy(tab = 2))
                    }
                    NavItem(R.drawable.ic_lucide_user, s.profile, nav.tab == 4, Modifier.weight(1f)) {
                        haptic(); onNav(nav.copy(tab = 4, profileUserId = null))
                    }
                }
            }
        }
        // AI FAB
        if (nav.tab == 0 && nav.commentsPost == null && nav.chatThread == null) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 96.dp)
                    .size(54.dp).clip(CircleShape)
                    .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Dz.Sky, Dz.Emerald)))
                    .clickable { haptic(); aiOpen = true },
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_sparkles, tint = Color.White, size = 25.dp) }
        }
    }
    if (aiOpen) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            Column {
                Box(Modifier.fillMaxWidth()) {
                    AiScreen()
                    Box(
                        Modifier.align(Alignment.TopEnd).padding(10.dp).size(38.dp)
                            .background(MaterialTheme.colorScheme.surface, CircleShape)
                            .clickable { aiOpen = false },
                        contentAlignment = Alignment.Center,
                    ) { DzIcon(R.drawable.ic_lucide_x, tint = MaterialTheme.colorScheme.onSurface, size = 19.dp) }
                }
            }
        }
    }
}

/** Bottom-navigation item with selection state. */
@Composable
private fun NavItem(
    icon: Int,
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .then(
                if (selected) Modifier.background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                else Modifier,
            )
            .clickable { onClick() }
            .padding(vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        DzIcon(icon, tint = if (selected) Dz.Emerald else MaterialTheme.colorScheme.onSurfaceVariant, size = 23.dp)
        Text(
            label, fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) Dz.Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
