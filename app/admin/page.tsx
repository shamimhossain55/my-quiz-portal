"use client";
import { useEffect, useState, useCallback } from "react";
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
    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const Badge = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${color}`}>
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
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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
              <code className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded shrink-0">
                "{f.key}"
              </code>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{f.desc}</span>
              {f.required && <span className="text-[10px] text-red-500 font-bold shrink-0">*আবশ্যক</span>}
            </div>
          ))}
        </div>

        {/* Code Preview */}
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">উদাহরণ JSON:</p>
        <pre className="text-[10px] leading-relaxed text-green-700 dark:text-green-400 bg-slate-900 dark:bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
          {type === "mcq" ? mcqExample : prepExample}
        </pre>
      </div>

      {/* Tips */}
      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg font-bold">
            ⚠️ Array [ ] দিয়ে শুরু করতে হবে
          </span>
          <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg font-bold">
            💡 একসাথে অনেক প্রশ্ন দেওয়া যাবে
          </span>
          {type === "mcq" && (
            <span className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded-lg font-bold">
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100">
              {type === "mcq" ? "📥 MCQ প্রশ্ন JSON Upload" : "📥 প্রস্তুতি প্রশ্ন JSON Upload"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {type === "mcq" ? "questions collection-এ যাবে" : "subject-এর preparation-এ যোগ হবে"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200">✕</button>
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
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400"
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
              rows={10}
              placeholder={type === "mcq"
                ? `[\n  {\n    "q": "প্রশ্ন লিখুন",\n    "a": "অপশন A",\n    "b": "অপশন B",\n    "c": "অপশন C",\n    "d": "অপশন D",\n    "correct": "a"\n  }\n]`
                : `[\n  {\n    "question": "প্রশ্ন লিখুন",\n    "answer": "উত্তর লিখুন"\n  }\n]`
              }
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 font-mono resize-none"
            />
          </div>

          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <span className="text-red-500 shrink-0">❌</span>
              <p className="text-sm text-red-600 dark:text-red-400 font-bold">{parseError}</p>
            </div>
          )}

          {/* Parse Success Preview */}
          {parsed && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
              <p className="text-sm font-bold text-green-700 dark:text-green-400">
                ✅ {parsed.length}টি {type === "mcq" ? "MCQ প্রশ্ন" : "প্রস্তুতি প্রশ্ন"} সঠিকভাবে পড়া হয়েছে — এখন সেভ করুন!
              </p>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">
            বাতিল
          </button>
          {!parsed ? (
            <button
              onClick={handleParse}
              disabled={!jsonText.trim()}
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50 transition"
            >
              🔍 যাচাই করুন
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition"
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
  // ✅ নতুন JSON upload modal state
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
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-lg text-sm font-bold text-white transition-all ${toast.type === "success" ? "bg-green-600" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}

      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-slate-800 dark:text-slate-100 font-bold text-center mb-6">{confirmModal.msg}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">বাতিল</button>
              <button onClick={() => { confirmModal.onOk(); setConfirmModal(null); }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm">নিশ্চিত করুন</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <h1 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Admin Panel</h1>
          </div>
          <button onClick={() => router.push("/dashboard")} className="text-xs font-bold text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            ← ড্যাশবোর্ড
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-[53px] z-10 overflow-x-auto">
        <div className="max-w-5xl mx-auto flex">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.id ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}>
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 mt-5">
        {loadingTab ? <Spinner /> : <>

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "মোট প্রশ্ন", value: questions.length, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400", icon: "❓" },
                  { label: "মোট ইউজার", value: users.length, color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400", icon: "👥" },
                  { label: "মোট Attempt", value: totalAttemptCount, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400", icon: "📝" },
                  { label: "গড় স্কোর", value: avgScore, color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400", icon: "📊" },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-2xl p-4 ${stat.color} border border-current/10`}>
                    <p className="text-2xl font-extrabold">{stat.value}</p>
                    <p className="text-xs font-bold mt-1 opacity-80">{stat.icon} {stat.label}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 mb-3 text-sm">🏆 শীর্ষ ইউজার</h3>
                <div className="space-y-2">
                  {[...users].sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).slice(0, 5).map((u, i) => (
                    <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <span className="w-6 text-center text-sm font-bold text-slate-400">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{u.name || "অজানা"}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{u.total_score || 0} pts</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 mb-3 text-sm">🕐 সাম্প্রতিক Attempt</h3>
                <div className="space-y-2">
                  {[...attempts].sort((a, b) => (b.timestamp?.toDate?.()?.getTime() || 0) - (a.timestamp?.toDate?.()?.getTime() || 0)).slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{a.displayName || a.email}</p>
                        <p className="text-xs text-slate-400">{a.examId}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${(a.score / a.total) >= 0.7 ? "bg-green-50 dark:bg-green-900/20 text-green-600" : "bg-red-50 dark:bg-red-900/20 text-red-500"}`}>{a.score}/{a.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* QUESTIONS TAB */}
          {activeTab === "questions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">মোট {questions.length}টি প্রশ্ন</p>
                <div className="flex gap-2">
                  {/* ✅ JSON Upload বাটন */}
                  <button
                    onClick={() => setJsonModal({ open: true, type: "mcq" })}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition active:scale-95 flex items-center gap-1.5"
                  >
                    📥 JSON Upload
                  </button>
                  <button onClick={() => setQModal({ open: true })} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition active:scale-95">
                    + নতুন প্রশ্ন
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 mt-1 shrink-0">Q{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">{q.q}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["a", "b", "c", "d"] as const).map(k => (
                            <div key={k} className={`text-xs p-2 rounded-lg border ${k === q.correct ? "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold" : "border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400"}`}>
                              <span className="uppercase font-bold">{k}.</span> {q[k]}{k === q.correct && " ✓"}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={() => setQModal({ open: true, data: q })} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 transition">✏️ সম্পাদনা</button>
                        <button onClick={() => setConfirmModal({ open: true, msg: "এই প্রশ্নটি মুছে ফেলবেন?", onOk: () => deleteQuestion(q.id) })} className="text-xs bg-slate-100 dark:bg-slate-800 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition">🗑️ মুছুন</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBJECTS TAB */}
          {activeTab === "subjects" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">মোট {subjects.length}টি বিষয়</p>
                <div className="flex gap-2">
                  {/* ✅ Preparation JSON Upload বাটন */}
                  <button
                    onClick={() => { fetchTab("subjects"); setJsonModal({ open: true, type: "preparation" }); }}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition active:scale-95 flex items-center gap-1.5"
                  >
                    📥 প্রস্তুতি JSON
                  </button>
                  <button onClick={() => setSModal({ open: true })} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition active:scale-95">
                    + নতুন বিষয়
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {subjects.map(s => {
                  const examDate = s.examDate?.toDate ? s.examDate.toDate() : new Date(s.examDate);
                  const isPast = examDate < new Date();
                  return (
                    <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">{s.name}</h4>
                            <Badge color={isPast ? "bg-slate-100 dark:bg-slate-800 text-slate-500" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}>
                              {isPast ? "শেষ" : "আসছে"}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400">ID: {s.examId}</p>
                          <p className="text-xs text-slate-400">📅 {examDate.toLocaleString("bn-BD")}</p>
                          <p className="text-xs text-slate-400">⏱️ {s.durationMinutes} মিনিট | 📚 {s.preparation?.length || 0}টি প্রস্তুতি প্রশ্ন</p>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button onClick={() => setSModal({ open: true, data: s })} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 transition">✏️ সম্পাদনা</button>
                          <button onClick={() => setConfirmModal({ open: true, msg: `"${s.name}" বিষয়টি মুছে ফেলবেন?`, onOk: () => deleteSubject(s.id) })} className="text-xs bg-slate-100 dark:bg-slate-800 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition">🗑️ মুছুন</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === "users" && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">মোট {users.length} জন ইউজার</p>
              {[...users].sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).map(u => (
                <div key={u.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="flex items-start gap-3">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {u.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{u.name || "অজানা"}</p>
                        {u.isAdmin && <Badge color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">Admin</Badge>}
                        {u.retakeAccess && <Badge color="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Retake</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">{u.total_score || 0} পয়েন্ট</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={() => setConfirmModal({ open: true, msg: u.isAdmin ? `${u.name} এর Admin সরাবেন?` : `${u.name} কে Admin বানাবেন?`, onOk: () => toggleAdmin(u) })} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${u.isAdmin ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                      {u.isAdmin ? "🛡️ Admin সরান" : "🛡️ Admin করুন"}
                    </button>
                    <button onClick={() => setConfirmModal({ open: true, msg: u.retakeAccess ? `${u.name} এর Retake সরাবেন?` : `${u.name} কে Retake দেবেন?`, onOk: () => toggleRetake(u) })} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${u.retakeAccess ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                      {u.retakeAccess ? "🔄 Retake সরান" : "🔄 Retake দিন"}
                    </button>
                    <button onClick={() => setConfirmModal({ open: true, msg: `${u.name} এর স্কোর ০ করবেন?`, onOk: () => resetScore(u) })} className="text-xs bg-slate-100 dark:bg-slate-800 text-red-500 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                      🔁 স্কোর রিসেট
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RESULTS TAB */}
          {activeTab === "results" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 text-center">
                  <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{attempts.length}</p>
                  <p className="text-[11px] font-bold text-blue-500 mt-0.5">মোট Attempt</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-3 text-center">
                  <p className="text-xl font-extrabold text-green-600 dark:text-green-400">{attempts.filter(a => a.total > 0 && (a.score / a.total) >= 0.7).length}</p>
                  <p className="text-[11px] font-bold text-green-500 mt-0.5">পাস (≥70%)</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3 text-center">
                  <p className="text-xl font-extrabold text-red-500">{avgScore}</p>
                  <p className="text-[11px] font-bold text-red-400 mt-0.5">গড় স্কোর</p>
                </div>
              </div>
              <div className="space-y-3">
                {[...attempts].sort((a, b) => (b.timestamp?.toDate?.()?.getTime() || 0) - (a.timestamp?.toDate?.()?.getTime() || 0)).map(a => {
                  const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                  const passed = pct >= 70;
                  return (
                    <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{a.displayName || a.email}</p>
                          <p className="text-xs text-slate-400 truncate">{a.email}</p>
                          <p className="text-xs text-slate-400">📋 {a.examId}</p>
                          <p className="text-xs text-slate-400">🕐 {a.timestamp?.toDate?.()?.toLocaleString("bn-BD") || "—"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-extrabold ${passed ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{a.score}/{a.total}</p>
                          <Badge color={passed ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"}>{pct}%</Badge>
                        </div>
                      </div>
                      <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${passed ? "bg-green-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <button onClick={() => setConfirmModal({ open: true, msg: `${a.displayName || a.email} এর এই attempt মুছবেন?`, onOk: () => deleteAttempt(a.id, a.uid, a.score) })} className="mt-3 text-xs text-red-500 font-bold px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition">
                        🗑️ এই Attempt মুছুন
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-3">📢 নোটিশ বোর্ড</h3>
                <textarea value={notice} onChange={e => setNotice(e.target.value)} rows={3} placeholder="ড্যাশবোর্ডে দেখানোর জন্য নোটিশ লিখুন..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveNotice} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 rounded-xl transition">সেভ করুন</button>
                  <button onClick={async () => { setNotice(""); await setDoc(doc(db, "settings", "notice"), { text: "" }); showToast("নোটিশ মুছে গেছে ✅"); }} className="text-sm font-bold text-red-500 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition">মুছুন</button>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">🎯 Current Exam ID</h3>
                <p className="text-xs text-slate-400 mb-3">Quiz page যে exam এর attempt চেক করবে</p>
                <input value={examConfigId} onChange={e => setExamConfigId(e.target.value)} placeholder="যেমন: math_2025" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 mb-2" />
                <button onClick={saveExamConfig} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 rounded-xl transition">সেভ করুন</button>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/40 p-4">
                <h3 className="text-sm font-extrabold text-red-600 dark:text-red-400 mb-3">⚠️ বিপজ্জনক এলাকা</h3>
                <button onClick={() => setConfirmModal({ open: true, msg: "সকল ইউজারের স্কোর ০ হয়ে যাবে! নিশ্চিত?", onOk: resetLeaderboard })} className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-3 rounded-xl transition">
                  🔁 সব স্কোর রিসেট করুন (Leaderboard Clear)
                </button>
              </div>
            </div>
          )}

        </>}
      </div>

      {qModal.open && <QuestionModal initial={qModal.data} onSave={saveQuestion} onClose={() => setQModal({ open: false })} />}
      {sModal.open && <SubjectModal initial={sModal.data} onSave={saveSubject} onClose={() => setSModal({ open: false })} />}

      {/* ✅ JSON Upload Modal */}
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{initial ? "প্রশ্ন সম্পাদনা" : "নতুন প্রশ্ন"}</h3>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">প্রশ্ন *</label>
            <textarea value={form.q} onChange={e => setForm(f => ({ ...f, q: e.target.value }))} rows={2} placeholder="প্রশ্নটি লিখুন" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          {(["a", "b", "c", "d"] as const).map(k => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block uppercase">{k} অপশন *</label>
              <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={`${k.toUpperCase()} এর উত্তর`} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">সঠিক উত্তর *</label>
            <div className="flex gap-2">
              {(["a", "b", "c", "d"] as const).map(k => (
                <button key={k} onClick={() => setForm(f => ({ ...f, correct: k }))} className={`flex-1 py-2 rounded-xl text-sm font-bold uppercase border-2 transition ${form.correct === k ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"}`}>{k}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">বাতিল</button>
            <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition">
              {saving ? "সেভ হচ্ছে..." : "সেভ করুন ✓"}
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
          <h3 className="font-extrabold text-slate-800 dark:text-slate-100">{initial ? "বিষয় সম্পাদনা" : "নতুন বিষয়"}</h3>
          <button onClick={onClose} className="text-slate-400 text-xl hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-3">
          {[{ label: "বিষয়ের নাম *", key: "name", placeholder: "যেমন: Business Mathematics" }, { label: "Exam ID *", key: "examId", placeholder: "যেমন: math_2025" }].map(f => (
            <div key={f.key}>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">পরীক্ষার তারিখ ও সময় *</label>
            <input type="datetime-local" value={form.examDate} onChange={e => setForm(p => ({ ...p, examDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">সময়কাল (মিনিট)</label>
            <input type="number" value={form.durationMinutes} onChange={e => setForm(p => ({ ...p, durationMinutes: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">📚 প্রস্তুতি প্রশ্ন ও উত্তর</label>
              <button onClick={addPrep} className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition">+ যোগ করুন</button>
            </div>
            {prepItems.map((item, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-2 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
                  <button onClick={() => removePrep(i)} className="text-xs text-red-500 font-bold">✕ সরান</button>
                </div>
                <input value={item.question} onChange={e => updatePrep(i, "question", e.target.value)} placeholder="প্রশ্ন" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <input value={item.answer} onChange={e => updatePrep(i, "answer", e.target.value)} placeholder="উত্তর" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-2.5 text-sm focus:outline-none focus:border-green-400" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">বাতিল</button>
            <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-60 transition">
              {saving ? "সেভ হচ্ছে..." : "সেভ করুন ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}