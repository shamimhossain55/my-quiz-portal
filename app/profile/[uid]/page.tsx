"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs,
} from "firebase/firestore";

// ✅ ব্যাজ টিয়ার — স্কোর অনুযায়ী, পরবর্তী ব্যাজের জন্য কত পয়েন্ট লাগবে সেটাও বের করা যাবে
const BADGE_TIERS = [
  { min: 500, label: "🏆 চ্যাম্পিয়ন", color: "from-amber-400 to-orange-500", chip: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" },
  { min: 250, label: "⭐ মেধাবী", color: "from-blue-400 to-indigo-500", chip: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" },
  { min: 50, label: "✅ ভালো অগ্রগতি", color: "from-emerald-400 to-teal-500", chip: "bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300" },
  { min: 0, label: "📚 যাত্রা শুরু", color: "from-slate-400 to-slate-500", chip: "bg-gray-50 text-gray-500 dark:bg-gray-400/10 dark:text-gray-300" },
];

function getBadgeInfo(score: number) {
  const currentIdx = BADGE_TIERS.findIndex((t) => score >= t.min);
  const current = BADGE_TIERS[currentIdx];
  const next = currentIdx > 0 ? BADGE_TIERS[currentIdx - 1] : null;
  const progress = next ? Math.min(100, Math.round(((score - current.min) / (next.min - current.min)) * 100)) : 100;
  return { current, next, progress };
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const uid = params?.uid as string;

  const [profile, setProfile] = useState<any>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [totalQuestionsSum, setTotalQuestionsSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!uid) return;
      try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = userDoc.data() as any;
        // ✅ যে ইউজার নিজেকে লিডারবোর্ড থেকে লুকিয়ে রেখেছেন, তার প্রোফাইলও সরাসরি লিংকে দেখানো হবে না
        if (data.hiddenFromLeaderboard) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setProfile({ id: userDoc.id, ...data });

        // ✅ র‍্যাঙ্ক বের করা — total_score অনুযায়ী টপ ১০০ এর মধ্যে অবস্থান
        const lbQ = query(collection(db, "users"), orderBy("total_score", "desc"), limit(100));
        const lbSnap = await getDocs(lbQ);
        const board = lbSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((u) => !u.hiddenFromLeaderboard);
        const idx = board.findIndex((u) => u.id === uid);
        setRank(idx >= 0 ? idx + 1 : null);

        // ✅ ইউজারের সব পরীক্ষার attempt
        const attemptsQ = query(collection(db, "user_attempts"), where("uid", "==", uid));
        const attemptsSnap = await getDocs(attemptsQ);
        const myAttempts = attemptsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setAttempts(myAttempts);
        setTotalQuestionsSum(myAttempts.reduce((sum, a) => sum + (a.total || 0), 0));

        // ✅ সাম্প্রতিক পরীক্ষার নাম দেখানোর জন্য subjects ফেচ করা (examId -> name ম্যাপ)
        const subjSnap = await getDocs(collection(db, "subjects"));
        const map: Record<string, string> = {};
        subjSnap.docs.forEach((d) => {
          const s = d.data() as any;
          map[s.examId || d.id] = s.name || "নামহীন বিষয়";
        });
        setSubjectNames(map);
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [uid]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-emerald-200 dark:border-emerald-900 border-t-emerald-600 dark:border-t-emerald-400 animate-spin" />
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500">প্রোফাইল লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <span className="text-5xl">🙈</span>
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">এই প্রোফাইলটি খুঁজে পাওয়া যায়নি</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition"
        >
          ← ফিরে যান
        </button>
      </div>
    );
  }

  const score = profile.total_score || 0;
  const { current: badge, next: nextBadge, progress } = getBadgeInfo(score);
  const accuracy = totalQuestionsSum > 0 ? Math.round((score / totalQuestionsSum) * 100) : 0;
  const totalAttempts = attempts.length;

  // ✅ সাম্প্রতিক পরীক্ষাগুলো — যদি timestamp/createdAt ফিল্ড থাকে সেটা দিয়ে সাজানো, না থাকলে যেমন আছে তেমন
  const sortedAttempts = [...attempts].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || a.timestamp?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || b.timestamp?.toMillis?.() || 0;
    return tb - ta;
  });
  const recentAttempts = sortedAttempts.slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      {/* ✅ হিরো ব্যানার */}
      <div className={`relative bg-gradient-to-br ${badge.color} pt-8 pb-20 sm:pt-10 sm:pb-24 px-4 overflow-hidden`}>
        <div className="pointer-events-none absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-black/10 blur-3xl" />

        <div className="relative max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-6 text-sm font-bold text-white/90 hover:text-white transition flex items-center gap-1"
          >
            ← ফিরে যান
          </button>

          <div className="flex flex-col items-center text-center gap-3">
            <div className="relative">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.name || "প্রোফাইল ছবি"}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover ring-4 ring-white/70 shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-3xl font-extrabold text-white ring-4 ring-white/70 shadow-lg">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : "?"}
                </div>
              )}
              {rank && rank <= 3 && (
                <span className="absolute -top-2 -right-2 text-2xl drop-shadow">
                  {rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉"}
                </span>
              )}
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white drop-shadow">
                {profile.name || "অজানা শিক্ষার্থী"}
              </h1>
              <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full bg-white/20 backdrop-blur text-white">
                {badge.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ স্ট্যাট কার্ডসমূহ — ব্যানারের উপরে ভাসমান */}
      <div className="relative max-w-2xl mx-auto px-4 -mt-12 sm:-mt-14">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 text-center shadow-sm">
            <p className="text-lg sm:text-2xl font-extrabold text-slate-800 dark:text-white">{rank ? `#${rank}` : "—"}</p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">র‍্যাঙ্ক</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 text-center shadow-sm">
            <p className="text-lg sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{score}</p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">মোট স্কোর</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 text-center shadow-sm">
            <p className="text-lg sm:text-2xl font-extrabold text-slate-800 dark:text-white">{totalAttempts}</p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">পরীক্ষা দিয়েছেন</p>
          </div>
        </div>

        {/* ✅ অ্যাকুরেসি + পরবর্তী ব্যাজে যেতে অগ্রগতি */}
        <div className="mt-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">🎯 গড় সঠিক হার</p>
            <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{accuracy}%</p>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
              style={{ width: `${Math.min(accuracy, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {nextBadge ? `পরবর্তী ব্যাজ: ${nextBadge.label}` : "🎉 সর্বোচ্চ ব্যাজ অর্জিত!"}
            </p>
            {nextBadge && (
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">আর {Math.max(nextBadge.min - score, 0)} pts</p>
            )}
          </div>
          {nextBadge && (
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${badge.color} rounded-full transition-all`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* ✅ সাম্প্রতিক পরীক্ষা */}
        <div className="mt-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-lg">📝</span>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">সাম্প্রতিক পরীক্ষা</h3>
          </div>
          {recentAttempts.length > 0 ? (
            <div className="space-y-2">
              {recentAttempts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                >
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                    {subjectNames[a.examId] || "নামহীন পরীক্ষা"}
                  </p>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 shrink-0">
                    {typeof a.score === "number" ? `${a.score}/${a.total || "?"}` : `${a.total || "?"} প্রশ্ন`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">এখনো কোনো পরীক্ষা দেওয়া হয়নি</p>
          )}
        </div>
      </div>
    </div>
  );
}