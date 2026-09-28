const form = document.getElementById("reset-form");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submit-btn");
const invalidLinkEl = document.getElementById("invalid-link");

const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  invalidLinkEl.style.display = "block";
  form.style.display = "none";
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = type;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Resetting…";
  showMessage("", "");

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json();

    if (response.ok) {
      showMessage("Password reset successful! Redirecting to login…", "success");
      form.reset();
      form.style.display = "none";
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } else {
      showMessage(data.message || "Failed to reset password. The link may have expired.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Reset password";
    }
  } catch {
    showMessage("Network error. Is the server running?", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Reset password";
  }
});
