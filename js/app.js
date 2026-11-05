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
    USER: "taaghche_current_user",
    PURCHASED: "taaghche_purchased_books",
    FAVORITES: "taaghche_favorite_books",
    READER_SETTINGS: "taaghche_reader_settings"
  };

  const AppState = {
    currentUser: null,
    purchasedIds: [],
    favoriteIds: [],
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
   * بارگذاری امن داده‌ها از LocalStorage با مدیریت خطا و مقادیر پیش‌فرض
   */
  function loadPersistedState() {
    try {
      const userStr = localStorage.getItem(STORAGE_KEYS.USER);
      if (userStr) {
        AppState.currentUser = JSON.parse(userStr);
      }
    } catch (e) {
      console.warn("خطا در خواندن اطلاعات کاربر از حافظه محلی:", e);
      AppState.currentUser = null;
    }

    try {
      const purchasedStr = localStorage.getItem(STORAGE_KEYS.PURCHASED);
      AppState.purchasedIds = purchasedStr ? JSON.parse(purchasedStr) : [];
      if (!Array.isArray(AppState.purchasedIds)) AppState.purchasedIds = [];
    } catch (e) {
      console.warn("خطا در خواندن کتاب‌های خریداری‌شده:", e);
      AppState.purchasedIds = [];
    }

    try {
      const favStr = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      AppState.favoriteIds = favStr ? JSON.parse(favStr) : [];
      if (!Array.isArray(AppState.favoriteIds)) AppState.favoriteIds = [];
    } catch (e) {
      console.warn("خطا در خواندن کتاب‌های مورد علاقه:", e);
      AppState.favoriteIds = [];
    }

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

  function saveUserState() {
    try {
      if (AppState.currentUser) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(AppState.currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    } catch (e) {
      console.error("ذخیره کاربر ناموفق بود:", e);
    }
  }

  function savePurchasedState() {
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASED, JSON.stringify(AppState.purchasedIds));
    } catch (e) {
      console.error("ذخیره کتاب‌های خریداری‌شده ناموفق بود:", e);
    }
  }

  function saveFavoritesState() {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(AppState.favoriteIds));
    } catch (e) {
      console.error("ذخیره علاقه‌مندی‌ها ناموفق بود:", e);
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
   * تبدیل ارقام فارسی به انگلیسی (برای اعتبارسنجی ورودی شماره موبایل)
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
    
    // استفاده امن از textContent
    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    container.appendChild(toast);

    // انیمیشن ورود
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    // حذف خودکار بعد از ۳ ثانیه
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

    // آیکون قلب SVG
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
  // ۴. مدیریت علاقه‌مندی‌ها و خرید (Favorites & Purchases)
  // =========================================================================

  function toggleFavorite(bookId) {
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

    saveFavoritesState();
    updateUIBadges();

    // به‌روزرسانی زنده کارت‌ها در صفحه فعلی
    document.querySelectorAll(`.book-card[data-book-id="${bookId}"] .card-favorite-btn`).forEach((btn) => {
      const isFav = AppState.favoriteIds.includes(bookId);
      btn.classList.toggle("favorited", isFav);
      btn.setAttribute("aria-label", isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها");
    });

    // در صورت بودن در صفحه جزییات کتاب
    const detailFavBtn = document.getElementById("btn-detail-favorite");
    if (detailFavBtn && AppState.selectedBookId === bookId) {
      const isFav = AppState.favoriteIds.includes(bookId);
      detailFavBtn.classList.toggle("btn-danger", isFav);
      detailFavBtn.classList.toggle("btn-outline", !isFav);
      detailFavBtn.textContent = isFav ? "❤️ حذف از نشان‌شده‌ها" : "🤍 افزودن به نشان‌شده‌ها";
    }

    // اگر در نمای کتابخانه هستیم، رندر مجدد تب علاقه‌مندی‌ها
    if (AppState.currentView === "library") {
      renderLibraryView();
    }
  }

  function handleBookAction(bookId) {
    const book = BOOKS_DATA.find((b) => b.id === bookId);
    if (!book) return;

    // بررسی آیا قبلاً دریافت شده است
    if (AppState.purchasedIds.includes(book.id)) {
      if (book.sampleText && book.sampleText.length > 0) {
        navigateToReader(book.id);
      } else {
        showToast("این کتاب در کتابخانه شما موجود است.", "success");
      }
      return;
    }

    // شرط احراز هویت کاربر
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
    if (!AppState.purchasedIds.includes(bookId)) {
      AppState.purchasedIds.push(bookId);
      savePurchasedState();
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

    // رندر کتاب‌های مرتبط (حداقل ۳ کتاب از همان دسته‌بندی به جز خود کتاب)
    const relatedGrid = document.getElementById("related-books-grid");
    if (relatedGrid) {
      relatedGrid.innerHTML = "";
      const related = BOOKS_DATA.filter((b) => b.category === book.category && b.id !== book.id).slice(0, 4);
      if (related.length === 0) {
        // در صورت کمبود، کتاب‌های عمومی پرامتیاز
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
      const emptyTitle = isPurchasedTab
        ? "هنوز هیچ کتابی در کتابخانه خود دریافت نکرده‌اید."
        : "هیچ کتابی در فهرست علاقه‌مندی‌های شما قرار ندارد.";
      const emptyActionText = isPurchasedTab ? "مشاهده کتاب‌های رایگان" : "گشت‌وگذار در میان کتاب‌ها";

      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${isPurchasedTab ? "📚" : "🤍"}</div>
          <h3 class="empty-state-title">${emptyTitle}</h3>
          <p class="empty-state-text">با گشت‌وگذار در فهرست کتاب‌ها و انتخاب آثار مورد علاقه خود، کتابخانه شخصی‌تان را بسازید.</p>
          <button type="button" class="btn btn-primary" id="btn-library-browse">
            ${emptyActionText}
          </button>
        </div>
      `;

      const browseBtn = document.getElementById("btn-library-browse");
      if (browseBtn) {
        browseBtn.addEventListener("click", () => {
          if (isPurchasedTab) {
            applyCatalogFilters({ priceType: "free", category: "all", searchQuery: "" });
          } else {
            resetAllFilters();
          }
          navigateTo("catalog");
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
    const container = document.getElementById("reader-container");

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

    // اعمال تنظیمات اندازه فونت و تم
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

    // بستن منوی موبایل در صورت باز بودن
    const searchContainer = document.getElementById("header-search-container");
    if (searchContainer) searchContainer.classList.remove("mobile-active");

    // پنهان کردن تمام نماها
    document.querySelectorAll(".app-view").forEach((view) => {
      view.style.display = "none";
    });

    // به‌روزرسانی فعال بودن پیوندهای هدر
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
    });

    // نمایش نمای مورد نظر
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.style.display = "block";
    }

    // اگر نمای مطالعه است، هدر و فوتر پنهان شوند
    const header = document.querySelector(".site-header");
    const footer = document.querySelector(".site-footer");
    const isReader = viewName === "reader";

    if (header) header.style.display = isReader ? "none" : "block";
    if (footer) footer.style.display = isReader ? "none" : "block";

    window.scrollTo({ top: 0, behavior: "smooth" });

    // مدیریت وضعیت هر نما
    if (viewName === "home") {
      const homeLink = document.getElementById("nav-link-home");
      if (homeLink) homeLink.classList.add("active");
      renderHomeView();
      window.location.hash = "home";
    } else if (viewName === "catalog") {
      const catLink = document.getElementById("nav-link-catalog");
      if (catLink) catLink.classList.add("active");
      renderCatalogView();
      window.location.hash = "catalog";
    } else if (viewName === "book") {
      const bookId = params.id || AppState.selectedBookId;
      renderBookDetailsView(bookId);
      window.location.hash = `book?id=${bookId}`;
    } else if (viewName === "library") {
      const libLink = document.getElementById("nav-link-library");
      if (libLink) libLink.classList.add("active");
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

  /**
   * تجزیه هش و پارامترهای آدرس مرورگر برای پشتیبانی از لینک‌های مستقیم و رفرش
   */
  function handleUrlRouting() {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");

    // پشتیبانی از باز کردن با پارامتر ?book=id
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

    // پیش‌فرض: صفحه اصلی
    navigateTo("home");
  }

  // =========================================================================
  // ۷. احراز هویت نمایشی و اعتبارسنجی فرم (Authentication & Validation)
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

    // ورود موفقیت‌آمیز
    AppState.currentUser = {
      name: rawName,
      phone: normalizedDigits
    };

    saveUserState();
    updateUIUserSection();
    closeLoginModal();
    showToast(`خوش آمدید، ${rawName}! ورود شما با موفقیت انجام شد.`, "success");

    // به‌روزرسانی صفحه جزییات کتاب در صورت باز بودن
    if (AppState.currentView === "book" && AppState.selectedBookId) {
      renderBookDetailsView(AppState.selectedBookId);
    }
  }

  function handleLogout() {
    const prevName = AppState.currentUser ? AppState.currentUser.name : "";
    AppState.currentUser = null;
    saveUserState();
    updateUIUserSection();
    showToast(`${prevName} عزیز، با موفقیت از حساب کاربری خارج شدید.`, "success");

    if (AppState.currentView === "book" && AppState.selectedBookId) {
      renderBookDetailsView(AppState.selectedBookId);
    }
  }

  function updateUIUserSection() {
    const loggedOutBox = document.getElementById("user-logged-out-box");
    const loggedInBox = document.getElementById("user-logged-in-box");
    const userNameSpan = document.getElementById("header-user-name");
    const userAvatar = document.getElementById("header-user-avatar");

    if (AppState.currentUser) {
      if (loggedOutBox) loggedOutBox.style.display = "none";
      if (loggedInBox) loggedInBox.style.display = "flex";
      if (userNameSpan) userNameSpan.textContent = AppState.currentUser.name;
      if (userAvatar) {
        userAvatar.textContent = AppState.currentUser.name.charAt(0) || "ک";
      }
    } else {
      if (loggedOutBox) loggedOutBox.style.display = "block";
      if (loggedInBox) loggedInBox.style.display = "none";
    }
  }

  function updateUIBadges() {
    const headerCount = document.getElementById("header-library-count");
    const purchasedCount = document.getElementById("library-purchased-count");
    const favoritesCount = document.getElementById("library-favorites-count");

    const totalCount = AppState.purchasedIds.length;
    if (headerCount) headerCount.textContent = toPersianDigits(totalCount);
    if (purchasedCount) purchasedCount.textContent = toPersianDigits(AppState.purchasedIds.length);
    if (favoritesCount) favoritesCount.textContent = toPersianDigits(AppState.favoriteIds.length);
  }

  // =========================================================================
  // ۸. پنجره خرید شبیه‌سازی‌شده (Purchase Modal)
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
  // ۹. راه‌اندازی و رویدادهای عمومی (Event Listeners & Initialization)
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

    // منوی موبایل
    const mobileMenuBtn = document.getElementById("btn-mobile-menu");
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", () => {
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
        if (track) track.scrollBy({ left: 300, behavior: "smooth" }); // در جهت RTL
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

    // بستن پنجره‌ها و خروج از مطالعه با کلید Escape
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const loginModal = document.getElementById("login-modal");
        const purchaseModal = document.getElementById("purchase-modal");

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

  // اجرای برنامه پس از بارگذاری DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
