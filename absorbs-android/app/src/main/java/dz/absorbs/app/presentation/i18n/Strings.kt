package dz.absorbs.app.presentation.i18n

import androidx.compose.runtime.staticCompositionLocalOf

enum class Lang(val code: String, val label: String) {
    AR("ar", "العربية"), FR("fr", "Français"), EN("en", "English");

    companion object {
        fun from(code: String?) = entries.firstOrNull { it.code == code } ?: AR
    }
}

data class Str(
    val appTagline: String, val login: String, val signup: String, val email: String, val password: String,
    val fullName: String, val username: String, val forgotPassword: String, val resetSent: String,
    val continueGoogle: String, val agreeTerms: String, val checkEmail: String, val resendLink: String,
    val home: String, val reels: String, val explore: String, val messages: String, val profile: String,
    val notifications: String, val settings: String, val createPost: String, val yourStory: String,
    val addStory: String, val whatsNew: String, val publish: String, val publishing: String,
    val comments: String, val addComment: String, val reply: String, val like: String, val save: String,
    val saved: String, val share: String, val report: String, val delete: String, val block: String,
    val unblock: String, val follow: String, val following: String, val followers: String, val followingLabel: String,
    val posts: String, val editProfile: String, val bio: String, val website: String, val saveChanges: String,
    val logout: String, val deleteAccount: String, val deleteAccountConfirm: String, val language: String,
    val darkMode: String, val privacy: String, val terms: String, val blockedUsers: String, val about: String,
    val searchPeople: String, val searchPosts: String, val noResults: String, val noPosts: String,
    val noMessages: String, val noNotifications: String, val noComments: String, val writeMessage: String,
    val typing: String, val online: String, val offlineBanner: String, val retry: String,
    val storyReplySent: String, val replyToStory: String, val aiTitle: String, val aiHint: String,
    val aiWelcome: String, val verified: String, val message: String, val camera: String, val gallery: String,
    val addCaption: String, val filters: String, val errorGeneric: String, val cancel: String, val confirm: String,
    val storyMode: String, val postMode: String, val loadMore: String, val newPostNotif: String,
    val likedYourPost: String, val commentedYourPost: String, val startedFollowing: String, val version: String,
)

val ArStr = Str(
    appTagline = "حيث تلتقي الجزائر", login = "تسجيل الدخول", signup = "حساب جديد", email = "البريد الإلكتروني",
    password = "كلمة المرور", fullName = "الاسم الكامل", username = "اسم المستخدم", forgotPassword = "نسيت كلمة المرور؟",
    resetSent = "أُرسل رابط الاستعادة إلى بريدك", continueGoogle = "المتابعة مع Google",
    agreeTerms = "بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية",
    checkEmail = "أرسلنا رابط تفعيل إلى بريدك. افتحه ثم سجّل الدخول هنا.", resendLink = "إعادة إرسال رابط التفعيل",
    home = "الرئيسية", reels = "ريلز", explore = "استكشاف", messages = "الرسائل", profile = "حسابي",
    notifications = "الإشعارات", settings = "الإعدادات", createPost = "إنشاء", yourStory = "قصتك", addStory = "أضف قصة",
    whatsNew = "شارك لحظتك مع الجزائر…", publish = "نشر", publishing = "جارٍ النشر…", comments = "التعليقات",
    addComment = "أضف تعليقًا…", reply = "رد", like = "إعجاب", save = "حفظ", saved = "المحفوظة", share = "مشاركة",
    report = "الإبلاغ", delete = "حذف", block = "حظر", unblock = "إلغاء الحظر", follow = "متابعة", following = "أتابعه",
    followers = "متابِع", followingLabel = "أُتابِع", posts = "منشور", editProfile = "تعديل الملف", bio = "نبذة عني",
    website = "الموقع", saveChanges = "حفظ التعديلات", logout = "تسجيل الخروج", deleteAccount = "حذف حسابي نهائيًا",
    deleteAccountConfirm = "سيتم حذف حسابك وكل محتواك نهائيًا ولا يمكن التراجع. متأكد؟",
    language = "اللغة", darkMode = "الوضع الداكن", privacy = "سياسة الخصوصية", terms = "شروط الاستخدام وقواعد المجتمع",
    blockedUsers = "المستخدمون المحظورون", about = "حول التطبيق", searchPeople = "ابحث عن الأشخاص…",
    searchPosts = "ابحث في المنشورات…", noResults = "لا توجد نتائج", noPosts = "لا توجد منشورات بعد — كن أول من ينشر",
    noMessages = "لا توجد محادثات بعد", noNotifications = "لا توجد إشعارات بعد", noComments = "لا توجد تعليقات — كن أول من يعلّق",
    writeMessage = "اكتب رسالة…", typing = "يكتب الآن…", online = "متصل الآن", offlineBanner = "لا يوجد اتصال بالإنترنت — تعرض آخر نسخة محفوظة",
    retry = "إعادة المحاولة", storyReplySent = "أُرسل ردّك على القصة", replyToStory = "رد على القصة…",
    aiTitle = "Dz connect ai", aiHint = "اسأل Dz connect ai…",
    aiWelcome = "أهلًا بك في Dz connect ai — اسألني عن أي شيء، أو اطلب أفكار منشورات وتحسين نصوصك.",
    verified = "موثّق", message = "مراسلة", camera = "الكاميرا", gallery = "المعرض", addCaption = "أضف وصفًا ووسومًا #…",
    filters = "الفلاتر", errorGeneric = "حدث خطأ — حاول مجددًا", cancel = "إلغاء", confirm = "تأكيد",
    storyMode = "قصة 24 ساعة", postMode = "منشور", loadMore = "تحميل المزيد", newPostNotif = "جديد",
    likedYourPost = "أعجب بمنشورك", commentedYourPost = "علّق على منشورك", startedFollowing = "بدأ متابعتك",
    version = "الإصدار",
)

