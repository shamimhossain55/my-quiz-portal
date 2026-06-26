"use client";
import { useEffect, useRef, useState } from "react";
import {
  collection, getDocs, doc, updateDoc, increment, setDoc, getDoc,
  query, where
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function QuizPage() {
  const [user, setUser] = useState<any>(null);
  const [examId, setExamId] = useState<string>("default_exam");
  const [subjectName, setSubjectName] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [maxWarnings, setMaxWarnings] = useState<number>(3);

  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  // ✅ প্রশ্নভিত্তিক উত্তর — index দিয়ে রাখা হচ্ছে যাতে back/skip করলেও উত্তর মনে থাকে
  const [answers, setAnswers] = useState<Record<number, string | null>>({});

  const [loading, setLoading] = useState(true);
  const [isFirstAttempt, setIsFirstAttempt] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFinalResult, setShowFinalResult] = useState(false);
  const [finalResults, setFinalResults] = useState<{ correct: boolean; selected: string | null; answer: string }[]>([]);
  const [finalScore, setFinalScore] = useState(0);

  // ✅ Exam শুরুর স্ক্রিন — fullscreen request করতে user gesture লাগে, তাই
  // প্রথমে একটা "শুরু করুন" বাটন দেখানো হয়
  const [examStarted, setExamStarted] = useState(false);

  // ✅ Timer
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // ✅ Anti-cheating
  const [warningCount, setWarningCount] = useState(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [flaggedForCheating, setFlaggedForCheating] = useState(false);
  const [autoSubmitReason, setAutoSubmitReason] = useState<string | null>(null);

  // ✅ Custom Submission Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const warningCountRef = useRef(0);
  const examStartedRef = useRef(false);
  const finalizedRef = useRef(false); // ডবল-সাবমিট আটকানোর জন্য
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const subjectParam = searchParams.get("subject");

  // ✅ প্রাথমিক ডেটা লোড: ইউজার, exam কনфিগ, প্রশ্ন, আগের attempt চেক
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { router.push("/"); return; }
      setUser(currentUser);

      try {
        let resolvedExamId = "default_exam";
        let resolvedDuration = 30;
        let resolvedMaxWarnings = 3;
        let resolvedSubjectName = "";

        if (subjectParam) {
          // ✅ subject-ভিত্তিক exam — subjects collection থেকে duration/name নেওয়া হচ্ছে
          resolvedExamId = subjectParam;
          const subjQ = query(collection(db, "subjects"), where("examId", "==", subjectParam));
          const subjSnap = await getDocs(subjQ);
          if (!subjSnap.empty) {
            const subjData = subjSnap.docs[0].data() as any;
            resolvedDuration = subjData.durationMinutes || 30;
            resolvedSubjectName = subjData.name || "";
            if (typeof subjData.maxWarnings === "number") resolvedMaxWarnings = subjData.maxWarnings;
          }
        } else {
          // ✅ পুরোনো single-exam সেটআপের সাথে compatible
          const configSnap = await getDoc(doc(db, "settings", "exam_config"));
          const configData = configSnap.data();
          resolvedExamId = configData?.current_exam_id || "default_exam";
          resolvedDuration = configData?.durationMinutes || 30;
          if (typeof configData?.maxWarnings === "number") resolvedMaxWarnings = configData.maxWarnings;
        }

        setExamId(resolvedExamId);
        setDurationMinutes(resolvedDuration);
        setMaxWarnings(resolvedMaxWarnings);
        setSubjectName(resolvedSubjectName);

        // ✅ আগে এই exam দেওয়া আছে কিনা চেক করা হচ্ছে — কিন্তু এখন এর জন্য
        // ইউজারকে আটকানো হবে না, শুধু মনে রাখা হচ্ছে এটা প্রথমবার কিনা।
        // প্রথমবারের স্কোরই ডাটাবেসে সেভ থাকবে, পরের বারগুলো শুধু practice হিসেবে গণ্য হবে।
        const attemptSnap = await getDoc(doc(db, "user_attempts", `${currentUser.uid}_${resolvedExamId}`));
        setIsFirstAttempt(!attemptSnap.exists());

        // ✅ প্রশ্ন লোড — subject-ভিত্তিক হলে সেই subject এর প্রশ্ন, ना পেলে সব প্রশ্ন (legacy fallback)
        let fetchedQuestions: any[] = [];
        if (subjectParam) {
          const qQ = query(collection(db, "questions"), where("examId", "==", resolvedExamId));
          const qSnap = await getDocs(qQ);
          fetchedQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        if (fetchedQuestions.length === 0) {
          const qSnapAll = await getDocs(collection(db, "questions"));
          fetchedQuestions = qSnapAll.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        setQuestions(fetchedQuestions);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router, subjectParam]);

  // ✅ Exam শুরু করার পদ্ধতি — timer শুরু হয়, fullscreen এর চেষ্টা হয়
  const handleStartExam = async () => {
    const startKey = `examStart_${user?.uid}_${examId}`;
    let startTime = Number(localStorage.getItem(startKey));
    if (!startTime) {
      startTime = Date.now();
      localStorage.setItem(startKey, String(startTime));
    }
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const remaining = durationMinutes * 60 - elapsedSec;

    if (remaining <= 0) {
      // ✅ আগেই সময় শেষ হয়ে গেছে (যেমন ট্যাব বন্ধ করে আবার এসেছে) — সরাসরি জমা
      setExamStarted(true);
      examStartedRef.current = true;
      handleSubmit("time");
      return;
    }

    setTimeLeft(remaining);
    setExamStarted(true);
    examStartedRef.current = true;

    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // ব্রাউজার fullscreen ব্লক করলেও পরীক্ষা চলবে, কেবল detection কাজ করবে না সম্পূর্ণভাবে
    }
  };

  // ✅ প্রতি সেকেন্ডে টাইমার কমবে; ০ হলে অটো-সাবমিট
  useEffect(() => {
    if (!examStarted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleSubmit("time");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examStarted]);

  // ✅ Anti-cheating: ট্যাব পরিবর্তন/মিনিমাইজ এবং fullscreen থেকে বের হওয়া ধরা
  useEffect(() => {
    const triggerViolation = (reason: string) => {
      if (!examStartedRef.current || finalizedRef.current) return;
      warningCountRef.current += 1;
      setWarningCount(warningCountRef.current);

      if (warningCountRef.current >= maxWarnings) {
        setFlaggedForCheating(true);
        handleSubmit("cheating");
      } else {
        setWarningMsg(
          `⚠️ সতর্কতা ${warningCountRef.current}/${maxWarnings}: পরীক্ষা চলাকালীন ট্যাব পরিবর্তন/মিনিমাইজ বা ফুলস্ক্রিন থেকে বের হওয়া নিষেধ। সীমা পার হলে পরীক্ষা স্বয়ংক্রিয়ভাবে জমা হয়ে যাবে।`
        );
        setTimeout(() => setWarningMsg(null), 6000);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) triggerViolation("tab");
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) triggerViolation("fullscreen");
    };
    const onContextMenu = (e: MouseEvent) => { if (examStartedRef.current) e.preventDefault(); };
    const onCopy = (e: ClipboardEvent) => { if (examStartedRef.current) e.preventDefault(); };

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWarnings]);

  const handleSelectOption = (key: string) => {
    setAnswers((prev) => ({ ...prev, [currentIdx]: key }));
  };

  const goNext = () => {
    if (currentIdx < questions.length - 1) setCurrentIdx((i) => i + 1);
  };
  const goBack = () => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  };
  const jumpTo = (idx: number) => setCurrentIdx(idx);

  // ✅ হিসাব করা কতটি প্রশ্নের উত্তর দেওয়া বাকি আছে
  const getUnansweredCount = () => {
    let count = 0;
    questions.forEach((_, idx) => {
      if (answers[idx] === undefined || answers[idx] === null) {
        count++;
      }
    });
    return count;
  };

  const unansweredCount = getUnansweredCount();

  // ✅ ফাইনাল সাবমিট — ম্যানুয়াল, সময় শেষে, বা cheating detect হলে — সবগুলো এই একই ফাংশন দিয়ে যায়
  const handleSubmit = async (reason: "manual" | "time" | "cheating") => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setAutoSubmitReason(reason !== "manual" ? reason : null);

    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
    }

    const results = questions.map((q, idx) => {
      const selected = answers[idx] ?? null;
      return { correct: selected === q.correct, selected, answer: q.correct };
    });
    const score = results.filter((r) => r.correct).length;

    setFinalResults(results);
    setFinalScore(score);

    if (isFirstAttempt) {
      await submitFinalScore(score, reason === "cheating", warningCountRef.current);
    } else {
      // ✅ প্রথম attempt না হলে ডাটাবেসে কিছু সেভ/আপডেট হবে না — শুধু practice
      setIsSubmitting(false);
    }
    localStorage.removeItem(`examStart_${user?.uid}_${examId}`);
    setShowFinalResult(true);
  };

  const submitFinalScore = async (
    finalScoreVal: number,
    cheatingFlag: boolean,
    violationCount: number
  ) => {
    if (!auth.currentUser) return;
    setIsSubmitting(true);
    try {
      const uid = auth.currentUser.uid;
      const email = auth.currentUser.email || "";

      const userDoc = await getDoc(doc(db, "users", uid));
      const displayName =
        userDoc.data()?.name ||
        auth.currentUser.displayName ||
        email.split("@")[0] ||
        "অজানা";

      const attemptRef = doc(db, "user_attempts", `${uid}_${examId}`);
      const prevAttemptSnap = await getDoc(attemptRef);
      const prevScore = prevAttemptSnap.exists() ? (prevAttemptSnap.data()?.score || 0) : 0;
      const scoreDelta = finalScoreVal - prevScore;

      await setDoc(attemptRef, {
        uid,
        examId,
        score: finalScoreVal,
        total: questions.length,
        email,
        displayName,
        timestamp: new Date(),
        // ✅ anti-cheating তথ্য — admin রিভিউ করতে পারবে
        flaggedForCheating: cheatingFlag,
        violationCount,
      });

      await updateDoc(doc(db, "users", uid), {
        total_score: increment(scoreDelta)
      });
    } catch (error) {
      console.error("Submit Error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getOptionStyle = (key: string) => {
    const selected = answers[currentIdx];
    return selected === key
      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold ring-2 ring-indigo-500/20"
      : "border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200";
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-500 dark:text-slate-400 font-bold">লোড হচ্ছে...</p>
      </div>
    </div>
  );

  // ✅ ফাইনাল রেজাল্ট স্ক্রিন
  if (showFinalResult) {
    const totalCorrect = finalResults.filter(r => r.correct).length;
    const totalWrong = finalResults.length - totalCorrect;
    const percentage = questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-10 transition-colors duration-300">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-6 sm:pt-10">

          {!isFirstAttempt && (
            <div className="mb-4 p-4 rounded-xl text-sm font-bold bg-blue-50 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 flex items-start gap-2">
              <span>📌</span>
              <span>এটি আপনার প্রথম প্রচেষ্টা নয়, তাই এই ফলাফল প্র্যাকটিস হিসেবে গণ্য হয়েছে — আপনার প্রথমবারের স্কোরই ডাটাবেসে ও লিডারবোর্ডে সংরক্ষিত থাকবে।</span>
            </div>
          )}
          {autoSubmitReason && (
            <div className={`mb-4 p-4 rounded-xl text-sm font-bold flex items-start gap-2 ${
              autoSubmitReason === "cheating"
                ? "bg-red-50 dark:bg-red-400/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
                : "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900"
            }`}>
              <span>{autoSubmitReason === "cheating" ? "🚩" : "⏰"}</span>
              <span>
                {autoSubmitReason === "cheating"
                  ? "বারবার ট্যাব পরিবর্তন/ফুলস্ক্রিন ত্যাগ করার কারণে পরীক্ষাটি স্বয়ংক্রিয়ভাবে জমা দেওয়া হয়েছে।"
                  : "সময় শেষ হওয়ায় পরীক্ষাটি স্বয়ংক্রিয়ভাবে জমা দেওয়া হয়েছে।"}
              </span>
            </div>
          )}

          {/* ✅ মাল্টি-কালার মডার্ন গ্র্যাডিয়েন্ট হিরো কার্ড */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 p-6 sm:p-8 text-white shadow-lg shadow-indigo-500/20 text-center mb-5">
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10"></div>
            <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/10"></div>
            <div className="relative">
              <p className="text-5xl mb-2">{percentage >= 70 ? "🏆" : percentage >= 40 ? "🎯" : "📚"}</p>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-1">
                {subjectName ? `${subjectName} — ` : ""}কুইজ শেষ!
              </h2>
              <p className="text-indigo-100 text-sm mb-6">আপনার ফলাফল প্রস্তুত হয়েছে</p>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5">
                <div className="bg-white/15 rounded-xl sm:rounded-2xl p-3 backdrop-blur-sm">
                  <p className="text-xl sm:text-2xl font-extrabold">{totalCorrect}/{questions.length}</p>
                  <p className="text-[11px] font-medium text-indigo-100 mt-0.5">মোট স্কোর</p>
                </div>
                <div className="bg-white/15 rounded-xl sm:rounded-2xl p-3 backdrop-blur-sm">
                  <p className="text-xl sm:text-2xl font-extrabold text-emerald-300">{totalCorrect}</p>
                  <p className="text-[11px] font-medium text-indigo-100 mt-0.5">সঠিক ✅</p>
                </div>
                <div className="bg-white/15 rounded-xl sm:rounded-2xl p-3 backdrop-blur-sm">
                  <p className="text-xl sm:text-2xl font-extrabold text-rose-300">{totalWrong}</p>
                  <p className="text-[11px] font-medium text-indigo-100 mt-0.5">ভুল ❌</p>
                </div>
              </div>

              <div className="w-full bg-white/20 rounded-full h-2.5 mb-2 overflow-hidden">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-700"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-sm font-bold text-white">{percentage}% সঠিক</p>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => {
              const result = finalResults[idx];
              return (
                <div
                  key={q.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-5 ${
                    result.correct
                      ? "border-emerald-100 dark:border-emerald-900/40"
                      : "border-rose-100 dark:border-rose-900/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      result.correct
                        ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-400"
                    }`}>
                      {result.correct ? "✓" : "✕"}
                    </span>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 dark:text-slate-100 mb-3">
                        <span className="text-slate-400 dark:text-slate-500 text-sm mr-2">প্রশ্ন {idx + 1}.</span>
                        {q.q}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {['a', 'b', 'c', 'd'].map((key) => (
                          <div
                            key={key}
                            className={`text-sm p-2 rounded-lg border ${
                              key === q.correct
                                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 font-bold"
                                : key === result.selected && !result.correct
                                ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300"
                                : "border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            <span className="uppercase font-bold mr-1">{key}.</span> {q[key]}
                          </div>
                        ))}
                      </div>
                      {!result.correct && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2">
                          সঠিক উত্তর: {q.correct.toUpperCase()}. {q[q.correct]}
                          {result.selected === null && <span className="text-slate-400 dark:text-slate-500 font-normal"> (এড়িয়ে গিয়েছিলেন)</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-4 rounded-xl font-bold transition shadow-lg shadow-indigo-500/20 active:scale-[0.99]"
          >
            ড্যাশবোর্ডে ফিরে যান 🏠
          </button>
        </div>
      </div>
    );
  }

  // ✅ Exam শুরু করার আগের স্ক্রিন
  if (!examStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-300">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">

          {/* ✅ বহু রঙের ভাইব্রেন্ট গ্র্যাডিয়েন্ট হিরো */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-500 to-fuchsia-600 p-6 sm:p-8 text-white text-center">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10"></div>
            <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-white/10"></div>
            <p className="relative text-4xl mb-2">📝</p>
            <h2 className="relative text-xl font-extrabold tracking-tight mb-1">{subjectName || "পরীক্ষা"}</h2>
            <p className="relative text-sm text-indigo-100">{questions.length} টি প্রশ্ন · {durationMinutes} মিনিট সময়</p>
          </div>

          <div className="p-6 sm:p-8">
            <div className="bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-left mb-6 space-y-1.5">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">নিয়মাবলী:</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/90">• পরীক্ষা শুরু হলে ফুলস্ক্রিন মোডে চলে যাবে</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/90">• ট্যাব পরিবর্তন/মিনিমাইজ করলে সতর্কবার্তা আসবে, সীমা পার হলে অটো-সাবমিট হবে</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/90">• সময় শেষ হলে যা উত্তর দেওয়া আছে তা নিয়েই স্বয়ংক্রিয়ভাবে জমা হয়ে যাবে</p>
              <p className="text-xs text-amber-700 dark:text-amber-300/90">• প্রশ্ন এড়িয়ে যেতে পারবেন এবং পরে ফিরে এসে উত্তর দিতে পারবেন</p>
              {!isFirstAttempt && (
                <p className="text-xs text-amber-700 dark:text-amber-300/90">• আপনি আগে এই পরীক্ষা দিয়েছেন — এবারের ফলাফল প্র্যাকটিস হিসেবে গণ্য হবে, ডাটাবেসে সেভ হবে না</p>
              )}
            </div>

            <button
              onClick={handleStartExam}
              disabled={questions.length === 0}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-3.5 rounded-xl font-bold transition shadow-lg shadow-indigo-500/20 active:scale-[0.99] disabled:opacity-50"
            >
              পরীক্ষা শুরু করুন →
            </button>
            {questions.length === 0 && (
              <p className="text-xs text-rose-500 dark:text-rose-400 mt-3 text-center">কোনো প্রশ্ন পাওয়া যায়নি, পরে চেষ্টা করুন।</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const isLast = currentIdx === questions.length - 1;
  const currentAnswered = answers[currentIdx] != null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 flex items-center justify-center transition-colors duration-300">
      <div className="relative max-w-xl w-full bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-200 dark:border-slate-800">

        {isSubmitting ? (
          <div className="text-center py-10">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">ফলাফল সংরক্ষণ হচ্ছে... ⏳</h2>
          </div>
        ) : (
          <>
            {/* ✅ Warning banner */}
            {warningMsg && (
              <div className="mb-4 p-3 rounded-xl text-xs sm:text-sm font-bold bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 animate-pulse">
                {warningMsg}
              </div>
            )}

            {/* ✅ Timer + প্রোগ্রেস (Multi-color Progress Bar) */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">
                  <span>প্রশ্ন {currentIdx + 1} / {questions.length}</span>
                  {subjectName && <span className="text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">{subjectName}</span>}
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${((currentIdx) / questions.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className={`shrink-0 px-3 py-2 rounded-xl font-mono font-bold text-sm sm:text-base ${
                timeLeft <= 60 
                  ? "bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-300 animate-pulse" 
                  : "bg-violet-50 dark:bg-violet-400/10 text-violet-600 dark:text-violet-300"
              }`}>
                ⏱️ {formatTime(timeLeft)}
              </div>
            </div>

            {/* ✅ প্রশ্ন নেভিগেটর — সরাসরি যেকোনো প্রশ্নে যাওয়া যাবে */}
            <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => jumpTo(idx)}
                  className={`shrink-0 w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition ${
                    idx === currentIdx
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : answers[idx] != null
                      ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            <h2 className="text-lg sm:text-xl font-bold mb-6 text-slate-800 dark:text-slate-100 leading-snug">
              {currentQ?.q || "⚠️ প্রশ্নটি ডাটাবেসে ঠিকমতো সেভ হয়নি!"}
            </h2>

            <div className="space-y-3">
              {['a', 'b', 'c', 'd'].map((key) => {
                const isSelected = answers[currentIdx] === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelectOption(key)}
                    className={`w-full flex items-center gap-3 text-left p-4 rounded-xl border-2 transition-all active:scale-[0.99] ${getOptionStyle(key)}`}
                  >
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs uppercase font-bold ${
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}>
                      {key}
                    </span>
                    <span>{currentQ[key] || "⚠️ অপশন ফাঁকা"}</span>
                  </button>
                );
              })}
            </div>

            {/* ✅ Back / Skip / Next / Submit নেভিগেশন */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={goBack}
                disabled={currentIdx === 0}
                className="flex-1 py-3.5 rounded-xl font-bold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                ← আগের
              </button>

              {!isLast ? (
                <button
                  onClick={goNext}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white transition shadow-lg shadow-indigo-500/20 active:scale-[0.99]"
                >
                  {currentAnswered ? "পরের প্রশ্ন →" : "এড়িয়ে যান →"}
                </button>
              ) : (
                <button
                  onClick={() => setShowSubmitModal(true)}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white transition shadow-lg shadow-violet-500/20 active:scale-[0.99]"
                >
                  পরীক্ষা জমা দিন 🎯
                </button>
              )}
            </div>

            {/* ✅ যেকোনো সময় জমা দেওয়ার অপশন (এখন কাস্টম মোডাল ওপেন করবে) */}
            {!isLast && (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="w-full mt-2 text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition py-1"
              >
                এখনই পরীক্ষা জমা দিন
              </button>
            )}
          </>
        )}

        {/* ✅ প্রিমিয়াম কাস্টম কনফার্মেশন পপআপ (Custom Submission Modal) */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fadeIn">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 transform scale-100 transition-all">
              <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                🎯 পরীক্ষা জমা নিশ্চিতকরণ
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                আপনি কি নিশ্চিত যে আপনার উত্তরপত্রটি এখনই জমা দিতে চান?
              </p>

              {/* প্রশ্ন বাকি থাকলে বা সবগুলোর উত্তর দিলে আলাদা ডায়নামিক কার্ড */}
              {unansweredCount > 0 ? (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-sm font-medium flex items-start gap-2">
                  <span className="text-base">⚠️</span>
                  <div>
                    আপনি এখনও <span className="font-extrabold text-rose-600 dark:text-rose-400">{unansweredCount} টি</span> প্রশ্নের উত্তর দেননি! জমা দিলে এগুলো এড়িয়ে যাওয়া (Skip) হিসেবে গণ্য হবে।
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-sm font-medium flex items-start gap-2">
                  <span className="text-base">✨</span>
                  <div>অভিনন্দন! আপনি সবকটি প্রশ্নের উত্তর সফলভাবে সম্পূর্ণ করেছেন।</div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-sm"
                >
                  ফিরে যান
                </button>
                <button
                  onClick={() => {
                    setShowSubmitModal(false);
                    handleSubmit("manual");
                  }}
                  className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20 transition text-sm"
                >
                  হ্যাঁ, জমা দিন
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}