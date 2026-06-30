"use client";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc, getDoc, collection, query, orderBy, limit,
  getDocs, updateDoc, where
} from "firebase/firestore";
import { useRouter } from "next/navigation";

// ✅ একটি Subject/পরীক্ষার শেপ — "subjects" কালেকশনে ডকুমেন্ট অ্যাড করলেই
// এখানে নতুন বিষয় অটো-শো হবে (admin panel থেকে subject add করা যাবে)
type PreparationItem = {
  question: string;
  answer: string;
};

type Subject = {
  id: string;
  name: string;          // বিষয়ের নাম, যেমন "Business Mathematics"
  examId: string;        // user_attempts এ ব্যবহৃত হবে uid_examId হিসেবে
  examDate: any;         // Firestore Timestamp
  durationMinutes?: number;
  preparation?: PreparationItem[]; // ✅ countdown চলাকালীন দেখার জন্য answer-সহ প্রশ্ন
  classLevel: string;    // ✅ কোন ক্লাসের বিষয় — Firestore এর "class" ফিল্ড থেকে আসবে, যেমন "V", "VI", "XII"
};

// ✅ ক্লাসগুলোকে সঠিক ক্রমে সাজানোর জন্য (Firestore থেকে আসা order নির্ভরযোগ্য না হতে পারে)
const CLASS_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// ✅ Firestore এ classLevel রোমান সংখ্যায় (I, II, V, VI...) থাকতে পারে —
// কিন্তু UI তে "Class 5", "Class 6" এর মতো সাধারণ সংখ্যা দেখানোর জন্য এই ম্যাপিং ব্যবহার হবে
const ROMAN_TO_NUMBER: Record<string, string> = {
  I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6",
  VII: "7", VIII: "8", IX: "9", X: "10", XI: "11", XII: "12",
};

