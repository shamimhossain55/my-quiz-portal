"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, deleteDoc, doc, query, orderBy, addDoc } from "firebase/firestore";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("questions");
  const [data, setData] = useState<any>({ questions: [], users: [], exams: [] });
  const [newJson, setNewJson] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");

  const fetchData = async () => {
    const qSnap = await getDocs(collection(db, "questions"));
    const uSnap = await getDocs(query(collection(db, "users"), orderBy("total_score", "desc")));
    const eSnap = await getDocs(collection(db, "exams"));
    setData({
      questions: qSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      users: uSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      exams: eSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    });
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddExam = async () => {
    if (!examName || !examDate) return alert("সব ঘর পূরণ করুন");
    await addDoc(collection(db, "exams"), { name: examName, date: examDate });
    alert("পরীক্ষা যুক্ত হয়েছে!");
    setExamName(""); setExamDate(""); fetchData();
  };

  const handleDeleteExam = async (id: string) => {
    await deleteDoc(doc(db, "exams", id));
    fetchData();
  };

  // ... (পূর্বের handleBulkUpload, handleScoreEdit, handleBlockUser, handleDeleteQuestion, clearLeaderboard ফাংশনগুলো এখানে থাকবে)
  const handleBulkUpload = async () => {
    try {
      const questions = JSON.parse(newJson);
      for (const q of questions) await addDoc(collection(db, "questions"), q);
      alert("সফল!"); setNewJson(""); fetchData();
    } catch (e) { alert("JSON এরর!"); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex text-gray-900">
      <div className="w-64 bg-white p-6 shadow-sm border-r border-gray-100">
        <h2 className="text-xl font-black text-blue-700 mb-8">Admin Panel ⚙️</h2>
        <nav className="space-y-2">
          <button onClick={() => setActiveTab("questions")} className="w-full text-left font-bold p-3 rounded-xl text-gray-700">প্রশ্ন ব্যবস্থাপনা</button>
          <button onClick={() => setActiveTab("users")} className="w-full text-left font-bold p-3 rounded-xl text-gray-700">ইউজার লিস্ট</button>
          <button onClick={() => setActiveTab("exams")} className="w-full text-left font-bold p-3 rounded-xl text-gray-700">পরীক্ষা ব্যবস্থাপনা</button>
        </nav>
      </div>

      <div className="flex-1 p-8">
        {activeTab === "exams" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <h3 className="text-lg font-bold mb-4">নতুন পরীক্ষা যোগ করুন</h3>
              <input placeholder="পরীক্ষার নাম" value={examName} onChange={(e) => setExamName(e.target.value)} className="w-full border p-3 rounded-xl mb-2" />
              <input placeholder="তারিখ (যেমন: ২৫ জুন, ২০২৬)" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full border p-3 rounded-xl mb-4" />
              <button onClick={handleAddExam} className="bg-blue-600 text-white py-3 px-6 rounded-xl font-bold">যোগ করুন</button>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              {data.exams.map((e: any) => (
                <div key={e.id} className="flex justify-between p-4 border-b">
                  <p>{e.name} - <span className="font-bold">{e.date}</span></p>
                  <button onClick={() => handleDeleteExam(e.id)} className="text-red-600">ডিলিট</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* অন্যান্য ট্যাবগুলো এখানে আগের মতোই থাকবে */}
      </div>
    </div>
  );
}