const CASE_USERS = [
  { username: "analista1", password: "1234", role: "analista", name: "Analista 1" },
  { username: "coordinador1", password: "admin123", role: "coordinador", name: "Coordinador 1" },
];

const existing = getSession("cases");
if (existing) {
  window.location.href = "/cases.html";
}

const form = document.getElementById("loginForm");
const error = document.getElementById("loginError");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const user = CASE_USERS.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    error.textContent = "Credenciales inválidas. Verifica usuario y clave.";
    return;
  }

  setSession("cases", user);
  window.location.href = "/cases.html";
});
