// document.getElementById("quotes").addEventListener("click", function() {
//     let quotesText = document.getElementById("quotes").innerText;
    
//     let textArea = document.createElement("textarea");
//     textArea.value = quotesText;
//     document.body.appendChild(textArea);
//     textArea.select();
    
//     document.execCommand("copy");
    
//     document.body.removeChild(textArea);
//   });

// document.getElementById("quotes").addEventListener("click", function() {
//     const quoteText = document.getElementById("quotes").innerText;
//     navigator.clipboard.writeText(quoteText).then(function() {
//     //   alert("Quote copied to clipboard!");
//     });
//   });

const quotes = document.getElementById("quotes");
const copyNotification = document.querySelector(".copy-notification");

quotes.addEventListener("click", function() {
const quote = document.getElementById("quotes").innerText;

navigator.clipboard.writeText(quote).then(() => {
    copyNotification.style.display = "block";

    setTimeout(() => {
    copyNotification.style.display = "none";
    }, 1200);
});
});