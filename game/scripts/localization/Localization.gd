class_name Localization
extends RefCounted
## Runtime Arabic/English dictionary. RTL is applied on the UI root.

var locale: String = "ar"
var _ar := {
	"PLAY": "اللعب", "NEW_GAME": "لعبة جديدة", "CONTINUE": "متابعة", "MISSIONS": "المهمات",
	"STORE": "المتجر", "SETTINGS": "الإعدادات", "ACHIEVEMENTS": "الإنجازات", "QUIT": "خروج",
	"NOVA MIRA": "نوفا ميرا", "START": "ابدأ", "BACK": "رجوع", "CLOSE": "إغلاق",
	"HEALTH": "الصحة", "ARMOUR": "الدرع", "MONEY": "المال", "WANTED": "مطلوب",
	"WEAPON": "السلاح", "AMMO": "الذخيرة", "SPEED": "السرعة", "FUEL": "الوقود",
	"DAY": "اليوم", "TIME": "الوقت", "WEATHER": "الطقس", "RADIO": "الراديو",
	"GOODS": "المتجر", "CLOTHES": "الملابس", "CARS": "السيارات", "PROPERTIES": "العقارات",
	"BUY": "اشترِ", "EQUIP": "ارتّدي", "ENTER": "ادخل", "EXIT": "اخرج",
	"MISSION_COMPLETE": "اكتملت المهمة", "REWARD": "المكافأة", "FAILED": "فشلت",
	"PAUSE": "إيقاف مؤقت", "RESUME": "استئناف", "SAVE": "حفظ", "LOAD": "تحميل",
	"ARABIC": "العربية", "ENGLISH": "الإنجليزية", "LANGUAGE": "اللغة", "QUALITY": "الجودة",
	"LOW": "منخفض", "MEDIUM": "متوسط", "HIGH": "عالي", "AUTO": "تلقائي",
	"SOUND": "الصوت", "SENSITIVITY": "حساسية الكاميرا", "FPS": "الإطارات",
	"BATTERY_SAVER": "توفير البطارية", "AIM_ASSIST": "المساعدة في التصويب",
	"PHONE": "الهاتف", "MAP": "الخريطة", "MESSAGES": "الرسائل", "NIGHT": "ليل",
	"NEWS": "الأخبار", "JOBS": "الأعمال", "WELCOME": "مرحباً بك في نوفا ميرا",
	"DRIVE": "قد", "SHOOT": "أطلق", "JUMP": "اقفز", "INTERACT": "تفاعل",
	"LOADING": "جارٍ التحميل", "TIP": "نصيحة: اضغط على عجلة القيادة لتبديل الراديو.",
	"OBJECTIVE": "الهدف", "POLICE": "الشرطة", "CLEAR": "صافٍ", "CLOUDY": "غائم", "RAIN": "مطر",
	"STORM": "عاصفة رعدية", "FOG": "ضباب", "ARRESTED": "تم اعتقالك", "ARRESTED_MSG": "فقدت 15% من مالك",
	"CHECKPOINT": "نقطة تفتيش", "DELIVERY": "توصيل", "ESCAPE": "الهروب", "ELIMINATE": "القضاء",
	"STORY": "القصة", "FREE_ROAM": "تجول حر", "CONTROLS": "أدوات التحكم", "DONE": "تم",
}

func tr_text(key: String) -> String:
	if locale == "ar" and _ar.has(key):
		return _ar[key]
	return key

func is_rtl() -> bool:
	return locale == "ar"

func set_locale(code: String) -> void:
	locale = "ar" if code == "ar" else "en"
