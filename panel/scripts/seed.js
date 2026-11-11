/* FT AI — تعبئة بيانات للتجربة (مستخدمون، إحالات، أسئلة) */
import { updateState, uid } from "../lib/core.js";

const names = ["أمين بوزيد", "سارة قاسمي", "ياسين مرابط", "نور الهدى", "رياض بلقاسم", "إيمان حمادي", "كريم زروقي", "ليلى عثماني", "سفيان عيساوي", "هبة بن عمر", "وليد شريف", "مروان قادري"];

const s = await updateState((st) => {
  st.users = {};
  st.referrals = [];
  names.forEach((name, i) => {
    const id = String(100000000 + i * 1111);
    st.users[id] = {
      id, name, username: `user_${i + 1}`, lang: "ar",
      points: (i * 37) % 260, referrals: i % 5, referred_by: i > 2 ? String(100000000) : null,
      ref_code: uid(3), joined_at: Date.now() - i * 86400000, last_seen: Date.now() - i * 3600000,
      blocked: i === 7, risk: i === 9 ? 55 : 0, flagged: i === 9, quiz_total: i * 3, quiz_correct: i * 2,
      streak: i % 4, avatar_url: null,
    };
  });
  for (let i = 3; i < names.length; i++) {
    st.referrals.push({
      id: st.referrals.length + 1,
      new_user_id: String(100000000 + i * 1111),
      referrer_id: "100000000",
      at: Date.now() - i * 7200000,
      status: i === 9 ? "flagged" : i === 5 ? "pending" : "confirmed",
      suspicious: i === 9,
      same_ip: i === 9,
      points_awarded: i === 9 ? 0 : 50,
    });
  }
  st.questions = [
    { id: "q1", text: "ما هي عاصمة الجزائر؟", options: ["وهران", "الجزائر", "قسنطينة", "عنابة"], correct: 1, category: "جغرافيا", at: Date.now() },
    { id: "q2", text: "كم عدد أيام السنة الميلادية؟", options: ["355", "360", "365", "370"], correct: 2, category: "عام", at: Date.now() },
    { id: "q3", text: "من كتب رواية «الأسود يليق بك»؟", options: ["أحلام مستغانمي", "مالك حداد", "الطاهر وطار", "محمد ديب"], correct: 0, category: "أدب", at: Date.now() },
  ];
  st.metrics = { visits: 128, answers: 342, correct: 231, broadcasts: 3 };
  return st;
});
console.log("تمّت التعبئة:", Object.keys(s.users).length, "عضو،", s.referrals.length, "إحالة،", s.questions.length, "سؤال");
