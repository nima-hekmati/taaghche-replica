/**
 * app.js - هسته منطق وب‌اپلیکیشن کتابخوان طاقچه
 * توسعه‌داده‌شده با جاوااسکریپت خالص (Vanilla JS) بدون هیچ کتابخانه خارجی
 */

(function () {
  "use strict";

  // =========================================================================
  // ۱. مدیریت وضعیت محلی و ذخیره‌سازی پایدار (State & LocalStorage)
  // =========================================================================
  const STORAGE_KEYS = {
    USERS_STORE: "taaghche_users_store",          // جدول کاربران با نگاشت بر اساس شماره همراه
    ACTIVE_PHONE: "taaghche_active_user_phone",   // شماره همراه کاربر لاگین‌شده فعلی
    READER_SETTINGS: "taaghche_reader_settings"   // تنظیمات قلم و تم کتابخوان
  };

  const AppState = {
    currentUser: null,          // { name: string, phone: string } یا null در زمان خروج
    purchasedIds: [],           // کتاب‌های دریافت‌شده/خریداری‌شده کاربر فعال
    favoriteIds: [],            // نشان‌شده‌های کاربر فعال
    usersStore: {},             // نگاشت وضعیت هر کاربر بر اساس شماره تلفن: { [phone]: { name, phone, purchasedIds, favoriteIds } }
    readerSettings: {
      fontSize: "md",
      theme: "light"
    },
    currentView: "home",
    selectedBookId: null,
    catalogFilters: {
      searchQuery: "",
      category: "all",
      priceType: "all",
      sortBy: "default"
    },
    activeBannerIndex: 0,
    bannerIntervalId: null,
    lastFocusedElement: null
  };

  /**
   * بارگذاری امن داده‌ها از LocalStorage با نگاشت وضعیت به شماره همراه هر کاربر
   */
  function loadPersistedState() {
    // ۱. بارگذاری مخزن کاربران
    try {
      const storeStr = localStorage.getItem(STORAGE_KEYS.USERS_STORE);
      AppState.usersStore = storeStr ? JSON.parse(storeStr) : {};
      if (typeof AppState.usersStore !== "object" || AppState.usersStore === null) {
        AppState.usersStore = {};
      }
    } catch (e) {
      console.warn("خطا در خواندن پایگاه داده کاربران:", e);
      AppState.usersStore = {};
    }

    // ۲. مهاجرت داده‌های قدیمی (Migration) در صورت وجود داده از نسخه‌های قبلی
    try {
      const oldUserStr = localStorage.getItem("taaghche_current_user");
      if (oldUserStr) {
        const oldUser = JSON.parse(oldUserStr);
        if (oldUser && oldUser.phone) {
          const oldPurchased = JSON.parse(localStorage.getItem("taaghche_purchased_books") || "[]");
          const oldFavs = JSON.parse(localStorage.getItem("taaghche_favorite_books") || "[]");
          if (!AppState.usersStore[oldUser.phone]) {
            AppState.usersStore[oldUser.phone] = {
              name: oldUser.name,
              phone: oldUser.phone,
              purchasedIds: Array.isArray(oldPurchased) ? oldPurchased : [],
              favoriteIds: Array.isArray(oldFavs) ? oldFavs : []
            };
            saveUsersStore();
          }
        }
      }
    } catch (e) {
      // نادیده گرفتن خطای تبدیل
    }

    // ۳. بارگذاری کاربر فعال فعلی
    try {
      const activePhone = localStorage.getItem(STORAGE_KEYS.ACTIVE_PHONE);
      if (activePhone && AppState.usersStore[activePhone]) {
        const user = AppState.usersStore[activePhone];
        AppState.currentUser = { name: user.name, phone: user.phone };
        AppState.purchasedIds = Array.isArray(user.purchasedIds) ? [...user.purchasedIds] : [];
        AppState.favoriteIds = Array.isArray(user.favoriteIds) ? [...user.favoriteIds] : [];
      } else {
        // وضعیت خروج / کاربر مهمان: کتابخانه و نشان‌شده‌ها کاملاً خالی هستند
        AppState.currentUser = null;
        AppState.purchasedIds = [];
        AppState.favoriteIds = [];
      }
    } catch (e) {
      AppState.currentUser = null;
      AppState.purchasedIds = [];
      AppState.favoriteIds = [];
    }

    // ۴. بارگذاری تنظیمات مطالعه
    try {
      const readerStr = localStorage.getItem(STORAGE_KEYS.READER_SETTINGS);
      if (readerStr) {
        const parsed = JSON.parse(readerStr);
        AppState.readerSettings = Object.assign({ fontSize: "md", theme: "light" }, parsed);
      }
    } catch (e) {
      console.warn("خطا در خواندن تنظیمات مطالعه:", e);
    }
  }

  function saveUsersStore() {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS_STORE, JSON.stringify(AppState.usersStore));
    } catch (e) {
      console.error("خطا در ذخیره مخزن کاربران:", e);
    }
  }

  function saveCurrentUserActiveState() {
    try {
      if (AppState.currentUser && AppState.currentUser.phone) {
        const phone = AppState.currentUser.phone;
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PHONE, phone);

        if (!AppState.usersStore[phone]) {
          AppState.usersStore[phone] = {
            name: AppState.currentUser.name,
            phone: phone,
            purchasedIds: [],
            favoriteIds: []
          };
        }

        AppState.usersStore[phone].name = AppState.currentUser.name;
        AppState.usersStore[phone].purchasedIds = AppState.purchasedIds;
        AppState.usersStore[phone].favoriteIds = AppState.favoriteIds;
        saveUsersStore();
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_PHONE);
      }
    } catch (e) {
      console.error("خطا در ذخیره وضعیت کاربر فعال:", e);
    }
  }

  function saveReaderSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.READER_SETTINGS, JSON.stringify(AppState.readerSettings));
    } catch (e) {
      console.error("ذخیره تنظیمات مطالعه ناموفق بود:", e);
    }
  }

  // =========================================================================
  // ۲. توابع کمکی و ابزارها (Helpers & Utilities)
  // =========================================================================

  /**
   * تبدیل ارقام انگلیسی به فارسی
   */
  function toPersianDigits(num) {
    if (num === null || num === undefined) return "";
    const str = String(num);
    const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return str.replace(/[0-9]/g, function (d) {
      return persianDigits[parseInt(d, 10)];
    });
  }

  /**
   * تبدیل ارقام فارسی و عربی به انگلیسی (جهت اعتبارسنجی یکنواخت شماره موبایل)
   */
  function toEnglishDigits(str) {
    if (!str) return "";
    const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    const arabicDigits = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
    let result = String(str);
    for (let i = 0; i < 10; i++) {
      result = result.replace(persianDigits[i], i).replace(arabicDigits[i], i);
    }
    return result;
  }

  /**
   * فرمت کردن قیمت به تومان با ارقام فارسی
   */
  function formatPrice(price) {
    if (price === 0) return "رایگان";
    const formatted = Number(price).toLocaleString("en-US");
    return toPersianDigits(formatted) + " تومان";
  }

  /**
   * نرمال‌سازی نویسه‌های فارسی برای جستجوی دقیق‌تر
   */
  function normalizePersian(text) {
    if (!text) return "";
    return text
      .trim()
      .toLowerCase()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/ة/g, "ه")
      .replace(/[\u200B-\u200D\uFEFF]/g, " "); // نیم‌فاصله‌ها
  }

  /**
   * نمایش پیام‌های موقت و تعاملی به کاربر (Toast Notification)
   */
  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 300);
    }, 3200);
  }

  // =========================================================================
  // ۳. کامپوننت‌های رندرینگ کارت و کتاب‌ها (Card Rendering)
  // =========================================================================

  /**
   * ایجاد المان DOM کارت کتاب با استفاده از ساختار بهینه و امن
   */
  function createBookCardElement(book) {
    const isFav = AppState.favoriteIds.includes(book.id);

    const card = document.createElement("article");
    card.className = "book-card";
    card.dataset.bookId = book.id;
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${book.title} اثر ${book.author}`);

    // تصویر جلد
    const coverWrapper = document.createElement("div");
    coverWrapper.className = "card-cover-wrapper";

    const coverImg = document.createElement("img");
    coverImg.className = "card-cover-img";
    coverImg.src = book.cover;
    coverImg.alt = `جلد کتاب ${book.title}`;
    coverImg.loading = "lazy";
    coverWrapper.appendChild(coverImg);

    // دکمه نشان کردن / علاقه‌مندی
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = `card-favorite-btn ${isFav ? "favorited" : ""}`;
    favBtn.setAttribute("aria-label", isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها");
    favBtn.setAttribute("title", isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها");

    favBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    `;

    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(book.id);
    });

    coverWrapper.appendChild(favBtn);
    card.appendChild(coverWrapper);

    // بدنه کارت
    const cardBody = document.createElement("div");
    cardBody.className = "card-body";

    const titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    titleEl.textContent = book.title;
    cardBody.appendChild(titleEl);

    const authorEl = document.createElement("p");
    authorEl.className = "card-author";
    authorEl.textContent = book.author;
    cardBody.appendChild(authorEl);

    // پاورقی کارت
    const footerEl = document.createElement("div");
    footerEl.className = "card-footer";

    const ratingEl = document.createElement("div");
    ratingEl.className = "card-rating";
    ratingEl.innerHTML = `
      <svg class="star-icon" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      <span>${toPersianDigits(book.rating.toFixed(1))}</span>
    `;
    footerEl.appendChild(ratingEl);

    const priceEl = document.createElement("div");
    priceEl.className = `card-price ${book.price === 0 ? "free" : ""}`;
    priceEl.textContent = formatPrice(book.price);
    footerEl.appendChild(priceEl);

    cardBody.appendChild(footerEl);
    card.appendChild(cardBody);

    // رویداد کلیک برای باز کردن جزییات کتاب
    card.addEventListener("click", () => {
      navigateToBookDetails(book.id);
    });

    // پشتیبانی از کلید Enter روی کیبورد
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        navigateToBookDetails(book.id);
      }
    });

    return card;
  }

  // =========================================================================
  // ۴. مدیریت علاقه‌مندی‌ها و خرید به صورت متصل به کاربر فعال
  // =========================================================================

  function toggleFavorite(bookId) {
    // شرط اختصاص حالت به کاربر: اگر کاربر لاگین نباشد، فرم ورود باز می‌شود
    if (!AppState.currentUser) {
      showToast("برای افزودن به نشان‌شده‌ها و ذخیره در حساب خود، لطفاً وارد شوید.", "error");
      openLoginModal();
      return;
    }

    const index = AppState.favoriteIds.indexOf(bookId);
    const book = BOOKS_DATA.find((b) => b.id === bookId);
    const bookTitle = book ? book.title : "کتاب";

    if (index > -1) {
      AppState.favoriteIds.splice(index, 1);
      showToast(`«${bookTitle}» از نشان‌شده‌ها حذف شد.`, "error");
    } else {
      AppState.favoriteIds.push(bookId);
      showToast(`«${bookTitle}» به نشان‌شده‌ها اضافه شد.`, "success");
    }

    // ذخیره در سوابق کاربر مربوطه بر اساس شماره همراه
    saveCurrentUserActiveState();
    updateUIBadges();

    // به‌روزرسانی زنده کارت‌ها در صفحه فعلی
    updateAllFavoriteButtons(bookId);

    // اگر در نمای کتابخانه هستیم، رندر مجدد تب علاقه‌مندی‌ها
    if (AppState.currentView === "library") {
      renderLibraryView("favorites");
    }
  }

  function updateAllFavoriteButtons(bookId) {
    const isFav = AppState.favoriteIds.includes(bookId);
    document.querySelectorAll(`.book-card[data-book-id="${bookId}"] .card-favorite-btn`).forEach((btn) => {
      btn.classList.toggle("favorited", isFav);
      btn.setAttribute("aria-label", isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها");
    });

    // در صورت بودن در صفحه جزییات کتاب
    const detailFavBtn = document.getElementById("btn-detail-favorite");
    if (detailFavBtn && AppState.selectedBookId === bookId) {
      detailFavBtn.classList.toggle("btn-danger", isFav);
      detailFavBtn.classList.toggle("btn-outline", !isFav);
      detailFavBtn.textContent = isFav ? "❤️ حذف از نشان‌شده‌ها" : "🤍 افزودن به نشان‌شده‌ها";
    }
  }

  function handleBookAction(bookId) {
    const book = BOOKS_DATA.find((b) => b.id === bookId);
    if (!book) return;

    // بررسی آیا قبلاً توسط این کاربر دریافت شده است
    if (AppState.purchasedIds.includes(book.id)) {
      if (book.sampleText && book.sampleText.length > 0) {
        navigateToReader(book.id);
      } else {
        showToast("این کتاب در کتابخانه شما موجود است.", "success");
      }
      return;
    }

    // شرط احراز هویت کاربر برای دریافت یا خرید
    if (!AppState.currentUser) {
      showToast("برای دریافت یا خرید کتاب، ابتدا وارد حساب کاربری خود شوید.", "error");
      openLoginModal();
      return;
    }

    // کتاب رایگان: دریافت مستقیم بدون پنجره پرداخت
    if (book.price === 0) {
      addBookToPurchased(book.id);
      showToast(`کتاب «${book.title}» با موفقیت به کتابخانه شما افزوده شد.`, "success");
      if (AppState.currentView === "book") {
        renderBookDetailsView(book.id);
      }
      return;
    }

    // کتاب پولی: باز کردن پنجره تایید خرید شبیه‌سازی‌شده
    openPurchaseModal(book);
  }

  function addBookToPurchased(bookId) {
    if (!AppState.currentUser) return;
    if (!AppState.purchasedIds.includes(bookId)) {
      AppState.purchasedIds.push(bookId);
      saveCurrentUserActiveState();
      updateUIBadges();
    }
  }

  // =========================================================================
  // ۵. رندرینگ نماهای برنامه (Views Rendering)
  // =========================================================================

  /**
   * رندر صفحه اصلی
   */
  function renderHomeView() {
    renderBanners();
    renderCategoriesGrid();
    renderShelves();
  }

  function renderBanners() {
    const track = document.getElementById("banner-slides-track");
    const indicators = document.getElementById("banner-indicators");
    if (!track || !indicators) return;

    track.innerHTML = "";
    indicators.innerHTML = "";

    BANNERS.forEach((banner, index) => {
      const slide = document.createElement("div");
      slide.className = "banner-slide";
      slide.style.background = banner.bgColor;

      slide.innerHTML = `
        <span class="banner-badge">${banner.badge}</span>
        <h2 class="banner-title">${banner.title}</h2>
        <p class="banner-subtitle">${banner.subtitle}</p>
        <button type="button" class="banner-btn" data-target-category="${banner.targetCategory}">
          ${banner.actionText} ←
        </button>
      `;

      slide.querySelector(".banner-btn").addEventListener("click", () => {
        if (banner.targetCategory === "free") {
          applyCatalogFilters({ priceType: "free", category: "all", searchQuery: "" });
        } else {
          applyCatalogFilters({ category: banner.targetCategory, priceType: "all", searchQuery: "" });
        }
        navigateTo("catalog");
      });

      track.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `banner-dot ${index === 0 ? "active" : ""}`;
      dot.setAttribute("aria-label", `رفتن به اسلاید ${toPersianDigits(index + 1)}`);
      dot.addEventListener("click", () => {
        goToBannerSlide(index);
      });
      indicators.appendChild(dot);
    });

    startBannerAutoplay();
  }

  function goToBannerSlide(index) {
    const track = document.getElementById("banner-slides-track");
    const dots = document.querySelectorAll(".banner-dot");
    if (!track) return;

    AppState.activeBannerIndex = (index + BANNERS.length) % BANNERS.length;
    track.style.transform = `translateX(${AppState.activeBannerIndex * 100}%)`;

    dots.forEach((dot, idx) => {
      dot.classList.toggle("active", idx === AppState.activeBannerIndex);
    });
  }

  function startBannerAutoplay() {
    if (AppState.bannerIntervalId) clearInterval(AppState.bannerIntervalId);
    AppState.bannerIntervalId = setInterval(() => {
      goToBannerSlide(AppState.activeBannerIndex + 1);
    }, 6000);
  }

  function renderCategoriesGrid() {
    const container = document.getElementById("home-categories-grid");
    if (!container) return;
    container.innerHTML = "";

    CATEGORIES.filter((c) => c.id !== "all").forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "category-chip";
      chip.innerHTML = `
        <span class="category-icon">${cat.icon}</span>
        <span class="category-name">${cat.title}</span>
      `;
      chip.addEventListener("click", () => {
        applyCatalogFilters({ category: cat.id, priceType: "all", searchQuery: "" });
        navigateTo("catalog");
      });
      container.appendChild(chip);
    });
  }

  function renderShelves() {
    // ردیف ۱: پیشنهادهای طاقچه (کتاب‌های با بیشترین امتیاز)
    const featuredTrack = document.getElementById("shelf-featured-track");
    if (featuredTrack) {
      featuredTrack.innerHTML = "";
      const featuredBooks = [...BOOKS_DATA].sort((a, b) => b.rating - a.rating).slice(0, 7);
      featuredBooks.forEach((book) => featuredTrack.appendChild(createBookCardElement(book)));
    }

    // ردیف ۲: تازه‌های نشر (مرتب بر اساس سال انتشار)
    const newTrack = document.getElementById("shelf-new-track");
    if (newTrack) {
      newTrack.innerHTML = "";
      const newBooks = [...BOOKS_DATA].sort((a, b) => b.publishYear - a.publishYear).slice(0, 7);
      newBooks.forEach((book) => newTrack.appendChild(createBookCardElement(book)));
    }

    // ردیف ۳: کتاب‌های رایگان (price === 0)
    const freeTrack = document.getElementById("shelf-free-track");
    if (freeTrack) {
      freeTrack.innerHTML = "";
      const freeBooks = BOOKS_DATA.filter((b) => b.price === 0);
      freeBooks.forEach((book) => freeTrack.appendChild(createBookCardElement(book)));
    }
  }

  /**
   * رندر صفحه فهرست و جستجوی کتاب‌ها
   */
  function renderCatalogView() {
    renderCatalogFilterControls();
    filterAndRenderCatalogBooks();
  }

  function renderCatalogFilterControls() {
    const catList = document.getElementById("filter-categories-list");
    if (!catList) return;
    catList.innerHTML = "";

    CATEGORIES.forEach((cat) => {
      const label = document.createElement("label");
      label.className = "filter-radio-label";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "filter-category";
      input.value = cat.id;
      input.checked = AppState.catalogFilters.category === cat.id;

      input.addEventListener("change", () => {
        AppState.catalogFilters.category = cat.id;
        filterAndRenderCatalogBooks();
      });

      const span = document.createElement("span");
      span.textContent = cat.title;

      label.appendChild(input);
      label.appendChild(span);
      catList.appendChild(label);
    });

    // همگام‌سازی فیلتر قیمت
    const priceInputs = document.querySelectorAll('input[name="filter-price"]');
    priceInputs.forEach((input) => {
      input.checked = input.value === AppState.catalogFilters.priceType;
    });

    // همگام‌سازی انتخابگر مرتب‌سازی
    const sortSelect = document.getElementById("catalog-sort-select");
    if (sortSelect) {
      sortSelect.value = AppState.catalogFilters.sortBy;
    }
  }

  function filterAndRenderCatalogBooks() {
    const grid = document.getElementById("catalog-books-grid");
    const countBadge = document.getElementById("catalog-count-badge");
    if (!grid) return;

    grid.innerHTML = "";

    const query = normalizePersian(AppState.catalogFilters.searchQuery);
    const category = AppState.catalogFilters.category;
    const priceType = AppState.catalogFilters.priceType;
    const sortBy = AppState.catalogFilters.sortBy;

    let filtered = BOOKS_DATA.filter((book) => {
      // فیلتر جستجو
      if (query) {
        const titleNorm = normalizePersian(book.title);
        const authorNorm = normalizePersian(book.author);
        if (!titleNorm.includes(query) && !authorNorm.includes(query)) {
          return false;
        }
      }

      // فیلتر دسته‌بندی
      if (category !== "all" && book.category !== category) {
        return false;
      }

      // فیلتر قیمت
      if (priceType === "free" && book.price !== 0) {
        return false;
      }
      if (priceType === "paid" && book.price === 0) {
        return false;
      }

      return true;
    });

    // مرتب‌سازی
    if (sortBy === "rating-desc") {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "price-asc") {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      filtered.sort((a, b) => b.price - a.price);
    }

    if (countBadge) {
      countBadge.textContent = toPersianDigits(filtered.length);
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3 class="empty-state-title">کتابی با این مشخصات یافت نشد!</h3>
          <p class="empty-state-text">لطفاً املای عبارت جستجو را بررسی کنید یا فیلترهای اعمال‌شده را پاک نمایید.</p>
          <button type="button" class="btn btn-primary" id="btn-reset-filters-empty">پاک کردن همه فیلترها</button>
        </div>
      `;
      const resetBtn = document.getElementById("btn-reset-filters-empty");
      if (resetBtn) {
        resetBtn.addEventListener("click", resetAllFilters);
      }
      return;
    }

    filtered.forEach((book) => {
      grid.appendChild(createBookCardElement(book));
    });
  }

  function resetAllFilters() {
    AppState.catalogFilters = {
      searchQuery: "",
      category: "all",
      priceType: "all",
      sortBy: "default"
    };

    const searchInput = document.getElementById("global-search-input");
    if (searchInput) searchInput.value = "";
    const clearBtn = document.getElementById("search-clear-btn");
    if (clearBtn) clearBtn.classList.remove("active");

    renderCatalogFilterControls();
    filterAndRenderCatalogBooks();
  }

  function applyCatalogFilters(filters) {
    Object.assign(AppState.catalogFilters, filters);
    const searchInput = document.getElementById("global-search-input");
    if (searchInput && filters.searchQuery !== undefined) {
      searchInput.value = filters.searchQuery;
      const clearBtn = document.getElementById("search-clear-btn");
      if (clearBtn) clearBtn.classList.toggle("active", Boolean(filters.searchQuery));
    }
  }

  /**
   * رندر صفحه جزییات کتاب با شناسه مشخص
   */
  function renderBookDetailsView(bookId) {
    const area = document.getElementById("book-detail-content-area");
    const breadcrumbTitle = document.getElementById("book-detail-breadcrumb");
    if (!area) return;

    const book = BOOKS_DATA.find((b) => b.id === bookId);

    if (!book) {
      if (breadcrumbTitle) breadcrumbTitle.textContent = "کتاب نامعتبر";
      area.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">کتاب مورد نظر یافت نشد!</h3>
          <p class="empty-state-text">شناسه کتاب واردشده معتبر نمی‌باشد یا ممکن است از سامانه حذف شده باشد.</p>
          <a href="#catalog" class="btn btn-primary">مشاهده همه کتاب‌ها</a>
        </div>
      `;
      return;
    }

    AppState.selectedBookId = book.id;
    if (breadcrumbTitle) breadcrumbTitle.textContent = book.title;

    const isFav = AppState.favoriteIds.includes(book.id);
    const isPurchased = AppState.purchasedIds.includes(book.id);
    const hasSample = book.sampleText && book.sampleText.length > 0;

    area.innerHTML = `
      <div class="details-card">
        <div class="details-grid">
          
          <!-- جعبه تصویر و جلد -->
          <div class="details-cover-box">
            <img class="details-cover-img" src="${book.cover}" alt="جلد کتاب ${book.title}">
            <button type="button" class="btn ${isFav ? "btn-danger" : "btn-outline"}" id="btn-detail-favorite">
              ${isFav ? "❤️ حذف از نشان‌شده‌ها" : "🤍 افزودن به نشان‌شده‌ها"}
            </button>
          </div>

          <!-- اطلاعات کامل کتاب -->
          <div class="details-content">
            <div class="details-meta-top">
              <span class="details-category-badge">${book.category}</span>
              <span style="font-size: 0.88rem; color: var(--text-muted);">${book.format}</span>
            </div>

            <h1 class="details-title">${book.title}</h1>
            <p class="details-author">نویسنده: <strong>${book.author}</strong></p>

            <!-- نوار مشخصات آماری -->
            <div class="details-stats-bar">
              <div class="stat-item">
                <span class="stat-label">امتیاز کاربران</span>
                <span class="stat-value">⭐ ${toPersianDigits(book.rating.toFixed(1))} / ۵</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">تعداد صفحات</span>
                <span class="stat-value">${toPersianDigits(book.pages)} صفحه</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">سال انتشار</span>
                <span class="stat-value">${toPersianDigits(book.publishYear)}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">ناشر</span>
                <span class="stat-value">${book.publisher}</span>
              </div>
            </div>

            <h3 class="details-description-title">درباره کتاب</h3>
            <p class="details-description-text">${book.description}</p>

            <!-- نوار اقدامات خرید و مطالعه -->
            <div class="details-actions-bar">
              <div class="details-price-tag ${book.price === 0 ? "free" : ""}">
                ${formatPrice(book.price)}
              </div>

              <!-- دکمه خرید یا دریافت -->
              <button type="button" class="btn btn-primary" id="btn-detail-purchase">
                ${isPurchased ? "✓ در کتابخانه شما موجود است" : book.price === 0 ? "دریافت رایگان کتاب" : "خرید نسخه الکترونیکی"}
              </button>

              <!-- دکمه مطالعه نمونه -->
              <button type="button" class="btn btn-outline" id="btn-detail-sample" ${!hasSample ? "disabled title='نمونه متنی برای این کتاب ثبت نشده است'" : ""}>
                ${hasSample ? "📖 مطالعه نمونه کتاب" : "نمونه متنی موجود نیست"}
              </button>
            </div>

          </div>

        </div>
      </div>

      <!-- قفسه کتاب‌های مرتبط -->
      <section class="shelf-section" aria-label="کتاب‌های مرتبط">
        <div class="section-header">
          <h2 class="section-title">کتاب‌های مرتبط با ${book.category}</h2>
        </div>
        <div class="catalog-books-grid" id="related-books-grid">
          <!-- کتاب‌های مرتبط -->
        </div>
      </section>
    `;

    // تنظیم رویدادهای دکمه‌ها
    const favBtn = document.getElementById("btn-detail-favorite");
    if (favBtn) {
      favBtn.addEventListener("click", () => toggleFavorite(book.id));
    }

    const purchaseBtn = document.getElementById("btn-detail-purchase");
    if (purchaseBtn) {
      purchaseBtn.addEventListener("click", () => handleBookAction(book.id));
    }

    const sampleBtn = document.getElementById("btn-detail-sample");
    if (sampleBtn && hasSample) {
      sampleBtn.addEventListener("click", () => navigateToReader(book.id));
    }

    // رندر کتاب‌های مرتبط
    const relatedGrid = document.getElementById("related-books-grid");
    if (relatedGrid) {
      relatedGrid.innerHTML = "";
      const related = BOOKS_DATA.filter((b) => b.category === book.category && b.id !== book.id).slice(0, 4);
      if (related.length === 0) {
        const fallback = BOOKS_DATA.filter((b) => b.id !== book.id).slice(0, 4);
        fallback.forEach((b) => relatedGrid.appendChild(createBookCardElement(b)));
      } else {
        related.forEach((b) => relatedGrid.appendChild(createBookCardElement(b)));
      }
    }
  }

  /**
   * رندر صفحه کتابخانه من (کتاب‌های خریداری‌شده و نشان‌شده‌ها)
   */
  function renderLibraryView(activeTab = "purchased") {
    const tabPurchasedBtn = document.getElementById("tab-btn-purchased");
    const tabFavoritesBtn = document.getElementById("tab-btn-favorites");
    const grid = document.getElementById("library-books-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const isPurchasedTab = activeTab === "purchased";
    if (tabPurchasedBtn) {
      tabPurchasedBtn.classList.toggle("active", isPurchasedTab);
      tabPurchasedBtn.setAttribute("aria-selected", isPurchasedTab ? "true" : "false");
    }
    if (tabFavoritesBtn) {
      tabFavoritesBtn.classList.toggle("active", !isPurchasedTab);
      tabFavoritesBtn.setAttribute("aria-selected", !isPurchasedTab ? "true" : "false");
    }

    const bookIds = isPurchasedTab ? AppState.purchasedIds : AppState.favoriteIds;
    const books = BOOKS_DATA.filter((b) => bookIds.includes(b.id));

    if (books.length === 0) {
      const emptyTitle = !AppState.currentUser
        ? "جهت مشاهده کتابخانه و علاقه‌مندی‌های خود، لطفاً وارد حساب شوید."
        : isPurchasedTab
        ? "هنوز هیچ کتابی در کتابخانه خود دریافت نکرده‌اید."
        : "هیچ کتابی در فهرست علاقه‌مندی‌های شما قرار ندارد.";

      const emptyActionText = !AppState.currentUser
        ? "ورود به حساب کاربری"
        : isPurchasedTab
        ? "مشاهده کتاب‌های رایگان"
        : "گشت‌وگذار در میان کتاب‌ها";

      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${!AppState.currentUser ? "🔒" : isPurchasedTab ? "📚" : "🤍"}</div>
          <h3 class="empty-state-title">${emptyTitle}</h3>
          <p class="empty-state-text">با ورود به حساب و ثبت آثار محبوب، کتابخانه دیجیتال شما همیشه در دسترس خواهد بود.</p>
          <button type="button" class="btn btn-primary" id="btn-library-browse">
            ${emptyActionText}
          </button>
        </div>
      `;

      const browseBtn = document.getElementById("btn-library-browse");
      if (browseBtn) {
        browseBtn.addEventListener("click", () => {
          if (!AppState.currentUser) {
            openLoginModal();
          } else if (isPurchasedTab) {
            applyCatalogFilters({ priceType: "free", category: "all", searchQuery: "" });
            navigateTo("catalog");
          } else {
            resetAllFilters();
            navigateTo("catalog");
          }
        });
      }
      return;
    }

    books.forEach((book) => {
      grid.appendChild(createBookCardElement(book));
    });
  }

  /**
   * رندر حالت مطالعه نمونه کتاب
   */
  function renderReaderView(bookId) {
    const book = BOOKS_DATA.find((b) => b.id === bookId);
    if (!book || !book.sampleText || book.sampleText.length === 0) {
      showToast("نمونه متنی برای این کتاب ثبت نشده است.", "error");
      navigateToBookDetails(bookId);
      return;
    }

    AppState.selectedBookId = book.id;

    const headerTitle = document.getElementById("reader-header-book-title");
    const mainTitle = document.getElementById("reader-title");
    const authorEl = document.getElementById("reader-author");
    const bodyEl = document.getElementById("reader-paragraphs-body");

    if (headerTitle) headerTitle.textContent = book.title;
    if (mainTitle) mainTitle.textContent = book.title;
    if (authorEl) authorEl.textContent = `نویسنده: ${book.author}`;

    // درج امن پاراگراف‌ها با textContent
    if (bodyEl) {
      bodyEl.innerHTML = "";
      book.sampleText.forEach((paragraph) => {
        const p = document.createElement("p");
        p.className = "reader-paragraph";
        p.textContent = paragraph;
        bodyEl.appendChild(p);
      });
    }

    applyReaderSettings();
  }

  function applyReaderSettings() {
    const container = document.getElementById("reader-container");
    const bodyEl = document.getElementById("reader-paragraphs-body");
    if (!container || !bodyEl) return;

    // تم
    container.className = `reader-container reader-theme-${AppState.readerSettings.theme}`;

    // فونت
    bodyEl.className = `reader-paragraphs font-size-${AppState.readerSettings.fontSize}`;

    // وضعیت فعال دکمه‌های ابزار
    document.querySelectorAll("[data-font-size]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.fontSize === AppState.readerSettings.fontSize);
    });

    document.querySelectorAll("[data-theme]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === AppState.readerSettings.theme);
    });
  }

  // =========================================================================
  // ۶. ناوبری و مسیریابی برنامه (Router & Navigation)
  // =========================================================================

  function navigateTo(viewName, params = {}) {
    AppState.currentView = viewName;

    // بستن منوهای شناور موبایل
    closeMobileDrawer();
    const searchContainer = document.getElementById("header-search-container");
    if (searchContainer) searchContainer.classList.remove("mobile-active");

    // پنهان کردن تمام نماها
    document.querySelectorAll(".app-view").forEach((view) => {
      view.style.display = "none";
    });

    // به‌روزرسانی فعال بودن پیوندهای هدر، سایدبار کشویی و نوار پایین موبایل
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
    });
    document.querySelectorAll(".drawer-link").forEach((link) => {
      link.classList.remove("active");
    });
    document.querySelectorAll(".bottom-nav-item").forEach((item) => {
      item.classList.remove("active");
    });

    // نمایش نمای مورد نظر
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.style.display = "block";
    }

    // اگر نمای مطالعه است، هدر، فوتر و نوار پایین موبایل پنهان شوند
    const header = document.querySelector(".site-header");
    const footer = document.querySelector(".site-footer");
    const bottomNav = document.getElementById("mobile-bottom-nav");
    const isReader = viewName === "reader";

    if (header) header.style.display = isReader ? "none" : "block";
    if (footer) footer.style.display = isReader ? "none" : "block";
    if (bottomNav) bottomNav.style.display = isReader ? "none" : "";

    window.scrollTo({ top: 0, behavior: "smooth" });

    // مدیریت فعال‌سازی تب‌ها و آدرس
    if (viewName === "home") {
      const homeLink = document.getElementById("nav-link-home");
      if (homeLink) homeLink.classList.add("active");
      const dLink = document.getElementById("drawer-link-home");
      if (dLink) dLink.classList.add("active");
      const bNav = document.getElementById("bnav-home");
      if (bNav) bNav.classList.add("active");

      renderHomeView();
      window.location.hash = "home";
    } else if (viewName === "catalog") {
      const catLink = document.getElementById("nav-link-catalog");
      if (catLink) catLink.classList.add("active");
      const dLink = document.getElementById("drawer-link-catalog");
      if (dLink) dLink.classList.add("active");
      const bNav = document.getElementById("bnav-catalog");
      if (bNav) bNav.classList.add("active");

      renderCatalogView();
      window.location.hash = "catalog";
    } else if (viewName === "book") {
      const bookId = params.id || AppState.selectedBookId;
      renderBookDetailsView(bookId);
      window.location.hash = `book?id=${bookId}`;
    } else if (viewName === "library") {
      const libLink = document.getElementById("nav-link-library");
      if (libLink) libLink.classList.add("active");
      const dLink = document.getElementById("drawer-link-library");
      if (dLink) dLink.classList.add("active");
      const bNav = document.getElementById("bnav-library");
      if (bNav) bNav.classList.add("active");

      renderLibraryView(params.tab || "purchased");
      window.location.hash = "library";
    } else if (viewName === "reader") {
      const bookId = params.id || AppState.selectedBookId;
      renderReaderView(bookId);
      window.location.hash = `reader?id=${bookId}`;
    }
  }

  function navigateToBookDetails(bookId) {
    navigateTo("book", { id: bookId });
  }

  function navigateToReader(bookId) {
    navigateTo("reader", { id: bookId });
  }

  function handleUrlRouting() {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");

    if (searchParams.has("book")) {
      navigateToBookDetails(searchParams.get("book"));
      return;
    }

    if (hash.startsWith("book")) {
      const bookParams = new URLSearchParams(hash.split("?")[1] || "");
      const bookId = bookParams.get("id");
      if (bookId) {
        navigateToBookDetails(bookId);
        return;
      }
    }

    if (hash.startsWith("reader")) {
      const readerParams = new URLSearchParams(hash.split("?")[1] || "");
      const bookId = readerParams.get("id");
      if (bookId) {
        navigateToReader(bookId);
        return;
      }
    }

    if (hash === "catalog") {
      navigateTo("catalog");
      return;
    }

    if (hash === "library") {
      navigateTo("library");
      return;
    }

    navigateTo("home");
  }

  // =========================================================================
  // ۷. احراز هویت اختصاصی کاربر و نگاشت به شماره همراه
  // =========================================================================

  function openLoginModal() {
    AppState.lastFocusedElement = document.activeElement;
    const modal = document.getElementById("login-modal");
    if (!modal) return;

    modal.classList.add("active");
    clearLoginErrors();

    const nameInput = document.getElementById("input-user-name");
    if (nameInput) {
      nameInput.value = "";
      setTimeout(() => nameInput.focus(), 100);
    }
    const phoneInput = document.getElementById("input-user-phone");
    if (phoneInput) phoneInput.value = "";
  }

  function closeLoginModal() {
    const modal = document.getElementById("login-modal");
    if (modal) modal.classList.remove("active");
    if (AppState.lastFocusedElement) {
      AppState.lastFocusedElement.focus();
    }
  }

  function clearLoginErrors() {
    const errorName = document.getElementById("error-user-name");
    const errorPhone = document.getElementById("error-user-phone");
    const inputName = document.getElementById("input-user-name");
    const inputPhone = document.getElementById("input-user-phone");

    if (errorName) errorName.classList.remove("visible");
    if (errorPhone) errorPhone.classList.remove("visible");
    if (inputName) inputName.classList.remove("has-error");
    if (inputPhone) inputPhone.classList.remove("has-error");
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    clearLoginErrors();

    const nameInput = document.getElementById("input-user-name");
    const phoneInput = document.getElementById("input-user-phone");
    const errorName = document.getElementById("error-user-name");
    const errorPhone = document.getElementById("error-user-phone");

    const rawName = nameInput ? nameInput.value.trim() : "";
    const rawPhone = phoneInput ? phoneInput.value.trim() : "";

    let isValid = true;

    // ۱. اعتبارسنجی نام: نباید خالی باشد
    if (!rawName) {
      if (errorName) errorName.classList.add("visible");
      if (nameInput) nameInput.classList.add("has-error");
      isValid = false;
    }

    // ۲. اعتبارسنجی شماره همراه: دقیقاً ۱۱ رقم و شروع با ۰۹ (فارسی یا لاتین)
    const normalizedDigits = toEnglishDigits(rawPhone).replace(/\s+/g, "");
    const phoneRegex = /^09\d{9}$/;

    if (!phoneRegex.test(normalizedDigits)) {
      if (errorPhone) errorPhone.classList.add("visible");
      if (phoneInput) phoneInput.classList.add("has-error");
      isValid = false;
    }

    if (!isValid) return;

    // ثبت کاربر جاری و بازیابی داده‌های اختصاصی شماره همراه وی
    AppState.currentUser = {
      name: rawName,
      phone: normalizedDigits
    };

    if (AppState.usersStore[normalizedDigits]) {
      // این شماره قبلاً ثبت شده: بازیابی کتاب‌ها و علاقه‌مندی‌های همان شماره
      const record = AppState.usersStore[normalizedDigits];
      record.name = rawName; // به‌روزرسانی نام
      AppState.purchasedIds = Array.isArray(record.purchasedIds) ? [...record.purchasedIds] : [];
      AppState.favoriteIds = Array.isArray(record.favoriteIds) ? [...record.favoriteIds] : [];
    } else {
      // کاربر جدید با وضعیت خالی
      AppState.purchasedIds = [];
      AppState.favoriteIds = [];
      AppState.usersStore[normalizedDigits] = {
        name: rawName,
        phone: normalizedDigits,
        purchasedIds: [],
        favoriteIds: []
      };
    }

    saveCurrentUserActiveState();
    updateUIUserSection();
    updateUIBadges();
    closeLoginModal();
    closeMobileDrawer();

    // به‌روزرسانی نماهای مختلف با داده‌های کاربر جدید
    refreshAllViewsForUserState();

    showToast(`خوش آمدید، ${rawName}! ورود شما با موفقیت انجام شد.`, "success");
  }

  function handleLogout() {
    const prevName = AppState.currentUser ? AppState.currentUser.name : "";

    // خروج: خالی کردن متغیرهای حافظه برنامه
    AppState.currentUser = null;
    AppState.purchasedIds = [];
    AppState.favoriteIds = [];

    // حذف کلید شماره فعال در مرورگر تا وضعیت لاگ‌اوت ثبت شود
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PHONE);

    updateUIUserSection();
    updateUIBadges();
    closeMobileDrawer();

    // به‌روزرسانی همه نماها به وضعیت خالی
    refreshAllViewsForUserState();

    showToast(prevName ? `${prevName} عزیز، با موفقیت از حساب کاربری خارج شدید.` : "با موفقیت از حساب کاربری خارج شدید.", "success");
  }

  function refreshAllViewsForUserState() {
    // ۱. به‌روزرسانی تمام کارت‌های کتاب صفحه فعلی
    document.querySelectorAll(".book-card").forEach((card) => {
      const bId = card.dataset.bookId;
      const isFav = AppState.favoriteIds.includes(bId);
      const favBtn = card.querySelector(".card-favorite-btn");
      if (favBtn) {
        favBtn.classList.toggle("favorited", isFav);
        favBtn.setAttribute("aria-label", isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها");
      }
    });

    // ۲. در صورت بودن در صفحه جزییات کتاب
    if (AppState.currentView === "book" && AppState.selectedBookId) {
      renderBookDetailsView(AppState.selectedBookId);
    }

    // ۳. در صورت بودن در صفحه کتابخانه
    if (AppState.currentView === "library") {
      renderLibraryView();
    }
  }

  function updateUIUserSection() {
    const loggedOutBox = document.getElementById("user-logged-out-box");
    const loggedInBox = document.getElementById("user-logged-in-box");
    const userNameSpan = document.getElementById("header-user-name");
    const userAvatar = document.getElementById("header-user-avatar");

    // کارت سایدبار کشویی موبایل
    const drawerUserName = document.getElementById("drawer-user-name");
    const drawerUserPhone = document.getElementById("drawer-user-phone");
    const drawerUserAvatar = document.getElementById("drawer-user-avatar");
    const drawerAuthBtn = document.getElementById("btn-drawer-auth-action");

    // برچسب ناوبری پایین موبایل
    const bnavUserLabel = document.getElementById("bnav-user-label");

    if (AppState.currentUser) {
      if (loggedOutBox) loggedOutBox.style.display = "none";
      if (loggedInBox) loggedInBox.style.display = "flex";
      if (userNameSpan) userNameSpan.textContent = AppState.currentUser.name;
      if (userAvatar) {
        userAvatar.textContent = AppState.currentUser.name.charAt(0) || "ک";
      }

      if (drawerUserName) drawerUserName.textContent = AppState.currentUser.name;
      if (drawerUserPhone) drawerUserPhone.textContent = toPersianDigits(AppState.currentUser.phone);
      if (drawerUserAvatar) drawerUserAvatar.textContent = AppState.currentUser.name.charAt(0) || "ک";
      if (drawerAuthBtn) {
        drawerAuthBtn.textContent = "خروج از حساب";
        drawerAuthBtn.className = "btn btn-danger btn-sm";
      }

      if (bnavUserLabel) {
        const shortName = AppState.currentUser.name.split(" ")[0];
        bnavUserLabel.textContent = shortName || "حساب من";
      }
    } else {
      if (loggedOutBox) loggedOutBox.style.display = "block";
      if (loggedInBox) loggedInBox.style.display = "none";

      if (drawerUserName) drawerUserName.textContent = "کاربر مهمان";
      if (drawerUserPhone) drawerUserPhone.textContent = "جهت دریافت کتاب وارد شوید";
      if (drawerUserAvatar) drawerUserAvatar.textContent = "م";
      if (drawerAuthBtn) {
        drawerAuthBtn.textContent = "ورود به حساب";
        drawerAuthBtn.className = "btn btn-outline btn-sm";
      }

      if (bnavUserLabel) bnavUserLabel.textContent = "ورود";
    }
  }

  function updateUIBadges() {
    const headerCount = document.getElementById("header-library-count");
    const purchasedCount = document.getElementById("library-purchased-count");
    const favoritesCount = document.getElementById("library-favorites-count");
    const drawerCount = document.getElementById("drawer-library-count");
    const bnavCount = document.getElementById("bnav-library-count");

    const totalPurchased = AppState.purchasedIds.length;
    const totalFavorites = AppState.favoriteIds.length;

    if (headerCount) headerCount.textContent = toPersianDigits(totalPurchased);
    if (drawerCount) drawerCount.textContent = toPersianDigits(totalPurchased);
    if (bnavCount) bnavCount.textContent = toPersianDigits(totalPurchased);
    if (purchasedCount) purchasedCount.textContent = toPersianDigits(totalPurchased);
    if (favoritesCount) favoritesCount.textContent = toPersianDigits(totalFavorites);
  }

  // =========================================================================
  // ۸. مدیریت سایدبار کشویی موبایل (Mobile Drawer)
  // =========================================================================

  function openMobileDrawer() {
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-drawer-overlay");
    if (drawer && overlay) {
      drawer.classList.add("active");
      overlay.classList.add("active");
      drawer.setAttribute("aria-hidden", "false");
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function closeMobileDrawer() {
    const drawer = document.getElementById("mobile-drawer");
    const overlay = document.getElementById("mobile-drawer-overlay");
    if (drawer && overlay) {
      drawer.classList.remove("active");
      overlay.classList.remove("active");
      drawer.setAttribute("aria-hidden", "true");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  // =========================================================================
  // ۹. پنجره خرید شبیه‌سازی‌شده (Purchase Modal)
  // =========================================================================

  let pendingPurchaseBookId = null;

  function openPurchaseModal(book) {
    AppState.lastFocusedElement = document.activeElement;
    pendingPurchaseBookId = book.id;

    const modal = document.getElementById("purchase-modal");
    const titleEl = document.getElementById("purchase-book-title");
    const authorEl = document.getElementById("purchase-book-author");
    const priceEl = document.getElementById("purchase-book-price");

    if (titleEl) titleEl.textContent = book.title;
    if (authorEl) authorEl.textContent = `نویسنده: ${book.author}`;
    if (priceEl) priceEl.textContent = formatPrice(book.price);

    if (modal) {
      modal.classList.add("active");
      const confirmBtn = document.getElementById("btn-confirm-purchase");
      if (confirmBtn) confirmBtn.focus();
    }
  }

  function closePurchaseModal() {
    const modal = document.getElementById("purchase-modal");
    if (modal) modal.classList.remove("active");
    pendingPurchaseBookId = null;
    if (AppState.lastFocusedElement) {
      AppState.lastFocusedElement.focus();
    }
  }

  function confirmPurchase() {
    if (!pendingPurchaseBookId) return;
    const book = BOOKS_DATA.find((b) => b.id === pendingPurchaseBookId);
    if (!book) return;

    addBookToPurchased(book.id);
    closePurchaseModal();
    showToast(`کتاب «${book.title}» با موفقیت خریداری شد و به کتابخانه اضافه گردید.`, "success");

    if (AppState.currentView === "book") {
      renderBookDetailsView(book.id);
    }
  }

  // =========================================================================
  // ۱۰. راه‌اندازی و رویدادهای عمومی (Event Listeners & Initialization)
  // =========================================================================

  function setupEventListeners() {
    // ناوبری هدر
    const brandLogo = document.getElementById("nav-brand-logo");
    if (brandLogo) brandLogo.addEventListener("click", (e) => { e.preventDefault(); navigateTo("home"); });

    const navHome = document.getElementById("nav-link-home");
    if (navHome) navHome.addEventListener("click", (e) => { e.preventDefault(); navigateTo("home"); });

    const navCatalog = document.getElementById("nav-link-catalog");
    if (navCatalog) navCatalog.addEventListener("click", (e) => { e.preventDefault(); navigateTo("catalog"); });

    const navLibrary = document.getElementById("nav-link-library");
    if (navLibrary) navLibrary.addEventListener("click", (e) => { e.preventDefault(); navigateTo("library"); });

    // باز و بسته کردن منوی کشویی سایدبار موبایل
    const mobileMenuBtn = document.getElementById("btn-mobile-menu");
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", openMobileDrawer);
    }

    const closeDrawerBtn = document.getElementById("btn-close-drawer");
    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener("click", closeMobileDrawer);
    }

    const drawerOverlay = document.getElementById("mobile-drawer-overlay");
    if (drawerOverlay) {
      drawerOverlay.addEventListener("click", closeMobileDrawer);
    }

    // پیوندهای داخل منوی سایدبار موبایل
    const dHome = document.getElementById("drawer-link-home");
    if (dHome) dHome.addEventListener("click", (e) => { e.preventDefault(); navigateTo("home"); });

    const dCatalog = document.getElementById("drawer-link-catalog");
    if (dCatalog) dCatalog.addEventListener("click", (e) => { e.preventDefault(); navigateTo("catalog"); });

    const dLibrary = document.getElementById("drawer-link-library");
    if (dLibrary) dLibrary.addEventListener("click", (e) => { e.preventDefault(); navigateTo("library"); });

    const dFree = document.getElementById("drawer-link-free");
    if (dFree) {
      dFree.addEventListener("click", (e) => {
        e.preventDefault();
        applyCatalogFilters({ priceType: "free", category: "all", searchQuery: "" });
        navigateTo("catalog");
      });
    }

    const drawerAuthBtn = document.getElementById("btn-drawer-auth-action");
    if (drawerAuthBtn) {
      drawerAuthBtn.addEventListener("click", () => {
        if (AppState.currentUser) {
          handleLogout();
        } else {
          closeMobileDrawer();
          openLoginModal();
        }
      });
    }

    // دکمه باز کردن جستجوی موبایل در هدر
    const mobileSearchBtn = document.getElementById("btn-mobile-search-toggle");
    if (mobileSearchBtn) {
      mobileSearchBtn.addEventListener("click", () => {
        const searchContainer = document.getElementById("header-search-container");
        if (searchContainer) {
          searchContainer.classList.toggle("mobile-active");
          const input = document.getElementById("global-search-input");
          if (input && searchContainer.classList.contains("mobile-active")) {
            input.focus();
          }
        }
      });
    }

    // نوار ناوبری پایین صفحه برای موبایل (Bottom Nav)
    const bHome = document.getElementById("bnav-home");
    if (bHome) bHome.addEventListener("click", (e) => { e.preventDefault(); navigateTo("home"); });

    const bCatalog = document.getElementById("bnav-catalog");
    if (bCatalog) bCatalog.addEventListener("click", (e) => { e.preventDefault(); navigateTo("catalog"); });

    const bLibrary = document.getElementById("bnav-library");
    if (bLibrary) bLibrary.addEventListener("click", (e) => { e.preventDefault(); navigateTo("library"); });

    const bUser = document.getElementById("bnav-user");
    if (bUser) {
      bUser.addEventListener("click", () => {
        if (AppState.currentUser) {
          openMobileDrawer();
        } else {
          openLoginModal();
        }
      });
    }

    // جستجوی سربرگ
    const searchInput = document.getElementById("global-search-input");
    const clearBtn = document.getElementById("search-clear-btn");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const val = e.target.value;
        if (clearBtn) clearBtn.classList.toggle("active", Boolean(val.length > 0));

        AppState.catalogFilters.searchQuery = val;
        if (AppState.currentView !== "catalog") {
          navigateTo("catalog");
        } else {
          filterAndRenderCatalogBooks();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        clearBtn.classList.remove("active");
        AppState.catalogFilters.searchQuery = "";
        filterAndRenderCatalogBooks();
      });
    }

    // دکمه‌های اسلایدر بنر
    const bannerPrev = document.getElementById("banner-prev-btn");
    const bannerNext = document.getElementById("banner-next-btn");
    if (bannerPrev) bannerPrev.addEventListener("click", () => goToBannerSlide(AppState.activeBannerIndex - 1));
    if (bannerNext) bannerNext.addEventListener("click", () => goToBannerSlide(AppState.activeBannerIndex + 1));

    // کنترل‌های اسکرول قفسه‌ها
    document.querySelectorAll("[data-shelf-prev]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = btn.getAttribute("data-shelf-prev");
        const track = document.getElementById(trackId);
        if (track) track.scrollBy({ left: 300, behavior: "smooth" });
      });
    });

    document.querySelectorAll("[data-shelf-next]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = btn.getAttribute("data-shelf-next");
        const track = document.getElementById(trackId);
        if (track) track.scrollBy({ left: -300, behavior: "smooth" });
      });
    });

    // پیوندهای «مشاهده همه» در ردیف‌های صفحه اصلی
    document.querySelectorAll("[data-shelf-filter]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const filterType = link.getAttribute("data-shelf-filter");
        if (filterType === "free") {
          applyCatalogFilters({ priceType: "free", category: "all", searchQuery: "" });
        } else {
          resetAllFilters();
        }
        navigateTo("catalog");
      });
    });

    // مرتب‌سازی در فهرست کتاب‌ها
    const sortSelect = document.getElementById("catalog-sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        AppState.catalogFilters.sortBy = e.target.value;
        filterAndRenderCatalogBooks();
      });
    }

    // فیلتر رادیویی قیمت
    document.querySelectorAll('input[name="filter-price"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        AppState.catalogFilters.priceType = e.target.value;
        filterAndRenderCatalogBooks();
      });
    });

    // دکمه پاک کردن فیلترها
    const clearAllFiltersBtn = document.getElementById("btn-clear-all-filters");
    if (clearAllFiltersBtn) {
      clearAllFiltersBtn.addEventListener("click", resetAllFilters);
    }

    // تب‌های کتابخانه
    const tabPurchasedBtn = document.getElementById("tab-btn-purchased");
    const tabFavoritesBtn = document.getElementById("tab-btn-favorites");
    if (tabPurchasedBtn) tabPurchasedBtn.addEventListener("click", () => renderLibraryView("purchased"));
    if (tabFavoritesBtn) tabFavoritesBtn.addEventListener("click", () => renderLibraryView("favorites"));

    // مودال ورود
    const openLoginBtn = document.getElementById("btn-open-login");
    const closeLoginBtn = document.getElementById("btn-close-login");
    const cancelLoginBtn = document.getElementById("btn-cancel-login");
    const loginForm = document.getElementById("login-form");
    const logoutBtn = document.getElementById("btn-logout");

    if (openLoginBtn) openLoginBtn.addEventListener("click", openLoginModal);
    if (closeLoginBtn) closeLoginBtn.addEventListener("click", closeLoginModal);
    if (cancelLoginBtn) cancelLoginBtn.addEventListener("click", closeLoginModal);
    if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    // مودال خرید
    const closePurchaseBtn = document.getElementById("btn-close-purchase");
    const cancelPurchaseBtn = document.getElementById("btn-cancel-purchase");
    const confirmPurchaseBtn = document.getElementById("btn-confirm-purchase");

    if (closePurchaseBtn) closePurchaseBtn.addEventListener("click", closePurchaseModal);
    if (cancelPurchaseBtn) cancelPurchaseBtn.addEventListener("click", closePurchaseModal);
    if (confirmPurchaseBtn) confirmPurchaseBtn.addEventListener("click", confirmPurchase);

    // رویدادهای حالت مطالعه
    const exitReaderBtn = document.getElementById("btn-reader-exit");
    if (exitReaderBtn) {
      exitReaderBtn.addEventListener("click", () => {
        if (AppState.selectedBookId) {
          navigateToBookDetails(AppState.selectedBookId);
        } else {
          navigateTo("catalog");
        }
      });
    }

    // ابزارهای تنظیم فونت و تم مطالعه
    document.querySelectorAll("[data-font-size]").forEach((btn) => {
      btn.addEventListener("click", () => {
        AppState.readerSettings.fontSize = btn.dataset.fontSize;
        saveReaderSettings();
        applyReaderSettings();
      });
    });

    document.querySelectorAll("[data-theme]").forEach((btn) => {
      btn.addEventListener("click", () => {
        AppState.readerSettings.theme = btn.dataset.theme;
        saveReaderSettings();
        applyReaderSettings();
      });
    });

    // بستن پنجره‌ها و منوها با کلید Escape
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const loginModal = document.getElementById("login-modal");
        const purchaseModal = document.getElementById("purchase-modal");
        const drawer = document.getElementById("mobile-drawer");

        if (drawer && drawer.classList.contains("active")) {
          closeMobileDrawer();
          return;
        }

        if (loginModal && loginModal.classList.contains("active")) {
          closeLoginModal();
          return;
        }

        if (purchaseModal && purchaseModal.classList.contains("active")) {
          closePurchaseModal();
          return;
        }

        if (AppState.currentView === "reader") {
          if (AppState.selectedBookId) {
            navigateToBookDetails(AppState.selectedBookId);
          } else {
            navigateTo("home");
          }
        }
      }
    });

    // پشتیبانی از تغییرات پاپ‌استیت و هش مرورگر
    window.addEventListener("hashchange", () => {
      handleUrlRouting();
    });
  }

  // راه‌اندازی اولیه برنامه
  function initApp() {
    loadPersistedState();
    updateUIUserSection();
    updateUIBadges();
    setupEventListeners();
    handleUrlRouting();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
