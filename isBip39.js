let bip39Words = [];

fetch('/docs/bip39.json')
  .then(res => res.json())
  .then(data => {
    bip39Words = data.words || data; // handle both `{"words": [...]} or just [...]`
  });

const input = document.getElementById('bip39Input');
const suggestionsBox = document.getElementById('suggestions');

let currentMatches = [];

input.addEventListener('input', () => {
  const value = input.value.trim().toLowerCase();

  if (value === "") {
    input.classList.remove('valid', 'invalid');
    suggestionsBox.textContent = "";
    return;
  }

  if (bip39Words.includes(value)) {
    input.classList.add('valid');
    input.classList.remove('invalid');
  } else {
    input.classList.add('invalid');
    input.classList.remove('valid');
  }

  // Suggestions
  currentMatches = bip39Words.filter(word => word.startsWith(value)).slice(0, 5);

  if (currentMatches.length) {
    suggestionsBox.innerHTML = 'Suggestions: ' + currentMatches
      .map(word => `<span class="suggestion">${word}</span>`)
      .join(', ');
  } else {
    suggestionsBox.innerHTML = "";
  }
});

// Autocomplete on click
suggestionsBox.addEventListener('click', (e) => {
  if (e.target.classList.contains('suggestion')) {
    input.value = e.target.textContent;
    input.dispatchEvent(new Event('input'));
  }
});

// Autocomplete on TAB if one match
input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && currentMatches.length === 1) {
    e.preventDefault();
    input.value = currentMatches[0];
    input.dispatchEvent(new Event('input'));
  }
});

// Open the modal
function openBipModal(event) {
    if (event) event.stopPropagation();
    closeAllModals(); // if you use this globally
    const modal = document.getElementById("bip39Modal");
    modal.classList.add("active");
    document.body.classList.add("modal-open");
  }
  
  // Close the modal
  function closeBipModal() {
    const modal = document.getElementById("bip39Modal");
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }
  
  // Global registration
  window.openBipModal = openBipModal;
  window.closeBipModal = closeBipModal;
  
  document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById("openBipInfoModal");
    const closeBtn = document.getElementById("closeBipModal");
    const modal = document.getElementById("bip39Modal");
  
    if (openBtn) {
      openBtn.addEventListener("click", openBipModal);
    }
  
    if (closeBtn) {
      closeBtn.addEventListener("click", closeBipModal);
    }
  
    // Close when clicking outside modal-content
    window.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeBipModal();
      }
    });
  });