"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  setDoc, getDoc, addDoc, writeBatch, query, orderBy, Timestamp
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

type Tab = "overview" | "questions" | "subjects" | "users" | "results" | "settings";

type Question = {
  id: string; q: string;
  a: string; b: string; c: string; d: string;
  correct: "a" | "b" | "c" | "d";
};

type Subject = {
  id: string; name: string; examId: string;
  examDate: any; durationMinutes: number;
  preparation?: { question: string; answer: string }[];
};

type UserData = {
  id: string; name: string; email: string;
  total_score: number; photoURL?: string;
  isAdmin?: boolean; retakeAccess?: boolean;
};

type Attempt = {
  id: string; uid: string; examId: string;
  score: number; total: number;
  displayName: string; email: string;
  timestamp: any;
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${color}`}>
    {children}
  </span>
);

// ─── JSON Format Preview Component ───────────────────────────────────────────
const JsonFormatPreview = ({ type }: { type: "mcq" | "preparation" }) => {
  const mcqExample = `[
  {
    "q": "বাংলাদেশের রাজধানী কোনটি?",
    "a": "চট্টগ্রাম",
    "b": "ঢাকা",
    "c": "সিলেট",
    "d": "খুলনা",
    "correct": "b"
  },
  {
    "q": "২ + ২ = ?",
    "a": "৩",
    "b": "৫",
    "c": "৪",
    "d": "৬",
    "correct": "c"
  }
]`;

  const prepExample = `[
  {
    "question": "মুক্তিযুদ্ধ কত সালে হয়েছিল?",
    "answer": "১৯৭১ সালে"
  },
  {
    "question": "বাংলাদেশের জাতীয় ফুলের নাম কী?",
    "answer": "শাপলা"
  }
]`;

  const fields = type === "mcq"
    ? [
        { key: "q", desc: "প্রশ্নের text", required: true },
        { key: "a", desc: "অপশন A", required: true },
        { key: "b", desc: "অপশন B", required: true },
        { key: "c", desc: "অপশন C", required: true },
        { key: "d", desc: "অপশন D", required: true },
        { key: "correct", desc: '"a" / "b" / "c" / "d" — সঠিক উত্তর', required: true },
      ]
    : [
        { key: "question", desc: "প্রস্তুতি প্রশ্নের text", required: true },
        { key: "answer", desc: "প্রশ্নের উত্তর", required: true },
      ];

  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          📋 JSON Format — উদাহরণ দেখুন
        </span>
      </div>

      {/* Field Table */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">প্রতিটি object-এ যা থাকবে:</p>
        <div className="space-y-1 mb-3">
          {fields.map(f => (
            <div key={f.key} className="flex items-start gap-2">
              <code className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded shrink-0">
                "{f.key}"
              </code>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{f.desc}</span>
              {f.required && <span className="text-[10px] text-red-500 font-bold shrink-0">*আবশ্যক</span>}
            </div>
          ))}
        </div>

        {/* Code Preview */}
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">উদাহরণ JSON:</p>
        <pre className="text-[10px] leading-relaxed text-emerald-600 dark:text-emerald-400 bg-slate-900 dark:bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words border border-slate-800">
          {type === "mcq" ? mcqExample : prepExample}
        </pre>
      </div>

      {/* Tips */}
      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-[10px] bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-lg font-bold">
            ⚠️ Array [ ] দিয়ে শুরু করতে হবে
          </span>
          <span className="text-[10px] bg-indigo-50 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-300 px-2 py-1 rounded-lg font-bold">
            💡 একসাথে অনেক প্রশ্ন দেওয়া যাবে
          </span>
          {type === "mcq" && (
            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg font-bold">
              ✅ correct-এ শুধু a/b/c/d লিখবেন
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── JSON Upload Modal ────────────────────────────────────────────────────────
function JsonUploadModal({ type, subjects, onClose, onSuccess, showToast }: {
  type: "mcq" | "preparation";
  subjects: Subject[];
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<any[] | null>(null);
  const [parseError, setParseError] = useState("");

  const handleParse = () => {
    setParseError("");
    try {
      const data = JSON.parse(jsonText.trim());
      if (!Array.isArray(data)) { setParseError("JSON অবশ্যই একটি array [ ] হতে হবে!"); return; }
      if (data.length === 0) { setParseError("Array খালি! কমপক্ষে একটি item দিন।"); return; }

      if (type === "mcq") {
        const invalid = data.find(item => !item.q || !item.a || !item.b || !item.c || !item.d || !["a","b","c","d"].includes(item.correct));
        if (invalid) { setParseError('প্রতিটি প্রশ্নে q, a, b, c, d এবং correct (a/b/c/d) থাকতে হবে!'); return; }
      } else {
        const invalid = data.find(item => !item.question || !item.answer);
        if (invalid) { setParseError('প্রতিটি item-এ "question" এবং "answer" থাকতে হবে!'); return; }
      }

      setParsed(data);
    } catch (e) {
      setParseError("JSON format ঠিক নেই! উদাহরণটি দেখে আবার চেষ্টা করুন।");
    }
  };

  const handleSave = async () => {
    if (!parsed) return;
    if (type === "preparation" && !selectedSubjectId) {
      setParseError("কোন বিষয়ে যোগ করবেন সেটি নির্বাচন করুন!");
      return;
    }
    setSaving(true);
    try {
      if (type === "mcq") {
        const batch = writeBatch(db);
        parsed.forEach(item => {
          const ref = doc(collection(db, "questions"));
          batch.set(ref, { q: item.q, a: item.a, b: item.b, c: item.c, d: item.d, correct: item.correct });
        });
        await batch.commit();
        showToast(`${parsed.length}টি MCQ প্রশ্ন সফলভাবে যোগ হয়েছে ✅`);
      } else {
        const subRef = doc(db, "subjects", selectedSubjectId);
        const subSnap = await getDoc(subRef);
        const existing = subSnap.data()?.preparation || [];
        const updated = [...existing, ...parsed.map(item => ({ question: item.question, answer: item.answer }))];
        await updateDoc(subRef, { preparation: updated });
        showToast(`${parsed.length}টি প্রস্তুতি প্রশ্ন সফলভাবে যোগ হয়েছে ✅`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      showToast("সেভ করতে সমস্যা হয়েছে!", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100">
              {type === "mcq" ? "📥 MCQ প্রশ্ন JSON Upload" : "📥 প্রস্তুতি প্রশ্ন JSON Upload"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {type === "mcq" ? "questions কালেকশনে জমা হবে" : "subject-এর preparation ফিল্ডে যুক্ত হবে"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200 transition">✕</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Format Preview */}
          <JsonFormatPreview type={type} />

          {/* Subject selector for preparation */}
          {type === "preparation" && (
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 block">
                কোন বিষয়ে প্রস্তুতি প্রশ্ন যোগ করবেন? *
              </label>
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">— বিষয় নির্বাচন করুন —</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.examId})</option>
                ))}
              </select>
            </div>
          )}

          {/* JSON Input */}
          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 block">
              এখানে JSON paste করুন *
            </label>
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setParsed(null); setParseError(""); }}
              rows={8}
              placeholder={type === "mcq"
                ? `[\n  {\n    "q": "প্রশ্ন লিখুন",\n    "a": "অপশন A",\n    "b": "অপশন B",\n    "c": "অপশন C",\n    "d": "অপশন D",\n    "correct": "a"\n  }\n]`
                : `[\n  {\n    "question": "প্রশ্ন লিখুন",\n    "answer": "উত্তর লিখুন"\n  }\n]`
              }
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-mono resize-none"
            />
          </div>

          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-3">
              <span className="text-red-500 shrink-0">❌</span>
              <p className="text-sm text-red-600 dark:text-red-400 font-bold">{parseError}</p>
            </div>
          )}

          {/* Parse Success Preview */}
          {parsed && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                ✅ {parsed.length}টি {type === "mcq" ? "MCQ প্রশ্ন" : "প্রস্তুতি প্রশ্ন"} সঠিকভাবে ভ্যালিডেট করা হয়েছে — এখন সেভ করতে পারেন!
              </p>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
            বাতিল
          </button>
          {!parsed ? (
            <button
              onClick={handleParse}
              disabled={!jsonText.trim()}
              className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm disabled:opacity-50 transition active:scale-95 shadow-md shadow-violet-500/10"
            >
              🔍 যাচাই করুন
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition active:scale-95 shadow-md shadow-indigo-500/10"
            >
              {saving ? "সেভ হচ্ছে..." : `💾 ${parsed.length}টি প্রশ্ন সেভ করুন`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [notice, setNotice] = useState("");
  const [examConfigId, setExamConfigId] = useState("");
  const [loadingTab, setLoadingTab] = useState(false);

  const [qModal, setQModal] = useState<{ open: boolean; data?: Question }>({ open: false });
  const [sModal, setSModal] = useState<{ open: boolean; data?: Subject }>({ open: false });
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; msg: string; onOk: () => void } | null>(null);
  const [jsonModal, setJsonModal] = useState<{ open: boolean; type: "mcq" | "preparation" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/"); return; }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.data()?.isAdmin === true) {
        setIsAdmin(true);
      } else {
        router.push("/dashboard");
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, [router]);

  const fetchTab = useCallback(async (tab: Tab) => {
    setLoadingTab(true);
    try {
      if (tab === "overview") {
        const [qSnap, uSnap, aSnap, noticeSnap, configSnap] = await Promise.all([
          getDocs(collection(db, "questions")),
          getDocs(collection(db, "users")),
          getDocs(collection(db, "user_attempts")),
          getDoc(doc(db, "settings", "notice")),
          getDoc(doc(db, "settings", "exam_config")),
        ]);
        setQuestions(qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
        setAttempts(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt)));
        setNotice(noticeSnap.data()?.text || "");
        setExamConfigId(configSnap.data()?.current_exam_id || "");
      } else if (tab === "questions") {
        const snap = await getDocs(collection(db, "questions"));
        setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
      } else if (tab === "subjects") {
        const snap = await getDocs(query(collection(db, "subjects"), orderBy("examDate", "asc")));
        setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
      } else if (tab === "users") {
        const snap = await getDocs(collection(db, "users"));
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
      } else if (tab === "results") {
        const [aSnap, uSnap] = await Promise.all([
          getDocs(collection(db, "user_attempts")),
          getDocs(collection(db, "users")),
        ]);
        setAttempts(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt)));
        setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserData)));
      } else if (tab === "settings") {
        const [noticeSnap, configSnap] = await Promise.all([
          getDoc(doc(db, "settings", "notice")),
          getDoc(doc(db, "settings", "exam_config")),
        ]);
        setNotice(noticeSnap.data()?.text || "");
        setExamConfigId(configSnap.data()?.current_exam_id || "");
      }
    } catch (e) {
      showToast("ডেটা লোড করতে সমস্যা হয়েছে", "error");
    } finally {
      setLoadingTab(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchTab(activeTab);
  }, [isAdmin, activeTab, fetchTab]);

  const saveQuestion = async (data: Omit<Question, "id">, id?: string) => {
    if (id) {
      await updateDoc(doc(db, "questions", id), data as any);
      showToast("প্রশ্ন আপডেট হয়েছে ✅");
    } else {
      await addDoc(collection(db, "questions"), data);
      showToast("নতুন প্রশ্ন যোগ হয়েছে ✅");
    }
    setQModal({ open: false });
    fetchTab("questions");
  };

  const deleteQuestion = async (id: string) => {
    await deleteDoc(doc(db, "questions", id));
    showToast("প্রশ্ন মুছে গেছে", "error");
    fetchTab("questions");
  };

  const saveSubject = async (data: any, id?: string) => {
    if (id) {
      await updateDoc(doc(db, "subjects", id), data);
      showToast("বিষয় আপডেট হয়েছে ✅");
    } else {
      await addDoc(collection(db, "subjects"), data);
      showToast("নতুন বিষয় যোগ হয়েছে ✅");
    }
    setSModal({ open: false });
    fetchTab("subjects");
  };

  const deleteSubject = async (id: string) => {
    await deleteDoc(doc(db, "subjects", id));
    showToast("বিষয় মুছে গেছে", "error");
    fetchTab("subjects");
  };

  const toggleAdmin = async (u: UserData) => {
    await updateDoc(doc(db, "users", u.id), { isAdmin: !u.isAdmin });
    showToast(!u.isAdmin ? `${u.name} কে Admin বানানো হয়েছে ✅` : `${u.name} এর Admin সরানো হয়েছে`);
    fetchTab("users");
  };

  const toggleRetake = async (u: UserData) => {
    await updateDoc(doc(db, "users", u.id), { retakeAccess: !u.retakeAccess });
    showToast(!u.retakeAccess ? `${u.name} কে Retake দেওয়া হয়েছে ✅` : `${u.name} এর Retake সরানো হয়েছে`);
    fetchTab("users");
  };

  const resetScore = async (u: UserData) => {
    await updateDoc(doc(db, "users", u.id), { total_score: 0 });
    showToast(`${u.name} এর স্কোর রিসেট হয়েছে`, "error");
    fetchTab("users");
  };

  const deleteAttempt = async (attemptId: string, uid: string, score: number) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, "user_attempts", attemptId));
    batch.update(doc(db, "users", uid), { total_score: Math.max(0, (users.find(u => u.id === uid)?.total_score || 0) - score) });
    await batch.commit();
    showToast("Attempt মুছে গেছে এবং স্কোর বাদ দেওয়া হয়েছে", "error");
    fetchTab("results");
  };

  const saveNotice = async () => {
    await setDoc(doc(db, "settings", "notice"), { text: notice });
    showToast("নোটিশ সেভ হয়েছে ✅");
  };

  const saveExamConfig = async () => {
    await setDoc(doc(db, "settings", "exam_config"), { current_exam_id: examConfigId });
    showToast("Exam Config সেভ হয়েছে ✅");
  };

  const resetLeaderboard = async () => {
    const batch = writeBatch(db);
    users.forEach(u => batch.update(doc(db, "users", u.id), { total_score: 0 }));
    await batch.commit();
    showToast("সব স্কোর রিসেট হয়েছে!", "error");
    fetchTab("settings");
  };

  if (!authChecked) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAdmin) return null;

  const totalAttemptCount = attempts.length;
  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length * 10) / 10
    : 0;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "ওভারভিউ", icon: "📊" },
    { id: "questions", label: "প্রশ্ন", icon: "❓" },
    { id: "subjects", label: "বিষয়", icon: "📖" },
    { id: "users", label: "ইউজার", icon: "👥" },
    { id: "results", label: "ফলাফল", icon: "🏆" },
    { id: "settings", label: "সেটিং", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors duration-300">

      {/* Тоast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold text-white transition-all border border-white/10 ${toast.type === "success" ? "bg-emerald-600" : "bg-red-500"}`}>
          {toast.type === "success" ? "💖" : "⚠️"} {toast.msg}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-slate-800 dark:text-slate-100 font-bold text-center mb-6 leading-relaxed">{confirmModal.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition">বাতিল</button>
              <button onClick={() => { confirmModal.onOk(); setConfirmModal(null); }} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm active:scale-95 transition shadow-md shadow-red-500/10">নিশ্চিত করুন</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <h1 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Admin Dashboard</h1>
          </div>
          <button onClick={() => router.push("/dashboard")} className="text-xs font-bold text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition">
            ← মেইন ড্যাশবোর্ড
          </button>
        </div>
      </div>

      {/* Tab bar — Sticky Navigation */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-[53px] z-10 overflow-x-auto shadow-sm">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all duration-200 ${
                activeTab === t.id 
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20" 
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
              }`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 mt-6">
        {loadingTab ? <Spinner /> : <>

          {/* ─── OVERVIEW TAB ────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Stat Cards with Gradient borders */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "মোট প্রশ্ন", value: questions.length, color: "bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/60", icon: "❓" },
                  { label: "মোট ইউজার", value: users.length, color: "bg-violet-50/60 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-900/60", icon: "👥" },
                  { label: "মোট Attempt", value: totalAttemptCount, color: "bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60", icon: "📝" },
                  { label: "গড় স্কোর", value: avgScore, color: "bg-amber-50/60 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60", icon: "📊" },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-2xl p-4 border ${stat.color} shadow-sm`}>
                    <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{stat.value}</p>
                    <p className="text-xs font-bold mt-1 opacity-85">{stat.icon} {stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Users */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 mb-3 text-sm flex items-center gap-1.5">🏆 শীর্ষ ৫ শিক্ষার্থী</h3>
                  <div className="space-y-2">
                    {[...users].sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).slice(0, 5).map((u, i) => (
                      <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
                        <span className="w-6 text-center text-sm font-extrabold text-indigo-500/80">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{u.name || "অজানা"}</p>
                          <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                        </div>
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">{u.total_score || 0} pts</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Attempts */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-100 mb-3 text-sm flex items-center gap-1.5">🕐 সাম্প্রতিক ৫টি পরীক্ষা</h3>
                  <div className="space-y-2">
                    {[...attempts].sort((a, b) => (b.timestamp?.toDate?.()?.getTime() || 0) - (a.timestamp?.toDate?.()?.getTime() || 0)).slice(0, 5).map(a => (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{a.displayName || a.email}</p>
                          <p className="text-[11px] text-slate-400 truncate">Exam ID: {a.examId}</p>
                        </div>
                        <span className={`text-xs font-mono font-bold px-2 py-1 rounded-lg ${(a.score / a.total) >= 0.7 ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-400/10 text-red-500"}`}>
                          {a.score}/{a.total}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── QUESTIONS TAB ───────────────────────────────────────────────── */}
          {activeTab === "questions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">ডাটাবেসে মোট প্রশ্ন রয়েছে: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{questions.length}টি</span></p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setJsonModal({ open: true, type: "mcq" })}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition active:scale-95 flex items-center gap-1 shadow-sm shadow-amber-500/10"
                  >
                    📥 Bulk JSON Upload
                  </button>
                  <button onClick={() => setQModal({ open: true })} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition active:scale-95 shadow-sm shadow-indigo-500/10">
                    ➕ ম্যানুয়াল প্রশ্ন
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition duration-150">
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 mt-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Q{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 leading-relaxed">{q.q}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {(["a", "b", "c", "d"] as const).map(k => (
                            <div key={k} className={`text-xs p-2.5 rounded-xl border transition ${k === q.correct ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold" : "border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 bg-slate-50/40 dark:bg-slate-900"}`}>
                              <span className="uppercase font-extrabold mr-1">{k}.</span> {q[k]}{k === q.correct && " ✓"}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={() => setQModal({ open: true, data: q })} className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 transition">✏️ এডিট</button>
                        <button onClick={() => setConfirmModal({ open: true, msg: "এই প্রশ্নটি নিশ্চিতভাবে মুছে ফেলবেন?", onOk: () => deleteQuestion(q.id) })} className="text-[11px] bg-slate-100 dark:bg-slate-800 text-red-500 px-2.5 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/30 transition">🗑️ মুছুন</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── SUBJECTS TAB ────────────────────────────────────────────────── */}
          {activeTab === "subjects" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">মোট অ্যাক্টিভ বিষয়: <span className="text-violet-600 dark:text-violet-400 font-extrabold">{subjects.length}টি</span></p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { fetchTab("subjects"); setJsonModal({ open: true, type: "preparation" }); }}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition active:scale-95 flex items-center gap-1 shadow-sm shadow-amber-500/10"
                  >
                    📥 প্রস্তুতি JSON Upload
                  </button>
                  <button onClick={() => setSModal({ open: true })} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition active:scale-95 shadow-sm shadow-indigo-500/10">
                    ➕ নতুন বিষয় যুক্ত করুন
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {subjects.map(s => {
                  const examDate = s.examDate?.toDate ? s.examDate.toDate() : new Date(s.examDate);
                  const isPast = examDate < new Date();
                  return (
                    <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm leading-snug">{s.name}</h4>
                            <Badge color={isPast ? "bg-slate-100 dark:bg-slate-800 text-slate-500" : "bg-indigo-50 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400"}>
                              {isPast ? "সমাপ্ত" : "আসন্ন"}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <p>🔑 <span className="font-bold">Exam ID:</span> {s.examId}</p>
                            <p>📅 <span className="font-bold">তারিখ:</span> {examDate.toLocaleString("bn-BD")}</p>
                            <p>⏱️ <span className="font-bold">ডিউরেশন:</span> {s.durationMinutes} মিনিট | 📚 <span className="font-bold">প্রস্তুতি প্রশ্ন:</span> {s.preparation?.length || 0}টি</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button onClick={() => setSModal({ open: true, data: s })} className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 transition">✏️ এডিট</button>
                          <button onClick={() => setConfirmModal({ open: true, msg: `"${s.name}" বিষয়টি সম্পূর্ণ মুছে ফেলবেন?`, onOk: () => deleteSubject(s.id) })} className="text-[11px] bg-slate-100 dark:bg-slate-800 text-red-500 px-2.5 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/30 transition">🗑️ মুছুন</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── USERS TAB ───────────────────────────────────────────────────── */}
          {activeTab === "users" && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">নিবন্ধিত মোট ইউজার সংখ্যা: <span className="font-extrabold text-slate-700 dark:text-slate-200">{users.length} জন</span></p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...users].sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).map(u => (
                  <div key={u.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-start gap-3">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-slate-100 dark:ring-slate-800" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{u.name || "অজানা"}</p>
                          {u.isAdmin && <Badge color="bg-violet-50 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300">Admin</Badge>}
                          {u.retakeAccess && <Badge color="bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300">Retake</Badge>}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">⭐ {u.total_score || 0} লাইফটাইম পয়েন্ট</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <button onClick={() => setConfirmModal({ open: true, msg: u.isAdmin ? `${u.name} এর Admin রোল বাতিল করবেন?` : `${u.name} কে Admin রোল প্রদান করবেন?`, onOk: () => toggleAdmin(u) })} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition ${u.isAdmin ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
                        {u.isAdmin ? "🛡️ Admin সরান" : "🛡️ Admin করুন"}
                      </button>
                      <button onClick={() => setConfirmModal({ open: true, msg: u.retakeAccess ? `${u.name} এর Retake অ্যাক্সেস বন্ধ করবেন?` : `${u.name} কে আবার পরীক্ষা দেওয়ার অ্যাক্সেস দিবেন?`, onOk: () => toggleRetake(u) })} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition ${u.retakeAccess ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
                        {u.retakeAccess ? "🔄 Retake বন্ধ" : "🔄 Retake দিন"}
                      </button>
                      <button onClick={() => setConfirmModal({ open: true, msg: `${u.name} এর মোট স্কোর ০ (শূন্য) করতে চান?`, onOk: () => resetScore(u) })} className="text-[11px] bg-slate-100 dark:bg-slate-800 text-red-500 px-2.5 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition ml-auto">
                        Reset Score
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── RESULTS TAB ─────────────────────────────────────────────────── */}
          {activeTab === "results" && (
            <div className="space-y-4">
              {/* Analytics header cards */}
              <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-center p-2">
                  <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{attempts.length}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">মোট সাবমিশন</p>
                </div>
                <div className="text-center p-2 border-x border-slate-100 dark:border-slate-800">
                  <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{attempts.filter(a => a.total > 0 && (a.score / a.total) >= 0.7).length}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">পাস (≥৭০%)</p>
                </div>
                <div className="text-center p-2">
                  <p className="text-xl font-extrabold text-violet-500">{avgScore}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">গড় স্কোর</p>
                </div>
              </div>

              <div className="space-y-3">
                {[...attempts].sort((a, b) => (b.timestamp?.toDate?.()?.getTime() || 0) - (a.timestamp?.toDate?.()?.getTime() || 0)).map(a => {
                  const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                  const passed = pct >= 70;
                  return (
                    <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{a.displayName || a.email}</p>
                          <p className="text-xs text-slate-400 truncate">{a.email}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <p>📋 Subject ID: <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{a.examId}</span></p>
                            <p>🕐 সময়: {a.timestamp?.toDate?.()?.toLocaleString("bn-BD") || "—"}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-extrabold font-mono ${passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{a.score}/{a.total}</p>
                          <Badge color={passed ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-400/10 text-red-600 dark:text-red-400"}>{pct}%</Badge>
                        </div>
                      </div>
                      <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${passed ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <button onClick={() => setConfirmModal({ open: true, msg: `এই শিক্ষার্থীর Attempt রেকর্ডটি চিরতরে মুছে ফেলবেন? (এতে লাইফটাইম স্কোর কমে যাবে)`, onOk: () => deleteAttempt(a.id, a.uid, a.score) })} className="mt-3 text-[11px] text-red-500 font-bold px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                        🗑️ এই Attempt-টি মুছুন
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── SETTINGS TAB ────────────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <div className="space-y-4 max-w-xl">
              {/* Notice board management */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1">📢 নোটিশ বোর্ড আপডেট</h3>
                <textarea value={notice} onChange={e => setNotice(e.target.value)} rows={3} placeholder="শিক্ষার্থীদের মেইন ড্যাশবোর্ডে দেখানোর জন্য একটি গুরুত্বপূর্ণ নোটিশ লিখুন..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none" />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveNotice} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition active:scale-95 shadow-md shadow-indigo-500/10">সেভ নোটিশ</button>
                  <button onClick={async () => { setNotice(""); await setDoc(doc(db, "settings", "notice"), { text: "" }); showToast("নোটিশ ক্লিয়ার করা হয়েছে ✅"); }} className="text-xs font-bold text-red-500 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition">মুছে ফেলুন</button>
                </div>
              </div>

              {/* Exam config management */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-0.5">🎯 Current Active Exam ID</h3>
                <p className="text-[11px] text-slate-400 mb-3">কুইজ পেজে শিক্ষার্থীরা প্রবেশ করলে সরাসরি যে পরীক্ষাটি লোড হবে তার আইডি দিন।</p>
                <input value={examConfigId} onChange={e => setExamConfigId(e.target.value)} placeholder="যেমন: math_2026" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 mb-3 focus:ring-1 focus:ring-indigo-400" />
                <button onClick={saveExamConfig} className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold py-2.5 rounded-xl transition active:scale-95 shadow-md shadow-violet-500/10">অ্যাক্টিভ এক্সাম আইডি সেভ করুন</button>
              </div>

              {/* Danger Zone */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-950/40 p-4 shadow-sm">
                <h3 className="text-sm font-extrabold text-red-600 dark:text-red-400 mb-1">⚠️ বিপজ্জনক এলাকা (Danger Zone)</h3>
                <p className="text-[11px] text-slate-400 mb-4">নিচের বাটনটি ব্যবহারের ক্ষেত্রে সতর্ক থাকুন। এটি সমস্ত লাইভ ডাটাবেস স্কোর মুছে দেবে।</p>
                <button onClick={() => setConfirmModal({ open: true, msg: "সতর্কবার্তা! সমস্ত নিবন্ধিত ইউজারের স্কোর সম্পূর্ণ ০ (শূন্য) হয়ে যাবে! আপনি কি নিশ্চিতভাবে লিডারবোর্ড রিসেট করতে চান?", onOk: resetLeaderboard })} className="w-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-3 rounded-xl transition active:scale-95 shadow-md shadow-red-500/10">
                  🔁 সকল ইউজারের লাইফটাইম স্কোর রিসেট করুন (Clear Leaderboard)
                </button>
              </div>
            </div>
          )}

        </>}
      </div>

      {qModal.open && <QuestionModal initial={qModal.data} onSave={saveQuestion} onClose={() => setQModal({ open: false })} />}
      {sModal.open && <SubjectModal initial={sModal.data} onSave={saveSubject} onClose={() => setSModal({ open: false })} />}

      {/* JSON Upload Modal */}
      {jsonModal?.open && (
        <JsonUploadModal
          type={jsonModal.type}
          subjects={subjects}
          onClose={() => setJsonModal(null)}
          onSuccess={() => fetchTab(jsonModal.type === "mcq" ? "questions" : "subjects")}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─── Question Modal ────────────────────────────────────────────────────────────
function QuestionModal({ initial, onSave, onClose }: {
  initial?: Question;
  onSave: (data: Omit<Question, "id">, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ q: initial?.q || "", a: initial?.a || "", b: initial?.b || "", c: initial?.c || "", d: initial?.d || "", correct: initial?.correct || "a" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.q || !form.a || !form.b || !form.c || !form.d) { alert("সব ঘর পূরণ করুন!"); return; }
    setSaving(true);
    await onSave(form as any, initial?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{initial ? "📝 প্রশ্ন সম্পাদনা" : "✨ নতুন প্রশ্ন যোগ"}</h3>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">প্রশ্নটির টাইটেল লিখুন *</label>
            <textarea value={form.q} onChange={e => setForm(f => ({ ...f, q: e.target.value }))} rows={2} placeholder="প্রশ্নটি এখানে টাইপ করুন..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          {(["a", "b", "c", "d"] as const).map(k => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block uppercase">{k} অপশন এর টেক্সট *</label>
              <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={`${k.toUpperCase()} অপশনের সঠিক উত্তর দিন`} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">সঠিক অপশনটি সিলেক্ট করুন *</label>
            <div className="flex gap-2">
              {(["a", "b", "c", "d"] as const).map(k => (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, correct: k }))} className={`flex-1 py-2.5 rounded-xl text-sm font-bold uppercase border-2 transition ${form.correct === k ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-extrabold" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{k}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition">বাতিল</button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition active:scale-95 shadow-md shadow-indigo-500/10">
              {saving ? "সেভ হচ্ছে..." : "সংরক্ষণ করুন ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subject Modal ────────────────────────────────────────────────────────────
function SubjectModal({ initial, onSave, onClose }: {
  initial?: Subject;
  onSave: (data: any, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const toLocalInput = (ts: any) => {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const [form, setForm] = useState({ name: initial?.name || "", examId: initial?.examId || "", examDate: toLocalInput(initial?.examDate), durationMinutes: initial?.durationMinutes || 30 });
  const [prepItems, setPrepItems] = useState<{ question: string; answer: string }[]>(initial?.preparation || []);
  const [saving, setSaving] = useState(false);

  const addPrep = () => setPrepItems(p => [...p, { question: "", answer: "" }]);
  const removePrep = (i: number) => setPrepItems(p => p.filter((_, idx) => idx !== i));
  const updatePrep = (i: number, field: "question" | "answer", val: string) => setPrepItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const handleSubmit = async () => {
    if (!form.name || !form.examId || !form.examDate) { alert("নাম, Exam ID ও তারিখ আবশ্যক!"); return; }
    setSaving(true);
    await onSave({ name: form.name, examId: form.examId, examDate: Timestamp.fromDate(new Date(form.examDate)), durationMinutes: Number(form.durationMinutes), preparation: prepItems.filter(p => p.question && p.answer) }, initial?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{initial ? "📖 বিষয় সম্পাদনা" : "✨ নতুন বিষয় যুক্ত করুন"}</h3>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {[{ label: "বিষয়ের নাম (Subject Name) *", key: "name", placeholder: "যেমন: Business Mathematics" }, { label: "ইউনিক Exam ID *", key: "examId", placeholder: "যেমন: math_2026" }].map(f => (
            <div key={f.key}>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">পরীক্ষার সিডিউল (তারিখ ও সময়) *</label>
            <input type="datetime-local" value={form.examDate} onChange={e => setForm(p => ({ ...p, examDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">পরীক্ষার মোট সময়কাল (মিনিট)</label>
            <input type="number" value={form.durationMinutes} onChange={e => setForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          
          {/* Preparation material list */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">📚 কাস্টম প্রস্তুতি প্রশ্ন ও উত্তর (কাউন্টডাউন ম্যাটেরিয়াল)</label>
              <button type="button" onClick={addPrep} className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100/60 transition">+ অ্যাড করুন</button>
            </div>
            {prepItems.map((item, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 mb-2.5 space-y-2 border border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">প্রশ্ন #{i + 1}</span>
                  <button type="button" onClick={() => removePrep(i)} className="text-xs text-red-500 font-bold hover:underline">✕ সরান</button>
                </div>
                <input value={item.question} onChange={e => updatePrep(i, "question", e.target.value)} placeholder="প্রস্তুতিমূলক মূল প্রশ্ন" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <input value={item.answer} onChange={e => updatePrep(i, "answer", e.target.value)} placeholder="সঠিক উত্তর বা ব্যাখ্যা" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-2.5 text-sm focus:outline-none focus:border-emerald-400" />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition">বাতিল</button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition active:scale-95 shadow-md shadow-indigo-500/10">
              {saving ? "সেভ হচ্ছে..." : "সংরক্ষণ করুন ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}