/**
 * Legal content for the web app and the Android listing (Uptodown / Google Play).
 *
 * Written to match what the code actually does: password + Google sign-in,
 * HttpOnly session cookie, e-mail/display name/locale, listings, offers,
 * messages, push subscriptions (only when the operator configures VAPID keys),
 * aggregate analytics, and a 12-month retention with account deletion.
 */
import type { Locale } from "@/lib/i18n/config";

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; intro: string; updated: string; sections: LegalSection[] };

export const LEGAL: {
  labels: Record<Locale, { legal: string; privacy: string; terms: string; deletion: string; app: string; contact: string; back: string }>;
  privacy: Record<Locale, LegalDoc>;
  terms: Record<Locale, LegalDoc>;
  deletion: Record<Locale, LegalDoc>;
} = {
  labels: {
    ar: { legal: "المعلومات القانونية", privacy: "سياسة الخصوصية", terms: "شروط الاستخدام", deletion: "حذف الحساب", app: "تطبيق أندرويد", contact: "للتواصل", back: "العودة إلى السوق" },
    fr: { legal: "Informations légales", privacy: "Confidentialité", terms: "Conditions d’utilisation", deletion: "Suppression du compte", app: "Application Android", contact: "Contact", back: "Retour au marché" },
    en: { legal: "Legal information", privacy: "Privacy", terms: "Terms of use", deletion: "Account deletion", app: "Android app", contact: "Contact", back: "Back to the marketplace" },
  },
  privacy: {
    ar: {
      title: "سياسة الخصوصية",
      intro: "DZ Exchange سوق جزائري للبيع والشراء بين المستعملين. توضح هذه السياسة أي بيانات نجمعها، ولماذا، وكيف تحذفها.",
      updated: "آخر تحديث: 6 نوفمبر 2026",
      sections: [
        { heading: "البيانات التي نجمعها", body: [
          "بيانات الحساب: البريد الإلكتروني، اسم العرض، الدور (مشترٍ أو بائع)، اللغة، وكلمة مرور مشفّرة باستعمال scrypt. إذا اخترت تسجيل الدخول بحساب Google، نستلم من Google معرّف الحساب وبريده الموثّق واسمه وصورته العامة فقط، ولا نستلم كلمة مرورك مطلقًا.",
          "محتوى السوق: الإعلانات (العنوان، الوصف، السعر، الولاية، البلدية، الحالة، الصور)، العروض التي ترسلها أو تستلمها، والرسائل داخل المنصة.",
          "بيانات تقنية: ملف تعريف ارتباط جلسة (HttpOnly) لتبقيك مسجّلًا، وعدّاد مشاهدات الإعلانات بشكل مجمّع، وسجلات أمنية مؤقتة (حد المعدل).",
          "الإشعارات: إذا فعّلتها، نخزّن عنوان اشتراك Web Push ومفاتيحه على هذا الجهاز فقط. لا نخزّن سجل تنقّل ولا نبيع أي بيانات.",
        ] },
        { heading: "لماذا نستعملها", body: [
          "لتشغيل الحساب والجلسة، ونشر إعلاناتك، وإيصال العروض والرسائل، ومنع الغش والاستعمال الآلي المسيء، وللرد على المساعد الذكي.",
          "الأساس القانوني: تنفيذ الخدمة التي طلبتها (المادة 7 من القانون 18-07) وموافقتك على الإشعارات.",
        ] },
        { heading: "من يطّلع على البيانات", body: [
          "البائعون يرون فقط ما تنشره في الإعلان. المستخدمون الآخرون لا يرون بريدك ولا رقم هاتفك.",
          "مزودو الخدمة التقنيون (استضافة Vercel، قاعدة بيانات PostgreSQL، وGoogle لتسجيل الدخول والإشعارات) يعالجون البيانات نيابة عنا بالحد الأدنى اللازم.",
          "عند تفعيل المساعد الذكي بمفتاح مزوّد خارجي، يُرسل نص طلبك فقط، دون بريدك أو رسائلك أو بيانات الدفع.",
        ] },
        { heading: "المدة والحذف", body: [
          "نحفظ بيانات الحساب ما دام نشطًا. يمكنك حذف حسابك في أي وقت من صفحة «حذف الحساب» أو بطلب إلى support@dzexchange.app، فتُحذف الإعلانات والرسائل والعروض نهائيًا.",
          "تُحذف سجلات الحد الأمني تلقائيًا بعد انتهاء مهلتها القصيرة.",
        ] },
        { heading: "حقوقك", body: [
          "لك حق الوصول إلى بياناتك وتصحيحها وحذفها والاعتراض على معالجتها، وفق القانون 18-07 المتعلق بحماية الأشخاص الطبيعيين في مجال معالجة المعطيات ذات الطابع الشخصي.",
          "لأي طلب، اكتب إلى support@dzexchange.app وسنجيب خلال 30 يومًا.",
        ] },
        { heading: "الأطفال والأمان", body: [
          "الخدمة موجّهة لمن هم في سن 18 أو أكثر. لا نجمع بيانات أطفال عن قصد.",
          "الاتصال مشفّر (HTTPS)، وكلمات المرور مخزّنة مشفّرة، والجلسات محمية بملفات تعريف ارتباط غير قابلة للقراءة من جافاسكربت.",
        ] },
      ],
    },
    fr: {
      title: "Politique de confidentialité",
      intro: "DZ Exchange est une place de marché algérienne entre particuliers. Cette politique explique quelles données nous traitons, pourquoi, et comment les supprimer.",
      updated: "Dernière mise à jour : 6 novembre 2026",
      sections: [
        { heading: "Données que nous traitons", body: [
          "Compte : adresse e-mail, nom d’affichage, rôle (acheteur ou vendeur), langue, et mot de passe haché avec scrypt. Si vous choisissez « Continuer avec Google », nous recevons uniquement l’identifiant, l’e-mail vérifié, le nom et la photo publique fournis par Google — jamais votre mot de passe.",
          "Contenu du marché : annonces (titre, description, prix, wilaya, commune, état, photos), offres envoyées ou reçues, et messages échangés sur la plateforme.",
          "Données techniques : un cookie de session HttpOnly pour rester connecté, un compteur de vues agrégé par annonce, et des compteurs anti-abus temporaires.",
          "Notifications : si vous les activez, l’abonnement Web Push et ses clés sont conservés pour cet appareil uniquement. Aucun historique de navigation n’est vendu ni revendu.",
        ] },
        { heading: "Pourquoi", body: [
          "Authentifier votre compte, publier vos annonces, transmettre offres et messages, prévenir la fraude et l’usage automatisé abusif, et répondre via l’assistant.",
          "Bases légales : exécution du service demandé (loi 18-07) et votre consentement pour les notifications.",
        ] },
        { heading: "Qui y accède", body: [
          "Les vendeurs ne voient que ce que vous publiez. Les autres utilisateurs ne voient ni votre e-mail ni votre téléphone.",
          "Prestataires techniques (hébergement Vercel, base PostgreSQL, Google pour la connexion et les notifications) traitent les données pour notre compte, au strict nécessaire.",
          "Si l’assistant est relié à un fournisseur d’IA externe, seul le texte de votre demande lui est transmis — jamais votre e-mail, vos messages ou des données de paiement.",
        ] },
        { heading: "Durée et suppression", body: [
          "Les données de compte sont conservées tant que le compte est actif. Vous pouvez supprimer votre compte à tout moment depuis la page « Suppression du compte » ou par e-mail à support@dzexchange.app : annonces, messages et offres sont alors effacés définitivement.",
          "Les compteurs anti-abus expirent automatiquement en quelques minutes.",
        ] },
        { heading: "Vos droits", body: [
          "Vous disposez des droits d’accès, de rectification, d’effacement et d’opposition prévus par la loi 18-07 relative à la protection des personnes physiques dans le traitement des données à caractère personnel.",
          "Écrivez à support@dzexchange.app : nous répondons sous 30 jours.",
        ] },
        { heading: "Enfants et sécurité", body: [
          "Le service est destiné aux personnes de 18 ans et plus. Aucune donnée d’enfant n’est collectée sciemment.",
          "Le trafic est chiffré (HTTPS), les mots de passe sont hachés, et la session repose sur un cookie inaccessible au JavaScript.",
        ] },
      ],
    },
    en: {
      title: "Privacy policy",
      intro: "DZ Exchange is an Algerian peer-to-peer marketplace. This policy explains what data we process, why, and how to delete it.",
      updated: "Last updated: 6 November 2026",
      sections: [
        { heading: "Data we process", body: [
          "Account: e-mail address, display name, role (buyer or seller), language, and a password hashed with scrypt. If you choose “Continue with Google”, we receive only the account identifier, verified e-mail, name and public photo from Google — never your password.",
          "Marketplace content: listings (title, description, price, wilaya, commune, condition, photos), offers you send or receive, and messages exchanged on the platform.",
          "Technical data: one HttpOnly session cookie to keep you signed in, an aggregated per-listing view counter, and short-lived anti-abuse counters.",
          "Notifications: if you enable them, the Web Push subscription and its keys are stored for that device only. No browsing history is collected, sold or shared.",
        ] },
        { heading: "Why we use it", body: [
          "To authenticate your account, publish your listings, deliver offers and messages, prevent fraud and automated abuse, and answer through the assistant.",
          "Legal bases: performance of the requested service (Algerian law 18-07) and your consent for notifications.",
        ] },
        { heading: "Who can access it", body: [
          "Sellers only see what you publish. Other users never see your e-mail or phone number.",
          "Technical providers (Vercel hosting, a PostgreSQL database, Google for sign-in and notifications) process data on our behalf, strictly as needed.",
          "When the assistant is connected to an external AI provider, only the text of your request is sent — never your e-mail, your messages or payment data.",
        ] },
        { heading: "Retention and deletion", body: [
          "Account data is kept while the account is active. You can delete your account at any time from the “Account deletion” page or by e-mail to support@dzexchange.app; listings, messages and offers are then permanently removed.",
          "Anti-abuse counters expire automatically within minutes.",
        ] },
        { heading: "Your rights", body: [
          "You have the rights of access, rectification, erasure and objection under Algerian law 18-07 on the protection of individuals in the processing of personal data.",
          "Write to support@dzexchange.app; we answer within 30 days.",
        ] },
        { heading: "Children and security", body: [
          "The service is intended for people aged 18 and over. We do not knowingly collect children’s data.",
          "Traffic is encrypted (HTTPS), passwords are hashed, and the session cookie is not readable from JavaScript.",
        ] },
      ],
    },
  },
  terms: {
    ar: {
      title: "شروط الاستخدام",
      intro: "باستعمالك DZ Exchange فإنك تقبل هذه الشروط. اقرأها قبل نشر أي إعلان أو إرسال أي عرض.",
      updated: "آخر تحديث: 6 نوفمبر 2026",
      sections: [
        { heading: "الخدمة", body: [
          "DZ Exchange منصة تربط البائعين والمشترين في الجزائر. نحن لا نملك السلع ولا نبيعها، ولا نتدخل في نقلها.",
          "المنصة لا تعالج المدفوعات حاليًا: كل اتفاق مالي يتم مباشرة بين الطرفين، والدفع المحمي غير مفعّل.",
        ] },
        { heading: "الحساب", body: [
          "يجب أن تكون في سن 18 أو أكثر وأن تقدم معلومات صحيحة. أنت مسؤول عن سرية كلمة مرورك وعن كل نشاط يجري من حسابك.",
          "يمكن تسجيل الدخول بكلمة مرور أو بحساب Google. لا تشارك رمز التحقق مع أي شخص، بما في ذلك من يدّعي أنه فريق الدعم.",
        ] },
        { heading: "قواعد الإعلانات", body: [
          "يُمنع نشر سلع ممنوعة قانونًا (مخدرات، أسلحة، أدوية، أعضاء، مواد مقرصنة، وثائق هوية)، أو محتوى مضلل، أو صور لا تملك حق استعمالها.",
          "يجب أن يكون الوصف صادقًا وأن يذكر العيوب المعروفة. السعر والولاية والبلدية إلزامية.",
        ] },
        { heading: "السلوك الممنوع", body: [
          "التحايل، انتحال الهوية، التهديد، خطاب الكراهية، الرسائل المزعجة، ومحاولة استخراج رموز بنكية أو كلمات مرور.",
          "استعمال برامج آلية لجمع البيانات أو إغراق الخدمة يُفضي إلى تعليق الحساب.",
        ] },
        { heading: "المسؤولية", body: [
          "أنت مسؤول عن فحص السلعة قبل الدفع وعن التحقق من هوية الطرف الآخر. ننصح باللقاء في مكان عام مزدحم.",
          "لا نضمن جودة السلع ولا هوية المستعملين ولا نتحمل خسائر ناتجة عن اتفاق بين طرفين، في حدود ما يسمح به القانون.",
        ] },
        { heading: "الإيقاف والتعديل", body: [
          "يمكننا تعليق أو حذف حساب يخالف هذه الشروط أو القوانين الجزائرية المعمول بها.",
          "قد نحدّث الشروط، وسننشر تاريخ التحديث في أعلى الصفحة. الاستمرار في الاستعمال يعني القبول.",
        ] },
      ],
    },
    fr: {
      title: "Conditions d’utilisation",
      intro: "En utilisant DZ Exchange, vous acceptez ces conditions. Lisez-les avant de publier une annonce ou d’envoyer une offre.",
      updated: "Dernière mise à jour : 6 novembre 2026",
      sections: [
        { heading: "Le service", body: [
          "DZ Exchange met en relation vendeurs et acheteurs en Algérie. Nous ne possédons ni ne vendons les biens et n’intervenons pas dans leur transport.",
          "Aucun paiement n’est traité par la plateforme : tout accord financier se fait directement entre les parties. Le paiement protégé n’est pas activé.",
        ] },
        { heading: "Compte", body: [
          "Vous devez avoir 18 ans ou plus et fournir des informations exactes. Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée depuis votre compte.",
          "La connexion se fait par mot de passe ou via Google. Ne partagez jamais un code de vérification, même avec quelqu’un qui se présente comme le support.",
        ] },
        { heading: "Règles des annonces", body: [
          "Sont interdits : les biens illégaux (stupéfiants, armes, médicaments, organes, contenus piratés, pièces d’identité), les contenus trompeurs et les photos que vous n’avez pas le droit d’utiliser.",
          "La description doit être sincère et mentionner les défauts connus. Le prix, la wilaya et la commune sont obligatoires.",
        ] },
        { heading: "Comportements interdits", body: [
          "Fraude, usurpation d’identité, menaces, discours haineux, spam, et toute tentative d’obtenir des codes bancaires ou des mots de passe.",
          "L’usage de robots pour extraire des données ou saturer le service entraîne la suspension du compte.",
        ] },
        { heading: "Responsabilité", body: [
          "Vous êtes responsable de vérifier l’article avant de payer et l’identité de votre interlocuteur. Privilégiez un lieu public fréquenté.",
          "Nous ne garantissons ni la qualité des biens ni l’identité des utilisateurs et ne répondons pas des pertes issues d’un accord entre deux parties, dans les limites permises par la loi.",
        ] },
        { heading: "Suspension et modifications", body: [
          "Nous pouvons suspendre ou supprimer un compte qui enfreint ces conditions ou la loi algérienne.",
          "Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. Continuer à utiliser le service vaut acceptation.",
        ] },
      ],
    },
    en: {
      title: "Terms of use",
      intro: "By using DZ Exchange you accept these terms. Please read them before publishing a listing or sending an offer.",
      updated: "Last updated: 6 November 2026",
      sections: [
        { heading: "The service", body: [
          "DZ Exchange connects sellers and buyers in Algeria. We do not own or sell the goods and take no part in their transport.",
          "No payment is processed by the platform: every financial agreement is made directly between the parties. Protected payment is not enabled.",
        ] },
        { heading: "Account", body: [
          "You must be 18 or older and provide accurate information. You are responsible for keeping your password secret and for all activity from your account.",
          "Sign-in uses a password or Google. Never share a verification code, even with someone claiming to be support.",
        ] },
        { heading: "Listing rules", body: [
          "Illegal goods (drugs, weapons, medicines, organs, pirated material, identity documents), misleading content, and photos you have no right to use are prohibited.",
          "Descriptions must be truthful and list known defects. Price, wilaya and commune are required.",
        ] },
        { heading: "Prohibited behaviour", body: [
          "Fraud, impersonation, threats, hate speech, spam, and any attempt to obtain bank codes or passwords.",
          "Automated scraping or flooding the service leads to account suspension.",
        ] },
        { heading: "Liability", body: [
          "You are responsible for inspecting the item before paying and for verifying the other party. Prefer a busy public place.",
          "We do not guarantee goods quality or user identity and are not liable for losses from an agreement between two parties, within the limits allowed by law.",
        ] },
        { heading: "Suspension and changes", body: [
          "We may suspend or remove an account that breaks these terms or Algerian law.",
          "These terms may change; the update date is shown at the top of the page. Continued use means acceptance.",
        ] },
      ],
    },
  },
  deletion: {
    ar: {
      title: "حذف الحساب والبيانات",
      intro: "يمكنك حذف حسابك وكل بياناتك من DZ Exchange نهائيًا، دون الحاجة إلى الاتصال بأي شخص.",
      updated: "آخر تحديث: 6 نوفمبر 2026",
      sections: [
        { heading: "من داخل التطبيق أو الموقع", body: [
          "سجّل الدخول، ثم افتح الإعدادات ← الحساب والأمان ← «حذف حسابي»، وأكّد العملية. يُحذف الحساب فورًا.",
          "قبل الحذف، أزل إعلاناتك النشطة إن أردت الاحتفاظ بالصور؛ حذف الحساب يحذفها معه.",
        ] },
        { heading: "ماذا يُحذف", body: [
          "يُحذف نهائيًا: الحساب، البريد الإلكتروني، الصورة، الإعلانات، الصور المرفوعة، العروض والرسائل المرتبطة بك، وأجهزة الإشعارات المسجّلة.",
          "تُحذف الجلسات النشطة فورًا، فتُخرَج من كل الأجهزة.",
        ] },
        { heading: "ما قد يبقى", body: [
          "قد نحتفظ بسجلات مجهّلة (بدون معرّف شخصي) لأغراض إحصائية أو لمكافحة الغش، ولا يمكن ربطها بك.",
          "إذا كان لديك نزاع مفتوح أو التزام قانوني، قد نحتفظ بالحد الأدنى الضروري للمدة التي يفرضها القانون.",
        ] },
        { heading: "بالبريد الإلكتروني", body: [
          "إذا لم تستطع الدخول، أرسل من بريد الحساب إلى support@dzexchange.app بعنوان «حذف الحساب» وسننفّذ الطلب خلال 30 يومًا بعد التحقق من الملكية.",
        ] },
      ],
    },
    fr: {
      title: "Suppression du compte et des données",
      intro: "Vous pouvez supprimer définitivement votre compte et vos données DZ Exchange, sans contacter qui que ce soit.",
      updated: "Dernière mise à jour : 6 novembre 2026",
      sections: [
        { heading: "Depuis l’application ou le site", body: [
          "Connectez-vous, puis ouvrez Paramètres → Compte et sécurité → « Supprimer mon compte » et confirmez. La suppression est immédiate.",
          "Avant de supprimer, retirez vos annonces actives si vous souhaitez conserver les photos : elles partent avec le compte.",
        ] },
        { heading: "Ce qui est supprimé", body: [
          "Sont effacés définitivement : le compte, l’e-mail, l’avatar, les annonces, les photos importées, les offres et messages liés, et les appareils d’notification enregistrés.",
          "Les sessions actives sont révoquées immédiatement : vous êtes déconnecté de tous les appareils.",
        ] },
        { heading: "Ce qui peut subsister", body: [
          "Des journaux anonymisés (sans identifiant personnel) peuvent être conservés à des fins statistiques ou anti-fraude ; ils ne peuvent pas être reliés à vous.",
          "En cas de litige ouvert ou d’obligation légale, le minimum nécessaire peut être conservé pour la durée imposée par la loi.",
        ] },
        { heading: "Par e-mail", body: [
          "Si vous ne pouvez plus vous connecter, écrivez depuis l’adresse du compte à support@dzexchange.app avec l’objet « Suppression du compte » : nous exécutons la demande sous 30 jours après vérification de la propriété.",
        ] },
      ],
    },
    en: {
      title: "Account and data deletion",
      intro: "You can permanently delete your DZ Exchange account and data without contacting anyone.",
      updated: "Last updated: 6 November 2026",
      sections: [
        { heading: "From the app or the website", body: [
          "Sign in, open Settings → Account and security → “Delete my account”, and confirm. Deletion is immediate.",
          "Remove your active listings first if you want to keep the photos: deleting the account deletes them too.",
        ] },
        { heading: "What is deleted", body: [
          "Permanently removed: the account, e-mail, avatar, listings, uploaded photos, related offers and messages, and registered notification devices.",
          "Active sessions are revoked immediately, signing you out on every device.",
        ] },
        { heading: "What may remain", body: [
          "Anonymised logs (without any personal identifier) may be kept for statistics or fraud prevention; they cannot be linked back to you.",
          "If you have an open dispute or a legal obligation, the minimum necessary is kept for the period the law requires.",
        ] },
        { heading: "By e-mail", body: [
          "If you can no longer sign in, write from the account address to support@dzexchange.app with the subject “Account deletion”. We carry it out within 30 days after verifying ownership.",
        ] },
      ],
    },
  },
};
