const translations = {
  en: {
    "nav.home": "Home",
    "nav.clips": "Clips",
    "nav.users": "Users",
    "nav.upload": "Upload",
    "auth.login": "Login with Discord",
    "auth.logout": "Logout",
    "home.title": "Share Your Gaming Moments",
    "home.desc":
      "Upload unlimited gaming clips in full quality. Like clips, track views, and build your profile with Discord.",
    "home.cta": "Browse Clips",
    "home.latest": "Latest Clips",
    "clips.title": "All Clips",
    "users.title": "Community",
    "upload.title": "Upload Clip",
    "upload.titleLabel": "TITLE",
    "upload.titlePh": "Enter title...",
    "upload.descLabel": "DESCRIPTION",
    "upload.descPh": "Optional description...",
    "upload.drop": "Drop video here or click to select (no size limit)",
    "upload.btn": "Upload",
    "upload.needLogin": "Login with Discord to upload",
    "upload.success": "Clip uploaded!",
    "upload.fail": "Upload failed",
    "profile.clips": "Clips",
    "profile.clipsCount": "clips",
    "profile.joined": "Joined",
    "empty.clips": "No clips yet. Be the first to upload!",
    "empty.users": "No users yet.",
    "likes": "Likes",
    "views": "views",
    "login.loading": "Signing in...",
    "login.ok": "Welcome!",
    "login.fail": "Login failed",
    "like.needLogin": "Login to like clips",
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.clips": "المقاطع",
    "nav.users": "المستخدمون",
    "nav.upload": "رفع",
    "auth.login": "تسجيل الدخول عبر ديسكورد",
    "auth.logout": "تسجيل الخروج",
    "home.title": "شارك لحظاتك في الألعاب",
    "home.desc":
      "ارفع مقاطع ألعاب بلا حد للحجم وبجودة كاملة. أعجب بالمقاطع، تابع المشاهدات، وابنِ ملفك عبر ديسكورد.",
    "home.cta": "تصفح المقاطع",
    "home.latest": "أحدث المقاطع",
    "clips.title": "كل المقاطع",
    "users.title": "المجتمع",
    "upload.title": "رفع مقطع",
    "upload.titleLabel": "العنوان",
    "upload.titlePh": "أدخل العنوان...",
    "upload.descLabel": "الوصف",
    "upload.descPh": "وصف اختياري...",
    "upload.drop": "أسقط الفيديو هنا أو انقر للاختيار (بدون حد للحجم)",
    "upload.btn": "رفع",
    "upload.needLogin": "سجّل الدخول عبر ديسكورد للرفع",
    "upload.success": "تم رفع المقطع!",
    "upload.fail": "فشل الرفع",
    "profile.clips": "المقاطع",
    "profile.clipsCount": "مقطع",
    "profile.joined": "انضم",
    "empty.clips": "لا توجد مقاطع بعد. كن الأول!",
    "empty.users": "لا يوجد مستخدمون بعد.",
    "likes": "إعجاب",
    "views": "مشاهدة",
    "login.loading": "جاري تسجيل الدخول...",
    "login.ok": "مرحباً!",
    "login.fail": "فشل تسجيل الدخول",
    "like.needLogin": "سجّل الدخول للإعجاب",
  },
};

let currentLang = localStorage.getItem("lang") || "en";

function t(key) {
  return translations[currentLang][key] || translations.en[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  document.documentElement.lang = lang === "ar" ? "ar" : "en";
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.placeholder = t(key);
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyLanguage(btn.dataset.lang));
});

applyLanguage(currentLang);
