"use client";
import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError("ইমেইল বা পাসওয়ার্ড ভুল হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  // লগইন চেক হওয়া পর্যন্ত লোডিং দেখাবে
  if (checking) return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm font-medium">লোড হচ্ছে...</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">

      {/* বাম পাশ — ব্র্যান্ডিং */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white" />
          <div className="absolute bottom-20 right-10 w-60 h-60 rounded-full bg-white" />
          <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full bg-white" />
        </div>
        <div className="relative text-center text-white">
          <div className="text-7xl mb-6">🎯</div>
          <h1 className="text-4xl font-black mb-4">কুইজ পোর্টাল</h1>
          <p className="text-blue-100 text-lg leading-relaxed max-w-sm">
            জ্ঞান যাচাই করুন, নিজেকে প্রস্তুত করুন এবং সেরাদের সাথে প্রতিযোগিতা করুন।
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { num: "৫০০+", label: "প্রশ্ন" },
              { num: "১০০+", label: "পরীক্ষার্থী" },
              { num: "৯৮%", label: "সন্তুষ্ট" },
            ].map((s) => (
              <div key={s.label} className="bg-white/10 rounded-2xl p-4">
                <p className="text-2xl font-black">{s.num}</p>
                <p className="text-blue-200 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ডান পাশ — লগইন ফর্ম */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* মোবাইলে লোগো */}
          <div className="lg:hidden text-center mb-8">
            <span className="text-5xl">🎯</span>
            <h1 className="text-2xl font-black text-gray-800 mt-2">কুইজ পোর্টাল</h1>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-black text-gray-800">স্বাগতম! 👋</h2>
              <p className="text-gray-500 text-sm mt-1">আপনার অ্যাকাউন্টে লগইন করুন</p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-xl">
                <span>❌</span> {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                  ইমেইল ঠিকানা
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">✉️</span>
                  <input
                    type="email"
                    required
                    placeholder="example@gmail.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                  পাসওয়ার্ড
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔒</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-200"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    লগইন হচ্ছে...
                  </>
                ) : "লগইন করুন →"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                নতুন অ্যাকাউন্ট নেই?{" "}
                <Link href="/register" className="text-blue-600 font-bold hover:underline">
                  রেজিস্ট্রেশন করুন
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}