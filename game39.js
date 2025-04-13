console.log("Firebase:", typeof firebase); // logs the type of Firebase to verify that Firebase SDK is properly loaded (should be "object").

// Standard Firebase configuration object for the project.
// This allows both the host and joiner to connect to the same Realtime Database under this project.
  const firebaseConfig = {
    apiKey: "AIzaSyBL78D_uhV11CIhQMlh_B6iUNb-Q5cYmKI",
    authDomain: "game39-websockets.firebaseapp.com",
    projectId: "game39-websockets",
    storageBucket: "game39-websockets.appspot.com",
    databaseURL: "https://game39-websockets-default-rtdb.europe-west1.firebasedatabase.app/",
    messagingSenderId: "860583729010",
    appId: "1:860583729010:web:b6500daf6485d52329afeb"
  };

  // Initialize the Firebase app and stores a reference to the Realtime Database.
  // All game state (like scores, answers, countdowns) are written/read through this `db` object.
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  let roomId = ""; // Room ID is shared by host and joiner. Host generates it, joiner uses it to connect.
  let isHost = false; // Used to distinguish logic between host and joiner throughout the app.
  let roundLimit = 21; // Default number of rounds if not selected by the host. Host can override it on game creation.
  let currentIsBip39 = null; // Used only by the joiner to evaluate the current word. Host uses allWords[], joiner uses this for quick local comparison.
  let currentRound = 0; // Tracks which round we are currently on. Shared across logic. Host increments this manually. Joiner receives it via Firebase.
  let roundDisplayedOnce = false; // Prevents re-displaying the round count for joiner multiple times when syncing game state.
  let answeredThisRound = false; // Ensures that each player can only answer once per round.
  let joinerAnswers = {}; // Used by joiner to track which rounds have already been answered. Prevents accidental duplicate submissions when Firebase is syncing.
  let wordLoopTimeout; // Timeout for auto-advancing to next word if no answer is received.
  let currentWord = ""; // Stores the currently displayed word, used mostly for display purposes.
  let player1Score = 0; // Scores for player 1. Host updates both player1Score and player2Score depending on who answered. Named as S1 (satoshi 1)
  let player2Score = 0; // Scores for player 2. Joiner only updates player2Score (their own) and gets host score from Firebase via "host-score". Named as S2 (satoshi 2)
  let isSpectator = false; // default false, true if third user joins
  let countdownInterval; // Global timer interval object for the game countdown. Can be cleared/stopped.
  let gameStarted = false; // Global flag to prevent game logic from triggering before it’s ready.
  let bip39Words = [], nonBip39Words = [], allWords = []; // Word pools. Host loads both lists, mixes them and sends them to joiner via Firebase.

// Auto-join if ?room=xyz is in URL
// This parses the current page's URL and tries to extract the value of the `room` query parameter.
// Example: If the URL is ?room=abc123, then rawRoom = "abc123".
// This lets someone click a shared link and automatically join the game.
const urlParams = new URLSearchParams(window.location.search);
const rawRoom = urlParams.get("room");


// If the URL contains a valid ?room=xyz code, auto-fill the input and join the room as a joiner
if (rawRoom && /^[a-zA-Z0-9_-]+$/.test(rawRoom)) {
  roomId = rawRoom; // Set the global roomId from the URL
  document.getElementById("peerIdInput").value = rawRoom; // Pre-fill the input field for user feedback
  joinRoom(roomId); // Immediately try to join the room using the extracted ID
}

