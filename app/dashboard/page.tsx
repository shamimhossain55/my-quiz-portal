"use client";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc, getDoc, collection, query, orderBy, limit,
  getDocs, updateDoc, setDoc
} from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const [myRank, setMyRank] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

  // ✅ আসন্ন পরীক্ষার তারিখ (এখান থেকে পরিবর্তন করুন)
  const nextExamDate = new Date("2026-06-28T10:00:00");

  const upcomingExams = [
    { id: 1, name: "Business Mathematics", date: "২৫ জুন, ২০২৬" },
    { id: 2, name: "Principles of Finance", date: "২৮ জুন, ২০২৬" },
  ];

  // ✅ থিম লোড ও সেট করা (dark/light)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const initial = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  // ✅ Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const diff = nextExamDate.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown("পরীক্ষা শুরু হয়েছে!");
        clearInterval(timer);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${days}দিন ${hours}ঘণ্টা ${minutes}মিনিট ${seconds}সেকেন্ড`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ✅ Badge নির্ধারণ
  const getBadge = (score: number, total: number) => {
    if (total === 0) return null;
    const pct = (score / total) * 100;
    if (pct >= 90) return { label: "🏆 চ্যাম্পিয়ন", color: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" };
    if (pct >= 75) return { label: "⭐ মেধাবী", color: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" };
    if (pct >= 50) return { label: "✅ উত্তীর্ণ", color: "bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300" };
    return { label: "📚 চেষ্টা করুন", color: "bg-gray-50 text-gray-500 dark:bg-gray-400/10 dark:text-gray-300" };
  };

  const fetchData = async (currentUser: any) => {
    if (!currentUser?.uid) return;
    try {
      // ইউজার ডেটা
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        setNewName(data.name || "");
        setPhotoPreview(data.photoURL || null);
      }

      // লিডারবোর্ড + নিজের rank
      const q = query(collection(db, "users"), orderBy("total_score", "desc"), limit(10));
      const snap = await getDocs(q);
      const board = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLeaderboard(board);
      const rankIdx = board.findIndex(b => b.id === currentUser.uid);
      setMyRank(rankIdx >= 0 ? rankIdx + 1 : null);

      // পরীক্ষার ইতিহাস
      const attemptsQ = query(
        collection(db, "user_attempts"),
        orderBy("timestamp", "desc"),
        limit(10)
      );
      const attemptsSnap = await getDocs(attemptsQ);
      const allAttempts = attemptsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((a: any) => a.uid === currentUser.uid);
      setAttemptHistory(allAttempts);

      // বর্তমান পরীক্ষার status
      const configSnap = await getDoc(doc(db, "settings", "exam_config"));
      const currentExamId = configSnap.data()?.current_exam_id || "default_exam";
      const attemptSnap = await getDoc(
        doc(db, "user_attempts", `${currentUser.uid}_${currentExamId}`)
      );
      setHasAttempted(attemptSnap.exists());

      // নোটিশ
      const noticeSnap = await getDoc(doc(db, "settings", "notice"));
      if (noticeSnap.exists()) setNotice(noticeSnap.data()?.text || null);

    } catch (error) {
      console.error("Data fetching error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser?.uid) {
        setUser(currentUser);
        await fetchData(currentUser);
      } else {
        router.push("/");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // ✅ ছবি সিলেক্ট করলে base64 এ কনভার্ট করা
  const MAX_PHOTO_BYTES = 1024 * 1024; // ~1MB মূল ফাইল সাইজ লিমিট

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("দয়া করে একটি ছবি ফাইল নির্বাচন করুন।");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      alert("ছবির সাইজ ১ MB এর কম হতে হবে।");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.onerror = () => alert("ছবি লোড করতে সমস্যা হয়েছে।");
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdating(true);
    try {
      const payload: Record<string, any> = { name: newName };
      if (photoPreview) payload.photoURL = photoPreview;
      await updateDoc(doc(db, "users", user.uid), payload);
      await fetchData(user);
      setIsModalOpen(false);
    } catch { alert("আপডেট ব্যর্থ হয়েছে।"); }
    finally { setIsUpdating(false); }
  };

  const handleLogout = async () => { await signOut(auth); router.push("/"); };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-500 dark:text-gray-400 font-bold">লোড হচ্ছে...</p>
      </div>
    </div>
  );

  const totalExams = attemptHistory.length;
  const totalCorrect = userData?.total_score || 0;
  const avgScore = totalExams > 0 ? Math.round((totalCorrect / (totalExams * 10)) * 100) : 0;
  const badge = getBadge(totalCorrect, totalExams * 10);

  const AvatarOrInitial = ({ size = "w-14 h-14", textSize = "text-xl" }: { size?: string; textSize?: string }) =>
    userData?.photoURL ? (
      <img
        src={userData.photoURL}
        alt="প্রোফাইল ছবি"
        className={`${size} rounded-full object-cover`}
      />
    ) : (
      <div className={`${size} rounded-full bg-blue-500 flex items-center justify-center ${textSize} font-bold text-white`}>
        {userData?.name ? userData.name.charAt(0).toUpperCase() : "U"}
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 pb-16 transition-colors duration-300">

      {/* ✅ Navbar */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">কুইজ পোর্টাল</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* ✅ ডার্ক/লাইট থিম টগল বাটন */}
          <button
            onClick={toggleTheme}
            aria-label="থিম পরিবর্তন করুন"
            className="relative w-12 h-7 rounded-full bg-gray-100 dark:bg-gray-800 transition-colors duration-200 flex items-center px-0.5 border border-gray-200 dark:border-gray-700"
          >
            <span
              className={`w-5 h-5 rounded-full bg-white dark:bg-gray-950 flex items-center justify-center text-[10px] transition-transform duration-200 ${
                theme === "dark" ? "translate-x-5" : "translate-x-0"
              }`}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-sm font-medium text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center gap-2"
          >
            <AvatarOrInitial size="w-7 h-7" textSize="text-xs" />
            প্রোফাইল
          </button>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-gray-500 dark:text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500 dark:hover:text-red-400 transition"
          >
            লগআউট
          </button>
        </div>
      </nav>

      {/* ✅ Notice Board */}
      {notice && (
        <div className="bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900 px-6 py-3 flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">📢 নোটিশ:</span>
          <p className="text-amber-700 dark:text-amber-300 text-sm">{notice}</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 mt-8 space-y-6">

        {/* ✅ সারি ১: প্রোফাইল কার্ড */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AvatarOrInitial />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                    স্বাগতম, {userData?.name || "শিক্ষার্থী"}! 👋
                  </h2>
                  {badge && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{user?.email}</p>
                {myRank && (
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                    🏅 লিডারবোর্ডে আপনার অবস্থান: #{myRank}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* স্ট্যাট কার্ড */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalCorrect}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">মোট স্কোর</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-3xl font-bold text-gray-700 dark:text-gray-200">{totalExams}টি</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">পরীক্ষা দিয়েছেন</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-3xl font-bold text-gray-700 dark:text-gray-200">{avgScore}%</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">গড় সঠিক হার</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-3xl font-bold text-gray-700 dark:text-gray-200">#{myRank || "—"}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">লিডারবোর্ড rank</p>
            </div>
          </div>
        </div>

        {/* ✅ সারি ২: Countdown + Quiz বাটন */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Countdown Timer */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">⏱️</span>
              <h3 className="font-bold text-gray-800 dark:text-gray-100">পরবর্তী পরীক্ষার কাউন্টডাউন</h3>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Principles of Finance</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono">{countdown || "গণনা হচ্ছে..."}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">২৮ জুন, ২০২৬ · সকাল ১০টা</p>
            </div>
          </div>

          {/* Quiz শুরু করুন */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🚀</span>
                <h3 className="font-bold text-gray-800 dark:text-gray-100">আজকের কুইজ</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {hasAttempted
                  ? "আপনি ইতিমধ্যে আজকের পরীক্ষা দিয়েছেন। পরবর্তী পরীক্ষার জন্য অপেক্ষা করুন।"
                  : "আজকের কুইজে অংশ নিয়ে আপনার মেধা যাচাই করুন এবং লিডারবোর্ডে উপরে উঠুন!"}
              </p>
            </div>
            <button
              onClick={() => router.push("/quiz")}
              disabled={hasAttempted}
              className={`mt-4 w-full py-3 rounded-xl font-bold text-white transition ${
                hasAttempted
                  ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 active:scale-95"
              }`}
            >
              {hasAttempted ? "পরীক্ষা দেওয়া সম্পন্ন ✅" : "কুইজ শুরু করুন →"}
            </button>
          </div>
        </div>

        {/* ✅ সারি ৩: পরীক্ষার ইতিহাস + লিডারবোর্ড */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* পরীক্ষার ইতিহাস */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xl">📋</span>
              <h3 className="font-bold text-gray-800 dark:text-gray-100">পরীক্ষার ইতিহাস</h3>
            </div>
            {attemptHistory.length > 0 ? (
              <div className="space-y-3">
                {attemptHistory.map((attempt: any, idx) => {
                  const pct = attempt.total
                    ? Math.round((attempt.score / attempt.total) * 100)
                    : null;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        pct === null ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                        : pct >= 70 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300"
                      }`}>
                        {attempt.score}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{attempt.examId || "পরীক্ষা"}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {attempt.timestamp?.toDate
                            ? attempt.timestamp.toDate().toLocaleDateString("bn-BD")
                            : ""}
                        </p>
                      </div>
                      {pct !== null && (
                        <div className="text-right">
                          <p className={`text-sm font-bold ${pct >= 70 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                            {pct}%
                          </p>
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1">
                            <div
                              className={`h-1.5 rounded-full ${pct >= 70 ? "bg-green-500" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm">এখনো কোনো পরীক্ষা দেননি</p>
              </div>
            )}
          </div>

          {/* লিডারবোর্ড */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xl">🏆</span>
              <h3 className="font-bold text-gray-800 dark:text-gray-100">লিডারবোর্ড</h3>
            </div>
            <div className="space-y-2">
              {leaderboard.length > 0 ? leaderboard.map((leader, index) => {
                const rankIcons = ["🥇", "🥈", "🥉"];
                const isMe = leader.id === user?.uid;
                return (
                  <div
                    key={leader.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      isMe
                        ? "bg-blue-50/60 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900"
                        : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <span className="text-lg w-7 text-center">
                      {index < 3 ? rankIcons[index] : <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{index + 1}</span>}
                    </span>
                    {leader.photoURL ? (
                      <img src={leader.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isMe ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-100" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}>
                        {leader.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${isMe ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-200"}`}>
                        {leader.name || "অজানা"}
                        {isMe && <span className="ml-1 text-xs">(আমি)</span>}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      isMe ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700"
                    }`}>
                      {leader.total_score || 0} pts
                    </span>
                  </div>
                );
              }) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">কোনো ডেটা নেই</p>
              )}
            </div>
          </div>
        </div>

        {/* ✅ সারি ৪: আসন্ন পরীক্ষা */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xl">📅</span>
            <h3 className="font-bold text-gray-800 dark:text-gray-100">আসন্ন পরীক্ষা</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upcomingExams.map((exam) => (
              <div key={exam.id} className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-500 dark:text-blue-300 font-bold text-sm">
                    {exam.id}
                  </div>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{exam.name}</p>
                </div>
                <span className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full">
                  {exam.date}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ✅ প্রোফাইল এডিট Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">⚙️ প্রোফাইল আপডেট</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
            </div>
            <form onSubmit={handleUpdateProfile} className="space-y-4">

              {/* ✅ প্রোফাইল ছবি আপলোড (base64) */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="প্রোফাইল প্রিভিউ"
                      className="w-24 h-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold text-white">
                      {newName ? newName.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center text-sm"
                    aria-label="ছবি পরিবর্তন করুন"
                  >
                    📷
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">ছবি পরিবর্তন করতে ক্যামেরা আইকনে ক্লিক করুন (সর্বোচ্চ ১MB)</p>
              </div>

              <div>
                <label className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-1 block">নতুন নাম</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 p-3 text-sm focus:outline-none focus:border-blue-400 dark:focus:border-blue-500"
                  placeholder="আপনার নাম লিখুন"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-1/2 rounded-xl bg-blue-500 hover:bg-blue-600 py-3 text-sm font-bold text-white transition disabled:opacity-60"
                >
                  {isUpdating ? "সেভ হচ্ছে..." : "সেভ করুন ✓"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}