// ✅ ক্লাস লেবেল দেখানোর জন্য — Firestore এ রোমান বা সংখ্যা যেভাবেই থাকুক না কেন,
// সবসময় সাধারণ সংখ্যা (Class 5, Class 6...) আকারে দেখাবে
const getClassDisplayLabel = (cls: string): string => {
  return ROMAN_TO_NUMBER[cls] || cls;
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [attemptedExamIds, setAttemptedExamIds] = useState<Set<string>>(new Set());
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [totalQuestionsSum, setTotalQuestionsSum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [now, setNow] = useState<number>(Date.now());
  const [preparationSubject, setPreparationSubject] = useState<Subject | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();

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

  // ✅ প্রতি সেকেন্ডে সময় আপডেট — সব subject কার্ডের কাউন্টডাউন একসাথে চলবে
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (diffMs: number) => {
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    if (days > 0) return `${days}দি ${hours}ঘ ${minutes}মি`;
    if (hours > 0) return `${hours}ঘ ${minutes}মি ${seconds}সে`;
    return `${minutes}মি ${seconds}সে`;
  };

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
      // [OPT-1] আগে শুধু এই user এর data আনো
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      let currentUserData: any = null;
      if (userDoc.exists()) {
        const data = userDoc.data();
        currentUserData = data;
        setUserData(data);
        setNewName(data.name || "");
        setNewStudentClass(data.studentClass || "");
        setPhotoPreview(data.photoURL || null);
      }

      // [OPT-2] বাকি সব query একসাথে parallel এ চালাও
      // আগে: 4টা query একটার পর একটা = 4x latency
      // এখন: সব একসাথে = শুধু সবচেয়ে slow টার সমান latency
      const [lbSnap, subjSnap, myAttemptsSnap, noticeSnap] = await Promise.all([
        // লিডারবোর্ড — limit 25 যথেষ্ট (20 দেখাই, 5 buffer)
        getDocs(query(collection(db, "users"), orderBy("total_score", "desc"), limit(25))),
        // সব subject
        getDocs(query(collection(db, "subjects"), orderBy("examDate", "asc"))),
        // [OPT-3] সবচেয়ে বড় fix: আগে সব user এর 200টা attempt টেনে client-side filter করত
        // এখন Firestore server-side এ শুধু এই user এর attempt আনছে — reads অনেক কমবে
        getDocs(query(collection(db, "user_attempts"), where("uid", "==", currentUser.uid))),
        // নোটিশ
        getDoc(doc(db, "settings", "notice")),
      ]);

      // লিডারবোর্ড process
      const allUsers = lbSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const board = allUsers.filter((u: any) => !u.hiddenFromLeaderboard).slice(0, 20);
      setLeaderboard(board);
      const rankIdx = board.findIndex((b: any) => b.id === currentUser.uid);
      setMyRank(rankIdx >= 0 ? rankIdx + 1 : null);

      // Subject process
      const subjList: Subject[] = subjSnap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || "নামহীন বিষয়",
          examId: data.examId || d.id,
          examDate: data.examDate,
          durationMinutes: data.durationMinutes || 30,
          preparation: Array.isArray(data.preparation) ? data.preparation : [],
          classLevel: (data.class || data.classLevel || "অন্যান্য").toString().trim(),
        };
      });
      setSubjects(subjList);

      // Admin না হলে student শুধু নিজের ক্লাসের subject দেখবে
      setSelectedClass(prev => {
        const isAdminUser = !!currentUserData?.isAdmin;
        if (!isAdminUser) return currentUserData?.studentClass || null;
        if (prev && subjList.some(s => s.classLevel === prev)) return prev;
        const uniqueClasses = Array.from(new Set(subjList.map(s => s.classLevel)));
        uniqueClasses.sort((a, b) => {
          const ai = CLASS_ORDER.indexOf(a);
          const bi = CLASS_ORDER.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        return uniqueClasses[0] || null;
      });

      // [OPT-3 continued] myAttemptsSnap এ এখন শুধু এই user এর attempt — আর client filter দরকার নেই
      const myAttempts = myAttemptsSnap.docs.map(d => d.data() as any);
      setAttemptedExamIds(new Set(myAttempts.map((a: any) => a.examId)));
      setTotalAttempts(myAttempts.length);
      const questionsSum = myAttempts.reduce((sum: number, a: any) => sum + (a.total || 0), 0);
      setTotalQuestionsSum(questionsSum);

      // নোটিশ
      if (noticeSnap.exists()) setNotice((noticeSnap as any).data()?.text || null);

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

  // ✅ Student (Admin না) এর ক্লাস এখনো সেট করা না থাকলে প্রোফাইল মডাল অটোমেটিক খুলে যাবে —
  // যাতে সে নিজের ক্লাস সিলেক্ট না করা পর্যন্ত বুঝতে পারে এটা আগে করতে হবে
  useEffect(() => {
    if (!loading && userData && !userData.isAdmin && !userData.studentClass) {
      setIsModalOpen(true);
    }
  }, [loading, userData]);

  // ✅ ছবি সিলেক্ট করলে Canvas দিয়ে compress করে base64 এ কনভার্ট করা
  // যেকোনো সাইজের ছবি আপলোড করা যাবে — অটো রিসাইজ ও কম্প্রেস হবে
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_DIM = 512; // প্রোফাইল ছবির জন্য যথেষ্ট
          let { width, height } = img;
          if (width > height) {
            if (width > MAX_DIM) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
          } else {
            if (height > MAX_DIM) { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas error"));
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.75)); // JPEG, 75% quality
        };
        img.onerror = () => reject(new Error("ছবি লোড হয়নি"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("ফাইল পড়া যায়নি"));
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("দয়া করে একটি ছবি ফাইল নির্বাচন করুন।");
      // ✅ ইনপুট রিসেট করা
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const compressed = await compressImage(file);
      setPhotoPreview(compressed);
    } catch {
      alert("ছবি প্রসেস করতে সমস্যা হয়েছে। অন্য একটি ছবি চেষ্টা করুন।");
    } finally {
      // ✅ আপলোড করার পর file input সবসময় রিসেট হবে
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // ✅ Admin না হলে নিজের ক্লাস সিলেক্ট করা বাধ্যতামূলক — এটার ভিত্তিতেই dashboard-এ শুধু তার ক্লাসের পরীক্ষা দেখাবে
    if (!userData?.isAdmin && !newStudentClass) {
      alert("দয়া করে আপনার ক্লাস নির্বাচন করুন!");
      return;
    }
    setIsUpdating(true);
    try {
      const payload: Record<string, any> = { name: newName };
      if (newStudentClass) payload.studentClass = newStudentClass;
      if (photoPreview) payload.photoURL = photoPreview;
      await updateDoc(doc(db, "users", user.uid), payload);
      await fetchData(user);
      setIsModalOpen(false);
    } catch { alert("আপডেট ব্যর্থ হয়েছে।"); }
    finally { setIsUpdating(false); }
  };

  const handleLogout = async () => { await signOut(auth); router.push("/"); };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-500 dark:text-slate-400 font-bold">লোড হচ্ছে...</p>
      </div>
    </div>
  );

  const totalCorrect = userData?.total_score || 0;
  const avgScore = totalQuestionsSum > 0 ? Math.round((totalCorrect / totalQuestionsSum) * 100) : 0;
  const badge = getBadge(totalCorrect, totalQuestionsSum);

  // ✅ Admin সব ক্লাসের subject দেখতে পাবে, কিন্তু student শুধু নিজের ক্লাসের subject-ই দেখবে/দিতে পারবে —
  // এতে অন্য ক্লাসের পরীক্ষা dashboard-এ আসেই না, তাই ভুল ক্লাসের পরীক্ষা দেওয়ার সুযোগ থাকে না
  const isAdminUser = !!userData?.isAdmin;
  const effectiveSubjects = isAdminUser
    ? subjects
    : subjects.filter(s => s.classLevel === userData?.studentClass);

  // ✅ ক্লাস অনুযায়ী subject গুলোকে গ্রুপ করার জন্য — শুধু সিলেক্ট করা ক্লাসের subject গুলো দেখানো হবে
  const sortedClasses = Array.from(new Set(effectiveSubjects.map(s => s.classLevel))).sort((a, b) => {
    const ai = CLASS_ORDER.indexOf(a);
    const bi = CLASS_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const visibleSubjects = effectiveSubjects.filter(s => s.classLevel === selectedClass);

  // ✅ সিলেক্ট করা ক্লাসের subject গুলোকে আবার subject name অনুযায়ী গ্রুপ করা হচ্ছে —
  // একই নামের subject এ একাধিক পরীক্ষা (ভিন্ন তারিখে) থাকলে সেগুলো একই সেকশনে দেখাবে
  const groupedBySubjectName = visibleSubjects.reduce((acc: Record<string, Subject[]>, subject) => {
    if (!acc[subject.name]) acc[subject.name] = [];
    acc[subject.name].push(subject);
    return acc;
  }, {});
  const subjectNameGroups = Object.entries(groupedBySubjectName);

  const AvatarOrInitial = ({ size = "w-14 h-14", textSize = "text-xl" }: { size?: string; textSize?: string }) =>
    userData?.photoURL ? (
      <img
        src={userData.photoURL}
        alt="প্রোফাইল ছবি"
        className={`${size} rounded-full object-cover ring-2 ring-white dark:ring-slate-900`}
      />
    ) : (
      <div className={`${size} rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center ${textSize} font-bold text-white ring-2 ring-white dark:ring-slate-900`}>
        {userData?.name ? userData.name.charAt(0).toUpperCase() : "U"}
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-8 sm:pb-16 transition-colors duration-300">

      {/* ✅ Navbar — Mobile First */}
      <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">🎯</span>
          <h1 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">কুইজ পোর্টাল</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {/* ✅ ডার্ক/লাইট থিম টগল বাটন */}
          <button
            onClick={toggleTheme}
            aria-label="থিম পরিবর্তন করুন"
            className="relative w-11 h-6 rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200 flex items-center px-0.5 border border-slate-200 dark:border-slate-700"
          >
            <span
              className={`w-5 h-5 rounded-full bg-white dark:bg-slate-950 flex items-center justify-center text-[10px] transition-transform duration-200 ${
                theme === "dark" ? "translate-x-[18px]" : "translate-x-0"
              }`}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="প্রোফাইল"
          >
            <AvatarOrInitial size="w-7 h-7" textSize="text-xs" />
            <span className="hidden sm:block text-sm font-medium text-slate-600 dark:text-slate-300">প্রোফাইল</span>
          </button>
          {userData?.isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="text-xs sm:text-sm font-medium text-white bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition"
            >
              🛡️ Admin
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-500 dark:hover:text-red-400 transition"
          >
            লগআউট
          </button>
        </div>
      </nav>

      {/* ✅ Notice Board — Mobile First */}
      {notice && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900 px-4 py-2.5 flex items-start gap-2.5">
          <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-[10px]">📢</span>
          <p className="text-amber-700 dark:text-amber-300 text-xs leading-relaxed"><span className="font-bold">নোটিশ: </span>{notice}</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-4 mt-4 sm:mt-8 space-y-5 sm:space-y-8">

        {/* ✅ প্রোফাইল হিরো কার্ড — ডার্ক থিমের সাথে মিলিয়ে সফট গ্লো ডিজাইন */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-8 shadow-sm">
          {/* সফট গ্লো accent — উজ্জ্বল সলিড ব্লকের বদলে subtle glow */}
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-emerald-400/20 dark:bg-emerald-500/10 blur-3xl"></div>
          <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-teal-400/10 dark:bg-teal-500/10 blur-3xl"></div>

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <AvatarOrInitial />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-white">
                    স্বাগতম, {userData?.name || "শিক্ষার্থী"}! 👋
                  </h2>
                  {badge && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900">
                      {badge.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{user?.email}</p>
                {myRank && (
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    🏅 লিডারবোর্ডে আপনার অবস্থান: #{myRank}
                  </p>
                )}
              </div>
            </div>

            {/* স্ট্যাট কার্ড */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full sm:min-w-[360px]">
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center">
                <p className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-white">{totalCorrect}</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">মোট স্কোর</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center">
                <p className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-white">{totalAttempts}</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">পরীক্ষা দিয়েছেন</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-400/10 border border-emerald-100 dark:border-emerald-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center">
                <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{avgScore}%</p>
                <p className="text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">গড় সঠিক হার</p>
              </div>
              <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 border border-amber-300 dark:border-amber-700 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 text-center shadow-sm">
                <p className="text-xl sm:text-2xl font-extrabold text-white drop-shadow">#{myRank || "—"}</p>
                <p className="text-[11px] font-bold text-amber-50 mt-0.5">🏅 র‍্যাঙ্ক</p>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ বিষয়ভিত্তিক পরীক্ষা — প্রতিটি subject এর নিজস্ব কাউন্টডাউন */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📖</span>
            <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg tracking-tight">পরীক্ষাসমূহ</h3>
          </div>

          {/* ✅ ক্লাস ট্যাব — শুধু Admin-ই সব ক্লাসের মধ্যে সুইচ করতে পারবে; Student শুধু নিজের ক্লাস দেখবে */}
          {isAdminUser && sortedClasses.length > 0 && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {sortedClasses.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition whitespace-nowrap ${
                    selectedClass === cls
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700"
                  }`}
                >
                  {cls === "অন্যান্য" ? cls : `ক্লাস ${getClassDisplayLabel(cls)}`}
                </button>
              ))}
            </div>
          )}
          {!isAdminUser && userData?.studentClass && (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-4">
              🎓 আপনার ক্লাস: ক্লাস {getClassDisplayLabel(userData.studentClass)} — শুধু এই ক্লাসের পরীক্ষাই এখানে দেখানো হচ্ছে
            </p>
          )}

          {!isAdminUser && !userData?.studentClass ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <p className="text-3xl mb-2">🎓</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">পরীক্ষা দেখতে হলে আগে আপনার ক্লাস নির্বাচন করুন।</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition active:scale-95"
              >
                ক্লাস নির্বাচন করুন
              </button>
            </div>
          ) : subjects.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <p className="text-3xl mb-2">🗒️</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">এখনো কোনো বিষয়/পরীক্ষা যুক্ত করা হয়নি।</p>
            </div>
          ) : effectiveSubjects.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <p className="text-3xl mb-2">🗒️</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">আপনার ক্লাসে এখনো কোনো বিষয়/পরীক্ষা যুক্ত করা হয়নি।</p>
            </div>
          ) : visibleSubjects.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <p className="text-3xl mb-2">🗒️</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">এই ক্লাসে এখনো কোনো বিষয়/পরীক্ষা যুক্ত করা হয়নি।</p>
            </div>
          ) : (
            <div className="space-y-6">
              {subjectNameGroups.map(([subjectName, subjectsInGroup]) => (
                <div key={subjectName}>
                  {/* ✅ Subject Name সেকশন হেডার — সিলেক্ট করা ক্লাসের ভেতরে বিষয় অনুযায়ী আলাদা গ্রুপ */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">📚</span>
                    <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm sm:text-base tracking-tight">
                      {subjectName}
                    </h4>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                      ({subjectsInGroup.length}টি পরীক্ষা)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {subjectsInGroup.map((subject) => {
                      const examTime = subject.examDate?.toDate
                        ? subject.examDate.toDate().getTime()
                        : new Date(subject.examDate).getTime();
                      const diff = examTime - now;
                      const isLive = diff <= 0;
                      const isDone = attemptedExamIds.has(subject.examId);
      
                      return (
                        <div
                          key={subject.id}
                          className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col justify-between hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-none hover:border-emerald-200 dark:hover:border-emerald-800 transition-all duration-200 active:scale-[0.99]"
                        >
                          {/* ✅ স্ট্যাটাস অনুযায়ী বাম পাশে রঙের একটা accent bar */}
                          <div
                            className={`absolute left-0 top-0 bottom-0 w-1 ${
                              isLive ? "bg-rose-400" : isDone ? "bg-green-400" : "bg-emerald-300"
                            }`}
                          />
      
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <h4 className="font-bold text-slate-800 dark:text-slate-100 leading-snug">{subject.name}</h4>
                              {isLive ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  লাইভ
                                </span>
                              ) : isDone ? (
                                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-400/10 dark:text-green-300 shrink-0">
                                  ✅ সম্পন্ন
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300 shrink-0">
                                  আসছে
                                </span>
                              )}
                            </div>
      
                            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-800">
                              {isLive ? (
                                <p className="text-sm font-bold text-rose-600 dark:text-rose-400">পরীক্ষা চলছে — এখনই অংশ নিন</p>
                              ) : isDone ? (
                                <p className="text-sm font-bold text-green-600 dark:text-green-400">আপনি এই পরীক্ষা দিয়েছেন ✅</p>
                              ) : (
                                <>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">শুরু হতে বাকি</p>
                                  <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                                    {formatCountdown(diff)}
                                  </p>
                                </>
                              )}
                            </div>
      
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                ⏳ {subject.durationMinutes || 30} মিনিট
                              </p>
                              {/* ✅ আগে দেওয়া থাকলে এবার দিলে এটা যে practice/re-attempt তা স্পষ্ট করে জানানো হচ্ছে */}
                              {isDone && (
                                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                  🔁 আবার দিলে প্র্যাকটিস হিসেবে গণ্য হবে
                                </p>
                              )}
                            </div>
                          </div>
      
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => setPreparationSubject(subject)}
                              disabled={isLive || !subject.preparation || subject.preparation.length === 0}
                              title={
                                isLive
                                  ? "কাউন্টডাউন শেষ — প্রস্তুতি বন্ধ"
                                  : !subject.preparation || subject.preparation.length === 0
                                  ? "এই বিষয়ে এখনো প্রস্তুতির প্রশ্ন যুক্ত করা হয়নি"
                                  : "প্রশ্ন ও উত্তর দিয়ে প্রস্তুতি নিন"
                              }
                              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition ${
                                isLive || !subject.preparation || subject.preparation.length === 0
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                  : "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-400/20 active:scale-95"
                              }`}
                            >
                              📘 প্রস্তুতি
                            </button>
                            {/* ✅ isDone হলেও বাটন disabled না — বার বার দেওয়া যাবে,
                                শুধু প্রথমবারের স্কোরই ডাটাবেসে সেভ থাকে (quiz page এ হ্যান্ডল হয়) */}
                            <button
                              onClick={() => router.push(`/quiz?subject=${subject.examId}`)}
                              disabled={!isLive}
                              title={isDone ? "আগে একবার দেওয়া হয়েছে — এবার দিলে এটি প্র্যাকটিস অ্যাটেম্পট হবে" : undefined}
                              className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition ${
                                !isLive
                                  ? "bg-slate-300 dark:bg-slate-700 cursor-not-allowed"
                                  : isDone
                                  ? "bg-amber-600 hover:bg-amber-700 active:scale-95"
                                  : "bg-emerald-600 hover:bg-emerald-700 active:scale-95"
                              }`}
                            >
                              {!isLive ? "অপেক্ষা করুন" : isDone ? "আবার দিন (প্র্যাকটিস) ↻" : "পরীক্ষা দিন →"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ✅ লিডারবোর্ড */}
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 overflow-hidden">
          {/* আবছা ব্যাকগ্রাউন্ড গ্লো */}
          <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-300/20 dark:bg-amber-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-emerald-300/20 dark:bg-emerald-400/10 blur-3xl" />

          <div className="relative flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xl">🏆</span>
            <h3 className="font-bold text-slate-800 dark:text-slate-100">লিডারবোর্ড</h3>
            <span className="ml-auto text-[11px] font-bold text-slate-400 dark:text-slate-500">টপ {leaderboard.length}</span>
          </div>

          {leaderboard.length > 0 ? (
            <div className="relative space-y-5">
              {/* ✅ পডিয়াম — টপ ৩ */}
              {(() => {
                const top3 = leaderboard.slice(0, 3);
                if (top3.length === 0) return null;
                const order = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i); // ২য়-১ম-৩য় বিন্যাস
                const podiumStyle = [
                  { h: "h-24", ring: "ring-amber-300 dark:ring-amber-500", grad: "from-amber-300 to-amber-500", crown: "👑", scale: "scale-105 sm:scale-110" },
                  { h: "h-16", ring: "ring-slate-300 dark:ring-slate-500", grad: "from-slate-300 to-slate-400", crown: "🥈", scale: "" },
                  { h: "h-12", ring: "ring-orange-300 dark:ring-orange-500", grad: "from-orange-300 to-orange-500", crown: "🥉", scale: "" },
                ];
                return (
                  <div className="flex items-end justify-center gap-2 sm:gap-4 pt-2">
                    {order.map((origIdx) => {
                      if (!top3[origIdx]) return null;
                      const leader = top3[origIdx];
                      const isMe = leader.id === user?.uid;
                      const style = podiumStyle[origIdx];
                      return (
                        <button
                          key={leader.id}
                          onClick={() => router.push(`/profile/${leader.id}`)}
                          className={`flex flex-col items-center gap-1.5 w-1/3 ${style.scale} transition-transform hover:scale-105 active:scale-95 cursor-pointer`}
                        >
                          <div className="relative">
                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-lg sm:text-xl drop-shadow">{style.crown}</span>
                            {leader.photoURL ? (
                              <img
                                src={leader.photoURL}
                                alt=""
                                className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover ring-4 ${style.ring} ${isMe ? "ring-emerald-400 dark:ring-emerald-400" : ""}`}
                              />
                            ) : (
                              <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-sm sm:text-base font-extrabold text-white bg-gradient-to-br ${style.grad} ring-4 ${style.ring} ${isMe ? "ring-emerald-400 dark:ring-emerald-400" : ""}`}>
                                {leader.name?.charAt(0).toUpperCase() || "?"}
                              </div>
                            )}
                          </div>
                          <p className={`text-[11px] sm:text-xs font-bold text-center truncate w-full ${isMe ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}>
                            {leader.name?.split(" ")[0] || "অজানা"}{isMe && " (আমি)"}
                          </p>
                          <p className="text-[11px] sm:text-xs font-extrabold text-amber-600 dark:text-amber-400">{leader.total_score || 0} pts</p>
                          <div className={`w-full ${style.h} rounded-t-xl bg-gradient-to-b ${style.grad} flex items-start justify-center pt-1.5 shadow-inner`}>
                            <span className="text-white font-extrabold text-sm sm:text-base drop-shadow">{origIdx + 1}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ✅ বাকি র‍্যাঙ্কিং তালিকা (৪ নম্বর থেকে) */}
              <div className="space-y-2">
                {leaderboard.slice(3).map((leader, i) => {
                  const index = i + 3;
                  const isMe = leader.id === user?.uid;
                  const prevScore = leaderboard[index - 1]?.total_score || 0;
                  const gapToPrev = Math.max(prevScore - (leader.total_score || 0), 0);
                  return (
                    <button
                      key={leader.id}
                      onClick={() => router.push(`/profile/${leader.id}`)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer text-left ${
                        isMe
                          ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 ring-1 ring-emerald-200 dark:ring-emerald-800"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800"
                      }`}
                    >
                      <span className="text-sm font-extrabold w-7 text-center text-slate-400 dark:text-slate-500">{index + 1}</span>
                      {leader.photoURL ? (
                        <img src={leader.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isMe ? "bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        }`}>
                          {leader.name?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isMe ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-200"}`}>
                          {leader.name || "অজানা"}
                          {isMe && <span className="ml-1 text-xs">(আমি)</span>}
                        </p>
                        {isMe && gapToPrev > 0 && (
                          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                            🔥 মাত্র {gapToPrev} pts বেশি হলেই উপরের র‍্যাঙ্কে যাবেন!
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${
                        isMe ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800"
                      }`}>
                        {leader.total_score || 0} pts
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ✅ আমি যদি লিডারবোর্ডে টপ ৩-এর বাইরে থাকি — মোটিভেশন বার */}
              {myRank && myRank > 3 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                  <span className="text-lg">🚀</span>
                  <p className="text-xs font-bold flex-1">
                    আপনি এখন #{myRank} নম্বরে — আরও পরীক্ষায় অংশ নিয়ে স্কোর বাড়ান, টপ ৩-এ জায়গা করে নিন!
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">কোনো ডেটা নেই</p>
          )}
        </div>

      </div>

      {/* ✅ প্রোফাইল এডিট Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">⚙️ প্রোফাইল আপডেট</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl">✕</button>
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
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white">
                      {newName ? newName.charAt(0).toUpperCase() : "U"}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center text-sm"
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
                <p className="text-xs text-slate-500 dark:text-slate-400">ছবি পরিবর্তন করতে ক্যামেরা আইকনে ক্লিক করুন (যেকোনো সাইজ — অটো কম্প্রেস হবে)</p>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1 block">নতুন নাম</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-emerald-400 dark:focus:border-emerald-500"
                  placeholder="আপনার নাম লিখুন"
                />
              </div>
              {/* ✅ Admin না হলে নিজের ক্লাস সিলেক্ট করতে হবে — dashboard-এ শুধু এই ক্লাসের পরীক্ষাই দেখানো হবে */}
              {!userData?.isAdmin && (
                <div>
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1 block">আপনার ক্লাস</label>
                  <select
                    required
                    value={newStudentClass}
                    onChange={(e) => setNewStudentClass(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 p-3 text-sm focus:outline-none focus:border-emerald-400 dark:focus:border-emerald-500"
                  >
                    <option value="">— ক্লাস নির্বাচন করুন —</option>
                    {CLASS_ORDER.map((c) => (
                      <option key={c} value={c}>ক্লাস {getClassDisplayLabel(c)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">আপনি শুধু নিজের ক্লাসের পরীক্ষাই দেখতে ও দিতে পারবেন।</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 rounded-xl border border-slate-200 dark:border-slate-700 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-1/2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white transition disabled:opacity-60"
                >
                  {isUpdating ? "সেভ হচ্ছে..." : "সেভ করুন ✓"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ✅ প্রস্তুতি Modal — countdown চলাকালীন প্রশ্ন+উত্তর দেখার জন্য */}
      {preparationSubject && (() => {
        const examTime = preparationSubject.examDate?.toDate
          ? preparationSubject.examDate.toDate().getTime()
          : new Date(preparationSubject.examDate).getTime();
        const diff = examTime - now;
        const stillOpen = diff > 0;

        // ✅ কাউন্টডাউন শেষ হয়ে গেলে মডাল নিজে থেকেই বন্ধ হয়ে যাবে
        if (!stillOpen) {
          setTimeout(() => setPreparationSubject(null), 0);
          return null;
        }

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">📘 প্রস্তুতি — {preparationSubject.name}</h3>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-1">
                    ⏱️ পরীক্ষা শুরু হতে বাকি: {formatCountdown(diff)} — তারপর প্রস্তুতি বন্ধ হয়ে যাবে
                  </p>
                </div>
                <button
                  onClick={() => setPreparationSubject(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl shrink-0"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto p-5 space-y-4">
                {(preparationSubject.preparation || []).map((item, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
                      {idx + 1}. {item.question}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-400 pl-4 border-l-2 border-green-300 dark:border-green-700">
                      ✓ {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}