function displayTruncatedText(element, fullText, limit = 300) {
    // Store the full text in a data attribute
    element.dataset.fullText = fullText;
    if (fullText.length > limit) {
      const truncated = fullText.substring(0, limit) + "...";
      element.textContent = truncated;
  
      // Create or reuse a toggle button
      let toggleButton = document.createElement("button");
      toggleButton.textContent = "Read more";
      toggleButton.classList.add("toggle-button");
      toggleButton.addEventListener("click", function () {
        if (toggleButton.textContent === "Read more") {
          element.textContent = fullText;
          toggleButton.textContent = "Read less";
        } else {
          element.textContent = truncated;
          toggleButton.textContent = "Read more";
        }
        // Append the button again so it stays visible after updating the text
        element.appendChild(toggleButton);
      });
      element.appendChild(toggleButton);
    } else {
      element.textContent = fullText;
    }
  }
  