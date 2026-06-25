"use client";
import { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // ✅ আগে লগইন থাকলে সরাসরি dashboard-এ পাঠাবে
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      return setError("নাম কমপক্ষে ২ অক্ষরের হতে হবে।");
    }
    if (password !== confirmPassword) {
      return setError("পাসওয়ার্ড দুটো মিলছে না। আবার চেক করুন।");
    }
    if (password.length < 6) {
      return setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name.trim(),
        email: email,
        total_score: 0,
        createdAt: new Date(),
      });

      router.push("/dashboard");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। লগইন করুন।");
      } else if (err.code === "auth/invalid-email") {
        setError("ইমেইল ঠিকানাটি সঠিক নয়।");
      } else {
        setError("রেজিস্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm font-medium">লোড হচ্ছে...</p>
      </div>
    </div>
  );

  const passwordStrength = password.length === 0 ? null : password.length < 6 ? "weak" : password.length < 10 ? "medium" : "strong";

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">

      {/* বাম পাশ — ব্র্যান্ডিং */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-500 to-green-700 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-10 right-10 w-48 h-48 rounded-full bg-white" />
          <div className="absolute bottom-10 left-10 w-64 h-64 rounded-full bg-white" />
          <div className="absolute top-1/3 right-1/4 w-24 h-24 rounded-full bg-white" />
        </div>
        <div className="relative text-center text-white">
          <div className="text-7xl mb-6">✨</div>
          <h1 className="text-4xl font-black mb-4">নতুন যাত্রা শুরু</h1>
          <p className="text-green-100 text-lg leading-relaxed max-w-sm">
            আজই রেজিস্ট্রেশন করুন এবং হাজারো প্রশ্নের মাধ্যমে নিজেকে প্রস্তুত করুন।
          </p>
          <div className="mt-10 space-y-3">
            {[
              { icon: "🏆", text: "লিডারবোর্ডে নিজের নাম দেখুন" },
              { icon: "📊", text: "নিজের অগ্রগতি ট্র্যাক করুন" },
              { icon: "🎯", text: "MCQ পরীক্ষায় অংশ নিন" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 bg-white/10 rounded-2xl px-5 py-3 text-left">
                <span className="text-2xl">{f.icon}</span>
                <p className="text-green-50 text-sm font-medium">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ডান পাশ — রেজিস্ট্রেশন ফর্ম */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* মোবাইলে লোগো */}
          <div className="lg:hidden text-center mb-8">
            <span className="text-5xl">✨</span>
            <h1 className="text-2xl font-black text-gray-800 mt-2">নতুন অ্যাকাউন্ট</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-black text-gray-800">অ্যাকাউন্ট তৈরি করুন 🚀</h2>
              <p className="text-gray-500 text-sm mt-1">মাত্র কয়েক সেকেন্ডে রেজিস্ট্রেশন সম্পন্ন করুন</p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-xl">
                <span>❌</span> {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">

              {/* নাম */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">আপনার নাম</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">👤</span>
                  <input
                    type="text"
                    required
                    placeholder="পূর্ণ নাম লিখুন"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 transition"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              {/* ইমেইল */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">ইমেইল ঠিকানা</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">✉️</span>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 transition"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* পাসওয়ার্ড */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">পাসওয়ার্ড</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔒</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="কমপক্ষে ৬ অক্ষর"
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 transition"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
                {/* পাসওয়ার্ড strength bar */}
                {passwordStrength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        passwordStrength === "weak" ? "w-1/3 bg-red-400" :
                        passwordStrength === "medium" ? "w-2/3 bg-amber-400" :
                        "w-full bg-green-500"
                      }`} />
                    </div>
                    <span className={`text-xs font-medium ${
                      passwordStrength === "weak" ? "text-red-500" :
                      passwordStrength === "medium" ? "text-amber-500" :
                      "text-green-600"
                    }`}>
                      {passwordStrength === "weak" ? "দুর্বল" : passwordStrength === "medium" ? "মাঝারি" : "শক্তিশালী"}
                    </span>
                  </div>
                )}
              </div>

              {/* কনফার্ম পাসওয়ার্ড */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">পাসওয়ার্ড নিশ্চিত করুন</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔑</span>
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    placeholder="পাসওয়ার্ড আবার লিখুন"
                    className={`w-full pl-10 pr-12 py-3 rounded-xl border bg-gray-50 text-gray-900 text-sm outline-none focus:bg-white focus:ring-2 transition ${
                      confirmPassword && password !== confirmPassword
                        ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                        : confirmPassword && password === confirmPassword
                        ? "border-green-400 focus:border-green-500 focus:ring-green-100"
                        : "border-gray-200 focus:border-green-500 focus:ring-green-100"
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition" onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                  {/* ম্যাচ চেক আইকন */}
                  {confirmPassword && (
                    <span className="absolute right-10 top-1/2 -translate-y-1/2 text-sm">
                      {password === confirmPassword ? "✅" : "❌"}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-green-200 mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    অ্যাকাউন্ট তৈরি হচ্ছে...
                  </>
                ) : "রেজিস্ট্রেশন সম্পন্ন করুন →"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                আগেই অ্যাকাউন্ট আছে?{" "}
                <Link href="/" className="text-green-600 font-bold hover:underline">
                  লগইন করুন
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}