// Utility logging and Firebase sending functions used by both host and joiner
  function log(msg) {
    console.log(`[🔍 DEBUG] ${msg}`); // Log messages to the browser console with a DEBUG tag
    const status = document.getElementById("debugStatus"); // Optional: show status in UI if the element exists
    if (status) status.innerText = msg; // Update on-screen debug display
  }

  function send(data) {
    log(`Sending to room ${roomId}: ${JSON.stringify(data)}`); // Log the outgoing data payload
    db.ref(`rooms/${roomId}`).update({ // Send update to Firebase under the current room
      ...data,
      senderId: playerId // Used to identify who sent the update
    }); 
  }

  // Host and Join buttons: set up a new game room or join an existing one
  // When the "Host Game" button is clicked...
  document.getElementById("hostGame").onclick = () => {
    isHost = true; // This client becomes the host
    roundLimit = Math.max(5, parseInt(document.getElementById("roundCount").value) || 21); // Use input round count or fallback to 21
    document.getElementById("round-count").innerText = `0 / ${roundLimit}`; // Show initial round count
    roomId = crypto.randomUUID().split("-")[0]; // Generate a short unique room ID

    setupGameScreen(); // Switch UI to game screen


    const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    const roomInfoDiv = document.getElementById("room-info");
    
    // Set the banner content
    roomInfoDiv.innerText = `Room link copied to clipboard: ${roomLink} (click to dismiss)`;
    
    // Try to copy link to clipboard
    navigator.clipboard.writeText(roomLink)
      .then(() => {
        // Show the banner
        roomInfoDiv.classList.add("visible");
    
        // When banner is clicked, hide it and show waiting message
        roomInfoDiv.onclick = () => {
          roomInfoDiv.classList.remove("visible");
          document.getElementById("word-display").innerText = "Waiting for opponent to join...";
        };
      })
      .catch(() => {
        // If copy fails, show fallback error
        roomInfoDiv.innerText = "⚠️ Failed to copy room link.";
        roomInfoDiv.classList.add("visible");
    
        // Hide on click
        roomInfoDiv.onclick = () => {
          roomInfoDiv.classList.remove("visible");
        };
      });

      document.getElementById("word-display").innerText = "Share the link and wait for the opponent"; // Initial instruction for host
    

      db.ref(`rooms/${roomId}`).set({
        host: true, // Mark this room as hosted
        ready: false, // Joiner hasn't connected yet
        roundLimit: roundLimit,   // Save round count in DB
        players: { player1: playerId } // Store host's ID
      });

    db.ref(`rooms/${roomId}`).on("value", snapshot => {
      const data = snapshot.val(); // Listen for updates from Firebase
      if (!data) return;
      handleIncomingData(data); // Pass new data to game logic
    });

    log("Host created room. Waiting for Player 2...");
  };

  // When the "Join Game" button is clicked
  document.getElementById("joinGame").onclick = () => {
    const inputRoom = document.getElementById("peerIdInput").value.trim(); // Get room ID from input
    if (!inputRoom) return;
  
    joinRoom(inputRoom); // Trigger join process
  };

  // Generate a unique player ID for every client (host or joiner or spectator)
  const playerId = crypto.randomUUID(); // Used to identify individual users

  // Function to join an existing game room using a room ID or full URL with Firebase player tracking br UUID
  function joinRoom(inputRoomId) {
    // Clean the input if the user pasted a full URL with ?room=
    try {
      if (inputRoomId.includes("http")) {
        const parsed = new URL(inputRoomId); // Parse the full URL
        const param = parsed.searchParams.get("room"); // Extract the ?room=xyz parameter
        if (param) inputRoomId = param; // Replace inputRoomId with the clean room code
      }
    } catch (e) {
      // Not a valid URL, continue as normal. Ignore parsing errors and continue with raw input
    }
    // Validate the room ID format (letters, numbers, underscore, dash)
    if (!/^[a-zA-Z0-9_-]+$/.test(inputRoomId)) {
      alert("Invalid room ID."); // Reject malformed room codes
      return;
    }
  
    roomId = inputRoomId; // Store the valid room ID
    isHost = false; // This client is not the host
    setupGameScreen(); // Switch UI to the game screen
    document.getElementById("joinGame").innerText = "Connecting..."; // Show connecting status
  
    // Check if the room exists in Firebase
    db.ref(`rooms/${roomId}`).once("value").then(snapshot => {
      if (!snapshot.exists()) return alert("Room not found!"); // Show error if not found
  

      const roomData = snapshot.val();
      const players = roomData.players || {};
      const playerIds = Object.keys(players);
  
      // If no joiners yet, assign this user as the first joiner (Player 2)
      if (!playerIds.includes("player2")) {
        db.ref(`rooms/${roomId}/players/player2`).set(playerId);
        isSpectator = false;
      } else {
        isSpectator = true; // Everyone else is a spectator
      }


      send({ ready: true }); // Notify the host that the joiner is ready

      // Subscribe to room updates in real time
      db.ref(`rooms/${roomId}`).on("value", snap => {
        handleIncomingData(snap.val()); // Forward data updates to game logic
      });
  
      log("Joined room. Waiting for game to start...");
    });
  }
  
  // Starts a 10-second countdown before the game begins (host triggers this)
  function startPreGameCountdown() {
    let count = 10; // Start from n seconds
    const display = document.getElementById("word-display");
    display.innerText = `Starting in ${count}...`; // Initial message
  
    const countdown = setInterval(() => {
      count--; // Decrease the timer each second
      display.innerText = `Starting in ${count}...`; // Update display
  
      if (isHost) {
        send({ type: "pre-countdown", time: count }); // Inform the joiner about remaining time
      }

      if (count <= 0) {
        clearInterval(countdown); // Stop countdown when done
        startGame(); // Start the game after countdown
      }
    }, 1000); // Run every second
  }

  // Switches from the setup screen to the main game screen (used by both host and joiner)
  function setupGameScreen() {
    document.getElementById("gameSetup").style.display = "none"; // Hide setup UI
    document.getElementById("game39-container").style.display = "block"; // Show game container

    // Spectator notice instead of answer buttons
    if (isSpectator) {
      const buttons = document.getElementById("answer-buttons");
      buttons.innerHTML = `<div class="spectator-message">
        This game is already in progress. You can watch or <a href="/game39.html">create your own room</a>.
      </div>`;
      buttons.style.display = "block";
      return;
    }

    document.getElementById("answer-buttons").style.display = "none"; // Hide buttons initially
  }

  // Inverts the game result for the joiner so they see the correct outcome
  function invertResult(result) {
    if (result === "win") return "lose"; // If host won, joiner lost
    if (result === "lose") return "win"; // If host lost, joiner won
    return "draw"; // Draw stays the same for both
  }

