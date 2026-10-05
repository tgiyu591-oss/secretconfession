"use strict";

const composerView = document.querySelector("#composer-view");
const resultView = document.querySelector("#result-view");
const letterView = document.querySelector("#letter-view");
const notFoundView = document.querySelector("#not-found-view");
const form = document.querySelector("#confession-form");
const messageInput = document.querySelector("#message");
const characterCount = document.querySelector("#character-count");
const formError = document.querySelector("#form-error");
const createButton = document.querySelector("#create-button");

function showOnly(view) {
  for (const section of [composerView, resultView, letterView, notFoundView]) {
    section.hidden = section !== view;
  }
}

function setError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

async function loadConfession(id) {
  showOnly(letterView);
  try {
    const response = await fetch(`/api/confessions/${encodeURIComponent(id)}`);
    if (!response.ok) {
      showOnly(notFoundView);
      return;
    }
    const confession = await response.json();
    document.querySelector("#letter-body").textContent = confession.message;
    const signature = document.querySelector("#letter-signature");
    signature.textContent = confession.senderName ? `— ${confession.senderName}` : "";
    signature.hidden = !confession.senderName;
  } catch {
    showOnly(notFoundView);
  }
}

if (window.location.pathname.startsWith("/c/")) {
  const id = window.location.pathname.slice(3);
  loadConfession(id);
} else {
  showOnly(composerView);
}

messageInput.addEventListener("input", () => {
  characterCount.textContent = `${messageInput.value.length.toLocaleString()} / 2,000`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError(formError, "");
  createButton.disabled = true;
  createButton.querySelector("span:first-child").textContent = "Making your link...";

  try {
    const response = await fetch("/api/confessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: messageInput.value,
        senderName: document.querySelector("#sender-name").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(formError, result.error || "Could not create your link. Please try again.");
      return;
    }

    document.querySelector("#share-link").value = new URL(result.path, window.location.origin).href;
    document.querySelector("#copy-status").textContent = "";
    showOnly(resultView);
  } catch {
    setError(formError, "Could not reach the server. Please try again.");
  } finally {
    createButton.disabled = false;
    createButton.querySelector("span:first-child").textContent = "Create a private link";
  }
});

document.querySelector("#copy-button").addEventListener("click", async () => {
  const copyStatus = document.querySelector("#copy-status");
  const copyButton = document.querySelector("#copy-button");
  try {
    await navigator.clipboard.writeText(document.querySelector("#share-link").value);
    copyButton.textContent = "Copied!";
    copyStatus.textContent = "Link copied. Send it to your person.";
  } catch {
    copyStatus.textContent = "Copy didn’t work here—select the link above and copy it.";
  }
});

document.querySelector("#new-confession").addEventListener("click", () => {
  form.reset();
  characterCount.textContent = "0 / 2,000";
  document.querySelector("#copy-button").textContent = "Copy link";
  setError(formError, "");
  showOnly(composerView);
});
