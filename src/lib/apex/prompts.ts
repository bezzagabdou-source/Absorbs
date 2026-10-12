import type { PromptItem } from '@/lib/apex/types';

/**
 * مكتبة البرومبتات الضخمة — 30 برومبتاً أسطورياً جاهزاً للاستخدام
 * كل برومبت: هدف + قيود + بوابات جودة + المخرَج المطلوب.
 */
export const PROMPTS: PromptItem[] = [
  /* ============================ ألعاب ============================ */
  {
    id: 'game-neon-runner',
    title: { ar: 'حلبة النيون: عدّاء لا نهائي', en: 'Neon Arena: Endless Runner' },
    category: 'game',
    tags: ['canvas', 'endless', 'arcade', '60fps'],
    difficulty: 'medium',
    bestModels: ['gpt-astra', 'deepseek-v4-lite', 'kimi-3'],
    minutes: 4,
    body: {
      ar: `ابنِ لعبة «عدّاء لا نهائي» كاملة في ملف HTML واحد باسم neon-runner.html.
العالم: مدينة نيون تحت المطر، مسارات ثلاث، عوائق متولّدة إجرائياً، عملات، دروع، وسرعة تتزايد تدريجياً.
المطلوب بالضبط:
• حلقة requestAnimationFrame مع deltaTime محصور بين 0 و33ms وتراكم زمني ثابت 1/60.
• لاعب بثلاث حالات: جري، انزلاق، قفز مزدوج مع coyote time 100ms، وتحكم: أسهم/WASD + اسحب على اللمس.
• توليد إجرائي عادل: لا عائقان متتاليان في نفس المسار يمنعان النجاة، والفجوة الدنيا تُحسب من سرعة اللاعب الحالية.
• تصادم AABB دقيق مع تسامح 2px لصالح اللاعب، وموت بحالة انفجار جزيئات ثم شاشة إعادة.
• كاميرا تتبع بـ lerp، اهتزاز شاشة متناقص عند الاصطدام، وإحساس تسارع في الجري.
• واجهة عربية RTL فوق الكانفس: النتيجة، أفضل نتيجة، المضاعف، شريط الإيقاف، وأزرار بدء/إيقاف/إعادة تعمل باللمس.
• صوت WebAudio: نقرة قفز، رنّة عملة، ضربة انفجار — كلها مُولَّدة رياضياً بلا ملفات.
• حفظ أفضل نتيجة ومجموع العملات في localStorage مع try/catch.
• إيقاف تلقائي عند إخفاء التبويب، وإعادة ضبط الأبعاد على resize مع devicePixelRatio.
• تجاوب كامل: تشتغل على شاشة 360px وعلى 4K بدون كسر التخطيط.
ممنوع: أي مكتبة خارجية، أي صورة خارجية، أي خط خارجي.
انسخ الملف وأعطني إياه كاملاً، ثم سطر DELIVERY فقط.`,
      en: `Build a complete "endless runner" game in a single HTML file named neon-runner.html.
World: a neon city in the rain, three lanes, procedurally generated obstacles, coins, shields, and a gradually increasing speed.
Exact requirements:
• requestAnimationFrame loop with deltaTime clamped to 0–33ms and a fixed 1/60 accumulator.
• Player with three states: run, slide, double jump with 100ms coyote time; controls: arrows/WASD + touch swipe.
• Fair procedural generation: no two consecutive obstacles in the same lane that make survival impossible; minimum gap derived from current player speed.
• Precise AABB collision with a 2px tolerance favoring the player; death with a particle burst then a restart screen.
• Lerped camera follow, decaying screen shake on impact, and a sense of acceleration.
• Arabic RTL HUD over the canvas: score, best, multiplier, pause bar, and start/pause/restart buttons that work on touch.
• WebAudio sound: jump click, coin chime, impact thud — all mathematically synthesized, no asset files.
• Persist best score and total coins in localStorage wrapped in try/catch.
• Auto-pause when the tab is hidden; resize handling with devicePixelRatio.
• Fully responsive: works at 360px and at 4K without breaking layout.
Forbidden: any external library, image, or font.
Output the full file plus a single DELIVERY line.`,
    },
    deliverable: { ar: 'ملف HTML واحد جاهز للتشغيل والنشر', en: 'Single runnable HTML file, deploy-ready' },
    gates: [
      { ar: 'لا مرجع غير معرّف ولا خطأ كونسول', en: 'No undefined refs, no console errors' },
      { ar: 'ثبات 60fps مع 60 عائقاً', en: 'Stable 60fps with 60 obstacles' },
      { ar: 'تحكم لمس يعمل على الهاتف', en: 'Touch controls work on mobile' },
    ],
  },
  {
    id: 'game-tower-defense',
    title: { ar: 'أبراج الصحراء: دفاع استراتيجي', en: 'Desert Towers: Strategy Defense' },
    category: 'game',
    tags: ['tower-defense', 'wave', 'strategy', 'canvas'],
    difficulty: 'hard',
    bestModels: ['kimi-3', 'deepseek-v4-lite', 'qwen-4-turbo'],
    minutes: 8,
    body: {
      ar: `ابنِ لعبة دفاع أبراج كاملة «أبراج الصحراء» في ملف واحد.
الخريطة: 12 مساراً منحنياً (waypoints)، 4 مواقع بناء، موارد: ذهب وحياة وطاقة.
الأبراج (5 أنواع): رشاش سريع، مدفع بطيء قوي، صاروخ أرض-جو بمدى واسع، بطيء (يُثلج الأعداء 40%)، وبرج دعم يزيد ضرر الأبراج المجاورة 25%.
الأعداء (6 أنواع): مشاة، سريع، درع، طائر يمر بالاختصار، حامل درع يصد الأمام، وزعيم كل 10 موجات بصحة مضاعفة ودرع يتجدد.
المطلوب:
• آلة حالات كاملة للعدو: MOVE/ATTACK/DIE/STUNNED مع مقاييس صحية تُرسم كشرائط فوق الرأس.
• تصويب الأبراج على أقرب عدو داخل المدى بخوارزمية هدف قابلة للتبديل (الأقرب/الأقوى/الأسرع) بزر.
• اقتصاص اقتصادي متوازن: كلفة كل برج × 1.6 لكل ترقية (3 ترقيات لكل برج)، وبيع بإرجاع 70%.
• 20 موجة متزايدة مع زر «موجة أسرع» ومكافأة نجاة بدون تسريب أي عدو.
• جزيئات ونصوص طائرة تظهر الضرر والذهب — بحد أقصى 120 جسيماً معاد استخدامها (object pooling).
• حفظ تلقائي للتقدم كل 10 ثوانٍ، واستئناف تلقائي عند إعادة الفتح.
• سرعات لعب: ×1 ×2 ×4 مع بقاء الفيزياء ثابتة (تحديث الخطوة لا يُضاعف الزمن).
• واجهة عربية RTL: شريط موارد علوي، درج بناء سفلي، لوحة معلومات عند اختيار برج.
ممنوع أي مكتبة خارجية. الفيزياء ثابتة الخطوة، والتصادم بالمدى الدائري.
اختم بـ DELIVERY + RISKS في سطرين.`,
      en: `Build a complete tower-defense game, "Desert Towers", in one file.
Map: 12 curved waypoints, 4 build slots; resources: gold, lives, power.
Towers (5): fast machine gun, slow heavy cannon, wide-range missile, cryo slow (40%), and a support tower boosting adjacent towers' damage by 25%.
Enemies (6): infantry, fast runner, armored, flying shortcut path, front-shield carrier, and a boss every 10 waves with doubled HP and regenerative armor.
Requirements:
• Full enemy FSM: MOVE/ATTACK/DIE/STUNNED with health bars drawn overhead.
• Tower targeting selects the nearest enemy in range with a switchable policy (nearest/strongest/fastest) via button.
• Balanced economy: each tower level costs x1.6 (3 levels), sell returns 70%.
• 20 escalating waves, a "send next wave early" button, and a no-leak survival bonus.
• Particles and floating damage/gold text — capped at 120 pooled particles.
• Auto-save progression every 10 seconds and auto-resume on reopen.
• Game speeds x1/x2/x4 keeping physics identical (scale steps, not timestep).
• Arabic RTL UI: top resource bar, bottom build tray, info panel on tower select.
No external libraries. Fixed-step physics, circular-range collision.
End with DELIVERY + RISKS lines.`,
    },
    deliverable: { ar: 'لعبة استراتيجية كاملة قابلة للتوسيع', en: 'Full extendable strategy game' },
    gates: [
      { ar: 'توازن الموجات: لا موجة مستحيلة', en: 'Wave balance: nothing impossible' },
      { ar: 'لا تسريب ذاكرة بعد 20 موجة', en: 'No memory leak after 20 waves' },
      { ar: 'الترقيات والبيع يعملان بلا أخطاء', en: 'Upgrades and selling error-free' },
    ],
  },
  {
    id: 'game-arena-fighter',
    title: { ar: 'ساحة القتال: مقاتل ثنائي الأبعاد', en: 'Zenith Arena: 2D Fighter' },
    category: 'game',
    tags: ['fighting', 'combos', 'ai-opponent', 'juice'],
    difficulty: 'extreme',
    bestModels: ['deepseek-v4-lite', 'kimi-3', 'gpt-astra'],
    minutes: 10,
    body: {
      ar: `ابنِ لعبة قتال ثنائية الأبعاد «ساحة القتال Zenith»: لاعب ضد ذكاء اصطناعي، في ملف واحد.
المفتاح هو الإحساس (game feel) — يجب أن تكون اللكمات ثقيلة ومرضية:
• نظام إطارات حقيقي: 60 إطاراً/ثانية، لكل هجمة إطارات تهيئة/نشاط/استرجاع (startup/active/recovery) موصوفة في جدول بيانات واضح.
• 6 هجمات: لكمة سريعة، لكمة قوية، رفسة عالية، رفسة ساق، هجمة جوّية، ورمية (throw) عند التقارب الشديد.
• إلغاء الحركة (cancel windows) لبناء سلاسل (combos) حتى 5 ضربات، مع عدّاد كومبو يظهر ويتلاشى.
• إلغاء حركة الكتلة (blockstring)، كتلة عالية/منخفضة، وصد مثالي (parry) بنافذة 6 إطارات يعكس الضرر.
• عدو بذكاء اصطناعي متدرّج: ثلاثة مستويات (مبتدئ/متمرّس/أسطوري) بمعاملات رد فعل تأخير 250/120/40ms واحتمال كتلة يتبع سلوك اللاعب.
• شريط صحة وشريط إطارات (super meter) يمتلئ بالضرر ويُصرف على هجمة مميزة بشاشة قتال قتالية.
• جزيئات اصطدام، تجميد إطارات قصير (hitstop 60–90ms)، دفع عكسي (knockback)، واهتزاز شاشة.
• إيقاف/استئناف، إعادة، شاشة فوز بثلاث جولات، وحفظ أفضل سلسلة في localStorage.
• مطلوب منظر مذهل: سماء متدرجة برسم SVG وكانفاس واحد فقط، شخصيات مرسومة بالأشكال الهندسية (بدون صور) بتشريح حركة يدوي.
اختم بـ SELF-CHECK: تحقق من كل نقطة (table frames, parry window, hitstop, AI levels) وأعطِ PASS/FAIL لكل واحدة.`,
      en: `Build a 2D fighting game "Zenith Arena": player vs AI, in a single file.
The key is game feel — hits must land heavy and satisfying:
• A real frame system at 60fps: every attack has startup/active/recovery frames described in a clear data table.
• 6 attacks: fast jab, heavy punch, high kick, low sweep, aerial strike, and a close-range throw.
• Cancel windows enabling combos up to 5 hits with a fading combo counter.
• Blockstrings, high/low blocking, and a 6-frame parry window that reflects damage.
• Escalating AI: three tiers (rookie/pro/veteran) with 250/120/40ms reaction delays and block probability that learns from the player's tendencies.
• Health bar plus a super meter charged by damage, spent on a cinematic special move.
• Impact particles, 60–90ms hitstop, knockback, and screen shake.
• Pause/resume, restart, best-of-three victory screen, and best-combo persistence in localStorage.
• Visual spectacle required: gradient sky drawn with SVG and one canvas; characters are geometric shapes (no images) with hand-authored motion rigs.
End with SELF-CHECK covering every bullet (frame table, parry window, hitstop, AI tiers) with PASS/FAIL.`,
    },
    deliverable: { ar: 'لعبة قتال بإحساس احترافي', en: 'Fighting game with pro-grade feel' },
    gates: [
      { ar: 'جدول الإطارات مطبّق فعلياً لا وصفاً', en: 'Frame data actually implemented' },
      { ar: 'لا زر عالقاً عند فقدان التركيز', en: 'No stuck keys on focus loss' },
      { ar: 'نافذة الصد المثالي 6 إطارات بالضبط', en: 'Parry window exactly 6 frames' },
    ],
  },
  {
    id: 'game-puzzle-lights',
    title: { ar: 'ألغاز الضوء: إيقاع وذكاء', en: 'Light Logic: Rhythm Puzzle' },
    category: 'game',
    tags: ['puzzle', 'levels', 'generator', 'calm'],
    difficulty: 'medium',
    bestModels: ['gpt-astra', 'glm-5-air', 'qwen-4-turbo'],
    minutes: 5,
    body: {
      ar: `ابنِ لعبة ألغاز «ألغاز الضوء» في ملف واحد: شبكة 6×6 فيها مصادر ضوء، مرايا تُدار بالنقر (0°/90°/180°/270°)، وأهداف يجب إضاءتها كلها.
المطلوب:
• محرّك أشعة (raycaster) يتتبّع الضوء خلية بخلية مع انعكاس ومصّ (Absorber)، وحد أقصى 200 انعكاس لمنع الحلقة اللانهائية.
• 20 مستوى مُعرّفاً في مصفوفة بيانات: {mirrors:[{x,y,angle}], targets:[], absorbers:[], stars:3} مع تدرّج صعوبة حقيقي.
• توليد إجرائي للمستويات بعد العشرين الأولى بضمان «قابلية الحل»: يُبنى الحل أولاً ثم يُشوَّش بضربات مطلوبة أقل من 12.
• تقييم النجوم: 3 نجوم بحركة واحدة أقل من الحد، 2 بالحد، 1 بثلاث حركات إضافية كحد أقصى.
• تراجع (undo) بعدد لا نهائي، إعادة المستوى، وتلميح واحد لكل مستوى ينير أول مرآة خاطئة (يخصم نجمة).
• حركات ناعمة لدوران المرايا (200ms ease)، وميض ضوء متنفس (bloom) عند إضاءة هدف.
• واجهة عربية RTL أنيقة هادئة: رقم المستوى، النجوم، أزرار إعادة/تلميح/التالي.
• حفظ تقدم كل مستوى في localStorage بمخطط {level: stars}.
ممنوع أي مكتبة. الألوان من متغيرات CSS داخل الكانفس لتناسق الهوية.`,
      en: `Build a puzzle game, "Light Logic", in one file: a 6x6 grid with light sources, mirrors rotated by click (0/90/180/270), and targets that must all be lit.
Requirements:
• A raycasting engine tracing light cell by cell with reflection and absorbers, capped at 200 bounces to prevent infinite loops.
• 20 levels defined as data: {mirrors:[{x,y,angle}], targets:[], absorbers:[], stars:3} with a real difficulty ramp.
• Procedural generation beyond the first 20 with a solvability guarantee: build the solution first, then scramble requiring fewer than 12 moves.
• Star scoring: 3 stars one move under par, 2 at par, 1 with at most three extra moves.
• Unlimited undo, level restart, and one hint per level revealing the first wrong mirror (costs a star).
• Smooth mirror rotation (200ms ease) and a breathing bloom when a target lights.
• Elegant calm Arabic RTL UI: level number, stars, restart/hint/next buttons.
• Per-level progress persisted in localStorage as {level: stars}.
No libraries. Colors come from CSS variables so the canvas matches the app identity.`,
    },
    deliverable: { ar: 'لعبة ألغاز بـ20+ مستوى', en: 'Puzzle game with 20+ levels' },
    gates: [
      { ar: 'كل مستوى قابل للحل فعلاً', en: 'Every level is truly solvable' },
      { ar: 'لا حلقة لا نهائية في محرّك الأشعة', en: 'No infinite loop in the raycaster' },
      { ar: 'التقدم يُحفظ ويُستأنف', en: 'Progress saves and resumes' },
    ],
  },
  {
    id: 'game-space-shooter',
    title: { ar: 'حافة المجرّة: مطلق فضائي', en: 'Galaxy Edge: Space Shooter' },
    category: 'game',
    tags: ['shooter', 'waves', 'boss', 'particles'],
    difficulty: 'hard',
    bestModels: ['deepseek-v4-lite', 'gpt-astra', 'llama-4-scout'],
    minutes: 7,
    body: {
      ar: `ابنِ لعبة إطلاق فضائي «حافة المجرّة» في ملف واحد، بمنظور علوي، مع تجربة فاتكة ومبهرة.
المحتوى:
• سفينة اللاعب: حركة بسلاسة تسارع/تباطؤ (لا حركة مباشرة)، رشق، درع مؤقت، وزر تفجير شامل بتعبئة 3 موجات.
• 8 أنواع أعداء بسلوكيات مختلفة: خط مستقيم، موجي، دائري، مطارد، منقسم عند الموت، مُطلع رصاص، درع أمامي، ومُختفي يظهر عند الاقتراب.
• 4 زعماء بنماذج هجوم متعددة المراحل (3 مراحل لكل زعيم) مع أنماط رصاص هندسية (شعاعي، حلزوني، مسح جانبي، شبكي).
• رصاص اللاعب: 3 مستويات ترقية، اختراق بعد الترقية الثالثة، ومقياس حرارة يمنع الرشق المتواصل بلا توقف.
• تحسين الأداء: كل الرصاص والجزيئات في مجموعات معاد استخدامها (pools) بحد أقصى 300 رصاصة و500 جسيم، وحذف فوري لما يخرج خارج الشاشة.
• خلفية نجوية متحركة بطبقات (parallax) مرسومة إجرائياً وتتجدد بلا توقف (bounded array).
• واجهة عربية RTL: صحة، درع، تعبئة التفجير، مستوى الرشق، مستوى الموجة، والنتيجة.
• إيقاف عند إخفاء التبويب، إعادة تشغيل نظيفة، وحفظ أعلى نتيجة بالملّي ثانية.
اختم بـ COMPLEXITY: تعقيد الزمن لكل نظام وعدد الكائنات الأقصى المضمون.`,
      en: `Build a top-down space shooter, "Galaxy Edge", in a single file with a lethal, spectacular feel.
Content:
• Player ship: acceleration/drag movement (not direct), rapid fire, temporary shield, and a screen-clearing bomb charged over 3 waves.
• 8 enemy types with distinct behaviors: straight, sine wave, orbit, chaser, splitter on death, bullet spawner, front-shielded, and a cloaker that reveals on approach.
• 4 bosses with multi-phase attack sets (3 phases each) and geometric bullet patterns (radial, spiral, sweep, grid).
• Player bullets: 3 upgrade levels, pierce at level 3, and a heat gauge preventing endless fire.
• Performance: all bullets and particles in object pools capped at 300 bullets and 500 particles, instantly recycled off-screen.
• Layered procedural starfield parallax that regenerates forever (bounded arrays).
• Arabic RTL HUD: health, shield, bomb charge, fire level, wave, score.
• Auto-pause on hidden tab, clean restart, and best score saved with millisecond precision.
End with COMPLEXITY: time complexity per system and the guaranteed max object counts.`,
    },
    deliverable: { ar: 'لعبة إطلاق كاملة بزعماء وأنماط رصاص', en: 'Full shooter with bosses and bullet patterns' },
    gates: [
      { ar: 'أداء ثابت مع 800 كائن نشط', en: 'Stable performance with 800 live objects' },
      { ar: 'لا تسريب مع إعادة التشغيل المتكرر', en: 'No leaks across repeated restarts' },
      { ar: 'كل الزعماء بثلاث مراحل منتهية', en: 'Every boss has three completable phases' },
    ],
  },
  {
    id: 'game-rogue-rooms',
    title: { ar: 'أقبية الفجر: روج‑لايك', en: 'Dawn Vaults: Roguelike' },
    category: 'game',
    tags: ['roguelike', 'rogue-lite', 'upgrades', 'rooms'],
    difficulty: 'extreme',
    bestModels: ['kimi-3', 'deepseek-v4-lite', 'qwen-4-turbo'],
    minutes: 12,
    body: {
      ar: `ابنِ روج‑لايك «أقبية الفجر» في ملف واحد، بجولة كاملة من 15 غرفة + زعيم.
البنية:
• توليد إجرائي مضمون الاتصال: بناء غرف بشبكة، ثم التأكد من الاتصال بخوارزمية بحث (BFS) وحذف أي غرفة معزولة قبل العرض.
• أنواع الغرف: قتال، كنز، متجر (يباع فيه 3 عروض عشوائية)، نافورة شفاء (تُستهلك مرة واحدة)، لغز بسيط، واختيار مكافأة (3 بطاقات).
• نظام بناء (build): 30 ترقية بنداء فريد لكل منها وتأثيرات متراكبة تُحسب بترتيب مضبوط (additive ثم multiplicative) وتُعرض في لوحة إحصاءات حيّة.
• شخصيات قابلة للفتح: 3 (محارب بدروع، رامي بعيد، ساحر بطاقة) لكل واحدة مدى ورصيد ومهارة خاصة.
• عدو بذكاء اصطناعي: 7 أنواع + 3 زعماء، وسلوك جماعي (مجموعة تتقارب ثم تتباعد لتجنّب الضربات).
• صعوبة تتكيّف: معامل يعتمد على أداء اللاعب (تعرض للضرر/دقائق الجولة) بحد أعلى 1.6.
• اقتصاد وما بعد الموت: جمع «شظايا» تُصرف على ترقيات دائمة بين الجولات، محفوظة في localStorage.
• خريطة صغيرة (minimap) تُرسم لحظياً، وعلامة على الغرفة الحالية والغرف المفتوحة.
• كل شيء بلا مكتبات. مهم جداً: قسم SELF-CHECK يتأكد أن كل ترقية من الـ30 تُطبَّق فعلاً وأن الكود لا يحتوي ترقية معلّقة.
ستسلّم ملفاً يعمل مباشرة، مع DELIVERY في النهاية.`,
      en: `Build a roguelike, "Dawn Vaults", in a single file, with a full run of 15 rooms plus a boss.
Architecture:
• Guaranteed-connectivity procedural generation: place rooms on a grid, verify connectivity with BFS, and delete isolated rooms before display.
• Room types: combat, treasure, shop (3 random offers), one-use healing fountain, a simple puzzle, and a reward choice (3 cards).
• Build system: 30 upgrades each with a unique call and stacking effects computed in a fixed order (additive then multiplicative), shown in a live stats panel.
• Unlockable classes: 3 (shield warrior, ranged archer, card mage) each with range, resource, and a signature skill.
• Enemy AI: 7 types + 3 bosses plus group behavior (converge then spread to dodge).
• Adaptive difficulty: a factor based on player performance (damage taken / run duration) capped at 1.6.
• Economy and meta: collect "shards" spent on permanent upgrades between runs, saved in localStorage.
• A live minimap marking the current room and opened rooms.
• Everything library-free. Crucially: a SELF-CHECK section confirming all 30 upgrades actually apply and none are stubs.
Deliver a directly runnable file with DELIVERY at the end.`,
    },
    deliverable: { ar: 'روج‑لايك كامل ببناء 30 ترقية', en: 'Complete roguelike with 30 upgrades' },
    gates: [
      { ar: 'كل غرفة متصلة ولا غرف يتيمة', en: 'All rooms connected, none orphaned' },
      { ar: 'كل الترقيات مطبّقة فعلاً', en: 'Every upgrade truly applies' },
      { ar: 'الحفظ الدائم يعمل بعد الإغلاق', en: 'Meta persistence survives reload' },
    ],
  },
  {
    id: 'game-3d-racer',
    title: { ar: 'طريق السراب: سباق ثلاثي الأبعاد', en: 'Mirage Road: 3D Racer' },
    category: 'game',
    tags: ['3d', 'racer', 'physics', 'procedural'],
    difficulty: 'extreme',
    bestModels: ['deepseek-v4-lite', 'gpt-astra', 'kimi-3'],
    minutes: 12,
    body: {
      ar: `ابنِ لعبة سباق ثلاثية الأبعاد «طريق السراب» بدون أي مكتبة إطلاقاً — اكتب محرّك عرض بسيطاً بنفسك على Canvas 2D.
المطلوب:
• إسقاط منظوري يدوي: كل كائن له (x, y, z) ويُسقَط بالشاشة عبر الدالة screenX = cx + (x-camX)*fov/z وscreenY = cy + (y-camY)*fov/z، مع ترتيب الرسم من الأبعد للأقرب (painter's algorithm).
• طريق إجرائي لا نهائي بمنحنيات (sine/Perlin مبسّط)، عرض ثابت، تخديد جانبي، ولافتات وأشجار تُولَّد وتُحذف بحد أقصى 120 كائناً.
• فيزياء سيارة: سرعة، تسارع، فرملة، توجيه يتبع السرعة (لا توجيه ثابت)، انزلاق عند تجاوز الحد، وخروج عن الطريق يبطئ.
• منافسون: 3 سيارات بذكاء مسار بسيط (target waypoint + تصحيح انحراف)، وسرعات متفاوتة، وتحسّس تصادم كروي بينها وبين اللاعب.
• كاميرا مطاردة بـ lerp خلف السيارة مع fov يتغير مع السرعة (إحساس تسريع).
• واجهة عربية RTL: عدّاد سرعة (كم/س)، زمن اللفة، أفضل لفة، الترتيب، وعداد تصادمات.
• 3 حلقات (Laps) ثم شاشة نتائج بتفصيل أفضل لفّة وترتيب نهائي، وحفظ أفضل لفة.
• سماء متدرجة وشمس مرسومة، وضباب مسافة (fog) يخفي ظهور الكائنات المفاجئ.
ممنوع: three.js أو أي مكتبة. يجب أن يبقى التنفيذ تحت 40ms لكل إطار على 200 كائن.
اختم بـ PERF: قياساتك المتوقعة وعدد مرات الرسم في الإطار.`,
      en: `Build a 3D racing game, "Mirage Road", with zero libraries — write a small renderer yourself on Canvas 2D.
Requirements:
• Manual perspective projection: every object has (x, y, z) projected via screenX = cx + (x-camX)*fov/z, screenY = cy + (y-camY)*fov/z, drawn far-to-near (painter's algorithm).
• Infinite procedural road with curves (simplified sine/Perlin), fixed width, side rails, signs and trees pooled at a 120-object cap.
• Car physics: speed, acceleration, braking, speed-dependent steering, slides past a grip threshold, and off-road slowdown.
• Rivals: 3 AI cars with simple waypoint following and deviation correction, varied speeds, spherical collision with the player.
• Lerped chase camera whose fov widens with speed to convey acceleration.
• Arabic RTL HUD: speedometer (km/h), lap time, best lap, position, collision counter.
• 3 laps then a results screen with best-lap breakdown and final standing; best lap persisted.
• Gradient sky, drawn sun, and distance fog hiding object pop-in.
Forbidden: three.js or any library. Frame budget under 40ms with 200 objects.
End with PERF: expected measurements and draw calls per frame.`,
    },
    deliverable: { ar: 'سباق 3D بمحرّك عرض يدوي', en: '3D racer with a hand-written renderer' },
    gates: [
      { ar: 'ترتيب رسم صحيح بلا كائنات شفافة خاطئة', en: 'Correct draw order, no wrong occlusion' },
      { ar: 'لا انخفاض إطارات تحت 30fps', en: 'Never drops below 30fps' },
      { ar: 'منافسون لا يعلقون خارج المسار', en: 'Rivals never get stuck off-road' },
    ],
  },
  {
    id: 'game-typing-words',
    title: { ar: 'معركة الكلمات: سرعة كتابة عربية', en: 'Word Battle: Arabic Typing' },
    category: 'game',
    tags: ['typing', 'arabic', 'education', 'fun'],
    difficulty: 'medium',
    bestModels: ['qwen-4-turbo', 'gpt-astra', 'glm-5-air'],
    minutes: 5,
    body: {
      ar: `ابنِ لعبة تعليمية «معركة الكلمات» لتقوية الكتابة العربية باللمس، في ملف واحد.
المطلوب:
• كلمات عربية تتساقط من الأعلى، واللاعب يكتبها فتتفجر — كتابة صحيحة = انفجار + نقاط، خطأ = اهتزاز وإعادة ضبط الحرف.
• مقارنة الحروف مُطبّعة: تجاهل التشكيل والتطويل وتوحيد الألف (أ/إ/آ → ا) والهاء/التاء المربوطة، مع دعم اختياري لوضع التشديد الصارم.
• 4 مستويات صعوبة تتحكم في سرعة السقوط وطول الكلمات وعددها المتزامن (حتى 6 كلمات).
• 6 حزم كلمات: أساسية، إسلامية، علوم، ألعاب، أدب، ووايلدكارد من ملف بيانات داخلي (120 كلمة على الأقل).
• إحصائيات دقيقة: كلمات/دقيقة (WPM)، دقة %، أطول سلسلة متتالية، وأخطاء كل حرف (خريطة أخطاء تُعرض في نهاية الجولة).
• إحساس: وميض عند الكتابة الصحيحة، اهتزاز عند الخطأ، وأصوات WebAudio مُولَّدة لكل حالة.
• حفظ أفضل النتائج لكل مستوى، ولوحة أبطال شخصية بآخر 10 جولات.
• دعم RTL كامل في الكانفس: قياس النص بـ measureText مع direction 'rtl'، والتشكيل يظهر صحيحاً.
• منع الأخطاء: عند فقدان التركيز تُوقف الجولة (لا سقوط كلمات وأنت بعيد عن الشاشة).
اختم بـ DELIVERY وTESTS: حالات اختبار التطبيع (تشكيل، همزات، تاء مربوطة).`,
      en: `Build an educational Arabic typing game, "Word Battle", in one file.
Requirements:
• Arabic words fall from the top; typing one detonates it — accurate typing means an explosion plus points, a mistake means shake and reset input.
• Normalized comparison: ignore diacritics and tatweel, unify alef forms (أ/إ/آ → ا) and ta marbuta/ha, with an optional strict mode.
• 4 difficulty tiers controlling fall speed, word length, and concurrent words (up to 6).
• 6 word packs: core, Islamic, science, gaming, literature, and wildcard from an internal dataset of at least 120 words.
• Precise stats: WPM, accuracy %, longest streak, and a per-letter error map shown after the round.
• Feel: flash on correct input, shake on error, and synthesized WebAudio cues per state.
• Best scores per level persisted, plus a personal leaderboard of the last 10 rounds.
• Full RTL inside canvas: measureText with direction 'rtl' so shaping renders correctly.
• Error prevention: losing focus pauses the round (no drops while you're away).
End with DELIVERY and TESTS covering normalization cases (diacritics, hamza, ta marbuta).`,
    },
    deliverable: { ar: 'لعبة تعليمية بإحصائيات وخريطة أخطاء', en: 'Educational game with stats and error map' },
    gates: [
      { ar: 'تطبيع عربي صحيح 100%', en: '100% correct Arabic normalization' },
      { ar: 'لا حروف عالقة عند تغيير المستوى', en: 'No stuck input on level change' },
      { ar: 'إحصائيات مضبوطة رياضياً', en: 'Mathematically correct statistics' },
    ],
  },
  {
    id: 'game-idle-factory',
    title: { ar: 'مصنع لا نهائي: لعبة كسول', en: 'Infinite Foundry: Idle Game' },
    category: 'game',
    tags: ['idle', 'economy', 'big-numbers', 'offline'],
    difficulty: 'medium',
    bestModels: ['llama-4-scout', 'mistral-forge', 'gpt-astra'],
    minutes: 5,
    body: {
      ar: `ابنِ لعبة كسول/تلقائية «مصنع لا نهائي» في ملف واحد.
الاقتصاد:
• 10 مستويات إنتاج (حديد، نحاس، فحم، زجاج، دوائر، محرّكات، روبوتات، ذكاء، كوانتم، سديم) لكل مستوى مضاعف سعر (×8) ومضاعف إنتاج.
• أرقام كبيرة حقيقية: استخدم كائن Decimal صغيراً بنفسك (mantissa/exponent) أو BigInt للتخزين، وتنسيق عربي للأرقام (ألف، مليون، بليون، ترليون...) حتى 10^30.
• ترقيات: 40 ترقية بـ3 أنواع (إنتاج، سرعة، مضاعف شامل)، وترقيات برستيج عند 10^15 تُعيد البداية مقابل معامل دائم.
• إنتاج غير متصل (offline): عند العودة يُحسب الإنتاج بمعدل 100% لأول ساعة و50% بعدها، بحد أقصى 24 ساعة — مع نافذة تشرح ما ربحته.
• تحسين الحساب: الإنتاج يُحدَّث بخطوة 250ms مع تراكم زمني، والواجهة تُحدَّث 4 مرات/ثانية فقط (لا رسم كل إطار).
• عدّاد إطارات مستقل (requestAnimationFrame) للحركات فقط، ومنع إعادة رسم DOM غير ضرورية.
• حفظ تلقائي كل 5 ثوانٍ + عند إغلاق الصفحة (beforeunload/visibilitychange)، مع نسخة احتياطية تُستعاد إن فسد الحفظ (try/catch كامل + تحقق من البنية).
• واجهة عربية RTL: شجرة إنتاج، قائمة ترقيات مع فلترة (مُقتنى/متاح/مقفل)، شريط تقدم للهدف القادم، وزر تصدير/استيراد الحفظ النصي.
• منع الغش البسيط: لا تعتمد على Date.now فقط، بل قارن مع طابع زمني محفوظ وتُحقّق من تقدم منطقي.
اختم بـ SAVE: بنية كائن الحفظ وحجمه المتوقع بالكيلوبايت.`,
      en: `Build an idle/incremental game, "Infinite Foundry", in one file.
Economy:
• 10 production tiers (iron, copper, coal, glass, circuits, engines, robots, intelligence, quantum, nebula) each with x8 cost scaling and an output multiplier.
• Real big numbers: write a tiny Decimal (mantissa/exponent) or use BigInt, with localized number formatting up to 10^30 (K, M, B, T...).
• 40 upgrades in three kinds (production, speed, global multiplier) plus a prestige reset at 10^15 granting a permanent factor.
• Offline production: full rate for the first hour, 50% afterwards, capped at 24 hours — with a modal explaining earnings.
• Computation efficiency: production steps every 250ms with an accumulator and the UI updates only 4 times per second (never per frame).
• A separate rAF loop for animations only; no redundant DOM writes.
• Auto-save every 5 seconds plus on unload (beforeunload/visibilitychange), with a backup restore if the save is corrupt (full try/catch plus schema validation).
• Arabic RTL UI: production tree, upgrade list with filters (owned/available/locked), a next-goal progress bar, and text export/import of the save.
• Light anti-cheat: never trust Date.now alone; compare against a stored timestamp and validate plausible progress.
End with SAVE: the save schema and its expected size in kilobytes.`,
    },
    deliverable: { ar: 'لعبة تلقائية بأرقام حتى 10^30', en: 'Idle game with numbers up to 10^30' },
    gates: [
      { ar: 'حساب الإنتاج غير المتصل صحيح', en: 'Offline production math correct' },
      { ar: 'لا فساد للحفظ ولا فقدان تقدم', en: 'No save corruption, no progress loss' },
      { ar: 'لا استهلاك CPU عالٍ في الخلفية', en: 'No high CPU when backgrounded' },
    ],
  },
  {
    id: 'game-coop-split',
    title: { ar: 'قلبان على لوحة: لعبة شاشة منقسمة', en: 'Two Hearts: Split-Screen Co-op' },
    category: 'game',
    tags: ['coop', 'local-multiplayer', 'split-screen', 'puzzle'],
    difficulty: 'hard',
    bestModels: ['kimi-3', 'deepseek-v4-lite', 'qwen-4-turbo'],
    minutes: 9,
    body: {
      ar: `ابنِ لعبة تعاونية محلية بشاشة منقسمة «قلبان على لوحة» في ملف واحد: لاعب على WASD ولاعب ثانٍ على الأسهم.
المطلوب:
• 12 غرفة تعاونية لا تُحلّ فردياً: أزرار تُبقي الباب مفتوحاً بينما يعبر الآخر، رافع يسند جسراً، أشعة تُحجب بجسم اللاعب، ومفاتيح حسّاسة على ممرات متحركة.
• شاشة منقسمة عمودي إذا كانت الشاشة عريضة، وأفقياً إذا كانت طويلة، مع تقطيع وتحويل إحداثيات صحيح لكل عدسة (viewport clip + translate).
• كاميرا لكل لاعب تتوسط بازدواجية (mid-point + spread) لتبقى الشاشة مفيدة دون كشف ما لا يجب.
• تصادم ومناولة صناديق: يمكن لكل لاعب حمل صندوق وإلقائه على الزر، والصناديق تُدفع بالجسم.
• مؤقت إجمالي وعدد محاولات لكل غرفة، وإحياء: إذا مات لاعب، يعيد الآخر إحياؤه بلمسة (مع مهلة 3 ثوانٍ).
• إحساس: غبار عند الارتطام، خطوط توضيحية (trails) لكل لاعب بلون مختلف، وموسيقى WebAudio بسيطة بإيقاع 2/4.
• حفظ أفضل زمن إجمالي وفتح الغرف تدريجياً في localStorage.
• إمكانية وصول: ألوان الشخصيات متباينة للأعمى اللوني (أزرق/برتقالي)، وسماكة خطوط الحائط كافية.
اختم بـ SELF-CHECK يتحقق من: تقطيع الشاشة، تساوي الإطارات للاعبين، وكون كل غرفة غير قابلة للحل فردياً.`,
      en: `Build a local split-screen co-op game, "Two Hearts", in one file: player one on WASD, player two on arrows.
Requirements:
• 12 co-op rooms that are solo-unsolvable: buttons held open while the other crosses, a lever supporting a bridge, beams blocked by a player's body, sensitive keys on moving platforms.
• Split-screen vertically on wide screens and horizontally on tall ones, with correct per-viewport clipping and coordinate translation.
• Per-player camera using a dual-focus (midpoint + spread) so the view stays useful without revealing too much.
• Box handling and collision: each player can carry and toss a box onto a button; boxes can be pushed with the body.
• A global timer, per-room attempt counts, and revive: when one dies, the other revives them by touching (3-second window).
• Feel: impact dust, distinct colored trails per player, and simple 2/4 WebAudio music.
• Best overall time and progressive room unlocking persisted in localStorage.
• Accessibility: colorblind-safe character colors (blue/orange) and thick enough wall strokes.
End with SELF-CHECK verifying view splitting, identical frame rate for both players, and that each room is solo-unsolvable.`,
    },
    deliverable: { ar: 'تعاون محلي 12 غرفة بشاشة منقسمة', en: 'Local co-op, 12 rooms, split-screen' },
    gates: [
      { ar: 'كل غرفة غير قابلة للحل فردياً', en: 'Every room is solo-unsolvable' },
      { ar: 'لا تعارض في مفاتيح اللاعبين', en: 'No key conflicts between players' },
      { ar: 'التقطيع دقيق على كل النسب', en: 'Accurate clipping at all aspect ratios' },
    ],
  },
  {
    id: 'game-horror-lantern',
    title: { ar: 'فانوس: رعب جوّي بالضوء', en: 'Lantern: Atmospheric Horror' },
    category: 'game',
    tags: ['horror', 'light', 'atmosphere', 'audio'],
    difficulty: 'hard',
    bestModels: ['kimi-3', 'deepseek-v4-lite', 'grok-4-mini'],
    minutes: 8,
    body: {
      ar: `ابنِ لعبة رعب جوّية «فانوس» في ملف واحد: اللاعب يهرب في متاهة مظلمة بفانوس ينفد زيت.
المطلوب:
• إظهار الظلام الحقيقي: طبقة ظلام كاملة فوق العالم، ويُقطع منها دائرة ضوء الفانوس بـ globalCompositeOperation = 'destination-out' بتدرّج شعاعي ناعم، مع حافة متذبذبة قليلاً (flicker) مرتبطة بحساب عشوائي محدود.
• عدو واحد ذكي يسمعك: يتبع آخر موضع سمع فيه صوت خطواتك، ويسرع عند الجري، ويتراجع عند وقوفك ساكناً (آلية «لا تتحرك»).
• إدارة موارد: زيت الفانوس ينفد، وعلب زيت موزّعة، ومصابيح تُضاء لتصنع نقاط أمان تُبقي العدو بعيداً.
• متاهة إجرائية مضمونة المسار بمخرج واحد + مخارج كاذبة، وتُنشأ بـ DFS ثم تُقصّ لتقليل الممرات الميتة.
• صوت موجّه: صرير الأبواب، أنفاس العدو تقترب (panning بسيط بحساب جهة الصوت بالنسبة للاعب)، ونبض قلب يتسارع حسب القرب — كلها WebAudio مُولَّدة، وممنوع أي ملف صوتي.
• توتر متصاعد: موسيقى/إيقاع يتغير حسب قرب العدو، وتأثير تلوين الشاشة (vignette) يتضيّق مع الخوف.
• حفظ: أفضل زمن هروب، وفتح 3 مستويات صعوبة (زيت أقل، عدو أسرع، متاهة أكبر).
• وصولية: وضع «ضوء أوضح» من الإعدادات وخيار تقليل الوميض، واحترام prefers-reduced-motion.
ممنوع محتوى عنيف بصرياً: الرعب نفسي بالضوء والصوت فقط.
اختم بـ SELF-CHECK يتحقق من إزالة مستمعي الأحداث وإيقاف كل مصادر الصوت عند الإنهاء.`,
      en: `Build an atmospheric horror game, "Lantern", in one file: the player flees a dark maze with a lamp whose oil runs out.
Requirements:
• Real darkness: a full-screen shadow layer above the world with the lamp's light punched out via globalCompositeOperation = 'destination-out' and a soft radial gradient, plus a subtle flickering edge driven by bounded randomness.
• One smart enemy that hears you: it moves to your last heard footstep, speeds up when you sprint, and backs off when you stand still (the "don't move" mechanic).
• Resource management: lamp oil depletes, oil cans are scattered, and lit fixed lamps create safe zones that keep the enemy away.
• Procedural maze with a guaranteed path to one exit plus false exits, generated by DFS then pruned to reduce dead ends.
• Positional audio: door creaks, approaching enemy breathing (simple panning computed from relative direction), and a heartbeat that accelerates with proximity — all WebAudio synthesized, no audio files allowed.
• Rising tension: rhythm shifts with enemy distance and a vignette that tightens with fear.
• Persistence: best escape time, and three difficulty tiers (less oil, faster enemy, larger maze).
• Accessibility: a "brighter light" setting, a flicker reduction option, and respect for prefers-reduced-motion.
No graphic violence: the horror is psychological, carried by light and sound.
End with SELF-CHECK verifying all event listeners are removed and all audio sources stop on teardown.`,
    },
    deliverable: { ar: 'تجربة رعب جوّية بضوء وصوت موجّه', en: 'Atmospheric horror with directional light and audio' },
    gates: [
      { ar: 'لا محتوى عنيف بصرياً', en: 'No graphic content' },
      { ar: 'إيقاف كل الصوت عند الإنهاء', en: 'All audio stopped on teardown' },
      { ar: 'المتاهة قابلة للحل دائماً', en: 'Maze always solvable' },
    ],
  },
  {
    id: 'game-card-battler',
    title: { ar: 'بطاقات الأبراج: معركة بطاقات', en: 'Tower Cards: Card Battler' },
    category: 'game',
    tags: ['cards', 'turn-based', 'deckbuilding', 'balance'],
    difficulty: 'hard',
    bestModels: ['qwen-4-turbo', 'kimi-3', 'glm-5-air'],
    minutes: 8,
    body: {
      ar: `ابنِ لعبة بطاقات «بطاقات الأبراج» في ملف واحد: مواجهات دورية ضد ذكاء اصطناعي.
المطلوب:
• 60 بطاقة في بيانات واحدة: {id, name, cost, type: هجوم/دفاع/مهارة, value, rarity, effect, desc} مع نصوص عربية دقيقة تُبنى ديناميكياً من قيم البطاقة (لا نصوص مكتوبة يدوياً تتعارض مع الأرقام).
• مواد طاقة 3 لكل دور + بطاقتان تُسحبان، ويد بحد أقصى 8 بطاقات، ومجموعة نفايات تُعاد خلطها عند نفاد السحب.
• تأثيرات مركّبة: دروع قابلة للتراكم، سُمّ، ضعف، قوة، تعزيز ضرر مؤقت، إحياء، وسحب بطاقات إضافية — تُحسب في ترتيب ثابت معلن في الكود (buff ثم debuff ثم ضرر).
• ذكاء الخصم: تقييم بسيط لكل بطاقة في يده (score = f(ضرر متوقع، خطر متبقٍ، صحة)) ويلعب الأعلى، مع تصرفات ذكية: يحتفظ ببطاقة الدفاع إن كانت صحته منخفضة، ويهجم بقوة إن كانت طاقته كاملة.
• 3 أعداء بأساليب مختلفة (هجوم شرس، تحمّل مع تحصين، لعبة تدمير البطاقات) + زعيم نهائي بقدرتين خاصتين.
• ترقيات ما بعد المعركة: اختر واحدة من 3 (بطاقة جديدة، تحسين بطاقة، مكافأة صحية) مع ضمان عدم تكرار نفس العرض مرتين متتاليتين.
• واجهة عربية RTL كاملة: اليد أسفل، الخصم أعلى، مؤشر الطاقة، سجل معركة جانبي مفصّل يشرح كل تأثير حدث.
• حركات: بطاقة تنزلق للحقل، ارتجاج عند الضرر، وميض عند التنشيط — كلها CSS/DOM بلا مكتبات.
• توازن: نفّذ دالة simulate(1000) تُحاكي 1000 معركة رأسياً في console لقياس نسبة الفوز، ويجب أن تكون بين 45% و65% — وإن خرجت عن المجال عدّل الأرقام وأعد الاختبار قبل التسليم.
اختم بـ BALANCE: نسبة الفوز في المحاكاة وثلاث تعديلات أجريتها.`,
      en: `Build a turn-based card battler, "Tower Cards", in one file.
Requirements:
• 60 cards in one dataset: {id, name, cost, type: attack/defense/skill, value, rarity, effect, desc} with precisely generated Arabic text built dynamically from card values (never handwritten strings that can drift from the numbers).
• 3 energy per turn, 2 cards drawn, hand capped at 8, and a discard pile reshuffled when the draw runs out.
• Compound effects: stacking armor, poison, weakness, strength, temporary damage buff, revive, and extra draw — applied in a fixed declared order (buffs, then debuffs, then damage).
• Opponent AI: a simple scorer over its hand (expected damage, remaining risk, health) playing the best card, with smart behavior: hold defense at low health, burst when energy is full.
• 3 enemies with distinct archetypes (aggressive rush, tanky fortifier, card-destroyer) plus a final boss with two special abilities.
• Post-battle upgrades: pick 1 of 3 (new card, card upgrade, heal bonus) with no repeated offer twice in a row.
• Full Arabic RTL UI: hand at the bottom, enemy up top, energy meter, and a detailed battle log explaining each effect.
• Motion: cards slide onto the board, shake on damage, flash on activation — all CSS/DOM, no libraries.
• Balance: implement simulate(1000) running 1000 headless battles in console; the win rate must land between 45% and 65% — if it falls outside, retune the numbers and re-test before delivery.
End with BALANCE: simulated win rate and three tweaks you made.`,
    },
    deliverable: { ar: 'لعبة بطاقات متوازنة بـ60 بطاقة', en: 'Balanced card battler with 60 cards' },
    gates: [
      { ar: 'نسبة فوز المحاكاة بين 45% و65%', en: 'Simulated win rate 45%–65%' },
      { ar: 'نصوص البطاقات مشتقة من الأرقام', en: 'Card text derived from values' },
      { ar: 'ترتيب تأثيرات ثابت ومعلن', en: 'Fixed, declared effect ordering' },
    ],
  },
  {
    id: 'game-sandbox-clone-that-must-add-nothing-lib',
    title: { ar: 'صندوق الرمل: محرّك جسيمات فاتك', en: 'Sandbox: Killer Particle Engine' },
    category: 'game',
    tags: ['particles', 'sandbox', 'simulation', 'physics'],
    difficulty: 'hard',
    bestModels: ['deepseek-v4-lite', 'llama-4-scout', 'gpt-astra'],
    minutes: 7,
    body: {
      ar: `ابنِ صندوق رمل فيزيائي «محاكي العناصر» في ملف واحد: رمل، ماء، حجر، بخار، نار، حمم، خشب، نبات، حامض، ومتفجرات.
المطلوب:
• محاكاة شبكية بأبعاد منطقية (نصف الدقة عند 4K) على Uint8Array لتخزين الأنواع وحقول مساعدة (عمر، حرارة، سرعة رأسية)، وتحديث بترتيب تبادلي للأسطر لمنع الانحياز.
• قواعد تفاعل واقعية: الرمل يسقط ويميل، الماء ينتشر ويُخمد النار ويتبخر بالحمم، النبات ينمو على الماء والتراب، النار تشتعل في الخشب وتنتهي عند نفاد العمر، الحامض يذيب الحجر والمعدن، والمتفجرات تفجّر دائرة بنبضة قوة.
• كفاءة: لا سبيكة GC داخل الحلقة (لا كائنات جديدة)، تحديث الشبكة بمعدل ثابت 30 مرة/ثانية والرسم كل إطار، وعرض الجزيئات النشطة فقط (active list) لتقليل المرور الكامل.
• أدوات اللاعب: فرشاة بقياس قابل للتغيير (1–20)، قائمة مواد أنيقة، حذف، إيقاف/تشغيل، مسح، وأخذ لقطة PNG، وتصدير/استيراد الحالة كـ base64 مضغوط بسيط (RLE).
• واجهة عربية RTL أنيقة: لوحة أدوات جانبية، إحصاء «عدد الجزيئات النشطة» و«FPS» بشكل لحظي، وتحكم شاشة كامل.
• مؤثرات: توهّج للحمم والنار (blur بسيط أو طبقة إضافية بشفافية)، دخان متصاعد، واهتزاز طفيف عند الانفجار.
• وصولية: أوضاع تقليل الحركة (يقلل معدل التحديث للعرض فقط)، ودعم اللمس الكامل بالرسم بالإصبع.
اختم بـ PERF: متوسط الإطارات المتوقع عند 100 ألف جزيء وخطتك للحفاظ على 60fps.`,
      en: `Build a physics sandbox, "Element Simulator", in one file: sand, water, stone, steam, fire, lava, wood, plant, acid, and explosives.
Requirements:
• Grid simulation at logical resolution (half-res at 4K) over a Uint8Array for cell types plus auxiliary fields (age, heat, vertical velocity), updating rows in alternating order to avoid bias.
• Realistic interaction rules: sand falls and slopes, water spreads, douses fire, and vaporizes on lava; plants grow on water and soil; fire ignites wood and dies when its age runs out; acid dissolves stone and metal; explosives detonate a circle with a force pulse.
• Efficiency: zero GC allocations inside the loop, grid updates at a fixed 30Hz while rendering every frame, and an active list so only live cells are visited.
• Player tools: resizable brush (1–20), an elegant material palette, erase, pause/play, clear, PNG snapshot, and state export/import as simply RLE-compressed base64.
• Elegant Arabic RTL UI: side tool panel, live "active cells" and FPS readouts, and fullscreen control.
• Effects: lava/fire glow (cheap blur or an additive layer), rising smoke, and a subtle shake on explosions.
• Accessibility: reduced-motion modes (render-rate only), and full touch drawing support.
End with PERF: expected average framerate at 100k cells and your plan to hold 60fps.`,
    },
    deliverable: { ar: 'صندوق رمل فيزيائي بـ10 عناصر', en: 'Physics sandbox with 10 elements' },
    gates: [
      { ar: 'صفر تخصيص ذاكرة داخل الحلقة', en: 'Zero allocations inside the loop' },
      { ar: 'قواعد التفاعل كلها مطبّقة', en: 'All interaction rules implemented' },
      { ar: 'التصدير/الاستيراد يعيد الحالة بدقة', en: 'Export/import restores state exactly' },
    ],
  },

  /* ============================ مواقع ============================ */
  {
    id: 'web-saas-landing',
    title: { ar: 'موقع SaaS أسطوري بصفحة واحدة', en: 'Epic SaaS One-Pager' },
    category: 'web',
    tags: ['landing', 'saas', 'conversion', 'seo'],
    difficulty: 'medium',
    bestModels: ['gemini-ultra-lite', 'gpt-astra', 'glm-5-air'],
    minutes: 5,
    body: {
      ar: `ابنِ صفحة هبوط لخدمة SaaS في ملف HTML واحد، بمستوى وكالة تصميم عالمية.
المطلوب:
• نظام تصميم داخل الكود: متغيرات CSS للألوان (5 رموز + لونان أساسيان)، سلّم مسافات، سلّم خطوط بـclamp، ونصف قطر واحد موحّد.
• الأقسام بالترتيب: شريط تنقل ثابت مع تمويه زجاجي (backdrop-filter)، بطل (hero) بعنوان قوي + شرح سطرين + زرّان + دليل اجتماعي، شعارات عملاء (SVG مضمّنة)، المشكلة/الحل، 6 ميزات بأيقونات SVG يدوية، كيف يعمل في 3 خطوات، جدول أسعار 3 خطط مع تمييز الخطة الموصى بها، أسئلة شائعة (accordion بلا JS ثقيل — details/summary)، قسم CTA ختامي، تذييل بأربعة أعمدة.
• تفاعلية: كشف عند التمرير بـ IntersectionObserver، عدّادات أرقام متحركة، قسم آراء بعرض أفقي بالسحب، تبديل شهري/سنوي يغيّر الأسعار فوراً، وقائمة جوال منسدلة.
• RTL عربي كامل مع منطقية (logical properties)، وخطوط نظام عربية أنيقة.
• SEO: title و description وصفتان، Open Graph، JSON-LD من نوع SoftwareApplication، وترتيب h1→h2→h3 صحيح.
• أداء: بلا أي طلب خارجي، حجم نهائي أقل من 60 كيلوبايت، ورسوم متحركة تُحترم فيها prefers-reduced-motion.
• إمكانية وصول: كل زر أيقوني له aria-label، وكل form له label، وتركيز ظاهر، وتباين مضمون.
اختم بـ LIGHTHOUSE: تقديرك لأربعة محاور مع سبب مختصر.`,
      en: `Build a SaaS landing page in one HTML file at the level of a world-class design agency.
Requirements:
• An in-code design system: CSS variables for color (5 neutrals + 2 brand), a spacing scale, a clamp-based type scale, and one unified radius.
• Sections in order: sticky nav with backdrop blur, hero with a strong headline, a two-line subhead, two CTAs, and social proof, client logos (inline SVG), problem/solution, 6 features with hand-drawn SVG icons, 3-step how-it-works, 3-tier pricing with the recommended tier highlighted, FAQ (lightweight details/summary accordion), closing CTA, and a 4-column footer.
• Interactivity: IntersectionObserver scroll reveals, animated number counters, a draggable testimonial rail, a monthly/yearly toggle that instantly reprices, and a mobile dropdown menu.
• Full Arabic RTL using logical properties and elegant system Arabic fonts.
• SEO: descriptive title and description, Open Graph, SoftwareApplication JSON-LD, correct h1→h2→h3 hierarchy.
• Performance: zero external requests, under 60KB final, motion honoring prefers-reduced-motion.
• Accessibility: aria-label on every icon button, labels on all inputs, visible focus, guaranteed contrast.
End with LIGHTHOUSE: your estimate for four categories with a short reason each.`,
    },
    deliverable: { ar: 'صفحة هبوط جاهزة للنشر بحجم <60KB', en: 'Deploy-ready landing page under 60KB' },
    gates: [
      { ar: 'صفر طلبات خارجية', en: 'Zero external requests' },
      { ar: 'بنية عناوين صحيحة', en: 'Correct heading structure' },
      { ar: 'تبديل الأسعار يعمل فوراً', en: 'Pricing toggle works instantly' },
    ],
  },
  {
    id: 'web-restaurant-menu',
    title: { ar: 'موقع مطعم فاخر مع قائمة تفاعلية', en: 'Luxury Restaurant Site' },
    category: 'web',
    tags: ['restaurant', 'menu', 'booking', 'local'],
    difficulty: 'medium',
    bestModels: ['gemini-ultra-lite', 'qwen-4-turbo', 'grok-4-mini'],
    minutes: 6,
    body: {
      ar: `ابنِ موقع مطعم عربي فاخر في ملف واحد، بهوية بصرية دافئة (عنابي/ذهبي/كريمي).
المطلوب:
• صفحة واحدة بأقسام: بطل بصورة مُولَّدة بـ SVG/CSS (طبق طعام مرسوم بالأشكال والتدرجات)، عن المطعم، القائمة التفاعلية، المعرض، آراء الزبائن، الحجز، الموقع وساعات العمل، والتذييل.
• القائمة التفاعلية: 5 أقسام (مقبلات، أطباق رئيسية، مشاوي، حلويات، مشروبات)، فلترة فورية بالكتابة، تصفية (نباتي/حار/بدون غلوتين)، وشارات على الأطباق، وأسعار تُنسّق بالدينار.
• سلة طلب تجريبية: إضافة/إزالة أصناف، مجموع يتحدّث فوراً، وزر إرسال يعرض ملخص الطلب في نافذة (بلا سيرفر).
• نموذج حجز مع تحقق كامل من المدخلات (اسم، هاتف جزائري 10 أرقام يبدأ بـ 0، تاريخ مستقبلي، عدد الأشخاص 1–12، وقت داخل ساعات العمل) ورسائل خطأ عربية واضحة أسفل كل حقل.
• تصميم: زخرفة إسلامية هندسية بـ SVG، فواصل ذهبية، طباعة عربية فخمة، وحركات ظهور ناعمة.
• RTL كامل + منطقية CSS، وبلا أي طلب خارجي.
• إمكانية وصول: تباين عالٍ على الخلفيات الداكنة، تنقّل لوحة مفاتيح كامل، وتركيز ظاهر.
اختم بـ DELIVERY + A11Y: ثلاث نقاط وصولية نفّذتها.`,
      en: `Build a luxury Arabic restaurant site in one file with a warm identity (burgundy/gold/cream).
Requirements:
• One page with sections: hero using an SVG/CSS-drawn dish (shapes and gradients), about, interactive menu, gallery, testimonials, reservation, location and hours, footer.
• Interactive menu: 5 sections (starters, mains, grills, desserts, drinks), instant text filtering, dietary filters (vegetarian/spicy/gluten-free), dish badges, and prices formatted in DZD.
• A demo order cart: add/remove items, live total, and a submit button showing an order summary modal (no server).
• Reservation form with full validation (name, 10-digit Algerian phone starting with 0, future date, party size 1–12, time within opening hours) and clear Arabic error messages under each field.
• Design: geometric Islamic ornamentation in SVG, gold dividers, refined Arabic typography, soft reveal animations.
• Full RTL with logical CSS and zero external requests.
• Accessibility: high contrast over dark backgrounds, full keyboard navigation, visible focus.
End with DELIVERY + A11Y: three accessibility measures you implemented.`,
    },
    deliverable: { ar: 'موقع مطعم كامل بطلب وحجز', en: 'Complete restaurant site with cart and booking' },
    gates: [
      { ar: 'تحقق مدخلات دقيق بالرسائل العربية', en: 'Precise validation with Arabic messages' },
      { ar: 'لا طلبات خارجية نهائياً', en: 'Absolutely no external requests' },
      { ar: 'تنقّل لوحة مفاتيح كامل', en: 'Full keyboard navigation' },
    ],
  },
  {
    id: 'web-dashboard-analytics',
    title: { ar: 'لوحة تحكم تحليلات ببيانات حيّة', en: 'Live Analytics Dashboard' },
    category: 'web',
    tags: ['dashboard', 'charts', 'canvas', 'realtime'],
    difficulty: 'hard',
    bestModels: ['gpt-astra', 'deepseek-v4-lite', 'glm-5-air'],
    minutes: 8,
    body: {
      ar: `ابنِ لوحة تحكم تحليلات في ملف واحد ببيانات تُولَّد حيّاً (محاكاة تدفق حقيقي).
المطلوب:
• رسوم بيانية مرسومة يدوياً على Canvas (بلا مكتبات): خطي متعدد السلاسل مع تمرير أفقي، أعمدة مكدّسة، دائري (donut) بنسب، وخريطة حرارية أسبوعية 7×24.
• تنسيق المحاور تلقائياً: اختيار «خطوات لطيفة» (nice numbers) للقيم، وتسميات عربية للأرقام والوحدات، وتجنّب التداخل عند ضيق المساحة.
• تلميح تفاعلي (tooltip) يتبع المؤشر ويعرض القيمة والتاريخ بصيغة عربية، مع خط رأسي مميّز.
• تدفق حيّ: نقطة جديدة كل ثانية عبر setInterval، بنافذة منزلقة 60 نقطة، وإيقاف تلقائي عند إخفاء التبويب واستئناف عند العودة (مع تعويض زمني منطقي لا قفزة).
• فلاتر: مدى زمني (ساعة/يوم/أسبوع/شهر)، قناة (ويب/جوال/متجر)، ومقارنة بالفترة السابقة تظهر كنسبة تغيّر بلون دلالي.
• بطاقات KPI مع عدّادات متحركة وشرائط أهداف (sparklines صغيرة مرسومة بـ SVG).
• لوحة جانبية للأحداث الحيّة (log) بحد 50 سطراً وإزالة الأقدم تلقائياً.
• إعادة رسم فعّالة: لا ترسم إلا عند تغيّر البيانات أو القياس (dirty flag)، وتفادي أي راسم مزدوج.
• تصدير CSV للبيانات الحالية، ووضع داكن/فاتح كامل يتبدّل بمتغيرات CSS.
• RTL كامل مع لوحة محاور معكوسة (الأحدث يمين).
اختم بـ PERF: عدد عمليات الرسم في الثانية وطريقتك لتقليلها.`,
      en: `Build an analytics dashboard in one file with live simulated data.
Requirements:
• Charts hand-drawn on Canvas (no libraries): a multi-series line chart with horizontal scrolling, stacked bars, a proportional donut, and a 7x24 weekly heatmap.
• Automatic axis formatting: nice-number steps, Arabic number/unit labels, and overlap avoidance on narrow widths.
• An interactive tooltip that follows the cursor and shows value plus date, with a highlighted vertical rule.
• Live stream: one new point per second via setInterval into a 60-point sliding window, auto-pausing on hidden tabs and resuming on return (with sensible time compensation, no jump).
• Filters: time range (hour/day/week/month), channel (web/mobile/store), and period-over-period comparison shown as a semantic-colored delta.
• KPI cards with animated counters and goal bars (tiny SVG sparklines).
• A live event log panel capped at 50 rows, dropping the oldest.
• Efficient redraws: only redraw on data or size change (dirty flag), never double-render.
• CSV export of current data, and a full dark/light theme toggled via CSS variables.
• Full RTL with the axis reversed (newest on the right).
End with PERF: renders per second and how you reduce them.`,
    },
    deliverable: { ar: 'لوحة تحكم برسوم يدوية وبيانات حيّة', en: 'Dashboard with hand-drawn charts, live data' },
    gates: [
      { ar: 'لا رسم زائد عند عدم تغير البيانات', en: 'No redundant renders' },
      { ar: 'إيقاف التدفق عند إخفاء التبويب', en: 'Stream pauses when hidden' },
      { ar: 'محاور عربية منسّقة صحيحة', en: 'Correctly formatted Arabic axes' },
    ],
  },
  {
    id: 'web-portfolio-3d',
    title: { ar: 'ملف شخصي ثلاثي الأبعاد مذهل', en: 'Stunning 3D Portfolio' },
    category: 'web',
    tags: ['portfolio', '3d', 'css', 'showcase'],
    difficulty: 'hard',
    bestModels: ['gemini-ultra-lite', 'grok-4-mini', 'gpt-astra'],
    minutes: 7,
    body: {
      ar: `ابنِ موقع ملف شخصي لمطوّر/مصمم، بصفحة واحدة، بتأثير ثلاثي الأبعاد خالص بـ CSS بلا أي مكتبة.
المطلوب:
• مشهد ثلاثي الأبعاد خفيف: مكعبات/حلقات تدور في فضاء باستخدام transform-style: preserve-3d، مع تدوير يتبع حركة المؤشر (parallax) بتخميد ناعم (lerp) يتوقف عند prefers-reduced-motion.
• بطاقة تعريف زجاجية (glassmorphism) مع حافة متوهجة تتبع المؤشر (spotlight بتحديث متغيرات CSS فقط، لا رسم في JS).
• شريط مهارات بصري: شرائط تتعبأ عند الظهور، وتجميعات تقنية كشارات، ومخطط رحلة زمنية (timeline) عمودية بمشروع لكل سنة.
• معرض 6 مشاريع: بطاقات بصور مُولَّدة بـ SVG متدرّج (بلا صور خارجية)، وتمرير أفقي بالسحب، ونافذة تفاصيل عند النقر مع وصف وتقنيات ورابط وهمي.
• قسم «ماذا أستطيع أن أبني لك» بثلاثة عروض خدمة وأسعار تقديرية.
• نموذج تواصل مع تحقق مدخلات ورسائل عربية، وزر نسخ البريد مع إشعار «تم النسخ».
• أداء: كل الرسوم CSS/SVG، لا Canvas، ومعدل تحديث التأثيرات مقيّد بـ requestAnimationFrame مع قياس (لا تحديث عند عدم تحرك المؤشر).
• RTL كامل، خطوط نظام، بلا طلبات خارجية، وحجم تحت 70 كيلوبايت.
اختم بـ DELIVERY + A11Y.`,
      en: `Build a one-page portfolio for a developer/designer using pure CSS 3D — no libraries.
Requirements:
• A lightweight 3D scene: rotating cubes/rings in space using transform-style: preserve-3d, rotating with pointer parallax damped by lerp and disabled under prefers-reduced-motion.
• A glassmorphism profile card with a cursor-following glowing edge (spotlight driven purely by CSS variables, not JS drawing).
• A visual skills section: bars filling on reveal, tech badges, and a vertical journey timeline with one project per year.
• A 6-project gallery: cards with gradient SVG-generated art (no external images), drag-scrollable rail, and a details modal with description, stack, and a placeholder link.
• A "what I can build for you" section with three service offers and estimated pricing.
• A contact form with input validation and Arabic messages, plus a copy-email button with a "copied" toast.
• Performance: all visuals CSS/SVG, no Canvas, and effect updates gated behind requestAnimationFrame with early exit when the pointer is idle.
• Full RTL, system fonts, no external requests, under 70KB.
End with DELIVERY + A11Y.`,
    },
    deliverable: { ar: 'ملف شخصي ثلاثي الأبعاد بلا مكتبات', en: 'Library-free 3D portfolio' },
    gates: [
      { ar: 'لا تخصيص ذاكرة عند سكون المؤشر', en: 'No allocations while the pointer is idle' },
      { ar: 'احترام reduced-motion', en: 'Respects reduced-motion' },
      { ar: 'حجم نهائي تحت 70KB', en: 'Final size under 70KB' },
    ],
  },
  {
    id: 'web-ecommerce-store',
    title: { ar: 'متجر إلكتروني كامل بواجهة أمامية', en: 'Full Front-End E-commerce Store' },
    category: 'web',
    tags: ['ecommerce', 'cart', 'checkout', 'search'],
    difficulty: 'extreme',
    bestModels: ['kimi-3', 'qwen-4-turbo', 'gpt-astra'],
    minutes: 12,
    body: {
      ar: `ابنِ متجراً إلكترونياً كامل الواجهة الأمامية في ملف واحد (بلا سيرفر) ببيانات منتجات داخلية.
المطلوب:
• 40 منتجاً ببيانات كاملة: {id, name, category, price, oldPrice, rating, reviews, stock, badges, colors, sizes, images(svg gradients)}.
• واجهة متجر: شبكة منتجات بقائمة تصفية جانبية (فئة، مدى سعر بشريط مزدوج، تقييم، توفر، خصومات)، وترتيب (الأحدث/الأرخص/الأعلى تقييماً/الأكثر مبيعاً)، وبحث فوري بتمييز النص المطابق (highlight) وdebounce 200ms.
• صفحة تفاصيل المنتج (نافذة كاملة): معرض صور SVG، اختيار مقاس ولون، كمّية مع حد المخزون، تبويبات (الوصف/المواصفات/التقييمات)، ومنتجات مشابهة محسوبة بالتشابه (لا عشوائية).
• سلة: إضافة/تعديل/حذف، حفظ في localStorage، ملخص سعر مع ضريبة وشحن مجاني فوق حد معيّن، وكوبونات خصم (3 أكواد يعمل أحدها فقط في الوقت).
• إتمام شراء من 3 خطوات بمؤشر تقدم ودفع وهمي مع تحقق كامل لكل حقل (اسم، هاتف، ولاية جزائرية من قائمة 58، كود بريدي 5 أرقام) وملخص نهائي.
• المفضلة (wishlist) بلوحة جانبية، ومقارنة منتجين (2–4) في جدول.
• إشعارات توست أنيقة، وحالة فراغ لكل قسم (رسالة وزر إجراء لا صورة معطوبة).
• RTL عربي كامل، أسعار بالدينار، وبلا أي مكتبة أو طلب خارجي.
• أداء: لا تُرسم القائمة كاملة عند كل تصفية إن لم تتغير النتائج (تجزئة + تخزين مؤقت للحساب).
اختم بـ SELF-CHECK: تحقق من حفظ السلة، صحة الجمع والخصومات، عمل الكوبونات، وتحقق الحقول — PASS/FAIL لكل واحدة.`,
      en: `Build a full front-end e-commerce store in one file (no server) with internal product data.
Requirements:
• 40 products with complete data: {id, name, category, price, oldPrice, rating, reviews, stock, badges, colors, sizes, images (SVG gradients)}.
• Storefront: a product grid with a sidebar filter (category, range slider price, rating, availability, discounts), sorting (newest/cheapest/top-rated/best-selling), and instant search with match highlighting and a 200ms debounce.
• Product detail (full modal): SVG gallery, size and color pickers, stock-aware quantity, tabs (description/specs/reviews), and similar products computed by actual similarity (not random).
• Cart: add/edit/remove, persisted in localStorage, price summary with tax and free shipping above a threshold, and discount coupons (3 codes, only one valid at a time).
• Three-step checkout with a progress indicator and a mock payment, full field validation (name, phone, Algerian wilaya from a 58-item list, 5-digit postal code), and a final summary.
• Wishlist with a side panel, and a 2–4 product comparison table.
• Elegant toast notifications and an empty state for every section (message plus action, never a broken image).
• Full Arabic RTL, DZD pricing, no libraries, no external requests.
• Performance: avoid re-rendering the whole grid when filters yield unchanged results (chunking plus memoized computation).
End with SELF-CHECK covering cart persistence, correct totals and discounts, working coupons, and field validation — PASS/FAIL each.`,
    },
    deliverable: { ar: 'متجر كامل بالسلة والدفع والمقارنة', en: 'Complete store with cart, checkout, compare' },
    gates: [
      { ar: 'الحسابات المالية دقيقة (ضريبة/خصم/شحن)', en: 'Exact money math (tax/discount/shipping)' },
      { ar: 'السلة تنجو من إعادة التحميل', en: 'Cart survives reload' },
      { ar: 'لا حالة فراغ مكسورة', en: 'No broken empty states' },
    ],
  },
  {
    id: 'web-booking-clinic',
    title: { ar: 'نظام حجز عيادة طبية', en: 'Clinic Booking System' },
    category: 'web',
    tags: ['booking', 'calendar', 'forms', 'healthcare'],
    difficulty: 'hard',
    bestModels: ['glm-5-air', 'qwen-4-turbo', 'gemini-ultra-lite'],
    minutes: 8,
    body: {
      ar: `ابنِ واجهة نظام حجز لعيادة طبية في ملف واحد بواجهة أمامية كاملة (تخزين localStorage).
المطلوب:
• تقويم شهري مرسوم بـ CSS Grid: تنقّل بين الأشهر، تعطيل الأيام الماضية والمغلق (الجمعة)، ونقر على اليوم يعرض الفترات المتاحة (30 دقيقة، 08:00–16:30) بحالة كل فترة (متاح/محجوز/محظور).
• حجز موعد: اختيار طبيب من 6 (تخصص، سعر، مدة الكشف)، الاسم، الهاتف (تحقق جزائري)، العمر، سبب الزيارة (اختياري بحد 300 حرف مع عدّاد)، ثم تأكيد برمز حجز من 6 خانات يُعرض في نافذة ويُنسَخ بزر.
• منع التعارض بقوة: لا يمكن حجز فترة محجوزة، ولا تجاوز حصص الطبيب اليومية، ولا حجز في الماضي — والفحص يعمل على مستوى الحالة لا على مستوى الواجهة فقط.
• الملف الشخصي للمريض: عرض مواعيده القادمة والسابقة، إلغاء مع تأكيد، وإعادة جدولة (مع تحرير الفترة القديمة فوراً).
• لوحة إدارة بسيطة: كل مواعيد اليوم، فلترة بالطبيب والحالة، وتغيير الحالة (منتظر/دخل/انتهى/ملغى)، وإحصاء يومي (عدد المواعيد، الإيراد المتوقع).
• طباعة بطاقة موعد (print CSS أنيقة) وبطاقة QR بسيطة مرسومة بنقاط SVG لرمز الحجز.
• تنبيهات: تحقق من عدم التداخل بين مواعيد الطبيب نفسه، ورسائل خطأ عربية دقيقة تحدد الحقل والمشكلة.
• RTL كامل، أرقام عربية اختيارية، وبلا مكتبات أو طلبات خارجية.
اختم بـ SELF-CHECK: اختبار منطق المواعيد (5 حالات: تداخل، ماضٍ، يوم مغلق، تجاوز الحصة، إعادة جدولة) مع النتيجة المتوقعة لكل حالة.`,
      en: `Build a clinic booking front-end in one file with complete client-side logic (localStorage persistence).
Requirements:
• A monthly calendar via CSS Grid: month navigation, past dates and closed days (Fridays) disabled, and clicking a day lists 30-minute slots (08:00–16:30) with per-slot state (free/booked/blocked).
• Booking flow: choose one of 6 doctors (specialty, fee, visit duration), enter name, phone (Algerian validation), age, and an optional 300-char reason with a counter, then confirm with a 6-slot booking code shown in a modal and copyable via button.
• Strong conflict prevention: cannot book a taken slot, cannot exceed a doctor's daily quota, cannot book in the past — validation operates on state, not merely in the UI.
• Patient profile: upcoming and past appointments, cancel with confirmation, and reschedule (immediately freeing the old slot).
• A simple admin board: today's appointments, filter by doctor and status, status changes (waiting/in-room/done/cancelled), and daily stats (count, expected revenue).
• Printable appointment card (clean print CSS) and a simple QR-style code drawn with SVG dots for the booking code.
• Guardrails: no overlap between the same doctor's appointments, and precise Arabic error messages naming the field and the problem.
• Full RTL, optional Arabic-Indic numerals, no libraries, no external requests.
End with SELF-CHECK: five booking-logic cases (overlap, past date, closed day, quota exceeded, reschedule) with the expected outcome each.`,
    },
    deliverable: { ar: 'نظام حجز بمنطق صارم ضد التعارض', en: 'Booking system with airtight conflict logic' },
    gates: [
      { ar: 'لا تعارض مواعيد ممكن إطلاقاً', en: 'Overlap is impossible' },
      { ar: 'التحقق على مستوى الحالة لا الواجهة', en: 'State-level validation, not UI-only' },
      { ar: 'الطباعة تنتج بطاقة نظيفة', en: 'Printing yields a clean card' },
    ],
  },
  {
    id: 'web-learn-platform',
    title: { ar: 'منصة تعليمية باختبارات تفاعلية', en: 'Learning Platform with Quizzes' },
    category: 'web',
    tags: ['education', 'quiz', 'progress', 'arabic'],
    difficulty: 'hard',
    bestModels: ['qwen-4-turbo', 'kimi-3', 'glm-5-air'],
    minutes: 9,
    body: {
      ar: `ابنِ منصة تعليمية عربية في ملف واحد: 3 مسارات (برمجة، رياضيات، إنجليزية) و18 درساً و90 سؤالاً.
المطلوب:
• بنية بيانات نظيفة: {tracks: [{id, title, color, lessons: [{id, title, minutes, content[], quiz: [{q, choices[], answer, explain}]}]}]} — والمحتوى عربي فصيح ومفيد فعلاً (لا نص حشو).
• مشغّل درس: شريط تقدم، تنقّل بين الأقسام، ترميز كود بسيط (Syntax highlight يدوي لـ JS بمطابقة أنماط آمنة)، وزر «أتممت الدرس» يفتح التالي.
• اختبار تفاعلي: سؤال واحد في الشاشة، اختيار يُقيَّم فوراً مع شرح، تراجع بين الأسئلة دون فقدان الإجابات، شريط وقت اختياري، ونتيجة نهائية بنسبة ونجوم ومراجعة الأخطاء.
• تقدم المستخدم: حفظ في localStorage (نسبة كل مسار، الدروس المكتملة، أفضل نتيجة اختبار، سلسلة أيام متتالية streak) ولوحة إحصاءات شخصية برسوم SVG صغيرة.
• تكرار متباعد بسيط: الأسئلة المخطأ فيها تعود في جلسة مراجعة بعد يوم (يُحسب بالتواريخ المحفوظة) وتظهر في قسم «راجع الآن».
• واجهة أنيقة: بطاقات مسارات بتدرجات مميزة للأعمى اللوني، وضع ليلي/نهاري، وتخطيط متجاوب 3/2/1 أعمدة.
• وصولية: كل عنصر تحكّم بزر حقيقي (لا div قابل للنقر)، aria-live لرسائل التقييم، وتنقّل كامل بلوحة المفاتيح.
• RTL كامل + منطقية CSS، وبلا مكتبات أو طلبات خارجية.
اختم بـ CONTENT: عدد الدروس والأسئلة الفعلي وثلاث جمل توضح كيف ضمنت عدم تكرار الأسئلة.`,
      en: `Build an Arabic learning platform in one file: 3 tracks (programming, math, English), 18 lessons, 90 questions.
Requirements:
• Clean data shape: {tracks: [{id, title, color, lessons: [{id, title, minutes, content[], quiz: [{q, choices[], answer, explain}]}]}]} — with genuinely useful fluent Arabic content, no filler.
• Lesson player: progress bar, section navigation, a simple hand-rolled code highlighter for JS (safe pattern matching), and a "lesson complete" button unlocking the next.
• Interactive quiz: one question on screen, instant graded choice with an explanation, back-navigation without losing answers, an optional timer, and a final score with percentage, stars, and an error review.
• User progress in localStorage (per-track percentage, completed lessons, best quiz score, day streak) plus a personal stats panel with small SVG charts.
• Simple spaced repetition: missed questions resurface in a review session the next day (computed from saved dates) under a "review now" section.
• Elegant UI: track cards with colorblind-distinguishable gradients, dark/light modes, and a responsive 3/2/1 column layout.
• Accessibility: real button elements for all controls (no clickable divs), aria-live for grading messages, and full keyboard navigation.
• Full RTL with logical CSS, no libraries, no external requests.
End with CONTENT: the actual lesson and question counts, plus three sentences on how you prevented question duplication.`,
    },
    deliverable: { ar: 'منصة تعليمية بـ18 درساً و90 سؤالاً', en: 'Learning platform with 18 lessons, 90 questions' },
    gates: [
      { ar: 'المحتوى حقيقي ومفيد لا حشو', en: 'Real content, not filler' },
      { ar: 'التقدم يُحفظ ويُستأنف', en: 'Progress persists and resumes' },
      { ar: 'كل عناصر التحكم أزرار حقيقية', en: 'All controls are real buttons' },
    ],
  },
  {
    id: 'web-news-portal',
    title: { ar: 'بوابة أخبار عربية سريعة', en: 'Fast Arabic News Portal' },
    category: 'web',
    tags: ['news', 'cms', 'search', 'reading'],
    difficulty: 'medium',
    bestModels: ['gemini-ultra-lite', 'glm-5-air', 'llama-4-scout'],
    minutes: 6,
    body: {
      ar: `ابنِ بوابة أخبار عربية كاملة الواجهة في ملف واحد، ببيانات 24 مقالاً داخلياً بمحتوى عربي حقيقي مكتوب بعناية (لا حشو Lorem).
المطلوب:
• الصفحة الرئيسية: مقال رئيسي بارز، 4 مقالات ثانوية، أقسام (سياسة/اقتصاد/تقنية/رياضة/ثقافة/صحة)، وقائمة «الأكثر قراءة».
• صفحة مقال: عنوان، سطر تاريخ بالعربية (منذ ساعتين…)، وقت القراءة المقدّر من عدد الكلمات، صورة SVG تعبيرية متدرجة، نص منسّق بعناوين فرعية واقتباس، أزرار مشاركة (نسخ الرابط/تويتر/واتساب كروابط نصية)، وقائمة مقالات ذات صلة محسوبة بالوسوم المشتركة.
• بحث فوري في العناوين والمحتوى مع تمييز النتائج وعدد النتائج، وفلترة بالوسوم، وترتيب حسب الأحدث/الأكثر قراءة.
• حفظ المقالات للقراءة لاحقاً في localStorage، مع قسم «قائمة القراءة».
• قراءة مريحة: وضع قراءة (يخفي الزوائد)، حجم خط قابل للتغيير (3 مستويات محفوظة)، شريط تقدم القراءة أعلى الصفحة، ووضع ليلي.
• أداء: لا طلبات خارجية، رسم قوائم بالتدريج (chunked rendering) عند الفلترة، وصور SVG خفيفة (<2KB لكل واحدة).
• RTL كامل، خطوط نظام، ترتيب عناوين صحيح، وحالة فراغ للبحث بلا نتائج.
اختم بـ DELIVERY + SEO: كيف جعلت المقالات صديقة لمحركات البحث في صفحة واحدة.`,
      en: `Build a complete Arabic news portal front-end in one file, with 24 articles of genuinely written Arabic content (no Lorem filler).
Requirements:
• Home: a lead story, 4 secondary stories, sections (politics/economy/tech/sports/culture/health), and a "most read" list.
• Article page: headline, relative Arabic timestamp (e.g., two hours ago), estimated reading time from word count, a gradient SVG illustration, formatted body with subheads and a pull quote, text share actions (copy link/Twitter/WhatsApp as plain links), and related articles computed from shared tags.
• Instant search across headlines and body with highlighting and a result count, tag filtering, and sorting by newest/most read.
• Save articles for later in localStorage with a "reading list" section.
• Comfortable reading: a reading mode (hides chrome), a 3-level persisted font size, a top reading-progress bar, and a night mode.
• Performance: no external requests, chunked list rendering while filtering, and light SVG art (under 2KB each).
• Full RTL, system fonts, correct heading order, and an empty state for zero-result searches.
End with DELIVERY + SEO: how you made articles search-friendly within a single-page app.`,
    },
    deliverable: { ar: 'بوابة أخبار بـ24 مقالاً وبحث فوري', en: 'News portal with 24 articles and instant search' },
    gates: [
      { ar: 'محتوى عربي حقيقي مكتوب بعناية', en: 'Genuinely written Arabic content' },
      { ar: 'البحث سريع ودقيق مع تمييز', en: 'Search is fast, accurate, highlighted' },
      { ar: 'وضع القراءة يعمل ويُحفظ', en: 'Reading mode works and persists' },
    ],
  },
  {
    id: 'web-chat-support',
    title: { ar: 'ودجت دعم فني ذكي', en: 'Smart Support Chat Widget' },
    category: 'web',
    tags: ['chat', 'widget', 'kb', 'ux'],
    difficulty: 'medium',
    bestModels: ['gpt-astra', 'gemini-ultra-lite', 'mistral-forge'],
    minutes: 5,
    body: {
      ar: `ابنِ ودجت دعم فني قابل للتضمين في ملف واحد، يعمل بمنطق محلي كامل (بلا سيرفر).
المطلوب:
• زر عائم أنيق مع نبضة تنبيه، ونافذة دردشة بزوايا ناعمة وتمرير ذكي يبقى في الأسفل مع رسالة جديدة إلا إن مرّر المستخدم للأعلى (ثم يظهر زر «رسائل جديدة ↓»).
• محرّك ردود محلي: مطابقة نية (intent) بثلاث طبقات (تطابق عبارة دقيق، ثم كلمات مفتاحية مرجّحة بـTF-IDF مبسط، ثم تشابه تقريبي بالحروف لتحمّل الأخطاء المطبعية العربية) مع حد ثقة وشكر بديل لطيف عند عدم الفهم.
• قاعدة معرفة داخلية: 20 سؤالاً/جواباً (الدفع، الشحن، الإرجاع، الاسترجاع، الحساب، الخصوصية...) مع اقتراح 3 أسئلة ذات صلة بعد كل رد.
• ردود غنية: نص، قائمة خطوات مرقّمة، بطاقة إجراء (زر يفتح رابطاً وهمياً)، وتقييم «هل أفادك الرد؟» يخزّن في localStorage ويؤثر في ترتيب الإجابات لاحقاً.
• نقل إلى موظف بشري: نموذج بسيط (اسم، بريد، وصف المشكلة) مع توليد رقم تذكرة بصيغة NF-XXXX، وإظهار نسخة في تبويب «تذاكري».
• تجربة مستخدم: مؤشر كتابة ثلاثي النقاط، طوابع زمنية، فواصل «اليوم/أمس»، تحديث المحادثة بعد إعادة التحميل من localStorage، وزر مسح المحادثة.
• وصولية: aria-live للمحادثة، تنقّل كامل بلوحة المفاتيح مع Esc للإغلاق، تركيز مُدار عند الفتح، وتقليل الحركة.
• RTL كامل، بلا مكتبات، وحجم تحت 40 كيلوبايت.
اختم بـ SELF-CHECK: اختبار 6 عبارات عربية (منها عبارات بها أخطاء مطبعية) وتوقّع النية ونسبة الثقة لكل واحدة.`,
      en: `Build an embeddable support-chat widget in one file with fully local logic (no server).
Requirements:
• An elegant floating button with an attention pulse, and a chat window with soft corners and smart scrolling that sticks to the bottom on new messages unless the user scrolled up (then a "new messages" jump button appears).
• A local reply engine: three-tier intent matching (exact phrase, then keyword scoring with simplified TF-IDF, then rough Arabic-tolerant character similarity for typos) with a confidence threshold and a polite fallback.
• An internal knowledge base: 20 Q&As (payments, shipping, returns, refunds, account, privacy...) that suggests 3 related questions after each answer.
• Rich replies: text, numbered steps, an action card (button opening a placeholder link), and a "was this helpful?" rating persisted in localStorage that reorders answers next time.
• Human handoff: a small form (name, email, issue description) generating a ticket id in the NF-XXXX format, with a copy shown in a "my tickets" tab.
• UX: a three-dot typing indicator, timestamps, "today/yesterday" separators, conversation restored from localStorage after reload, and a clear-chat action.
• Accessibility: aria-live for the transcript, full keyboard navigation with Esc to close, managed focus on open, and reduced motion.
• Full RTL, no libraries, under 40KB.
End with SELF-CHECK: test 6 Arabic phrases (including typos) and predict the intent and confidence for each.`,
    },
    deliverable: { ar: 'ودجت دعم بقاعدة معرفة وتذاكر', en: 'Support widget with knowledge base and tickets' },
    gates: [
      { ar: 'مطابقة النية تتحمّل الأخطاء المطبعية', en: 'Intent matching tolerates typos' },
      { ar: 'لا رد فارغ أبداً (مسار بديل دائماً)', en: 'Never an empty reply (always a fallback)' },
      { ar: 'المحادثة تُستأنف بعد التحديث', en: 'Conversation resumes after reload' },
    ],
  },

  /* ============================ تطبيقات وأدوات ============================ */
  {
    id: 'app-codesnap-editor',
    title: { ar: 'محرّر كود مصغّر بمعاينة حيّة', en: 'Mini Code Editor with Live Preview' },
    category: 'app',
    tags: ['editor', 'preview', 'tools', 'sandbox'],
    difficulty: 'hard',
    bestModels: ['gpt-astra', 'qwen-4-turbo', 'kimi-3'],
    minutes: 8,
    body: {
      ar: `ابنِ أداة «محرّر كود مصغّر» في ملف واحد: كتابة HTML/CSS/JS مع معاينة حيّة آمنة.
المطلوب:
• ثلاثة محرّرات بتبويبات (HTML/CSS/JS) على عنصر textarea بتنسيق طباعي مريح (خط برمجي، تبويب بمفتاح Tab يعمل فعلاً، ترقيم أسطر بمزامنة تمرير دقيقة، وإبراز السطر الحالي).
• إعادة تشغيل المعاينة تلقائياً بعد 600ms من التوقف (debounce)، أو فورياً بزر تشغيل، وزر إعادة تشغيل نظيف (يُعيد إنشاء الـiframe لتصفير الحالة).
• معاينة معزولة: srcDoc على iframe برمل (sandbox="allow-scripts")، والتقاط أخطاء الكونسول والأخطاء غير المعالجة من داخل الإطار عبر postMessage وعرضها في لوحة كونسول سفلية ملوّنة حسب النوع (log/warn/error) مع عدد الأخطاء كشارة.
• حفظ تلقائي في localStorage لثلاثة مشاريع (Tabs)، مع إمكانية إعادة تسمية المشروع، ونسخ، وحذف، وتصدير ملف .html مدمج جاهز للتشغيل.
• قوالب جاهزة (بداية فارغة، لعبة كانفاس، صفحة هبوط، نموذج بتحقق) تُحمَّل بزر واحد.
• اختصارات: Ctrl+S حفظ، Ctrl+Enter تشغيل، Ctrl+/ تعليق السطر المحدد، Ctrl+D تكرار السطر.
• تنسيق تلقائي بسيط (indent) لكل لغة بلا مكتبات، وزر نسخ شامل للمشروع.
• تخطيط متجاوب: في الشاشات الضيقة تتحول المعاينة إلى تبويب مستقل بدل شبكة منقسمة.
• RTL كامل للواجهة العربية، مع بقاء المحرّرات LTR (dir="ltr" داخلياً) — هذه نقطة حسّاسة يجب تنفيذها بدقة.
اختم بـ SELF-CHECK: تحقق من عمل sandbox، والتقاط الأخطاء، وعدم تسريب مستمعات postMessage بعد إعادة التشغيل.`,
      en: `Build a "mini code editor" tool in one file: write HTML/CSS/JS with a secure live preview.
Requirements:
• Three tabbed editors (HTML/CSS/JS) on textareas with comfortable typography (monospace font, working Tab insertion, line numbers synced precisely to scroll, current-line highlight).
• The preview restarts automatically 600ms after you stop typing (debounce) or instantly via a run button, plus a hard restart that recreates the iframe to reset state.
• Isolated preview: srcDoc on an iframe with sandbox="allow-scripts", capturing console output and unhandled errors from inside via postMessage into a color-coded bottom console (log/warn/error) with an error badge count.
• Auto-save to localStorage across three projects (tabs), with rename, duplicate, delete, and export of a combined runnable .html file.
• Starter templates (blank, canvas game, landing page, validated form) loadable with one click.
• Shortcuts: Ctrl+S save, Ctrl+Enter run, Ctrl+/ comment the selected line, Ctrl+D duplicate line.
• Simple per-language auto-indent without libraries, and a copy-everything button.
• Responsive layout: on narrow screens the preview becomes its own tab instead of a split grid.
• Full RTL for the Arabic chrome while editors stay LTR (dir="ltr" internally) — this detail must be exactly right.
End with SELF-CHECK: verify the sandbox, error capture, and that no postMessage listeners leak after a restart.`,
    },
    deliverable: { ar: 'محرّر كود بمعاينة معزولة وكونسول', en: 'Code editor with isolated preview and console' },
    gates: [
      { ar: 'المعاينة معزولة بأمان', en: 'Preview securely sandboxed' },
      { ar: 'لا تسريب مستمعات بعد إعادة التشغيل', en: 'No listener leaks after restart' },
      { ar: 'المحرّرات LTR داخل واجهة RTL', en: 'LTR editors inside an RTL chrome' },
    ],
  },
  {
    id: 'app-habit-tracker',
    title: { ar: 'متتبّع عادات بتحليلات ونقاط', en: 'Habit Tracker with Streaks' },
    category: 'app',
    tags: ['productivity', 'habits', 'charts', 'offline'],
    difficulty: 'medium',
    bestModels: ['glm-5-air', 'gpt-astra', 'llama-4-scout'],
    minutes: 6,
    body: {
      ar: `ابنِ تطبيق «متتبّع عادات» في ملف واحد يعمل بلا إنترنت.
المطلوب:
• إضافة عادات: اسم، أيقونة (SVG من مجموعة داخلية 24 أيقونة)، لون، تكرار (يومي/أيام محددة/× مرات أسبوعياً)، وهدف يومي.
• شاشة اليوم: شبكة عادات مع مربع إتمام، عدّاد سلسلة أيام (streak) بلهب، ونسبة الإنجاز اليومي كحلقة تقدم SVG.
• خريطة حرارية سنوية (contributions) بألوان متدرجة حسب عدد الإنجازات، مع تلميح لكل يوم يعرض العادات المنجزة.
• إحصاءات: أفضل سلسلة، معدل الالتزام 30 يوماً، مخطط أعمدة أسبوعي، وأكثر عادة منتظمة — كلها SVG بلا مكتبات.
• تفاعل لمسي مريح: نقرة تُتم، ضغطة طويلة تفتح التفاصيل، وسحب أفقي لتبديل الأيام (مع دعم كامل للفأرة).
• إشعارات محلية (Notification API) اختيارية بوقت محدد لكل عادة، مع طلب إذن مؤدب وشرح واضح، وتجاهل صامت عند الرفض.
• حفظ محلي كامل + تصدير/استيراد JSON + نسخة احتياطية تلقائية آخر 7 نسخ (تُدار بالحجم لا بالعدد الزائد).
• دقة التواريخ: احسب «اليوم» محلياً (لا UTC) لتجنّب انحراف السلسلة عند منتصف الليل، وتحقّق من تخطي الأيام الغائبة.
• تصميم أنيق: بطاقات بزوايا ناعمة، ألوان هادئة، ووضع ليلي، مع RTL كامل.
اختم بـ SELF-CHECK: اختبار 4 حالات تواريخ (تغيير اليوم عند منتصف الليل، توقيت صيفي، يوم مفقود، أسبوع جديد) مع النتيجة المتوقعة.`,
      en: `Build an offline habit tracker in one file.
Requirements:
• Add habits: name, icon (from an internal set of 24 SVGs), color, frequency (daily/specific weekdays/times per week), and a daily target.
• Today view: a habit grid with completion toggles, flame-styled streak counters, and daily completion as an SVG progress ring.
• A yearly heatmap (contributions) with intensity colors and a per-day tooltip listing completed habits.
• Stats: best streak, 30-day consistency, weekly bar chart, and most consistent habit — all SVG, no libraries.
• Comfortable touch interaction: tap to complete, long-press for details, swipe horizontally to change days (full mouse support too).
• Optional local notifications (Notification API) with a per-habit time, a polite permission request with clear reasoning, and silent respect on denial.
• Full local persistence + JSON export/import + an automatic backup keeping the last 7 snapshots (size-managed, not unbounded).
• Date correctness: compute "today" in local time (never UTC) so streaks don't drift at midnight, and handle skipped days correctly.
• Elegant design: soft-cornered cards, calm palette, night mode, full RTL.
End with SELF-CHECK: four date scenarios (midnight rollover, DST change, missed day, new week) with the expected outcome.`,
    },
    deliverable: { ar: 'تطبيق عادات بالتحليلات والخريطة الحرارية', en: 'Habit app with analytics and heatmap' },
    gates: [
      { ar: 'حساب التواريخ المحلي صحيح دائماً', en: 'Local date math always correct' },
      { ar: 'التصدير يعيد البناء بدقة', en: 'Export restores state precisely' },
      { ar: 'الرفض لا يكسر أي شيء', en: 'Permission denial breaks nothing' },
    ],
  },
  {
    id: 'app-invoice-maker',
    title: { ar: 'مولّد فواتير احترافي بطباعة', en: 'Professional Invoice Generator' },
    category: 'app',
    tags: ['invoice', 'print', 'pdf', 'business'],
    difficulty: 'medium',
    bestModels: ['mistral-forge', 'glm-5-air', 'gpt-astra'],
    minutes: 6,
    body: {
      ar: `ابنِ مولّد فواتير عربي في ملف واحد للشركات الصغيرة الجزائرية.
المطلوب:
• رأس الفاتورة: شعار نصي/SVG، اسم المؤسسة، العنوان، RC/NIF/NIS (حقول اختيارية)، الهاتف والبريد، ورقم الفاتورة التلقائي بصيغة FAC-2026-0001 متزايد ومحفوظ.
• بنود قابلة للإضافة/الحذف/السحب للترتيب: الوصف، الكمية، السعر الوحدوي، والوحدة (قطعة/ساعة/يوم)، مع ضريبة TVA قابلة للضبط (0/9/19%)، وخصم بنسبة أو مبلغ، ومجموع فرعي وضريبة وإجمالي نهائي بالأرقام وبالحروف العربية (تفقيط عربي صحيح حتى الملايين).
• الطباعة: قالب فاتورة أنيق عبر @media print (A4، هوامش صحيحة، إخفاء الواجهة، رأس وتذييل، ترقيم صفحات منطقي) + زر طباعة/حفظ PDF.
• حفظ العملاء (قائمة محلية) وإعادة استخدام بياناتهم بنقرة، وسجل فواتير سابق مع بحث وفلترة بالتاريخ والحالة (مدفوعة/غير مدفوعة/جزئية) وعدد أيام التأخير.
• التحقق: منع فاتورة فارغة، منع كميات سالبة أو صفرية، تحقق من صيغة البريد والهاتف، وتنبيه لطيف عند تجاوز حدود التقريب.
• التدقيق الرقمي: كل الحسابات بأعداد صحيحة من السنتيمات (لا أخطاء فاصلة عائمة) ثم تُقسّم للعرض — مطلوب صراحة.
• تصدير/استيراد JSON لكل البيانات، وإحصاء لوحة (عدد الفواتير، الإجمالي الشهري، المتأخرات).
• RTL كامل، أرقام عربية اختيارية، وتفقيط عربي عربي صحيح (واحد وعشرون ألفاً وخمسمائة دينار جزائري).
اختم بـ SELF-CHECK: 5 حالات حسابية (خصم+ضريبة، كمية عشرية، تقريب، تفقيط 1000000، فاتورة بإجمالي صفر) مع النتيجة الصحيحة لكل حالة.`,
      en: `Build an Arabic invoice generator in one file for small Algerian businesses.
Requirements:
• Invoice header: text/SVG logo, company name, address, optional RC/NIF/NIS fields, phone and email, plus an auto-incrementing invoice number in the FAC-2026-0001 format, persisted.
• Line items that can be added/removed/reordered: description, quantity, unit price, unit (piece/hour/day), a configurable TVA (0/9/19%), percentage or fixed discount, and subtotal/tax/total in digits and in correct Arabic words (numeral-to-words up to millions).
• Printing: an elegant invoice template via @media print (A4, correct margins, chrome hidden, header/footer, sensible page breaks) plus a print/save-as-PDF button.
• Save customers locally and reuse their data in one click, plus an invoice history with search, date filtering, and status (paid/unpaid/partial) including days overdue.
• Validation: no empty invoices, no zero or negative quantities, email/phone format checks, and a gentle warning near rounding limits.
• Numeric rigor: all math in integer centimes (never floating point) converted for display — explicitly required.
• Full JSON export/import, plus a dashboard (invoice count, monthly total, outstanding balance).
• Full RTL, optional Arabic-Indic digits, and correct Arabic numeral phrasing (one thousand two hundred dinars, etc.).
End with SELF-CHECK: five calculation cases (discount+tax, decimal quantity, rounding, 1,000,000 in words, zero-total invoice) with the correct expected result each.`,
    },
    deliverable: { ar: 'مولّد فواتير جاهز للطباعة والتفقيط', en: 'Print-ready invoice maker with numerals-to-words' },
    gates: [
      { ar: 'حسابات صحيحة بأعداد صحيحة', en: 'Correct integer-based math' },
      { ar: 'التفقيط العربي صحيح نحوياً', en: 'Grammatically correct numeral phrasing' },
      { ar: 'الطباعة A4 نظيفة بلا قطع', en: 'Clean A4 print, nothing cut off' },
    ],
  },
  {
    id: 'app-ai-notes',
    title: { ar: 'دفتر ملاحظات ذكي ببحث دلالي محلي', en: 'Smart Notes with Local Search' },
    category: 'ai',
    tags: ['notes', 'search', 'embeddings', 'offline'],
    difficulty: 'hard',
    bestModels: ['kimi-3', 'gpt-astra', 'mistral-forge'],
    minutes: 7,
    body: {
      ar: `ابنِ تطبيق ملاحظات ذكياً في ملف واحد يعمل بلا إنترنت وبلا أي API.
المطلوب:
• تحرير ملاحظات بتنسيق Markdown مصغّر (عناوين، قوائم، عريض، كود مضمّن، اقتباس) بمحلل خطّي تكتبه بنفسك (بلا مكتبات) يُنتج HTML منظّفاً — مع خطوة تنقية (escape) لأي HTML مُدخل لمنع XSS، مهم جداً.
• بحث محلي دلالي بالكلمات: بناء تمثيل TF-IDF لكلمات عربية مُجرَّدة من التشكيل واللواصق (ال، و، ف، ب، ل، ك) مع مرادفات مدمجة (مثال: سيارة/عربة/مركبة)، وترتيب النتائج بدرجة تشابه مع إبراز المقاطع المطابقة في النتائج.
• تصنيف تلقائي للملاحظة (عمل/شخصي/أفكار/مهام) بمنطق قواعد مرجّح، مع إمكانية تصحيح يدوي، ووسوم يُستنتج بعضها من النص (تواريخ، أرقام، أسماء أيام).
• مهام: سطور تبدأ بـ - [ ] تتحول إلى مهام قابلة للتعليم، وتجميع تلقائي في لوحة مهام جانبية مع عدّاد أيام.
• لوحة جانبية: شجرة وسوم، تصفية متعددة المعايير، فرز (الأحدث/الأطول/الأكثر ارتباطاً)، وحفظ بحث كـ«عرض محفوظ».
• حفظ تلقائي فوري في localStorage مع فهرسة متزايدة (تحديث تمثيل TF-IDF للملاحظة المتغيرة فقط، لا إعادة بناء كامل).
• ميزات إضافية: رابط مرجعي بين الملاحظات [[اسم الملاحظة]] يتحول لرابط تنقّل، ونسخ احتياطي تلقائي، وتصدير كل الملاحظات Markdown في ملف واحد.
• RTL مثالي للنص العربي، مع محرّر LTR عند إدخال كود، وتنقّل لوحة مفاتيح كامل (Ctrl+K للبحث).
اختم بـ SELF-CHECK: تحقق من منع XSS (6 مدخلات ضارّة)، صحة تجريد اللواصق العربية، وسرعة البحث على 500 ملاحظة.`,
      en: `Build a smart notes app in one file that runs offline with no APIs.
Requirements:
• Note editing with a mini Markdown (headings, lists, bold, inline code, quotes) using a hand-written linear parser (no libraries) producing sanitized HTML — with escaping of any raw input HTML to prevent XSS, which is critical.
• Local semantic-ish keyword search: build TF-IDF over Arabic tokens stripped of diacritics and clitics (ال, و, ف, ب, ل, ك) with a built-in synonym map (car/automobile/vehicle), ranking results by cosine similarity and highlighting matched spans.
• Automatic note classification (work/personal/ideas/tasks) via weighted rules, with manual override, and tags partly inferred from text (dates, numbers, weekday names).
• Tasks: lines starting with "- [ ] " become checkable tasks collected into a side panel with day counters.
• Sidebar: tag tree, multi-criteria filtering, sorting (newest/longest/most linked), and saved searches as "views".
• Instant autosave to localStorage with incremental indexing (recompute TF-IDF only for the changed note, never a full rebuild).
• Extras: wiki-links [[note name]] that navigate between notes, automatic backups, and Markdown export of all notes into one file.
• Flawless RTL for Arabic text while the editor switches to LTR for code, with full keyboard navigation (Ctrl+K for search).
End with SELF-CHECK: XSS prevention (6 malicious inputs), Arabic clitic stripping correctness, and search speed on 500 notes.`,
    },
    deliverable: { ar: 'تطبيق ملاحظات ببحث دلالي محلي', en: 'Notes app with local semantic search' },
    gates: [
      { ar: 'منع XSS مثبت باختبارات', en: 'Proven XSS prevention' },
      { ar: 'الفهرسة تزايدية لا كاملة', en: 'Incremental indexing, not full' },
      { ar: 'العربية تُبحث بكفاءة', en: 'Arabic search is efficient' },
    ],
  },

  /* ============================ جودة ومراجعة ============================ */
  {
    id: 'qa-deep-audit',
    title: { ar: 'تدقيق عميق قبل التسليم (إلزامي)', en: 'Deep Pre-Delivery Audit (Mandatory)' },
    category: 'qa',
    tags: ['audit', 'bugs', 'security', 'gate'],
    difficulty: 'extreme',
    bestModels: ['nova-coder-x', 'kimi-3', 'gpt-astra'],
    minutes: 5,
    body: {
      ar: `أنت مدقّق الجودة النهائي. سأتيك مشروع، ولن يُسلَّم لأي إنسان قبل أن تجتاز فحصك. اتبع البروتوكول بدقة وأخرِج تقريراً منظّماً:

المرحلة 1 — السلامة البنيوية: تحقق من التماسك الكامل (وسوم/أقواس/أقواس مربّعة)، ترتيب التعريف قبل الاستخدام، ضياع أي سطر بسبب نص غير مغلق، واكتمال الملف من البداية للنهاية. أخرِج جدولاً: [فحص | نتيجة PASS/FAIL | الدليل].

المرحلة 2 — الأخطاء الديناميكية الحتمية: لكل مرجع — أين يُعرَّف؟ هل يمكن الوصول إليه في كل المسارات؟ ما يحدث إن كان العنصر غير موجود؟ هل توجد قراءة لمتغير قبل تهيئته (TDZ)؟ هل يمكن لحلقة أن لا تنتهي؟ هل كل الوعد (Promise) له catch؟ أخرِج كل خطأ محتمل مع السطر والسبب.

المرحلة 3 — الأمان: eval/Function؟ innerHTML مع محتوى متغيّر؟ تخزين أسرار؟ target=_blank بلا rel="noopener noreferrer"؟ حقن في محددات CSS عبر مدخل المستخدم؟ طلب شبكة بلا مهلة؟ حقول كلمة مرور بلا autocomplete صحيح؟

المرحلة 4 — الأداء والذاكرة: هل يُنشئ حلقة الرسم كائنات (مصفوفات/سلاسل/دوال) داخل الإطار؟ هل يوجد setInterval بلا clearInterval؟ هل تُضاف مستمعات بلا إزالة؟ هل تُحدَّث DOM بشكل غير مُجمَّع؟ هل يوجد رسم مزدوج لنفس البيانات؟ قدّر عدد العمليات في الإطار.

المرحلة 5 — ألعاب (إن كان المشروع لعبة): deltaTime محصور؟ إيقاف عند إخفاء التبويب؟ زر عالق عند Alt+Tab؟ تحكم لمس موجود وموضعي؟ إعادة تشغيل نظيفة تفرّغ كل الحالة؟ مجموعات الكائنات معاد استخدامها؟ عدد أقصى مضمون للكائنات؟

المرحلة 6 — الواجهة والوصولية وRTL: كل زر أيقوني له aria-label؟ التباين كافٍ؟ التركيز ظاهر؟ ترتيب العناوين صحيح؟ الأرقام لا تكسر الاتجاه؟ النص العربي يظهر بتشكيل صحيح؟

ثم:
• أخرِج قائمة الإصلاحات مرتّبة بالخطورة، ولكل إصلاح: الملف/السطر + السبب + الكود الجاهز للّصق (لا وصفاً عاماً).
• أخرِج النسخة المُصلَحة كاملة.
• اختم بـ: SCORE: x/100 — VERDICT: PASS أو FAIL — REASONS: ثلاثة أسباب فقط.
لا مجاملة، ولا تجاوز، ولا «قد» و«ربما». إما مؤكد أو لا.`,
      en: `You are the final QA auditor. A project is handed to you and nobody ships it until it passes your gate. Follow the protocol and emit a structured report:

Phase 1 — Structural integrity: verify full closure (tags/braces/brackets), definition-before-use ordering, no lines lost to an unclosed string, and a complete file from start to finish. Emit a table: [check | PASS/FAIL | evidence].

Phase 2 — Deterministic runtime risks: for every reference — where is it defined, is it reachable on every path, what happens if the element is missing, is any variable read before initialization (TDZ), can any loop fail to terminate, does every Promise have a catch? List each potential defect with line and cause.

Phase 3 — Security: eval/Function? innerHTML with variable content? stored secrets? target=_blank without rel="noopener noreferrer"? selector injection via user input? network calls without timeout? password fields without proper autocomplete?

Phase 4 — Performance and memory: does the render loop allocate (arrays/strings/closures) per frame? any setInterval without clearInterval? any listener added without removal? unbatched DOM writes? double rendering of the same data? Estimate operations per frame.

Phase 5 — Games (if applicable): clamped deltaTime? pause on tab hidden? stuck keys after Alt+Tab? touch controls present and positioned? clean restart clearing all state? pooled objects? guaranteed object caps?

Phase 6 — UI, a11y, RTL: aria-label on every icon button? sufficient contrast? visible focus? correct heading order? digits not breaking direction? Arabic shaping correct?

Then:
• Emit the fix list ordered by severity; each fix carries file/line + cause + ready-to-paste code (never generic advice).
• Emit the fully repaired version.
• Finish with: SCORE: x/100 — VERDICT: PASS or FAIL — REASONS: exactly three.
No flattery, no skipping, no "maybe". Either certain or not.`,
    },
    deliverable: { ar: 'تقرير تدقيق كامل + نسخة مصلحة', en: 'Full audit report + repaired version' },
    gates: [
      { ar: 'كل إصلاح مصحوب بكود جاهز', en: 'Every fix ships with ready code' },
      { ar: 'VERDICT صريح بلا مجاملة', en: 'Blunt verdict, no flattery' },
      { ar: 'النسخة المصلحة تُشغَّل فوراً', en: 'Repaired version runs immediately' },
    ],
  },
  {
    id: 'qa-bug-hunt',
    title: { ar: 'مطاردة البقة: تشخيص خطأ محدد', en: 'Bug Hunt: Targeted Diagnosis' },
    category: 'qa',
    tags: ['debug', 'diagnosis', 'root-cause', 'fix'],
    difficulty: 'hard',
    bestModels: ['gpt-astra', 'deepseek-v4-lite', 'nova-coder-x'],
    minutes: 3,
    body: {
      ar: `هناك خطأ في الكود التالي. لا تجرّب حلولاً عشوائية. نفّذ خطوات التشخيص بالترتيب:

1) أعد صياغة المشكلة بجملة واحدة دقيقة: «يتوقع المستخدم X، ويحدث Y، في الحالة Z».
2) حدّد الفرضيات الممكنة (3–5) ورتّبها بالاحتمال مع سبب مختصر لكل فرضية.
3) لكل فرضية: اذكر دليلاً يمكن التحقق منه من الكود نفسه (سطر/نمط)، واستبعد ما لا دليل عليه.
4) ثبّت السبب الجذري (Root Cause) بدليل قاطع، واذكر لماذا الأسباب الأخرى مستبعدة.
5) اختبار دحض: اكتب الحالة التي لو حدثت لكان تشخيصك خاطئاً — وكيف تميّزها.
6) الإصلاح الجاهز: الكود المعدّل كاملاً (لا مقتطفاً ناقصاً)، مع شرح سطر واحد لكل تغيير.
7) الوقاية: قاعدة أو فحص واحد يمنع تكرار هذا النوع من الأخطاء، واكتبها كتعليق في الكود.
8) اختبار تحقق: 3 حالات اختبار (نجاح، حدّي، فشل متوقع) بأوامر جاهزة.

قواعد صارمة: لا تعد كتابة الكود كاملاً من الصفر إن كان الإصلاح صغيراً. لا تخفِ المشكلة بتعطيل ميزة. لا تستخدم try/catch كتمويه إلا إن كان هناك مسار بديل حقيقي.`,
      en: `There is a bug in the following code. Do not guess. Execute these diagnostic steps in order:

1) Restate the problem in one precise sentence: "the user expects X, Y happens, under condition Z".
2) List 3–5 candidate hypotheses ranked by probability with a one-line rationale each.
3) For each, cite verifiable in-code evidence (line/pattern) and eliminate the unsupported ones.
4) Lock the root cause with conclusive evidence, and state why the other candidates are excluded.
5) Falsification test: describe the condition that would prove your diagnosis wrong, and how you'd tell.
6) Ready fix: the full corrected code (never a partial snippet), one-line rationale per change.
7) Prevention: one rule or check that stops this bug class from recurring, written as a code comment.
8) Verification tests: three cases (success, boundary, expected failure) with ready commands.

Strict rules: do not rewrite everything when the fix is small. Never hide the bug by disabling a feature. Never use try/catch as camouflage unless a real fallback path exists.`,
    },
    deliverable: { ar: 'تشخيص جذري + إصلاح + اختبارات', en: 'Root-cause fix + tests' },
    gates: [
      { ar: 'سبب جذري مؤكد بالدليل لا تخمين', en: 'Evidence-backed root cause, no guessing' },
      { ar: 'إصلاح يبقي كل الميزات عاملة', en: 'Fix keeps every feature working' },
      { ar: 'اختبار دحض مذكور', en: 'Falsification test included' },
    ],
  },
  {
    id: 'qa-perf-boost',
    title: { ar: 'تسريع فوري: من 20 إلى 60 إطاراً', en: 'Perf Boost: 20fps → 60fps' },
    category: 'qa',
    tags: ['performance', 'optimization', 'profiling', '60fps'],
    difficulty: 'hard',
    bestModels: ['deepseek-v4-lite', 'gpt-astra', 'llama-4-scout'],
    minutes: 4,
    body: {
      ar: `مشروعي يعمل ببطء (حوالي 20 إطاراً/ثانية). ارفعه إلى 60 إطاراً ثابتاً دون فقدان أي ميزة أو جمال.

نفّذ خطة الأداء المرتّبة (ولكل خطوة: قبل/بعد بالأرقام المتوقعة):
1) القياس أولاً: أضف عدّاد FPS وقياس زمن كل مرحلة (تحديث، تصادم، رسم) بـ performance.now، وأخرجه في وحدة قياس 60 إطاراً.
2) تخصيص الذاكرة: أزل كل إنشاء كائنات/مصفوفات/سلاسل/دوال داخل حلقة الرسم، واستبدلها بكائنات معاد استخدامها ومصفوفات مُسبقة التخصيص.
3) العمليات المكلفة في DOM: جمّع التحديثات في كتابة واحدة لكل إطار، استخدم transform/opacity بدل خصائص تُسبب إعادة التخطيط، وتفادَ القراءة/الكتابة المتناوبة (layout thrashing).
4) الرسم على Canvas: قلّل تغييرات الحالة (state changes)، جمّع نفس الأنماط، استخدم مسارات Path2D مُخزّنة للأشكال الثابتة، واستبدل الظلال (shadowBlur) بطبقات تدرّجية أرخص.
5) الخوارزميات: استبدل O(n²) بشبكة مكانية (spatial hash) عند تجاوز 50 كائناً، وقلّل حلقة البحث بالتصفية المبكرة (broad phase قبل narrow phase).
6) الشبكة والمهام: انقل أي حساب ثقيل إلى web worker أو وزّعه على إطارات (time slicing)، وقلّل حجم البيانات المنقولة إن كانت البيانات قادمة من الشبكة.
7) الذاكرة: أغلق كل مصدر تسريب (مستمعات، مؤقتات، مراجع لدورات كائنات)، وتحقق بعد 5 دقائق تشغيل من ثبات استهلاك الذاكرة.

المطلوب النهائي: النسخة المحسّنة كاملة + جدول: [التحسين | التوفير المقدّر | الأثر على الميزات]، وأكيد أن كل ميزة وكل تأثير بصري ما زالت تعمل.`,
      en: `My project runs slowly (~20fps). Push it to a locked 60fps without losing a single feature or visual flourish.

Execute this ordered performance plan (each step with before/after numbers):
1) Measure first: add an FPS counter and per-stage timing (update, collision, render) via performance.now, surfaced in a 60-frame rolling unit.
2) Allocations: remove every per-frame object/array/string/closure creation, replacing them with reused objects and preallocated arrays.
3) DOM costs: batch writes once per frame, animate transform/opacity instead of layout-triggering properties, and avoid interleaved read/write (layout thrashing).
4) Canvas drawing: minimize state changes, group identical styles, cache static shapes as Path2D, and replace shadowBlur with cheaper gradient layers.
5) Algorithms: swap O(n²) for a spatial hash beyond 50 objects, and shrink search loops with broad-phase filtering before narrow-phase checks.
6) Scheduling: move heavy computation to a web worker or time-slice it across frames; shrink network payloads where data is fetched.
7) Memory: close every leak (listeners, timers, cyclic references) and confirm stable usage after 5 minutes of play.

Deliver the optimized full version plus a table: [optimization | estimated saving | feature impact], confirming every feature and visual effect still works.`,
    },
    deliverable: { ar: 'نسخة محسّنة بـ60fps بدون فقدان ميزات', en: 'Optimized 60fps build, zero feature loss' },
    gates: [
      { ar: 'قياس قبل/بعد لكل تحسين', en: 'Before/after measurement per optimization' },
      { ar: 'صفر تخصيص داخل حلقة الرسم', en: 'Zero allocations in the render loop' },
      { ar: 'الذاكرة ثابتة بعد 5 دقائق', en: 'Flat memory after 5 minutes' },
    ],
  },
  {
    id: 'qa-security-pass',
    title: { ar: 'تحصين أمني كامل للواجهة', en: 'Full Front-End Security Hardening' },
    category: 'qa',
    tags: ['security', 'xss', 'csp', 'hardening'],
    difficulty: 'hard',
    bestModels: ['mistral-forge', 'nova-coder-x', 'gpt-astra'],
    minutes: 4,
    body: {
      ar: `راجع هذا المشروع أمنياً واجعل الأمان صلباً. لكل بند: الحالة الحالية (خطر/مقبول) + الإصلاح بالكود.

الشيك ليست:
1) XSS: ابحث عن innerHTML/outerHTML/insertAdjacentHTML/document.write/eval/new Function. كل إدراج لمحتوى متغيّر يجب أن يمرّ بـ escapeHtml أو يستخدم textContent/createElement. أضف دالة escapeHtml مركزية إن لم توجد.
2) الرابط الخبيث: أي target="_blank" يأخذ rel="noopener noreferrer"، وأي href قادم من المستخدم يُتحقق من بروتوكوله (javascript: ممنوع).
3) الحقن في المحددات: أي querySelector/getElementById بمعرّف قادم من المستخدم يجب أن يمرّ بـ CSS.escape.
4) التخزين: لا أسرار ولا مفاتيح API في الكود أو localStorage؛ إن وُجد مفتاح في واجهة عامة فنبّه أنه يجب نقله إلى سيرفر وسيط (proxy) وأعطِ مخططاً بسيطاً للتنفيذ.
5) الشبكة: مهلة زمنية لكل fetch (AbortController)، تحقق من شكل الاستجابة قبل استخدامها (schema check بسيط)، وعدم عرض رسائل داخلية للمستخدم.
6) CSP: اقترح سياسة محتوى مناسبة للمشروع (meta tag أو رأس سيرفر) تعطي أقصى تقييد ممكن مع الحفاظ على عمل المشروع — مع شرح كل توجيه.
7) الاعتماد على الخارج: عدّد كل مصدر خارجي (سكربت/خط/صورة/CDN) وقيّم مخاطر سلسلة التوريد، واقترح استبدالات محلية.
8) الحالة والمدخلات: تحقق من كل مدخل قبل الحساب/التخزين، وحدّد حدود قصوى للأطوال والأرقام، واحمِ من الفيض العددي.

المطلوب: قائمة مخاطر مرتّبة (عالية/متوسطة/منخفضة)، ثم الكود المُحصَّن كاملاً، ثم قائمة تحقق نهائية في نهاية الملف كتعليق.`,
      en: `Audit this project for security and make it hard. For each item: current state (risk/acceptable) plus a code fix.

Checklist:
1) XSS: hunt innerHTML/outerHTML/insertAdjacentHTML/document.write/eval/new Function. Every variable insertion must pass escapeHtml or use textContent/createElement. Add a central escapeHtml if missing.
2) Malicious links: anything with target="_blank" gets rel="noopener noreferrer"; user-supplied hrefs are protocol-checked (javascript: forbidden).
3) Selector injection: any querySelector/getElementById using user input must pass through CSS.escape.
4) Storage: no secrets or API keys in code or localStorage; if a key sits in a public UI, flag that it must move behind a proxy and sketch that proxy.
5) Network: a timeout on every fetch (AbortController), response shape validated before use (lightweight schema check), and no internal messages shown to users.
6) CSP: propose a content security policy for the project (meta tag or server header) that is as strict as possible while keeping it functional — explaining each directive.
7) External dependencies: enumerate every outside source (script/font/image/CDN), assess supply-chain risk, and propose local replacements.
8) State and input: validate every input before computing or storing, enforce max lengths and numeric bounds, and guard numeric overflow.

Deliver a risk list ranked high/medium/low, the fully hardened code, and a final checklist comment at the end of the file.`,
    },
    deliverable: { ar: 'مشروع محصّن + سياسة CSP', en: 'Hardened project + CSP policy' },
    gates: [
      { ar: 'صفر مداخل innerHTML غير آمنة', en: 'Zero unsafe innerHTML paths' },
      { ar: 'مهلة على كل نداء شبكة', en: 'Timeout on every network call' },
      { ar: 'CSP لا يكسر المشروع', en: 'CSP does not break the app' },
    ],
  },

  /* ============================ تصميم ومحتوى ============================ */
  {
    id: 'design-identity-kit',
    title: { ar: 'هوية بصرية كاملة لمشروعك', en: 'Complete Brand Identity Kit' },
    category: 'design',
    tags: ['branding', 'colors', 'typography', 'system'],
    difficulty: 'medium',
    bestModels: ['gemini-ultra-lite', 'glm-5-air', 'grok-4-mini'],
    minutes: 5,
    body: {
      ar: `صمّم هوية بصرية كاملة لمشروعي وأخرجها كصفحة HTML واحدة تُعرض فيها كل عناصر النظام (بلا صور خارجية).

الفكرة: [اكتب وصف مشروعك هنا في سطرين].

المطلوب:
• الاسم والشعار: 3 مقترحات لشعار نصي (wordmark) مرسومة بـ SVG وكأنها خط، مع نسخة أحادية اللون ونسخة معكوسة، وقواعد المسافة الآمنة (clear space) والحد الأدنى للحجم.
• الألوان: لوحة أساسية (لون أساسي + ثانوي + لون تمييز)، سلّم رمادي 9 درجات، ألوان حالات (نجاح/تحذير/خطأ/معلومة)، وقيم HEX وRGB وOKLCH لكل لون، مع تباين محسوب مقابل الأسود والأبيض ونتيجة WCAG (AA/AAA) لكل توليفة تُستخدم للنصوص.
• الخطوط: تدرّج طباعي عربي (6 مستويات) بأحجام وارتفاعات أسطر ووزن موصى به، وقواعد للتشكيل والأرقام العربية واللاتينية.
• مكونات: أزرار (5 حالات)، حقول إدخال (4 حالات)، بطاقة، شارة، تنبيه، شريط تنقّل، تبويبات — كلها مُعروضة حيّة في الصفحة بكود حقيقي قابل للنسخ.
• الرموز والمسافات: سلّم مسافات (4→64)، زوايا (4 أحجام)، ظلال (4 مستويات)، وأيقونات أساسية (12 أيقونة SVG بنفس سماكة الخط).
• قواعد الاستخدام: ما يجب وما لا يجوز (Do/Don't) بـ6 أمثلة بصرية سريعة، وقواعد RTL، وقواعد الوضع الليلي.
• أخرج كل الألوان والمسافات كمتغيرات CSS جاهزة للنسخ، واحفظ كل الصفحة في ملف واحد يمكن طبعه كدليل هوية PDF.
اختم بـ TOKENS: عدد المتغيرات المُصدَّرة وثلاث ملاحظات على التباين.`,
      en: `Design a complete brand identity for my project and output it as one HTML page showing the whole system (no external images).

The idea: [describe your project in two lines here].

Requirements:
• Name and logo: 3 wordmark directions drawn as SVG lettering, each with a monochrome and an inverted version, plus clear-space rules and minimum sizes.
• Color: a core palette (primary, secondary, accent), a 9-step neutral scale, semantic states (success/warning/error/info), with HEX, RGB, and OKLCH values, computed contrast against black and white, and a WCAG result (AA/AAA) for every text combination.
• Type: an Arabic type ramp (6 levels) with sizes, line heights, and recommended weights, plus rules for diacritics and Arabic/Latin numerals.
• Components: buttons (5 states), inputs (4 states), card, badge, alert, navbar, tabs — all rendered live on the page as real copyable code.
• Scale and tokens: a spacing scale (4→64), radii (4 steps), shadows (4 levels), and 12 base SVG icons drawn at one consistent stroke weight.
• Usage rules: six quick Do/Don't examples, RTL rules, and dark-mode rules.
• Export all colors and spacing as copy-ready CSS variables, and keep the whole page in one file printable as a PDF brand guide.
End with TOKENS: the number of exported variables and three contrast notes.`,
    },
    deliverable: { ar: 'دليل هوية كامل يُطبع كـ PDF', en: 'Full brand guide, printable as PDF' },
    gates: [
      { ar: 'كل توليفة نصية تجتاز WCAG AA', en: 'Every text pairing passes WCAG AA' },
      { ar: 'الرموز بأسلوب خط واحد موحّد', en: 'Icons share one stroke style' },
      { ar: 'المتغيرات جاهزة للنسخ', en: 'Tokens are copy-ready' },
    ],
  },
  {
    id: 'design-game-jam',
    title: { ar: 'تحدي الجيم جام: لعبة في 30 ثانية شرح', en: 'Game Jam: Build From a One-Line Pitch' },
    category: 'game',
    tags: ['game-jam', 'creativity', 'prototype', 'fast'],
    difficulty: 'medium',
    bestModels: ['grok-4-mini', 'gpt-astra', 'llama-4-scout'],
    minutes: 3,
    body: {
      ar: `تحدي: حوّل هذه الفكرة الغامضة إلى لعبة كاملة قابلة للعب في ملف واحد.
الفكرة: «[ضع فكرتك هنا — مثال: أنت ريح تحاول إسقاط أوراق شجرة]».

قواعد التحدي:
1) ابدأ بـ5 أسطر تصميم: الهدف، اللاعب، اللبنة الأساسية للمتعة، شرط الفوز/الخسارة، الخطاف الفريد.
2) ميكانيكية واحدة فقط، لكنها مُتقَنة إلى أقصى حد — لا تعقيد مفتعل.
3) أضف طبقتين من التصاعد: المواقف تزيد صعوبة، والأدوات تزيد قدرة.
4) جلسة لعب 2–5 دقائق، مع إعادة محاولة فورية بضغطة واحدة (بلا شاشات تحميل).
5) إحساس: 3 مؤثرات بصرية على الأقل (اهتزاز، جزيئات، وميض) و3 مؤثرات صوتية مُولَّدة.
6) الحالة كاملة: بداية، لعب، إيقاف، فوز، خسارة — كلها موجودة وتُختبر ذهنياً قبل التسليم.
7) ممنوعات صارمة: لا مكتبات، لا صور، لا TODO، لا ميزة نصف منفّذة، لا شاشة فارغة.
8) لوحة صدارة محلية لأفضل 5 نتائج بأحرف أولى من اسم اللاعب (3 أحرف) محفوظة في localStorage.

المطلوب: اللعبة كاملة في ملف واحد + سطر DELIVERY + سطر RISKS يجيب عن «ما الذي قد ينكسر أولاً؟».`,
      en: `Challenge: turn this vague pitch into a complete playable game in one file.
Pitch: "[put your idea here — e.g., you are the wind trying to knock leaves off a tree]".

Challenge rules:
1) Open with a 5-line design: goal, player, core fun loop, win/lose condition, unique hook.
2) Exactly one mechanic, polished to its limit — no artificial complexity.
3) Two escalation layers: situations get harder, tools get stronger.
4) A 2–5 minute session with one-tap instant retry (no loading screens).
5) Feel: at least 3 visual effects (shake, particles, flash) and 3 synthesized audio cues.
6) Complete states: start, play, pause, win, lose — present and mentally tested before delivery.
7) Hard bans: no libraries, no images, no TODOs, no half-built features, no blank screens.
8) A local leaderboard of the top 5 runs with 3-letter name initials, persisted in localStorage.

Deliver the full game in one file + a DELIVERY line + a RISKS line answering "what breaks first?".`,
    },
    deliverable: { ar: 'لعبة كاملة من فكرة من سطر واحد', en: 'Complete game from a one-line pitch' },
    gates: [
      { ar: 'كل حالات اللعب موجودة وتعمل', en: 'All game states exist and work' },
      { ar: 'إعادة محاولة فورية بضغطة', en: 'One-press instant retry' },
      { ar: 'صفر TODO وصفر ميزة معلّقة', en: 'Zero TODOs, zero stubs' },
    ],
  },
  {
    id: 'growth-seo-launch',
    title: { ar: 'خطة إطلاق وSEO كاملة', en: 'Full Launch and SEO Plan' },
    category: 'growth',
    tags: ['seo', 'launch', 'growth', 'checklist'],
    difficulty: 'medium',
    bestModels: ['gemini-ultra-lite', 'glm-5-air', 'grok-4-mini'],
    minutes: 4,
    body: {
      ar: `ضع خطة إطلاق كاملة لمشروعي (موقع/لعبة) قبل النشر وبعده، بشكل قابل للتنفيذ لا نظري.

المطلوب:
1) الأساسيات التقنية: قائمة تحقق SEO تقنية (title/description/OG/JSON-LD/canonical/robots/sitemap/lang/سرعة/الجوال) مع أمثلة كود جاهزة لمشروعي.
2) الكلمات المفتاحية: 20 كلمة بالعربية و10 بالإنجليزية مقسّمة (نية معلوماتية/تجارية/تنقّلية)، مع عمود «الصعوبة المتوقعة» و«المكان المناسب» (عنوان/محتوى/وصف).
3) محتوى: 8 أفكار مقالات/صفحات لكل واحدة: العنوان المقترح، الكلمة المستهدفة، الفكرة في سطرين، وبنية H2/H3 المختصرة.
4) ما قبل الإطلاق (T-minus): جدول زمني 7 أيام بأعمال يومية محددة (أعمال محتوى، فحص تقني، تحضير منشورات، اختبار أجهزة).
5) يوم الإطلاق: قائمة 12 إجراءً مرتبة زمنياً بالساعات، مع نصوص جاهزة لمنشورات التواصل الاجتماعي (منصة لكل نص) ونص بريد إشعار.
6) ما بعد الإطلاق: 14 يوماً من المهام (قياس، تحسين، ردود، تحديث محتوى)، ومؤشرات للمتابعة (زوار، معدل تفاعل، عمق تمرير، مصدر الزيارات) مع الحد الأدنى المقبول لكل مؤشر.
7) الألعاب تحديداً: كيف تُنشر على منصات الألعاب المجانية (itch.io، Newgrounds، CrazyGames) بمتطلبات كل منصة ولافتة ووصف جاهز ولقطات شاشة مطلوبة.
8) صفحة هبوط مصغّرة جاهزة (HTML واحد) تجمع النقاط الأساسية.

المطلوب النهائي: مستند منظم بجداول حقيقية (بلا Markdown ثقيل) + صفحة الهبوط ككود منفصل.`,
      en: `Build a complete pre- and post-launch plan for my project (site/game) — actionable, not theoretical.

Requirements:
1) Technical basics: a technical SEO checklist (title/description/OG/JSON-LD/canonical/robots/sitemap/lang/speed/mobile) with ready code examples for my project.
2) Keywords: 20 Arabic and 10 English keywords split by intent (informational/commercial/navigational), with expected difficulty and best placement (title/body/meta).
3) Content: 8 article/page ideas, each with a proposed headline, target keyword, a two-line angle, and a short H2/H3 outline.
4) Pre-launch (T-minus): a 7-day schedule with concrete daily tasks (content, technical checks, post drafts, device testing).
5) Launch day: 12 actions ordered by hour, with ready-to-paste social copy per platform and an announcement email.
6) Post-launch: 14 days of tasks (measure, improve, reply, refresh content) and metrics to watch (visitors, engagement rate, scroll depth, traffic source) each with a minimum acceptable value.
7) Games specifically: how to publish on free game portals (itch.io, Newgrounds, CrazyGames) with each platform's requirements, a ready banner and description, and the screenshots needed.
8) A compact ready landing page (single HTML) collecting the essentials.

Final output: an organized document with real tables plus the landing page as separate code.`,
    },
    deliverable: { ar: 'خطة إطلاق بجداول + صفحة هبوط', en: 'Launch plan with tables + landing page' },
    gates: [
      { ar: 'كل بند قابل للتنفيذ اليوم', en: 'Every item is actionable today' },
      { ar: 'جداول حقيقية لا كلام عام', en: 'Real tables, no fluff' },
      { ar: 'نصوص جاهزة للنسخ', en: 'Copy-ready texts' },
    ],
  },
];

export const PROMPT_CATEGORIES: { id: PromptItem['category']; label: { ar: string; en: string }; icon: string; color: string }[] = [
  { id: 'game', label: { ar: 'ألعاب', en: 'Games' }, icon: 'gamepad', color: '#a855f7' },
  { id: 'web', label: { ar: 'مواقع', en: 'Websites' }, icon: 'globe', color: '#327dff' },
  { id: 'app', label: { ar: 'تطبيقات', en: 'Apps' }, icon: 'apps', color: '#14b8a6' },
  { id: 'ai', label: { ar: 'ذكاء اصطناعي', en: 'AI' }, icon: 'brain', color: '#22c55e' },
  { id: 'qa', label: { ar: 'فحص وجودة', en: 'QA' }, icon: 'shield', color: '#f43f5e' },
  { id: 'design', label: { ar: 'تصميم', en: 'Design' }, icon: 'palette', color: '#eab308' },
  { id: 'growth', label: { ar: 'نمو وإطلاق', en: 'Growth' }, icon: 'rocket', color: '#f97316' },
];

export const PROMPT_BY_ID: Record<string, PromptItem> = PROMPTS.reduce<Record<string, PromptItem>>((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {});
