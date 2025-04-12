let peer = null;
let isHost = false;
let roundLimit = 21;
let currentRound = 0;
let answeredThisRound = false;
let wordLoopInterval;
let isInPause = false;
let currentWord = "";
let player1Score = 0;
let player2Score = 0;
let countdownInterval, answerTimeout;
let bip39Words = [], nonBip39Words = [], allWords = [];

document.getElementById("hostGame").onclick = () => {
    isHost = true;
    roundLimit = parseInt(document.getElementById("roundCount").value) || 21;
    if (roundLimit < 5) roundLimit = 5;

    // Show the game screen early (host view)
    document.getElementById("gameSetup").style.display = "none";
    document.getElementById("game39-container").style.display = "block";
    document.getElementById("word-display").innerText = "Waiting for Player 2...";
    document.getElementById("answer-buttons").style.display = "none"; // Hide YES/NO buttons
    document.getElementById("round-count").innerText = "";
    document.getElementById("countdown").innerText = "";

    setupPeer();
};



document.getElementById("joinGame").onclick = () => {
    const hostId = document.getElementById("peerIdInput").value.trim();
    if (!hostId) return;

    console.log("Attempting to connect to host:", hostId);

    const joinBtn = document.getElementById("joinGame");
    const joinStatus = document.getElementById("joinStatus");

    joinBtn.innerText = "Connecting...";
    joinBtn.disabled = true;
    joinStatus.innerText = `Trying to join room: ${hostId}`;

    setupPeer(); // make sure peer exists

    // Now connect
    conn = peer.connect(hostId);

    conn.on("open", () => {
        console.log("✅ Connected to host!");
        conn.send({ type: "player-ready" }); // let host know we’re in

        joinBtn.innerText = "Connected!";
        joinStatus.innerText = "🎮 Joined successfully! Waiting for the game to start...";
    });

    conn.on("data", handleIncomingData);

    conn.on("error", (err) => {
        console.error("❌ Connection error:", err);
        joinBtn.innerText = "Join Game";
        joinBtn.disabled = false;
        joinStatus.innerText = "❌ Failed to join. Check the Room ID and try again.";
    });

    conn.on("close", () => {
        console.warn("⚠️ Connection closed");
        joinBtn.innerText = "Join Game";
        joinBtn.disabled = false;
        joinStatus.innerText = "⚠️ Connection was closed.";
    });
};


function setupPeer() {
    if (peer) return;

    Peer.debug = 3;
    peer = new Peer({
        host: 'skyway.peerjs.dev',
        port: 443,
        secure: true,
        path: '/'
      });

    peer.on("open", id => {
        console.log("🌐 PeerJS client ID:", id);
        document.getElementById("word-display").innerText = `Room ID: ${id}`;
        document.getElementById("word-display").style.cursor = "pointer";
    
        // Enable copying when clicked/tapped
        document.getElementById("word-display").onclick = () => {
            navigator.clipboard.writeText(id).then(() => {
                const original = document.getElementById("word-display").innerText;
                document.getElementById("word-display").innerText = "✅ Copied!";
                setTimeout(() => {
                    document.getElementById("word-display").innerText = original;
                }, 2000);
            });
        };
    });

    peer.on("connection", connection => {
        conn = connection;
        conn.on("data", handleIncomingData);
        // Wait for "player-ready" before starting game
    });

    peer.on("error", err => {
        console.error("❌ PeerJS error:", err);
    });
}


async function startGame() {
    document.getElementById("answer-buttons").style.display = "flex";
    document.getElementById("gameSetup").style.display = "none";
    document.getElementById("game39-container").style.display = "block";
    await loadWordLists();

    allWords = shuffleArray([
        ...bip39Words.map(word => ({ word, isBip39: true })),
        ...nonBip39Words.map(word => ({ word, isBip39: false }))
    ]).slice(0, roundLimit);

    if (isHost) nextWord();
    startGameTimer();
    startWordLoop(); // 🕐 one tick every 5s, hosts control flow
}

function startWordLoop() {
    function runWordRound() {
        if (currentRound >= roundLimit) {
            endGame();
            return;
        }

        if (!answeredThisRound) {
            handleAnswer(null); // score 0 if not answered
        }

        disableAnswerButtons(); // Disable buttons on pause between words

        // Pause: show ⏳ and wait 3 seconds
        document.getElementById("word-display").innerText = '⏳';
        document.getElementById("round-count").innerText = '';
        isInPause = true;

        setTimeout(() => {
            isInPause = false;

            if (isHost) {
                nextWord(); // show new word
            }

            // Wait 5 seconds before going to the next round
            setTimeout(runWordRound, 5000);
        }, 3000); // pause = 3s
    }

    // Start the first round
    runWordRound();
}


