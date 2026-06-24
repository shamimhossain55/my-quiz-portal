"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, orderBy, limit, getDocs, updateDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [upcomingExams] = useState([
    { id: 1, name: "Business Mathematics", date: "২৫ জুন, ২০২৬" },
    { id: 2, name: "Principles of Finance", date: "২৮ জুন, ২০২৬" },
  ]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const router = useRouter();

  const fetchData = async (currentUser: any) => {
    if (!currentUser || !currentUser.uid) return;

    try {
      const userRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        setNewName(data.name || "");
      } else {
        const defaultData = {
          uid: currentUser.uid,
          name: currentUser.displayName || "শিক্ষার্থী",
          email: currentUser.email,
          total_score: 0,
        };
        await setDoc(userRef, defaultData);
        setUserData(defaultData);
        setNewName(defaultData.name);
      }

      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("total_score", "desc"), limit(5));
      const querySnapshot = await getDocs(q);
      
      const leaders: any[] = [];
      querySnapshot.forEach((doc) => {
        leaders.push({ id: doc.id, ...doc.data() });
      });
      setLeaderboard(leaders);

    } catch (error) {
      console.error("Data fetching error:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && currentUser.uid) {
        setUser(currentUser);
        await fetchData(currentUser);
      } else {
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUpdating(true);
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        name: newName
      });
      
      await fetchData(user);
      setIsModalOpen(false);
      alert("আপনার নাম সফলভাবে আপডেট হয়েছে! 🎉");
    } catch (error) {
      console.error("Update failed:", error);
      alert("আপডেট করতে ব্যর্থ হয়েছে।");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-xl font-medium text-gray-600 animate-pulse">লোড হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <nav className="flex items-center justify-between bg-white px-6 py-4 shadow-sm border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🎯</span>
          <h1 className="text-xl font-black text-gray-800">কুইজ পোর্টাল</h1>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100 transition"
        >
          লগআউট
        </button>
      </nav>

      <div className="mx-auto mt-8 max-w-5xl px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* বাম পাশের কলাম: প্রোফাইল এবং আসন্ন পরীক্ষা */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl bg-white p-8 shadow-md border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-xs">
                  {userData?.name ? userData.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-800">
                    স্বাগতম, {userData?.name || "শিক্ষার্থী"}! 👋
                  </h2>
                  <p className="text-sm text-gray-500">আপনার প্রোফাইল প্যানেল</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 text-xs font-bold transition shrink-0"
              >
                ⚙️ প্রোফাইল এডিট
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-6">
                <p className="text-sm font-bold text-blue-600">আপনার মোট স্কোর</p>
                <h3 className="mt-2 text-4xl font-black text-blue-700">
                  {userData?.total_score || 0} পয়েন্ট
                </h3>
              </div>
              <div className="rounded-xl bg-green-50/50 border border-green-100 p-6 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-bold text-green-600">নতুন কুইজ</p>
                  <p className="text-xs text-gray-500 mt-1">আজকের কুইজে অংশ নিয়ে আপনার মেধা যাচাই করুন।</p>
                </div>
                <button
                  onClick={() => router.push("/quiz")}
                  className="mt-4 w-full rounded-xl bg-green-600 py-3 text-center font-bold text-white hover:bg-green-700 transition"
                >
                  কুইজ শুরু করুন 🚀
                </button>
              </div>
            </div>
          </div>

          {/* আসন্ন পরীক্ষা সেকশন */}
          <div className="rounded-2xl bg-white p-6 shadow-md border border-gray-100">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-3 mb-4">
              <span className="text-xl">📅</span>
              <h3 className="text-lg font-black text-gray-800">আসন্ন পরীক্ষা</h3>
            </div>
            <div className="space-y-3">
              {upcomingExams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-sm font-bold text-gray-700">{exam.name}</p>
                  <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-md">{exam.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ডান পাশের কলাম: লিডারবোর্ড */}
        <div className="md:col-span-1">
          <div className="rounded-2xl bg-white p-6 shadow-md border border-gray-100 h-full">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-3 mb-4">
              <span className="text-xl">🏆</span>
              <h3 className="text-lg font-black text-gray-800">লিডারবোর্ড</h3>
            </div>
            <div className="space-y-3">
              {leaderboard.length > 0 ? (
                leaderboard.map((leader, index) => {
                  const rankIcons = ["🥇", "🥈", "🥉"];
                  const isCurrentUser = leader.id === user?.uid;
                  const firstLetter = leader.name ? leader.name.charAt(0).toUpperCase() : "U";
                  return (
                    <div key={leader.id} className={`flex items-center justify-between p-3 rounded-xl border transition ${isCurrentUser ? "bg-amber-50 border-amber-200 text-amber-900 font-bold" : "bg-gray-50/50 border-gray-100 text-gray-700"}`}>
                      <div className="flex items-center space-x-3 truncate">
                        <span className="text-sm font-bold w-5 text-center shrink-0">{index < 3 ? rankIcons[index] : index + 1}</span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : index === 2 ? "bg-amber-600" : "bg-blue-500"}`}>{firstLetter}</div>
                        <span className="text-sm truncate">{leader.name} {isCurrentUser && "(আপনি)"}</span>
                      </div>
                      <span className="text-xs font-black bg-white px-2 py-1 rounded-md border border-gray-100 shadow-2xs shrink-0">{leader.total_score || 0} pts</span>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">কোনো ডাটা পাওয়া যায়নি</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-black text-gray-800 border-b border-gray-100 pb-3">⚙️ প্রোফাইল আপডেট করুন</h3>
            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">আপনার নাম</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 outline-none focus:border-blue-500 transition"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-1/2 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">বাতিল</button>
                <button type="submit" disabled={isUpdating} className="w-1/2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50">{isUpdating ? "সেভ হচ্ছে..." : "সেভ করুন ✨"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}