val FrStr = Str(
    appTagline = "Là où l'Algérie se retrouve", login = "Se connecter", signup = "Créer un compte", email = "E-mail",
    password = "Mot de passe", fullName = "Nom complet", username = "Nom d'utilisateur", forgotPassword = "Mot de passe oublié ?",
    resetSent = "Lien de réinitialisation envoyé", continueGoogle = "Continuer avec Google",
    agreeTerms = "En continuant, vous acceptez les Conditions et la Politique de confidentialité",
    checkEmail = "Nous avons envoyé un lien d'activation à votre e-mail. Ouvrez-le puis connectez-vous ici.",
    resendLink = "Renvoyer le lien d'activation",
    home = "Accueil", reels = "Reels", explore = "Explorer", messages = "Messages", profile = "Profil",
    notifications = "Notifications", settings = "Paramètres", createPost = "Créer", yourStory = "Votre story", addStory = "Ajouter une story",
    whatsNew = "Partagez votre moment avec l'Algérie…", publish = "Publier", publishing = "Publication…", comments = "Commentaires",
    addComment = "Ajouter un commentaire…", reply = "Répondre", like = "J'aime", save = "Enregistrer", saved = "Enregistrés",
    share = "Partager", report = "Signaler", delete = "Supprimer", block = "Bloquer", unblock = "Débloquer",
    follow = "Suivre", following = "Suivi", followers = "Abonnés", followingLabel = "Abonnements", posts = "Publications",
    editProfile = "Modifier le profil", bio = "Bio", website = "Site web", saveChanges = "Enregistrer", logout = "Se déconnecter",
    deleteAccount = "Supprimer mon compte", deleteAccountConfirm = "Votre compte et tout votre contenu seront supprimés définitivement. Confirmer ?",
    language = "Langue", darkMode = "Mode sombre", privacy = "Politique de confidentialité", terms = "Conditions et règles de la communauté",
    blockedUsers = "Utilisateurs bloqués", about = "À propos", searchPeople = "Rechercher des personnes…",
    searchPosts = "Rechercher des publications…", noResults = "Aucun résultat", noPosts = "Aucune publication — soyez le premier à publier",
    noMessages = "Aucune conversation", noNotifications = "Aucune notification", noComments = "Aucun commentaire — soyez le premier",
    writeMessage = "Écrivez un message…", typing = "écrit…", online = "En ligne", offlineBanner = "Pas de connexion — dernière version en cache affichée",
    retry = "Réessayer", storyReplySent = "Réponse à la story envoyée", replyToStory = "Répondre à la story…",
    aiTitle = "Dz connect ai", aiHint = "Demandez à Dz connect ai…",
    aiWelcome = "Bienvenue dans Dz connect ai — posez vos questions ou demandez des idées de publications.",
    verified = "Vérifié", message = "Message", camera = "Caméra", gallery = "Galerie", addCaption = "Ajoutez une description et des #tags…",
    filters = "Filtres", errorGeneric = "Une erreur est survenue — réessayez", cancel = "Annuler", confirm = "Confirmer",
    storyMode = "Story 24 h", postMode = "Publication", loadMore = "Charger plus", newPostNotif = "Nouveau",
    likedYourPost = "a aimé votre publication", commentedYourPost = "a commenté votre publication", startedFollowing = "vous suit désormais",
    version = "Version",
)