async function loadWordLists() {
    try {
        const [bipRes, nonRes] = await Promise.all([
            fetch("/docs/bip39.json"),
            fetch("/docs/nonBip39.json")
        ]);

        const bipData = await bipRes.json();
        const nonData = await nonRes.json();

        // Handle both array or object format
        bip39Words = Array.isArray(bipData) ? bipData : bipData.words || [];
        nonBip39Words = Array.isArray(nonData) ? nonData : nonData.words || [];

        console.log("Loaded BIP39 words:", bip39Words.slice(0, 5));
        console.log("Loaded non-BIP39 words:", nonBip39Words.slice(0, 5));
    } catch (err) {
        console.error("Error loading word lists:", err);
    }
}


function nextWord() {
    if (currentRound >= roundLimit) return endGame();

    const wordObj = allWords[currentRound];
    currentWord = wordObj.word;

    const payload = {
        type: "new-word",
        word: wordObj.word,
        round: currentRound + 1
    };
    if (isHost) conn.send(payload);
    displayWord(payload);
    currentRound++;
}

function displayWord({ word, round }) {
    currentWord = word;
    answeredThisRound = false;
    document.getElementById("word-display").innerText = word;
    document.getElementById("round-count").innerText = `Round: ${round} / ${roundLimit}`;
    enableAnswerButtons(); // enable when word is shown again
}

function disableAnswerButtons() {
    document.getElementById("yes-btn").disabled = true;
    document.getElementById("no-btn").disabled = true;
}

function enableAnswerButtons() {
    document.getElementById("yes-btn").disabled = false;
    document.getElementById("no-btn").disabled = false;
}

function startGameTimer() {
    let timeLeft = roundLimit * 8; // total game duration. word show 5sec + 3 sec pause * roundLimit
    document.getElementById("countdown").innerText = formatTime(timeLeft);

    countdownInterval = setInterval(() => {
        timeLeft--;
        document.getElementById("countdown").innerText = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            endGame(); // Just in case
        }
    }, 1000);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${minutes}:${sec.toString().padStart(2, '0')}`;
}


document.getElementById("yes-btn").onclick = () => handleAnswer(true);
document.getElementById("no-btn").onclick = () => handleAnswer(false);

function handleAnswer(answer) {
    if (answeredThisRound) return;
    answeredThisRound = true;

    const isCorrect = getCurrentAnswerCorrectness(answer);
    const points = answer === null ? 0 : isCorrect ? 1 : -1;

    if (isHost) {
        player1Score += points;
        conn.send({ type: "score", points });
        updateScores();
    
    } else {
        player2Score += points;
        updateScores();
        conn.send({ type: "answer", answer });
    }
}


function getCurrentAnswerCorrectness(answer) {
    const correct = allWords[currentRound - 1].isBip39;
    return (answer === true && correct) || (answer === false && !correct);
}

function handleIncomingData(data) {
    if (data.type === "player-ready" && isHost) {
        startGame(); // Start only after player 2 confirms
    }
    if (data.type === "new-word") {
        displayWord(data);
    }
    if (data.type === "answer" && isHost) {
        const isCorrect = getCurrentAnswerCorrectness(data.answer);
        const points = data.answer === null ? 0 : isCorrect ? 1 : -1;
        player2Score += points;
        updateScores();
        setTimeout(nextWord, 1000);
    }
    if (data.type === "score" && !isHost) {
        player1Score += data.points;
        updateScores();
    }
}

function updateScores() {
    document.querySelector("#player1-score span").innerText = player1Score;
    document.querySelector("#player2-score span").innerText = player2Score;
}


function endGame() {
    document.getElementById("answer-buttons").style.display = "none";
    document.getElementById("countdown").style.display = "none";

    const resultBox = document.getElementById("final-result");
    resultBox.style.display = "block";

    if (player1Score === player2Score) {
        resultBox.innerText = `Draw! Both scored ${player1Score}`;
    } else if (
        (isHost && player1Score > player2Score) ||
        (!isHost && player2Score > player1Score)
    ) {
        resultBox.innerText = `🎉 You won! Final Score: ${isHost ? player1Score : player2Score}`;
    } else {
        resultBox.innerText = `💥 You lost! Final Score: ${isHost ? player1Score : player2Score}`;
    }
}

// Utility
function shuffleArray(array) {
    return [...array].sort(() => Math.random() - 0.5);
}
