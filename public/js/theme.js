const themeInput = document.getElementById("theme-input");

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (themeInput) themeInput.checked = dark;
  localStorage.setItem("theme", dark ? "dark" : "light");
}

const saved = localStorage.getItem("theme") || "dark";
applyTheme(saved === "dark");

if (themeInput) {
  themeInput.addEventListener("change", () => {
    applyTheme(themeInput.checked);
  });
}
