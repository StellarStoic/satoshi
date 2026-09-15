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

    let currentQuote = 0;
    let quoteTimer;
    function showNextQuote() {
      clearTimeout(quoteTimer);
      quotesContainer.innerHTML = `<p>"${quotes[currentQuote].text}"<br><br>~ Satoshi Nakamoto <br>${quotes[currentQuote].date}</p>`;
      currentQuote = (currentQuote + 1) % quotes.length;
      window.scrollTo(0, 0);
      quoteTimer = setTimeout(showNextQuote, 120000);
    }

    showNextQuote();
    const nextQuoteButton = document.getElementById('next-quote');
    nextQuoteButton.disabled = false;
    nextQuoteButton.addEventListener('click', showNextQuote);
  });

