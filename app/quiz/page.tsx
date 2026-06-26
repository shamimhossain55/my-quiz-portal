"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, increment, setDoc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function QuizPage() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<{ correct: boolean; selected: string; answer: string }[]>([]);
  const [showFinalResult, setShowFinalResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/"); return; }

      try {
        const configSnap = await getDoc(doc(db, "settings", "exam_config"));
        const examId = configSnap.data()?.current_exam_id || "default_exam";

        // ✅ ইউজারের প্রোফাইল ডাটা থেকে retakeAccess চেক করা হচ্ছে।
        // অ্যাডমিন প্যানেল থেকে নির্দিষ্ট কোনো ইউজারকে retakeAccess = true করে দিলে
        // সে আগে পরীক্ষা দিয়ে থাকলেও আবার দিতে পারবে।
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const retakeAccess = userSnap.data()?.retakeAccess === true;

        if (!retakeAccess) {
          const attemptSnap = await getDoc(doc(db, "user_attempts", `${user.uid}_${examId}`));
          if (attemptSnap.exists()) { setHasAttempted(true); }
        }

        const qSnap = await getDocs(collection(db, "questions"));
        const fetchedQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(fetchedQuestions);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSelectOption = (key: string) => {
    if (answered) return;
    setSelectedOpt(key);
    setAnswered(true);
  };

  const handleNext = async () => {
    const currentQ = questions[currentIdx];
    const isCorrect = selectedOpt === currentQ.correct;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);

    const newResults = [...results, {
      correct: isCorrect,
      selected: selectedOpt || "",
      answer: currentQ.correct
    }];
    setResults(newResults);

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelectedOpt(null);
      setAnswered(false);
    } else {
      await submitFinalScore(newScore);
      setShowFinalResult(true);
    }
  };

  // ✅ এখানেই মূল পরিবর্তন — displayName সহ save হবে, এবং retake হলে
  // total_score-এ পুরনো স্কোর বাদ দিয়ে নতুন স্কোরের পার্থক্য যোগ হবে
  // (একই exam বারবার দিলে যেন লিডারবোর্ডের স্কোর ভুলভাবে বেড়ে না যায়)
  const submitFinalScore = async (finalScore: number) => {
    if (!auth.currentUser) return;
    setIsSubmitting(true);
    try {
      const uid = auth.currentUser.uid;
      const email = auth.currentUser.email || "";

      // users collection থেকে নাম নিন
      const userDoc = await getDoc(doc(db, "users", uid));
      const displayName =
        userDoc.data()?.name ||
        auth.currentUser.displayName ||
        email.split("@")[0] ||
        "অজানা";

      const configSnap = await getDoc(doc(db, "settings", "exam_config"));
      const examId = configSnap.data()?.current_exam_id || "default_exam";

      // আগের attempt (যদি থাকে) থেকে পুরনো স্কোর বের করা — retake-এর সময়
      // total_score ডাবল কাউন্ট হওয়া ঠেকাতে
      const attemptRef = doc(db, "user_attempts", `${uid}_${examId}`);
      const prevAttemptSnap = await getDoc(attemptRef);
      const prevScore = prevAttemptSnap.exists() ? (prevAttemptSnap.data()?.score || 0) : 0;
      const scoreDelta = finalScore - prevScore;

      // ✅ displayName ও email সহ save
      await setDoc(attemptRef, {
        uid,
        examId,
        score: finalScore,
        total: questions.length,
        email,
        displayName,
        timestamp: new Date()
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

  const getOptionStyle = (key: string) => {
    const currentQ = questions[currentIdx];
    if (!answered) {
      return selectedOpt === key
        ? "border-blue-500 bg-blue-50 text-blue-700 font-bold"
        : "border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700";
    }
    if (key === currentQ.correct) {
      return "border-green-500 bg-green-50 text-green-700 font-bold";
    }
    if (key === selectedOpt && selectedOpt !== currentQ.correct) {
      return "border-red-500 bg-red-50 text-red-700 font-bold";
    }
    return "border-gray-200 text-gray-400";
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="font-bold text-gray-600">লোড হচ্ছে...</p>
    </div>
  );

  if (hasAttempted) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center bg-white p-10 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-4xl mb-4">✅</p>
        <p className="font-bold text-gray-700 text-lg">আপনি ইতিমধ্যে এই পরীক্ষা দিয়েছেন!</p>
        <button onClick={() => router.push("/dashboard")} className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition">
          ড্যাশবোর্ডে যান
        </button>
      </div>
    </div>
  );

  if (showFinalResult) {
    const totalCorrect = results.filter(r => r.correct).length;
    const totalWrong = results.filter(r => !r.correct).length;
    const percentage = Math.round((totalCorrect / questions.length) * 100);

    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center mb-6">
            <p className="text-5xl mb-3">🎯</p>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">কুইজ শেষ!</h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-3xl font-bold text-blue-600">{totalCorrect}/{questions.length}</p>
                <p className="text-xs font-bold text-blue-500 mt-1">মোট স্কোর</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <p className="text-3xl font-bold text-green-600">{totalCorrect}টি</p>
                <p className="text-xs font-bold text-green-500 mt-1">সঠিক ✅</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <p className="text-3xl font-bold text-red-600">{totalWrong}টি</p>
                <p className="text-xs font-bold text-red-500 mt-1">ভুল ❌</p>
              </div>
            </div>

            <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
              <div
                className="h-3 rounded-full transition-all"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: percentage >= 70 ? "#16a34a" : percentage >= 40 ? "#d97706" : "#dc2626"
                }}
              />
            </div>
            <p className="text-sm text-gray-500">{percentage}% সঠিক</p>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => {
              const result = results[idx];
              return (
                <div
                  key={q.id}
                  className={`bg-white rounded-xl border p-5 shadow-sm ${result.correct ? "border-green-200" : "border-red-200"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{result.correct ? "✅" : "❌"}</span>
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 mb-3">
                        <span className="text-gray-400 text-sm mr-2">প্রশ্ন {idx + 1}.</span>
                        {q.q}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {['a', 'b', 'c', 'd'].map((key) => (
                          <div
                            key={key}
                            className={`text-sm p-2 rounded-lg border ${
                              key === q.correct
                                ? "border-green-400 bg-green-50 text-green-700 font-bold"
                                : key === result.selected && !result.correct
                                ? "border-red-400 bg-red-50 text-red-700"
                                : "border-gray-100 text-gray-500"
                            }`}
                          >
                            <span className="uppercase font-bold mr-1">{key}.</span> {q[key]}
                          </div>
                        ))}
                      </div>
                      {!result.correct && (
                        <p className="text-xs text-green-600 font-bold mt-2">
                          সঠিক উত্তর: {q.correct.toUpperCase()}. {q[q.correct]}
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
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold transition"
          >
            ড্যাশবোর্ডে ফিরে যান 🏠
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">

        {isSubmitting ? (
          <div className="text-center py-10">
            <h2 className="text-2xl font-bold text-gray-800">ফলাফল সংরক্ষণ হচ্ছে... ⏳</h2>
          </div>
        ) : questions.length > 0 ? (
          <>
            <div className="mb-6">
              <div className="flex justify-between text-sm font-bold text-gray-500 mb-2">
                <span>প্রশ্ন {currentIdx + 1} / {questions.length}</span>
                <span className="text-green-600">{score} সঠিক</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${((currentIdx) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <h2 className="text-xl font-bold mb-6 text-gray-800">
              {currentQ?.q || "⚠️ প্রশ্নটি ডাটাবেসে ঠিকমতো সেভ হয়নি!"}
            </h2>

            <div className="space-y-3">
              {['a', 'b', 'c', 'd'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleSelectOption(key)}
                  disabled={answered}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${getOptionStyle(key)}`}
                >
                  <span className="uppercase mr-2 font-bold">{key}.</span>
                  {currentQ[key] || "⚠️ অপশন ফাঁকা"}
                  {answered && key === currentQ.correct && (
                    <span className="float-right">✓</span>
                  )}
                  {answered && key === selectedOpt && selectedOpt !== currentQ.correct && (
                    <span className="float-right">✗</span>
                  )}
                </button>
              ))}
            </div>

            {answered && (
              <div className={`mt-4 p-3 rounded-xl text-sm font-bold ${
                selectedOpt === currentQ.correct
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {selectedOpt === currentQ.correct
                  ? "✅ সঠিক উত্তর!"
                  : `❌ ভুল হয়েছে! সঠিক উত্তর: ${currentQ.correct.toUpperCase()}. ${currentQ[currentQ.correct]}`
                }
              </div>
            )}

            {answered && (
              <button
                onClick={handleNext}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold transition"
              >
                {currentIdx === questions.length - 1 ? "ফলাফল দেখুন 🎯" : "পরের প্রশ্ন →"}
              </button>
            )}
          </>
        ) : (
          <p className="text-center font-bold text-gray-500">কোনো প্রশ্ন পাওয়া যায়নি।</p>
        )}
      </div>
    </div>
  );
}