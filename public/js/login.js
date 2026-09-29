const form = document.getElementById("login-form");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submit-btn");

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = type;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in…";
  showMessage("", "");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      showMessage("Login successful! Welcome back.", "success");
      form.reset();
      const token = data?.data?.token;
      if (token) {
        localStorage.setItem("taskforge_token", token);
      }
    } else {
      showMessage(data.message || "Invalid email or password.", "error");
    }
  } catch {
    showMessage("Network error. Is the server running?", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Log in";
  }
});
