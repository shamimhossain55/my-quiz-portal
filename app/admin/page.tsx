"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, getDocs, doc, writeBatch, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, limit
} from "firebase/firestore";

const ADMIN_EMAIL = "shamimhossain.demo1@gmail.com";

type Question = { id: string; q: string; a: string; b: string; c: string; d: string; correct: string };
type UserAttempt = { uid: string; displayName?: string; email?: string; score: number; timestamp: any };
type AppUser = { id: string; name?: string; email?: string; total_score?: number; photoURL?: string };
type ExamConfig = {
  current_exam_id: string;
  exam_active: boolean;
  timer_seconds: number;
  multiple_attempts: boolean;
  show_leaderboard: boolean;
};

type Tab = "dashboard" | "questions" | "leaderboard" | "users" | "settings";

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Data states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<UserAttempt[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [noticeText, setNoticeText] = useState("");
  const [examConfig, setExamConfig] = useState<ExamConfig>({
    current_exam_id: "default_exam",
    exam_active: true,
    timer_seconds: 30,
    multiple_attempts: false,
    show_leaderboard: true,
  });

  // UI states
  const [newJson, setNewJson] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSavingNotice, setIsSavingNotice] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ✅ থিম লোড ও সেট করা (dark/light) — ড্যাশবোর্ডের সাথে সামঞ্জস্য রেখে
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) {
        setIsAdmin(true);
        fetchAll();
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchAll = async () => {
    await Promise.all([fetchQuestions(), fetchAttempts(), fetchExamConfig(), fetchUsers(), fetchNotice()]);
  };

  const fetchQuestions = async () => {
    try {
      const snap = await getDocs(collection(db, "questions"));
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    } catch (e) { console.error(e); }
  };

  const fetchAttempts = async () => {
    try {
      const snap = await getDocs(collection(db, "user_attempts"));
      const list = snap.docs.map(d => d.data() as UserAttempt);
      list.sort((a, b) => b.score - a.score);
      setAttempts(list);
    } catch (e) { console.error(e); }
  };

  const fetchExamConfig = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "exam_config"));
      if (snap.exists()) setExamConfig(snap.data() as ExamConfig);
    } catch (e) { console.error(e); }
  };

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
      list.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
      setUsers(list);
    } catch (e) { console.error(e); }
  };

  const fetchNotice = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "notice"));
      if (snap.exists()) setNoticeText(snap.data()?.text || "");
    } catch (e) { console.error(e); }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      await setDoc(doc(db, "settings", "exam_config"), examConfig);
      showToast("✅ সেটিংস সেভ হয়েছে!");
    } catch (e) {
      showToast("❌ সেভ করা যায়নি", "error");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveNotice = async () => {
    setIsSavingNotice(true);
    try {
      await setDoc(doc(db, "settings", "notice"), { text: noticeText });
      showToast("✅ নোটিশ সেভ হয়েছে!");
    } catch (e) {
      showToast("❌ নোটিশ সেভ করা যায়নি", "error");
    } finally {
      setIsSavingNotice(false);
    }
  };

  const handleResetAttempts = async () => {
    if (!confirm("সব Attempt মুছে ফেলবেন? এটি পূর্বাবস্থায় ফেরানো যাবে না।")) return;
    try {
      const snap = await getDocs(collection(db, "user_attempts"));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setAttempts([]);
      showToast("✅ সব Attempt রিসেট হয়েছে!");
    } catch (e) {
      showToast("❌ রিসেট করা যায়নি", "error");
    }
  };

  const handleReplaceQuestions = async () => {
    try {
      const parsed = JSON.parse(newJson);
      if (!Array.isArray(parsed)) return showToast("JSON অবশ্যই Array [] ফরম্যাটে হতে হবে!", "error");
      if (!confirm(`${parsed.length}টি নতুন প্রশ্ন যোগ হবে, পুরনো সব মুছে যাবে। নিশ্চিত?`)) return;

      setIsUpdating(true);
      const existingSnap = await getDocs(collection(db, "questions"));
      const deleteOps = existingSnap.docs.map(d => ({ type: "delete", id: d.id }));
      const addOps = parsed.map((q: any) => ({ type: "set", data: q }));
      const allOps = [...deleteOps, ...addOps];

      for (let i = 0; i < allOps.length; i += 499) {
        const batch = writeBatch(db);
        allOps.slice(i, i + 499).forEach((op: any) => {
          if (op.type === "delete") batch.delete(doc(db, "questions", op.id));
          else batch.set(doc(collection(db, "questions")), op.data);
        });
        await batch.commit();
      }

      showToast(`✅ ${parsed.length}টি প্রশ্ন আপডেট হয়েছে!`);
      setNewJson("");
      fetchQuestions();
    } catch (e: any) {
      showToast(e instanceof SyntaxError ? "❌ JSON ফরম্যাট ভুল!" : "❌ সমস্যা হয়েছে: " + e.message, "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm("এই প্রশ্নটি মুছে ফেলবেন?")) return;
    try {
      await deleteDoc(doc(db, "questions", id));
      setQuestions(prev => prev.filter(q => q.id !== id));
      showToast("✅ প্রশ্ন মুছে ফেলা হয়েছে!");
    } catch (e) {
      showToast("❌ মুছা যায়নি", "error");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("এই ইউজারের প্রোফাইল ডেটা মুছে ফেলবেন? (অ্যাকাউন্ট লগইন এখনও থাকবে, কিন্তু প্রোফাইল ডেটা মুছে যাবে)")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast("✅ ইউজার ডেটা মুছে ফেলা হয়েছে!");
    } catch (e) {
      showToast("❌ মুছা যায়নি", "error");
    }
  };

  const handleResetUserScore = async (id: string) => {
    if (!confirm("এই ইউজারের স্কোর ০ করে দেওয়া হবে। নিশ্চিত?")) return;
    try {
      await updateDoc(doc(db, "users", id), { total_score: 0 });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, total_score: 0 } : u));
      showToast("✅ স্কোর রিসেট হয়েছে!");
    } catch (e) {
      showToast("❌ রিসেট করা যায়নি", "error");
    }
  };

  const totalAttempts = attempts.length;
  const avgScore = attempts.length
    ? Math.round((attempts.reduce((s, a) => s + a.score, 0) / attempts.length / questions.length) * 100)
    : 0;

  const filteredUsers = users.filter(u =>
    (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950">
      <p className="text-gray-500 dark:text-gray-400 font-medium">অ্যাক্সেস যাচাই হচ্ছে...</p>
    </div>
  );

  if (!isAdmin) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="text-center">
        <p className="text-5xl mb-3">🔒</p>
        <p className="text-red-600 dark:text-red-400 font-bold text-lg">অ্যাক্সেস নেই!</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">শুধুমাত্র Admin এই পেজ দেখতে পারবেন।</p>
      </div>
    </div>
  );

  const navItems: { tab: Tab; icon: string; label: string }[] = [
    { tab: "dashboard", icon: "📊", label: "ড্যাশবোর্ড" },
    { tab: "questions", icon: "📋", label: "প্রশ্ন" },
    { tab: "leaderboard", icon: "🏆", label: "লিডারবোর্ড" },
    { tab: "users", icon: "👥", label: "ইউজার" },
    { tab: "settings", icon: "⚙️", label: "সেটিংস" },
  ];

  const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
        checked ? "left-[22px]" : "left-0.5"
      }`} />
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col py-6 px-3 gap-1 sticky top-0 h-screen">
        <div className="px-3 pb-4 mb-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-gray-800 dark:text-gray-100">⚙️ Admin Panel</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">পরীক্ষা নিয়ন্ত্রণ কেন্দ্র</p>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="থিম পরিবর্তন করুন"
            className="relative w-10 h-6 rounded-full bg-gray-100 dark:bg-gray-800 transition-colors duration-200 flex items-center px-0.5 border border-gray-200 dark:border-gray-700 flex-shrink-0"
          >
            <span
              className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded-full bg-white dark:bg-gray-950 flex items-center justify-center text-[9px] transition-transform duration-200 ${
                theme === "dark" ? "translate-x-4" : "translate-x-0"
              }`}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </span>
          </button>
        </div>
        {navItems.map(({ tab, icon, label }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition text-left ${
              activeTab === tab
                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <span>{icon}</span> {label}
          </button>
        ))}
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">ড্যাশবোর্ড</h1>

            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: "মোট প্রশ্ন", value: `${questions.length}টি`, color: "text-blue-600 dark:text-blue-400" },
                { label: "মোট পরীক্ষার্থী", value: totalAttempts, color: "text-gray-700 dark:text-gray-200" },
                { label: "গড় স্কোর", value: `${avgScore}%`, color: "text-gray-700 dark:text-gray-200" },
                { label: "পরীক্ষার অবস্থা", value: examConfig.exam_active ? "চালু ✅" : "বন্ধ ❌", color: examConfig.exam_active ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
              ].map((s, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Quick Controls */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">⚡ দ্রুত নিয়ন্ত্রণ</h3>
                <div className="space-y-4">
                  {[
                    { label: "পরীক্ষা চালু/বন্ধ", sub: "ইউজাররা পরীক্ষা দিতে পারবে কিনা", key: "exam_active" as const },
                    { label: "লিডারবোর্ড দেখাবে", sub: "Dashboard-এ র‍্যাংকিং দেখাবে", key: "show_leaderboard" as const },
                    { label: "একাধিক Attempt", sub: "একজন বারবার পরীক্ষা দিতে পারবে", key: "multiple_attempts" as const },
                  ].map(({ label, sub, key }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
                      </div>
                      <ToggleSwitch checked={examConfig[key]} onChange={() => setExamConfig(p => ({ ...p, [key]: !p[key] }))} />
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig}
                    className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-bold transition"
                  >
                    {isSavingConfig ? "সেভ হচ্ছে..." : "💾 সেটিংস সেভ করুন"}
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">🏆 শীর্ষ পরীক্ষার্থী</h3>
                {attempts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">এখনো কোনো পরীক্ষার্থী নেই।</p>
                ) : (
                  <div className="space-y-3">
                    {attempts.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-base w-5 text-center">{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{a.email || a.uid.slice(0, 12) + "..."}</p>
                        </div>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{a.score}/{questions.length}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setActiveTab("leaderboard")}
                  className="mt-4 w-full py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 transition font-medium"
                >
                  পূর্ণ লিডারবোর্ড →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── QUESTIONS TAB ── */}
        {activeTab === "questions" && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">📋 প্রশ্ন ব্যবস্থাপনা</h1>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 dark:text-gray-100">📥 JSON দিয়ে প্রশ্ন আপলোড করুন</h3>
                <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 font-bold px-3 py-1 rounded-full">বর্তমানে {questions.length}টি প্রশ্ন</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                ফরম্যাট:{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-gray-600 dark:text-gray-300">
                  {`[{"q":"প্রশ্ন?","a":"...","b":"...","c":"...","d":"...","correct":"a"}]`}
                </code>
              </p>
              <textarea
                rows={10}
                className="w-full border border-gray-200 dark:border-gray-700 p-3 rounded-xl mb-4 font-mono text-sm focus:outline-none focus:border-blue-400 resize-none bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                value={newJson}
                onChange={e => setNewJson(e.target.value)}
                placeholder={`[\n  {\n    "q": "বাংলাদেশের রাজধানী কোনটি?",\n    "a": "চট্টগ্রাম",\n    "b": "ঢাকা",\n    "c": "রাজশাহী",\n    "d": "খুলনা",\n    "correct": "b"\n  }\n]`}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleReplaceQuestions}
                  disabled={isUpdating || !newJson.trim()}
                  className={`py-3 px-6 rounded-xl font-bold text-white transition text-sm ${
                    isUpdating || !newJson.trim() ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {isUpdating ? "⏳ আপডেট হচ্ছে..." : "🔄 পুরনো মুছে নতুন যোগ করুন"}
                </button>
                {newJson.trim() && (
                  <button onClick={() => setNewJson("")} className="py-3 px-4 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                    ✕ মুছুন
                  </button>
                )}
              </div>
            </div>

            {/* Questions list */}
            {questions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">বর্তমান প্রশ্নসমূহ</h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {questions.map((q, i) => (
                    <div key={q.id} className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold text-gray-700 dark:text-gray-200">{i + 1}. {q.q || "⚠️ প্রশ্ন নেই"}</p>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-xs font-bold text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition flex-shrink-0"
                        >
                          🗑 মুছুন
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 dark:text-gray-400">
                        {["a","b","c","d"].map(k => (
                          <span key={k} className={k === q.correct ? "text-green-600 dark:text-green-400 font-bold" : ""}>
                            {k === q.correct ? "✓" : "·"} {k.toUpperCase()}. {(q as any)[k]}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === "leaderboard" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">🏆 লিডারবোর্ড</h1>
              <button
                onClick={handleResetAttempts}
                className="py-2 px-4 text-sm font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition"
              >
                🗑 সব Attempt রিসেট
              </button>
            </div>

            {attempts.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500 dark:text-gray-400">এখনো কোনো পরীক্ষার্থী নেই।</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">র‍্যাংক</th>
                      <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">ইউজার</th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 dark:text-gray-300">স্কোর</th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 dark:text-gray-300">শতাংশ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a, i) => {
                      const pct = questions.length ? Math.round((a.score / questions.length) * 100) : 0;
                      return (
                        <tr key={i} className={`border-b border-gray-100 dark:border-gray-800 ${i < 3 ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                          <td className="py-3 px-4 font-bold text-gray-500 dark:text-gray-400">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-200">{a.email || a.uid.slice(0, 16) + "..."}</td>
                          <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400">{a.score}/{questions.length}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              pct >= 70 ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" :
                              pct >= 40 ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" :
                              "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                            }`}>{pct}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-6 gap-4">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">👥 ইউজার ব্যবস্থাপনা</h1>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="নাম বা ইমেইল দিয়ে খুঁজুন..."
                className="w-64 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>

            {filteredUsers.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                <p className="text-4xl mb-3">👤</p>
                <p className="text-gray-500 dark:text-gray-400">কোনো ইউজার পাওয়া যায়নি।</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">ইউজার</th>
                      <th className="text-left py-3 px-4 font-bold text-gray-600 dark:text-gray-300">ইমেইল</th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 dark:text-gray-300">মোট স্কোর</th>
                      <th className="text-right py-3 px-4 font-bold text-gray-600 dark:text-gray-300">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
                                {u.name?.charAt(0).toUpperCase() || "?"}
                              </div>
                            )}
                            <span className="font-medium text-gray-700 dark:text-gray-200">{u.name || "অজানা"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{u.email || "—"}</td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400">{u.total_score || 0}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleResetUserScore(u.id)}
                              className="text-xs font-bold text-amber-600 dark:text-amber-400 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
                            >
                              স্কোর রিসেট
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-xs font-bold text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                            >
                              🗑 মুছুন
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">⚙️ পরীক্ষার সেটিংস</h1>

            <div className="max-w-xl space-y-4">

              {/* Notice */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">📢 নোটিশ বোর্ড</h3>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1 font-medium">Dashboard-এ যে নোটিশ দেখাবে</label>
                <textarea
                  rows={3}
                  value={noticeText}
                  onChange={e => setNoticeText(e.target.value)}
                  placeholder="যেমন: আগামী পরীক্ষা ২৮ জুন সকাল ১০টায় অনুষ্ঠিত হবে।"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 resize-none"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveNotice}
                    disabled={isSavingNotice}
                    className="py-2 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-bold transition"
                  >
                    {isSavingNotice ? "সেভ হচ্ছে..." : "💾 নোটিশ সেভ করুন"}
                  </button>
                  {noticeText && (
                    <button
                      onClick={() => setNoticeText("")}
                      className="py-2 px-4 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                    >
                      ✕ পরিষ্কার করুন
                    </button>
                  )}
                </div>
              </div>

              {/* Exam ID */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">🆔 Exam পরিচয়</h3>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1 font-medium">বর্তমান Exam ID</label>
                <input
                  type="text"
                  value={examConfig.current_exam_id}
                  onChange={e => setExamConfig(p => ({ ...p, current_exam_id: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-400 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">এটি পরিবর্তন করলে সব ইউজার নতুন করে পরীক্ষা দিতে পারবে।</p>
              </div>

              {/* Timer */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">⏱ টাইমার সেটিংস</h3>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1 font-medium">প্রতি প্রশ্নে সময় (সেকেন্ড)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={5}
                    value={examConfig.timer_seconds}
                    onChange={e => setExamConfig(p => ({ ...p, timer_seconds: Number(e.target.value) }))}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="w-16 text-center py-2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-sm rounded-xl">
                    {examConfig.timer_seconds}s
                  </span>
                </div>
              </div>

              {/* Toggles */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4">🔧 বিবিধ সেটিংস</h3>
                <div className="space-y-5">
                  {[
                    { label: "পরীক্ষা চালু আছে", sub: "বন্ধ করলে ইউজাররা পরীক্ষা দিতে পারবে না", key: "exam_active" as const },
                    { label: "একাধিক Attempt অনুমতি", sub: "একজন ইউজার বারবার পরীক্ষা দিতে পারবে", key: "multiple_attempts" as const },
                    { label: "লিডারবোর্ড দেখাবে", sub: "Dashboard-এ র‍্যাংকিং প্রদর্শিত হবে", key: "show_leaderboard" as const },
                  ].map(({ label, sub, key }) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
                      </div>
                      <ToggleSwitch checked={examConfig[key]} onChange={() => setExamConfig(p => ({ ...p, [key]: !p[key] }))} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="w-full py-3.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl font-bold transition text-sm"
              >
                {isSavingConfig ? "⏳ সেভ হচ্ছে..." : "💾 সব সেটিংস Firebase-এ সেভ করুন"}
              </button>

              {/* Danger zone */}
              <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-100 dark:border-red-900 p-6">
                <h3 className="font-bold text-red-700 dark:text-red-400 mb-1">⚠️ বিপদজনক এলাকা</h3>
                <p className="text-xs text-red-400 dark:text-red-400/70 mb-4">এই কাজগুলো পূর্বাবস্থায় ফেরানো যাবে না।</p>
                <button
                  onClick={handleResetAttempts}
                  className="py-2.5 px-5 bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-950/40 transition"
                >
                  🗑 সব Attempt রিসেট করুন
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}