// Processes real-time updates received from Firebase for both host and joiner
  function handleIncomingData(data) {
    log(`Data from room: ${JSON.stringify(data)}`);
  
    // Host detects that player 2 joined and starts the countdown
    if (data.ready && isHost && currentRound === 0 && !gameStarted) {
        log("Player 2 joined. Starting game...");
        gameStarted = true;
        startPreGameCountdown();
      }

      // Joiner sets round limit once on first data load
      if (!isHost && data.roundLimit && !roundDisplayedOnce) {
        roundLimit = data.roundLimit;
        document.getElementById("round-count").innerText = `0 / ${roundLimit}`;
        roundDisplayedOnce = true;
      }
  
      // Both players receive the new word; joiner sets current round and answer state
      if (data.type === "new-word") {
        displayWord(data); // always update the UI
        if (!isHost) {
          currentRound = data.round; // sync joiner round
          currentIsBip39 = data.isBip39; // joiner needs this to check answers

          // Slight delay to ensure word is rendered before showing buttons
          setTimeout(() => {
            document.getElementById("answer-buttons").style.display = "flex";
            enableAnswerButtons();
          }, 200);
        }
      }
      
      // Host handles incoming answer from joiner and scores it
    if (data.type === "answer" && isHost) {
      const roundIndex = (data.round || 1) - 1;
      const correctWord = allWords[roundIndex]; // get word object for that round

      if (!correctWord) {
        console.warn("⚠️ Host hasn't loaded word yet for round", data.round);
        return;
      }
    
      const submittedAnswer = data.answer === true || data.answer === "true"; // normalize boolean
      const correct = !!correctWord.isBip39; // ensure it's true/false
      
      console.log(`[🛠 HOST SCORING] Joiner answered round ${data.round}, expected isBip39: ${correctWord.isBip39}, submitted: ${submittedAnswer}`);

      const points = submittedAnswer === correct ? 1 : -1;
    
      player2Score += points; // update joiner’s score on host
      updateScores();
      send({ type: "score", points }); // send result back to joiner
    }
  
    // Joiner receives their own score update from host
    if (data.type === "score") {
      if (!isHost) {
        player2Score += data.points;
        updateScores();
      }
    }

    // Joiner receives host's score update
    if (data.type === "host-score" && !isHost) {
        player1Score += data.points; // joiner sees host's updated score
        updateScores();
    }

    // Joiner receives countdown before game starts
    if (data.type === "pre-countdown" && !isHost) {
        document.getElementById("word-display").innerText = `Starting in ${data.time}...`;
      }
  
    // Joiner receives round/game timer countdown
    if (data.type === "countdown" && !isHost) {
      document.getElementById("countdown").innerText = data.time;
    }

    // Joiner receives final game result (inverted to their perspective)
    if (data.type === "game-over" && !isHost) {
      endGame(invertResult(data.result));
    }
  }