val EnStr = Str(
    appTagline = "Where Algeria connects", login = "Log in", signup = "Create account", email = "Email",
    password = "Password", fullName = "Full name", username = "Username", forgotPassword = "Forgot password?",
    resetSent = "Password reset link sent", continueGoogle = "Continue with Google",
    agreeTerms = "By continuing you agree to the Terms of Use and Privacy Policy",
    checkEmail = "We sent an activation link to your email. Open it, then log in here.", resendLink = "Resend activation link",
    home = "Home", reels = "Reels", explore = "Explore", messages = "Messages", profile = "Profile",
    notifications = "Notifications", settings = "Settings", createPost = "Create", yourStory = "Your story", addStory = "Add story",
    whatsNew = "Share your moment with Algeria…", publish = "Publish", publishing = "Publishing…", comments = "Comments",
    addComment = "Add a comment…", reply = "Reply", like = "Like", save = "Save", saved = "Saved",
    share = "Share", report = "Report", delete = "Delete", block = "Block", unblock = "Unblock",
    follow = "Follow", following = "Following", followers = "Followers", followingLabel = "Following", posts = "Posts",
    editProfile = "Edit profile", bio = "Bio", website = "Website", saveChanges = "Save changes", logout = "Log out",
    deleteAccount = "Delete my account", deleteAccountConfirm = "Your account and all content will be permanently deleted. Are you sure?",
    language = "Language", darkMode = "Dark mode", privacy = "Privacy Policy", terms = "Terms & Community Rules",
    blockedUsers = "Blocked users", about = "About", searchPeople = "Search people…",
    searchPosts = "Search posts…", noResults = "No results", noPosts = "No posts yet — be the first to publish",
    noMessages = "No conversations yet", noNotifications = "No notifications yet", noComments = "No comments — be the first",
    writeMessage = "Write a message…", typing = "typing…", online = "Online now", offlineBanner = "No internet — showing the last cached version",
    retry = "Retry", storyReplySent = "Story reply sent", replyToStory = "Reply to story…",
    aiTitle = "Dz connect ai", aiHint = "Ask Dz connect ai…",
    aiWelcome = "Welcome to Dz connect ai — ask me anything, or get post ideas and text improvements.",
    verified = "Verified", message = "Message", camera = "Camera", gallery = "Gallery", addCaption = "Add a caption and #hashtags…",
    filters = "Filters", errorGeneric = "Something went wrong — try again", cancel = "Cancel", confirm = "Confirm",
    storyMode = "24h Story", postMode = "Post", loadMore = "Load more", newPostNotif = "New",
    likedYourPost = "liked your post", commentedYourPost = "commented on your post", startedFollowing = "started following you",
    version = "Version",
)

fun stringsFor(lang: Lang): Str = when (lang) {
    Lang.AR -> ArStr
    Lang.FR -> FrStr
    Lang.EN -> EnStr
}

val LocalStr = staticCompositionLocalOf { ArStr }
val LocalLang = staticCompositionLocalOf { Lang.AR }
