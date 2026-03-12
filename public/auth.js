const AUTH_KEYS = {
  chat: "evala_auth_chat",
  cases: "evala_auth_cases",
};
const SESSION_TTL_MS = 5 * 60 * 1000;

function getSessionKey(moduleName) {
  return AUTH_KEYS[moduleName];
}

function getSession(moduleName) {
  const key = getSessionKey(moduleName);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session || !session.expiresAt) return null;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function setSession(moduleName, user) {
  const key = getSessionKey(moduleName);
  if (!key) return;
  const now = Date.now();
  const payload = {
    username: user.username,
    role: user.role,
    name: user.name,
    loggedAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
  };
  localStorage.setItem(key, JSON.stringify(payload));
}

function clearSession(moduleName) {
  const key = getSessionKey(moduleName);
  if (!key) return;
  localStorage.removeItem(key);
}

function requireAuth(moduleName, redirectTo) {
  const session = getSession(moduleName);
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

function bindLogout(buttonId, moduleName, redirectTo) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.addEventListener("click", () => {
    clearSession(moduleName);
    window.location.href = redirectTo;
  });
}

function setUserLabel(targetId, session) {
  const node = document.getElementById(targetId);
  if (!node || !session) return;
  node.textContent = `${session.name} · ${session.role}`;
}

function formatCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startSessionCountdown(targetId, session, moduleName, redirectTo) {
  const node = document.getElementById(targetId);
  if (!node || !session) return;

  const tick = () => {
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearSession(moduleName);
      window.location.href = redirectTo;
      return;
    }
    node.textContent = `Sesión expira en ${formatCountdown(remaining)}`;
  };

  tick();
  return setInterval(tick, 1000);
}
