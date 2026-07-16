
(() => {
  const currentPath = location.pathname.split("/").pop() || "index.html";
  const excluded = new Set(["index.html", "dashboard.html"]);

  if (excluded.has(currentPath)) return;

  const isSafeInternalUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      return (
        parsed.origin === location.origin &&
        !parsed.pathname.endsWith("/index.html") &&
        !parsed.pathname.endsWith("/dashboard.html")
      );
    } catch {
      return false;
    }
  };

  const rememberCurrentPage = () => {
    if (!excluded.has(currentPath)) {
      sessionStorage.setItem(
        "tkn-last-page",
        location.href
      );
    }
  };

  const goBackSafely = () => {
    const referrer = document.referrer;

    if (referrer && isSafeInternalUrl(referrer)) {
      history.back();
      return;
    }

    const lastPage = sessionStorage.getItem("tkn-last-page");

    if (
      lastPage &&
      lastPage !== location.href &&
      isSafeInternalUrl(lastPage)
    ) {
      location.href = lastPage;
      return;
    }

    location.href = "./dashboard.html";
  };

  const bar = document.createElement("nav");
  bar.className = "tkn-nav-bar no-print";
  bar.setAttribute("aria-label", "เมนูนำทาง");

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "tkn-nav-btn";
  backButton.textContent = "← ย้อนกลับ";
  backButton.addEventListener("click", goBackSafely);

  const dashboardLink = document.createElement("a");
  dashboardLink.className = "tkn-nav-btn primary";
  dashboardLink.href = "./dashboard.html";
  dashboardLink.textContent = "Dashboard";

  const title = document.createElement("span");
  title.className = "tkn-nav-title";
  title.textContent = document.title || "ร้านเถ้าแก่น้อยชลบุรี";

  bar.append(backButton, dashboardLink, title);
  document.body.prepend(bar);

  document.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener("click", () => {
      rememberCurrentPage();
    });
  });
})();
