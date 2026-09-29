const form = document.getElementById("forgot-form");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submit-btn");

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = type;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";
  showMessage("", "");

  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("email").value.trim() }),
    });
    const data = await response.json();

    if (response.ok) {
      showMessage(data.message || "If an account with that email exists, a password reset link has been sent.", "success");
      form.reset();
    } else {
      showMessage(data.message || "Something went wrong. Please try again.", "error");
    }
  } catch {
    showMessage("Network error. Is the server running?", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset link";
  }
});