// Starts the game by loading words, setting up the word pool, and beginning the timer
  async function startGame() {
    document.getElementById("answer-buttons").style.display = "flex"; // show answer buttons immediately for host

    await loadWordLists(); // fetch bip39 and nonBip39 word lists from JSON

    // Combine both word lists into one array of objects with bip39 flag
    allWords = shuffleArray([
      ...bip39Words.map(word => ({ word, isBip39: true })), // mark each bip39 word
      ...nonBip39Words.map(word => ({ word, isBip39: false })) // mark each non-bip39 word
    ]).slice(0, roundLimit); // trim to the selected round limit

    startGameTimer(); // begin global countdown timer (shared between both players)
    nextWord(); // start the first round
  }

  // Moves to the next word in the game or ends the game if round limit reached
  function nextWord() {
    // Stop if we've completed the required number of rounds
    if (currentRound >= roundLimit) {
      if (isHost) {
        // Host calculates final result based on scores
        let resultType = "";
        if (player1Score === player2Score) resultType = "draw";
        else if (player1Score > player2Score) resultType = "win";
        else resultType = "lose";
    
        send({ type: "game-over", result: resultType }); // send final result to joiner
        endGame(resultType); // show result screen on host
      }
      return; // exit the function after game ends
    }

    const wordObj = allWords[currentRound++]; // get the next word from the shuffled list and increment round
    currentWord = wordObj.word; // store current word for reference

    // Structure the new-word message to send to the joiner
    const data = {
        type: "new-word",
        word: wordObj.word,
        round: currentRound,
        isBip39: wordObj.isBip39
      };
    if (isHost) send(data); // host sends the word and round info to the joiner
    displayWord(data); // both host and joiner use this to update the word on screen
  }

  // Displays the given word and handles answer window + timeout logic
  function displayWord({ word, round, isBip39 }) {
    document.getElementById("word-display").innerText = word; // show word on screen
    document.getElementById("round-count").innerText = `${round} / ${roundLimit}`; // update round progress
    answeredThisRound = false; // reset answer tracking for this round
  
    if (!isHost) {
      currentIsBip39 = isBip39; // store the correct answer for joiner to check against
      document.getElementById("answer-buttons").style.display = "flex"; // show answer buttons for joiner
    }
  
    enableAnswerButtons(); // make sure buttons are clickable
  
    if (wordLoopTimeout) clearTimeout(wordLoopTimeout); // clear previous timer if active

    wordLoopTimeout = setTimeout(() => {
      disableAnswerButtons(); // lock buttons after 5s
      document.getElementById("word-display").innerHTML = `<div class="loader"></div>`; // show waiting symbol / loader
  
      setTimeout(() => {
        if (isHost) {
          // if no answer was received from joiner in time, assign 0 points
          if (!answeredThisRound) {
            send({ type: "score", points: 0 });  // no penalty, no reward
          }
          nextWord(); // move to next round
        }
      }, 3000); // 3s delay before showing next word
    }, 5000); // joiner has 5s to answer
  }

  // Starts the global game timer (affects both players' countdown display)
  function startGameTimer() {
    let timeLeft = roundLimit * 8; // total time depends on how many rounds were set (8s per round)
    clearInterval(countdownInterval); // avoid stacking multiple timers
  
    countdownInterval = setInterval(() => {
      // update the countdown text on screen
      document.getElementById("countdown").innerText = formatTime(timeLeft);
  
      // host broadcasts countdown to the joiner every second
      if (isHost) {
        send({ type: "countdown", time: formatTime(timeLeft) });
      }
  
      timeLeft--; // tick down
  
      // if time runs out
      if (timeLeft < 0) {
        clearInterval(countdownInterval); // stop the timer
        
        if (isHost) {
          // host determines final result and informs joiner
          let resultType = "";
          if (player1Score === player2Score) resultType = "draw";
          else if (player1Score > player2Score) resultType = "win";
          else resultType = "lose";
      
          // SEND THE RESULT BEFORE ENDING THE GAME
          send({ type: "game-over", result: resultType }); // notify joiner
      
          // Then call endGame()
          endGame(resultType); // update local UI
        }
      }
    }, 1000); // run every second
  }
  
  // Handles when a player clicks "Yes" or "No" during a round
  function handleAnswer(answer) {
    if (answeredThisRound) return; // prevent double-clicking
    answeredThisRound = true; // lock in that the player answered this round
  
    const points = checkAnswer(answer); // locally check if the answer is right
    console.log(`[💡] Answer submitted: ${answer}, Points (local calc): ${points}, isHost: ${isHost}`);
  
    if (isHost) {
      // if this is the host answering their own question
      player1Score += points; // apply points to host
      updateScores(); // refresh the score display
      send({ type: "host-score", points }); // send the host's score update to the joiner
      console.log(`[🧮 Host Scoring] Host answered: ${answer}, isBip39: ${allWords[currentRound - 1].isBip39}, Points: ${points}`);
    } else {
      // this is the joiner answering
      if (joinerAnswers[currentRound]) {
        // safety check: prevent duplicate submission in same round
        console.log(`[⚠️ Joiner] Already answered round ${currentRound}`);
        return;
      }
      joinerAnswers[currentRound] = true; // mark round as answered
  
      console.log(`[🚀 Joiner Sent Answer] Answer: ${answer}, Round: ${currentRound}`);
      
      // small delay helps the host fully load word data before evaluating the joiner's answer
      setTimeout(() => {
        console.log(`[🚀 Joiner Sent Answer] Answer: ${answer}, Round: ${currentRound}`);
        send({ type: "answer", answer, round: currentRound }); // send answer to host for scoring
      }, 200); // ⏱ Small delay to give host time to load allWords[]
    }
  }
  

  // Determines if the player's answer is correct
  function checkAnswer(answer) {
    // For the host, compare to allWords[] array
    // For joiner, compare to the currentIsBip39 flag sent from host
    const correct = isHost
      ? allWords[currentRound - 1].isBip39
      : currentIsBip39;
  
    // If no answer (null), score 0. Otherwise +1 or -1 depending on match
    return answer === null ? 0 : (answer === correct ? 1 : -1);
  }

  // Loads BIP39 and non-BIP39 word lists from external JSON files
  async function loadWordLists() {
    // Fetch both lists in parallel
    const [bipRes, nonRes] = await Promise.all([
      fetch("/docs/bip39.json"),
      fetch("/docs/nonBip39.json")
    ]);

    // Parse the responses as JSON
    const bipData = await bipRes.json();
    const nonData = await nonRes.json();

    // Extract actual word arrays; fallback to .words[] if needed
    bip39Words = Array.isArray(bipData) ? bipData : bipData.words || [];
    nonBip39Words = Array.isArray(nonData) ? nonData : nonData.words || [];
  }

  // Updates the score display for both players
  function updateScores() {
    // Show "Me" next to the current player depending on role
    const p1Label = isHost ? "S1 (Me)" : "S1";
    const p2Label = !isHost ? "S2 (Me)" : "S2";
  
    // Update DOM elements with current scores
    document.getElementById("player1-score").innerHTML = `${p1Label}: <span>${player1Score}</span>`;
    document.getElementById("player2-score").innerHTML = `${p2Label}: <span>${player2Score}</span>`;
  }

  // Ends the game and displays the final result to both players
  function endGame(resultOverride = null) {
    clearInterval(countdownInterval); // Stop the overall game timer
    gameStarted = false; // Mark the game as finished

    // Hide UI elements no longer needed
    document.getElementById("answer-buttons").style.display = "none";
    document.getElementById("countdown").style.display = "none";
    document.getElementById("word-display").style.display = "none"; // hide the ⏳
  
    // Show the final result box
    const resultBox = document.getElementById("final-result");
    resultBox.style.display = "block";
  
    let resultText = "";
  
    // If the host sends an explicit result override, use that
    if (resultOverride) {
      resultText = resultOverride === "draw"
        ? "Draw! Both scored the same"
        : resultOverride === "win"
        ? "🎉 You won!"
        : "💥 You lost!";
    } else {
      // Fallback: calculate based on score comparison
      if (player1Score === player2Score) {
        resultText = `Draw! Both scored ${player1Score}`;
      } else {
        // Host wins if player1 > player2; joiner wins if player2 > player1
        const win = (isHost && player1Score > player2Score) || (!isHost && player2Score > player1Score);
        resultText = win
          ? `🎉 You won! Final Score: ${isHost ? player1Score : player2Score}`
          : `💥 You lost! Final Score: ${isHost ? player1Score : player2Score}`;
      }
    }
  // Show the final outcome message in the result box
    resultBox.innerText = resultText;
  }

  // Randomly shuffle the elements of an array
  // Used to mix BIP39 and non-BIP39 word lists before starting the game
  function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  // Format a number of seconds into MM:SS string
  // Used to show countdown timer on screen 
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60); // Extract minutes
    const s = seconds % 60;           // Extract remaining seconds
    return `${m}:${s.toString().padStart(2, '0')}`; // Zero-padded seconds
  }

  // When "Yes" button is clicked, submit answer: true (means "Yes, it's a BIP39 word")
  document.getElementById("yes-btn").onclick = () => handleAnswer(true);
  // When "No" button is clicked, submit answer: false (means "No, it's not a BIP39 word")
  document.getElementById("no-btn").onclick = () => handleAnswer(false);

  // Disables both Yes and No buttons (prevents answering more than once per round)
  function disableAnswerButtons() {
    document.getElementById("yes-btn").disabled = true;
    document.getElementById("no-btn").disabled = true;
  }

  // Re-enables both Yes and No buttons for the next word
  function enableAnswerButtons() {
    document.getElementById("yes-btn").disabled = false;
    document.getElementById("no-btn").disabled = false;
  }
