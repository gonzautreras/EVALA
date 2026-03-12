const CHAT_USERS = [
  { username: "tecnico1", password: "1234", role: "tecnico", name: "Técnico 1" },
  { username: "tecnico2", password: "1234", role: "tecnico", name: "Técnico 2" },
  { username: "supervisor1", password: "admin123", role: "supervisor", name: "Supervisor 1" },
];

const existing = getSession("chat");
if (existing) {
  window.location.href = "/chat.html";
}

const form = document.getElementById("loginForm");
const error = document.getElementById("loginError");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const user = CHAT_USERS.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    error.textContent = "Credenciales inválidas. Verifica usuario y clave.";
    return;
  }

  setSession("chat", user);
  window.location.href = "/chat.html";
});
