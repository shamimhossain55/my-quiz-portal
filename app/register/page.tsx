"use client";
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // পাসওয়ার্ড শো/হাইড স্টেট
  const [error, setError] = useState("");
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        email: email,
        total_score: 0,
        createdAt: new Date(),
      });

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed. Try again.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h2 className="text-center text-3xl font-bold text-gray-800">নতুন অ্যাকাউন্ট তৈরি</h2>
        {error && <p className="mt-4 text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>}
        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">আপনার নাম</label>
            <input
              type="text"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-gray-900 bg-white outline-none focus:border-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">ইমেইল ঠিকানা</label>
            <input
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-gray-900 bg-white outline-none focus:border-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">পাসওয়ার্ড</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"} // কন্ডিশনাল টাইপ
                required
                className="w-full rounded-lg border border-gray-300 p-3 pr-10 text-gray-900 bg-white outline-none focus:border-blue-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/* আইকন বোতাম */}
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  // চোখ বন্ধ আইকন (Hide)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  // চোখ খোলা আইকন (Show)
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit" className="w-full rounded-lg bg-green-600 p-3 font-semibold text-white hover:bg-green-700 transition">
            রেজিস্ট্রেশন কমপ্লিট করুন
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          অলরেডি অ্যাকাউন্ট আছে?{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            লগইন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}