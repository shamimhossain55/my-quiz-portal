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
  const [wrong, setWrong] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/");
        return;
      }
      setUser(currentUser);

      // পরীক্ষা আগে দিয়েছে কি না চেক করা
      const attemptRef = doc(db, "user_attempts", currentUser.uid);
      const attemptSnap = await getDoc(attemptRef);
      if (attemptSnap.exists()) {
        setHasAttempted(true);
      }
    });

    const fetchQuestions = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "questions"));
        const data = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setQuestions(data);
      } catch (error) {
        console.error("প্রশ্ন লোড করতে সমস্যা:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
    return () => unsubscribe();
  }, [router]);

  const handleOptionClick = (opt: string) => {
    if (selectedOpt !== null) return;
    setSelectedOpt(opt);
    if (opt === questions[currentIdx].correct) setScore(score + 1);
    else setWrong(wrong + 1);
  };

  const saveScoreAndExit = async () => {
    if (user) {
      // স্কোর আপডেট
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { total_score: increment(score) });

      // একবার পরীক্ষা দিয়েছে বলে মার্ক করা
      const attemptRef = doc(db, "user_attempts", user.uid);
      await setDoc(attemptRef, { attempted: true, date: new Date() });
    }
    router.push("/dashboard");
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-800">লোড হচ্ছে...</div>;

  if (hasAttempted) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-red-100 max-w-sm w-full">
        <h2 className="text-2xl font-black text-red-600">আপনি ইতিমধ্যে পরীক্ষা দিয়েছেন!</h2>
        <p className="mt-4 text-gray-600">আপনি একবারই কুইজে অংশ নিতে পারবেন।</p>
        <button onClick={() => router.push("/dashboard")} className="mt-8 w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-bold">ড্যাশবোর্ডে ফিরে যান</button>
      </div>
    </div>
  );

  if (showResult) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-gray-100 max-w-sm w-full">
        <h2 className="text-3xl font-black text-gray-800">কুইজ শেষ! 🎉</h2>
        <p className="text-xl mt-4 font-bold">
          <span className="text-green-700">সঠিক: {score}</span> 
          <span className="mx-2 text-gray-400">|</span> 
          <span className="text-red-700">ভুল: {wrong}</span>
        </p>
        <button onClick={saveScoreAndExit} className="mt-8 w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-blue-700 transition">
          ড্যাশবোর্ডে ফিরে যান
        </button>
      </div>
    </div>
  );

  const currentQ = questions[currentIdx];

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="max-w-xl w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between mb-6 text-sm font-bold">
          <span className="text-green-700">সঠিক: {score}</span>
          <span className="text-red-700">ভুল: {wrong}</span>
        </div>
        
        <h2 className="text-xl font-bold text-gray-800 mb-6">{currentIdx + 1}. {currentQ.question}</h2>
        
        <div className="space-y-3">
          {currentQ.options?.map((opt: string, i: number) => {
            const isSelected = selectedOpt === opt;
            const isCorrect = opt === currentQ.correct;
            let bgColor = "bg-white text-gray-800 border-gray-200";
            if (selectedOpt !== null) {
              if (isCorrect) bgColor = "bg-green-600 text-white border-green-600";
              else if (isSelected) bgColor = "bg-red-600 text-white border-red-600";
            }
            return (
              <button 
                key={i}
                onClick={() => handleOptionClick(opt)}
                disabled={selectedOpt !== null}
                className={`w-full p-4 border-2 rounded-xl transition font-semibold text-left ${bgColor}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {selectedOpt && (
          <button 
            onClick={() => {
              if (currentIdx < questions.length - 1) {
                setCurrentIdx(currentIdx + 1);
                setSelectedOpt(null);
              } else setShowResult(true);
            }} 
            className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-bold"
          >
            {currentIdx === questions.length - 1 ? "ফলাফল দেখুন" : "পরের প্রশ্ন"}
          </button>
        )}
      </div>
    </div>
  );
}