import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // 🔥 ফায়ারবেস স্টোরেজ ইম্পোর্ট করা হলো

const firebaseConfig = {
  apiKey: "AIzaSyCiPc5suJwnYHNOhmUnfUp9w7MFtN75PL4",
  authDomain: "quiz-web-ba6d2.firebaseapp.com",
  projectId: "quiz-web-ba6d2",
  storageBucket: "quiz-web-ba6d2.firebasestorage.app",
  messagingSenderId: "402237836434",
  appId: "1:402237836434:web:cd5c2f442271bfa0a0aa4b",
  measurementId: "G-ELB32RDCWN"
};

// Next.js ফ্রেন্ডলি ইনিশিয়ালাইজেশন
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // 🔥 স্টোরেজ ইনিশিয়ালের ভেরিয়েবল তৈরি করা হলো

// আগের এক্সপোর্টগুলোর পাশাপাশি storage-কেও এক্সপোর্ট করা হলো
export { app, auth, db, storage };