const quotesContainer = document.getElementById('quotes');

fetch('quotes.json')
  .then(response => response.json())
  .then(data => {
    let quotes = data;

    // Shuffle quotes
    for (let i = quotes.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
    }

    // Display the first quote
    quotesContainer.innerHTML = `<p>"${quotes[0].text}"<br><br>~ Satoshi Nakamoto <br>${quotes[0].date}</p>`;

    // Show next quote after 30 seconds
    let currentQuote = 1;
    setInterval(() => {
      quotesContainer.innerHTML = `<p>"${quotes[currentQuote].text}"<br><br>~ Satoshi Nakamoto <br>${quotes[currentQuote].date}</p>`;
      currentQuote = (currentQuote + 1) % quotes.length;
    }, 35000);
  });


