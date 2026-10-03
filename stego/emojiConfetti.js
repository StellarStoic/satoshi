function checkForConfettiTrigger(secretMessage) {
    if (!secretMessage) return false; // Ensure there's a message to check

    const lowerMessage = secretMessage.toLowerCase(); // Normalize for case-insensitive search
    const prefixes = {
        "cashu": "/stego/img/QRcode_logo/ecash.png",  // Cashu
        "lnbc": "/stego/img/QRcode_logo/ln.png",  // Lightning
        "lightning:": "⚡",  // Lightning
        "bitcoin:": "/stego/img/QRcode_logo/bitcoin.png", // Bitcoin
        "bc1": "/stego/img/QRcode_logo/bitcoin.png", // Bitcoin
        "nostr:": "/stego/img/othrIcon/purpleFeather.png", // Nostr
        "nevent": "/stego/img/othrIcon/purpleFeather.png", // Nostr
        "note1": "/stego/img/othrIcon/purpleFeather.png", // Nostr
        "npub": "/stego/img/othrIcon/purpleFeather.png", // Nostr
        "nsec": "/stego/img/othrIcon/purpleFeather.png", // Nostr
        "monero:": "/stego/img/QRcode_logo/monero.png", // Monero
    };

    for (const [prefix, emoji] of Object.entries(prefixes)) {
        // if (lowerMessage.includes(prefix)) {  // ✅ Check ANYWHERE in the message
        // Build a regex to match the prefix only if it starts at the beginning of a word
        const regex = new RegExp(`\\b${prefix}`, 'i'); // \b = word boundary, 'i' = case insensitive
        if (regex.test(secretMessage)) {
            startEmojiConfetti(emoji);
            return true; // ✅ Confetti triggered, return true
        }
    }
    return false; // ❌ No confetti triggered
}

function startEmojiConfetti(confettiType) {
    const container = document.createElement('div');
    container.classList.add('confetti-container');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);

    let isImage = confettiType.endsWith(".png") || confettiType.endsWith(".jpg") || confettiType.endsWith(".jpeg");
    
    let active = 0;
    let spawnFinished = false;
    const spawnDuration = 3000;
    const intervalMs = 150;

    const spawner = setInterval(() => {
        const now = Date.now();
        const endTime = startTime + spawnDuration;
        if (now >= endTime) {
            clearInterval(spawner);
            spawnFinished = true;
            if (active === 0) container.remove();
            return;
        }

        const confetti = document.createElement('span');  // Wrap in a span
        confetti.className = 'confetti-emoji';

        const size = 20 + Math.random() * 40; // Random size between 20px - 40px

        if (isImage) {
            const img = document.createElement('img');
            img.src = confettiType;
            img.style.width = `${size}px`; // Match emoji size range
            img.style.height = "auto";
            confetti.appendChild(img);
        } else {
            confetti.textContent = confettiType;
            confetti.style.fontSize = `${size}px`; // Match text size
        }

        confetti.style.left = Math.random() * 100 + "%";
        confetti.style.top = "-10px"; // Start above the screen
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;

        container.appendChild(confetti);
        active++;

        confetti.style.animation = `fall ${3 + Math.random() * 2}s linear`;

        confetti.addEventListener('animationend', () => {
            confetti.remove();
            active--;
            if (spawnFinished && active === 0) container.remove();
        });
    }, intervalMs);

    const startTime = Date.now();
}
