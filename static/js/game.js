// Connect to the Socket.IO server
const socket = io({
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  path: "/socket.io",
});

// Game state
let playerName = "";
let roomCode = "";
let isHost = false;
let myPlayerId = null;
let bonusMessageShown = false; // Global flag to prevent duplicate bonus messages

// DOM Elements
const landingButtons = document.getElementById("landing-buttons");
const createRoomSection = document.getElementById("create-room-section");
const joinRoomSection = document.getElementById("join-room-section");
const waitingRoom = document.getElementById("waiting-room");
const gameSection = document.getElementById("game-section");
const gameOver = document.getElementById("game-over");

// Debug logging for Socket.IO events
socket.onAny((event, ...args) => {
  console.log(`Socket.IO Event: ${event}`, args);
});

// Landing page button handlers
document.getElementById("create-room-btn").addEventListener("click", () => {
  landingButtons.style.display = "none";
  createRoomSection.style.display = "block";
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  landingButtons.style.display = "none";
  joinRoomSection.style.display = "block";
});

// Back button handlers
document.getElementById("back-from-create").addEventListener("click", () => {
  createRoomSection.style.display = "none";
  landingButtons.style.display = "block";
});

document.getElementById("back-from-join").addEventListener("click", () => {
  joinRoomSection.style.display = "none";
  landingButtons.style.display = "block";
});

// How to Play modal handlers
document.getElementById("how-to-play-btn").addEventListener("click", () => {
  document.getElementById("how-to-play-modal").style.display = "block";
});

// Close modal when clicking the X
document.querySelector(".close").addEventListener("click", () => {
  document.getElementById("how-to-play-modal").style.display = "none";
});

// Close modal when clicking outside of it
window.addEventListener("click", (event) => {
  const modal = document.getElementById("how-to-play-modal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

// --- Reconnect banner helpers ---
function showReconnectingBanner() {
  let banner = document.getElementById("reconnect-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "reconnect-banner";
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;background:#fbbf24;color:#1f2937;" +
      "text-align:center;padding:10px;z-index:99999;font-size:1rem;font-weight:bold;";
    banner.textContent = "Connection lost — reconnecting…";
    document.body.appendChild(banner);
  }
}

function hideReconnectingBanner() {
  const banner = document.getElementById("reconnect-banner");
  if (banner) banner.remove();
}

// --- Connection handling ---
socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id);
  hideReconnectingBanner();
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  showReconnectingBanner();
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from server:", reason);
  showReconnectingBanner();
});

// Auto-rejoin using stored session token when Socket.IO reconnects
socket.on("reconnect", () => {
  console.log("Socket.IO reconnected with new SID:", socket.id);
  const token = localStorage.getItem("fishyToken");
  if (token && roomCode) {
    socket.emit("rejoin_game", { token });
  } else {
    hideReconnectingBanner();
  }
});

socket.on("reconnect_failed", () => {
  localStorage.removeItem("fishyToken");
  alert("Could not reconnect after multiple attempts. Please refresh the page.");
});

// Server issued (or refreshed) a session token — persist it
socket.on("session_token", (data) => {
  localStorage.setItem("fishyToken", data.token);
});

// Token-based rejoin failed — clear stale token and let user rejoin manually
socket.on("rejoin_failed", (data) => {
  console.warn("Rejoin failed:", data.message);
  localStorage.removeItem("fishyToken");
  hideReconnectingBanner();
  alert(`Reconnection failed: ${data.message}\nPlease re-enter your name and room code.`);
  window.location.reload();
});

// Rejoined during waiting room — repopulate the player list
socket.on("rejoined_waiting", (data) => {
  hideReconnectingBanner();
  myPlayerId = data.player_id;
  waitingRoom.style.display = "block";
  gameSection.style.display = "none";
  gameOver.style.display = "none";
  landingButtons.style.display = "none";
  document.getElementById("room-code-display").textContent = data.room_code;

  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";
  data.players.forEach((p) => {
    const item = document.createElement("div");
    item.className = "player-item";
    item.setAttribute("data-player-id", p.id);
    item.textContent = `${p.name} is in the room`;
    playersList.appendChild(item);
  });
});

// Handle errors from server
socket.on("error", (data) => {
  console.error("Server error:", data);
  alert(`Error: ${data.message}`);

  // If we're in a reconnection attempt and it failed, go back to join room page
  if (
    data.message.includes("already connected") ||
    data.message.includes("in progress")
  ) {
    // Reset to join room page
    gameSection.style.display = "none";
    waitingRoom.style.display = "none";
    createRoomSection.style.display = "none";
    joinRoomSection.style.display = "block";
  }
});

// Create Room
document.getElementById("create-room").addEventListener("click", () => {
  playerName = document.getElementById("create-player-name").value.trim();
  if (!playerName) {
    alert("Please enter your name");
    return;
  }

  console.log("Creating room for player:", playerName);
  fetch("/create_room", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: playerName }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert(data.error);
        return;
      }
      roomCode = data.room_code;
      isHost = true;
      console.log(
        "Room created successfully. Room code:",
        roomCode,
        "Is host:",
        isHost,
      );
      joinGame();
    })
    .catch((error) => {
      console.error("Error creating room:", error);
      alert("Error creating room. Please try again.");
    });
});

// Join Room
document.getElementById("join-room").addEventListener("click", () => {
  playerName = document.getElementById("join-player-name").value.trim();
  roomCode = document.getElementById("room-code").value.trim().toUpperCase();

  if (!playerName || !roomCode) {
    alert("Please enter your name and room code");
    return;
  }

  // First check room status to see if reconnection is possible
  fetch(`/room_status/${roomCode}`)
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        // Room doesn't exist, proceed with normal join
        attemptJoinRoom();
      } else {
        // Room exists, show status and disconnected players
        console.log("Room status:", data);

        if (data.disconnected_players.includes(playerName)) {
          console.log(
            `Player ${playerName} found in disconnected players list`,
          );
          alert(`Reconnecting as ${playerName}...`);
          // Skip HTTP endpoint and go directly to WebSocket for reconnection
          joinGame();
        } else if (data.status !== "waiting") {
          const disconnectedList =
            data.disconnected_players.length > 0
              ? `\n\nDisconnected players available for reconnection:\n${data.disconnected_players.join(", ")}`
              : "\n\nNo disconnected players available.";

          if (
            confirm(
              `Game is in progress (Round ${data.current_round}).${disconnectedList}\n\nTry to join anyway?`,
            )
          ) {
            // For non-reconnection attempts to games in progress, still try HTTP first
            attemptJoinRoom();
          }
          return;
        } else {
          // Game is waiting, proceed normally
          attemptJoinRoom();
        }
      }
    })
    .catch((error) => {
      console.error("Error checking room status:", error);
      attemptJoinRoom(); // Fallback to normal join
    });
});

function attemptJoinRoom() {
  fetch(`/join_room/${roomCode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: playerName }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert(data.error);
        return;
      }
      joinGame();
    })
    .catch((error) => {
      console.error("Error joining room:", error);
      alert("Error joining room. Please try again.");
    });
}

function joinGame() {
  console.log(`Attempting to join game: ${roomCode} as ${playerName}`);

  socket.emit("join_game", {
    room_code: roomCode,
    name: playerName,
  });

  createRoomSection.style.display = "none";
  joinRoomSection.style.display = "none";
  waitingRoom.style.display = "block";
  document.getElementById("room-code-display").textContent = roomCode;
}

// Handle player joined
socket.on("player_joined", (data) => {
  console.log("Player joined event received:", data);
  const playersList = document.getElementById("players-list");

  // Check if this player is already in the list
  const existingPlayer = playersList.querySelector(
    `[data-player-id="${data.player.id}"]`,
  );
  if (existingPlayer) {
    console.log("Player already in list:", data.player.name);
    return; // Skip if player already shown
  }

  const playerItem = document.createElement("div");
  playerItem.className = "player-item";
  playerItem.setAttribute("data-player-id", data.player.id);
  playerItem.textContent = data.message;
  playersList.appendChild(playerItem);

  if (isHost) {
    console.log("Current player is host, showing start button");
    const startButton = document.getElementById("start-game");
    if (startButton) {
      startButton.style.display = "block";
    } else {
      console.error("Start game button not found in DOM");
    }
  } else {
    console.log("Current player is not host");
  }
});

// Handle player disconnection
socket.on("player_disconnected", (data) => {
  addGameMessage(data.message, "system");

  // Update player list to show disconnected status
  const playerItem = document.querySelector(
    `[data-player-id="${data.player_id}"]`,
  );
  if (playerItem) {
    playerItem.classList.add("disconnected");
    playerItem.textContent += " (Disconnected)";
  }
});

// Handle player reconnection
socket.on("player_reconnected", (data) => {
  addGameMessage(data.message, "guesser-announcement");

  // Update player list to remove disconnected status
  const playerItem = document.querySelector(
    `[data-player-id="${data.player_id}"]`,
  );
  if (playerItem) {
    playerItem.classList.remove("disconnected");
    playerItem.textContent = playerItem.textContent.replace(
      " (Disconnected)",
      "",
    );
  }
});

// Handle game pause
socket.on("game_paused", (data) => {
  addGameMessage(data.message, "system");

  // Show pause overlay or message
  const gameSection = document.getElementById("game-section");
  let pauseOverlay = document.getElementById("pause-overlay");

  if (!pauseOverlay) {
    pauseOverlay = document.createElement("div");
    pauseOverlay.id = "pause-overlay";
    pauseOverlay.className = "pause-overlay";
    pauseOverlay.innerHTML = `
            <div class="pause-content">
                <h3>Game Paused</h3>
                <p>${data.message}</p>
                <div class="loading-spinner"></div>
            </div>
        `;
    gameSection.appendChild(pauseOverlay);
  }
});

// Handle game resume
socket.on("game_resumed", (data) => {
  addGameMessage(data.message, "guesser-announcement");

  // Remove pause overlay
  const pauseOverlay = document.getElementById("pause-overlay");
  if (pauseOverlay) {
    pauseOverlay.remove();
  }
});

// Initialize start game button event listener
document.addEventListener("DOMContentLoaded", () => {
  // On page load, try to restore a session from a previous tab/visit
  const savedToken = localStorage.getItem("fishyToken");
  if (savedToken) {
    showReconnectingBanner();
    landingButtons.style.display = "none";
    // Wait for socket to connect, then attempt token-based rejoin
    if (socket.connected) {
      socket.emit("rejoin_game", { token: savedToken });
    } else {
      socket.once("connect", () => {
        socket.emit("rejoin_game", { token: savedToken });
      });
    }
  }

  const startButton = document.getElementById("start-game");
  if (startButton) {
    startButton.addEventListener("click", () => {
      console.log("Start game button clicked");
      console.log("Current state - Room code:", roomCode, "Is host:", isHost);

      if (!roomCode) {
        console.error("No room code available");
        alert("Error: Room code not found");
        return;
      }

      if (!isHost) {
        console.error("Non-host player trying to start game");
        alert("Only the host can start the game");
        return;
      }

      console.log("Emitting start_game event");
      socket.emit("start_game", { room_code: roomCode });
    });
  } else {
    console.error("Start game button not found during initialization");
  }
});

function addGameMessage(message, type = "info") {
  const messagesDiv = document.getElementById("game-messages");
  const messageElem = document.createElement("div");
  messageElem.className = `message ${type}`;

  // Add typing effect for longer messages
  if (message.length > 20) {
    messageElem.classList.add("typing");
    messageElem.style.borderRight = "2px solid";

    // Remove typing effect after animation completes
    setTimeout(
      () => {
        messageElem.classList.remove("typing");
        messageElem.style.borderRight = "none";
      },
      Math.min(message.length * 50, 3000),
    ); // Adjust timing based on message length
  }

  messageElem.textContent = message;
  messagesDiv.appendChild(messageElem);

  // Force auto-scroll to bottom with a small delay to ensure the element is rendered
  setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, 10);
}

// Handle game started event
socket.on("game_started", (state) => {
  console.log("Game started event received:", state);
  hideReconnectingBanner();
  waitingRoom.style.display = "none";
  gameSection.style.display = "block";
  myPlayerId = state.player_id;
  bonusMessageShown = false; // Reset bonus message flag for new game

  // Display room code in corner
  const roomCodeCorner = document.getElementById("room-code-corner");
  if (roomCodeCorner) {
    roomCodeCorner.textContent = roomCode;
  }

  addGameMessage("Game has started!", "system");
  updateGameState(state);
});

// Update game state
socket.on("game_state_update", updateGameState);

function updateGameState(state) {
  // Find my player info
  const myPlayer = state.players[myPlayerId];
  if (!myPlayer || !myPlayer.role) return;

  // Update role with simple description
  const roleSection = document.getElementById("game-info");
  roleSection.innerHTML = "";

  // Add role
  const roleContainer = document.createElement("div");
  roleContainer.className = "space-y-4";

  const roleColor =
    myPlayer.role === "liar"
      ? "text-red-600"
      : myPlayer.role === "truth-teller"
        ? "text-green-600"
        : "text-sky-600";

  const roleElem = document.createElement("p");
  roleElem.className = `text-3xl font-bold ${roleColor}`;
  roleElem.innerHTML = `Your Role: <span class="capitalize-first">${myPlayer.role}</span>`;
  roleContainer.appendChild(roleElem);

  // Add hint section under role
  const hintSection = document.createElement("div");
  hintSection.className = `text-xl font-semibold mt-2 ${roleColor}`;
  if (myPlayer.role === "guesser") {
    hintSection.textContent =
      "Try to figure out who's lying by asking questions and observing responses.";
  } else if (myPlayer.role === "truth-teller") {
    hintSection.textContent =
      "You must tell the truth! Give the answer exactly as shown.";
  } else if (myPlayer.role === "liar") {
    hintSection.textContent =
      "You're a liar! Make up a convincing false answer.";
  }
  roleContainer.appendChild(hintSection);

  // Update question and answer
  if (state.question) {
    const questionElem = document.createElement("p");
    questionElem.className = "text-2xl mt-6";
    questionElem.innerHTML = `Question: <span id="current-question-text" class="font-medium">${state.question}</span>`;
    roleContainer.appendChild(questionElem);

    // Skip button — only visible to the guesser
    if (myPlayer.role === "guesser") {
      const skipButton = document.createElement("button");
      skipButton.id = "skip-question-btn";
      skipButton.className = "btn-fishy mt-4 text-base px-6 py-2";
      skipButton.textContent = "Skip Question";
      skipButton.onclick = () => {
        skipButton.disabled = true;
        socket.emit("skip_question", { room_code: roomCode });
      };
      roleContainer.appendChild(skipButton);
    }
  }

  if (myPlayer.role !== "guesser" && state.answer) {
    const answerSection = document.createElement("p");
    answerSection.className = "text-2xl mt-4";
    answerSection.innerHTML = `Correct Answer: <span id="current-answer-text" class="font-medium">${state.answer}</span>`;
    roleContainer.appendChild(answerSection);
  }

  roleSection.appendChild(roleContainer);

  // Update players list
  const playersList = document.getElementById("players-game-list");
  playersList.innerHTML = "";

  // Add round information
  const roundInfo = document.createElement("div");
  roundInfo.className = "text-xl font-bold text-sky-600 mb-6";
  roundInfo.textContent = `Round ${state.current_round || 1}`;
  playersList.appendChild(roundInfo);

  // Add other players
  Object.values(state.players).forEach((player) => {
    if (myPlayer.role === "guesser" && player.id === myPlayerId) {
      return;
    }

    const playerItem = document.createElement("div");
    playerItem.className = "mb-4";
    if (player.has_been_guessed) {
      playerItem.classList.add("opacity-50");
    }

    let playerStatus = player.has_been_guessed ? " (Already Guessed)" : "";

    if (myPlayer.role === "guesser" && !player.has_been_guessed) {
      const guessButton = document.createElement("button");
      guessButton.className =
        "btn-fishy w-full text-left flex items-center justify-between";
      guessButton.innerHTML = `
                <span class="flex items-center">
                    <span class="material-icons mr-2">person</span>
                    ${player.name}
                </span>
                <span class="text-sm">${player.points} points</span>
            `;
      const playerId = player.id;
      guessButton.onclick = () => {
        socket.emit("make_guess", {
          room_code: roomCode,
          guessed_player_id: playerId,
        });
        guessButton.disabled = true;
      };
      playerItem.appendChild(guessButton);
    } else {
      playerItem.innerHTML = `
                <div class="bg-sky-50 rounded-lg p-4 flex items-center justify-between">
                    <span class="flex items-center">
                        <span class="material-icons mr-2">person</span>
                        ${player.name}${playerStatus}
                    </span>
                    <span class="text-sm">${player.points} points</span>
                </div>
            `;
    }

    playersList.appendChild(playerItem);
  });

  // End Turn Early button — only for the guesser
  if (myPlayer.role === "guesser") {
    const endTurnBtn = document.createElement("button");
    endTurnBtn.id = "end-turn-btn";
    const pts = state.temp_points || 0;
    endTurnBtn.className =
      "btn-fishy w-full mt-6 bg-amber-400 border-amber-500 text-gray-900";
    endTurnBtn.textContent =
      pts > 0
        ? `End Turn Early (Keep ${pts} pt${pts !== 1 ? "s" : ""})`
        : "End Turn Early";
    endTurnBtn.onclick = () => {
      endTurnBtn.disabled = true;
      socket.emit("end_turn", { room_code: roomCode });
    };
    playersList.appendChild(endTurnBtn);
  }

  // Only announce next guesser when it's a new round
  if (state.new_round && state.next_guesser) {
    addGameMessage(
      `The new guesser is: ${state.next_guesser}`,
      "guesser-announcement",
    );
  }
}

// Handle guess results
socket.on("guess_result", (result) => {
  const message = document.createElement("div");

  // Set color and text based on whether it was the truth-teller
  if (result.was_truth_teller) {
    message.className = "message wrong-guess";
    message.textContent = `${result.guessed_player} was the Truth-teller! Round Over!`;
  } else {
    message.className = "message correct-liar";
    message.textContent = `${result.guessed_player} was a Liar! +${result.points_earned} point${result.points_earned !== 1 ? "s" : ""}`;
  }

  // Show bonus message if all liars were found
  if (result.found_all_liars && !bonusMessageShown) {
    const bonusMessage = document.createElement("div");
    bonusMessage.className = "message system";
    bonusMessage.textContent = "You found all the liars! Bonus point awarded!";
    document.getElementById("game-messages").appendChild(bonusMessage);
    bonusMessageShown = true;
  }

  // Re-enable remaining guess buttons if the round isn't over
  // (safety net in case game_state_update is delayed or lost)
  if (!result.was_truth_teller && !result.round_ended) {
    const gameList = document.getElementById("players-game-list");
    if (gameList) {
      gameList.querySelectorAll("button").forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  document.getElementById("game-messages").appendChild(message);
});

// Handle guesser ending turn early
socket.on("turn_ended_early", (data) => {
  const pts = data.points_kept;
  const ptText = pts > 0 ? ` keeping ${pts} point${pts !== 1 ? "s" : ""}` : "";
  addGameMessage(
    `${data.guesser_name} ended their turn early${ptText}. Unguessed liars each got a point!`,
    "system",
  );
});

// Handle new round state updates
socket.on("new_round", (state) => {
  bonusMessageShown = false; // Reset bonus message flag for new round

  // Clear previous round's chat messages
  document.getElementById("game-messages").innerHTML = "";

  // Add next guesser announcement
  addGameMessage(
    `The new guesser is: ${state.next_guesser}`,
    "guesser-announcement",
  );

  // Update the game state with the new round info
  updateGameState(state);
});

// Handle question skip
socket.on("question_skipped", (result) => {
  // Update the question text for everyone
  const questionElem = document.getElementById("current-question-text");
  if (questionElem) {
    questionElem.textContent = result.question;
  }
  // Update the answer text (only non-guessers have this element)
  const answerElem = document.getElementById("current-answer-text");
  if (answerElem) {
    answerElem.textContent = result.answer;
  }
  // Re-enable skip button for the guesser
  const skipBtn = document.getElementById("skip-question-btn");
  if (skipBtn) {
    skipBtn.disabled = false;
  }
  addGameMessage("Question skipped! New question is ready.", "system");
});

// Game over
socket.on("game_over", (results) => {
  // Hide game section and show game over
  gameSection.style.display = "none";
  gameOver.style.display = "block";

  const resultsDiv = document.getElementById("final-results");
  const rankingsList = resultsDiv.querySelector(".rankings-list");
  rankingsList.innerHTML = "";

  // Add rankings
  results.rankings.forEach((r) => {
    const rankItem = document.createElement("div");
    rankItem.className = "bg-sky-50 p-4 rounded-lg";
    rankItem.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <span class="text-2xl font-bold">${r.rank}. ${r.name}</span>
                    <div class="text-sky-700">Points: ${r.points}</div>
                    <div class="text-sky-700">Guessing Accuracy: ${Math.round(r.accuracy)}%</div>
                </div>
                ${r.awards ? `<div class="text-sky-600 font-semibold">Awards: ${r.awards}</div>` : ""}
            </div>
        `;
    rankingsList.appendChild(rankItem);
  });

  // Update award cards
  const guesserCard = resultsDiv.querySelector(
    ".award-card:nth-child(1) .award-content",
  );
  guesserCard.innerHTML = `
        <div class="font-semibold">${results.awards.best_guesser.name}</div>
        <div>${results.awards.best_guesser.correct_guesses} correct guesses</div>
        <div class="text-sky-600">Success Rate: ${Math.round(
          (results.stats[
            Object.keys(results.stats).find(
              (id) =>
                results.stats[id].correct_guesses ===
                results.awards.best_guesser.correct_guesses,
            )
          ].correct_guesses /
            results.stats[
              Object.keys(results.stats).find(
                (id) =>
                  results.stats[id].correct_guesses ===
                  results.awards.best_guesser.correct_guesses,
              )
            ].total_guesses) *
            100,
        )}%</div>
    `;

  const liarCard = resultsDiv.querySelector(
    ".award-card:nth-child(2) .award-content",
  );
  liarCard.innerHTML = `
        <div class="font-semibold">${results.awards.best_liar.name}</div>
        <div>${results.awards.best_liar.successful_escapes} successful escapes</div>
        <div class="text-sky-600">Survival Rate: ${Math.round(
          (results.stats[
            Object.keys(results.stats).find(
              (id) =>
                results.stats[id].times_survived ===
                results.awards.best_liar.successful_escapes,
            )
          ].times_survived /
            results.stats[
              Object.keys(results.stats).find(
                (id) =>
                  results.stats[id].times_survived ===
                  results.awards.best_liar.successful_escapes,
              )
            ].times_as_liar) *
            100,
        )}%</div>
    `;

  const statsCard = resultsDiv.querySelector(
    ".award-card:nth-child(3) .award-content",
  );
  statsCard.innerHTML = `
        <div>Total Rounds: ${Object.values(results.stats)[0].rounds_played}</div>
        <div>Total Lies Caught: ${Object.values(results.stats).reduce((sum, player) => sum + player.times_caught, 0)}</div>
        <div>Total Successful Escapes: ${Object.values(results.stats).reduce((sum, player) => sum + player.times_survived, 0)}</div>
        <div class="text-sky-600 mt-2">
            Overall Guesser Success: ${Math.round(
              (Object.values(results.stats).reduce(
                (sum, player) => sum + player.correct_guesses,
                0,
              ) /
                Object.values(results.stats).reduce(
                  (sum, player) => sum + player.total_guesses,
                  0,
                )) *
                100,
            )}%
        </div>
        <div class="text-sky-600">
            Overall Liar Survival: ${Math.round(
              (Object.values(results.stats).reduce(
                (sum, player) => sum + player.times_survived,
                0,
              ) /
                Object.values(results.stats).reduce(
                  (sum, player) => sum + player.times_as_liar,
                  0,
                )) *
                100,
            )}%
        </div>
    `;
});


// Back to home
document.getElementById("back-to-home").addEventListener("click", () => {
  localStorage.removeItem("fishyToken");
  window.location.reload();
});

// Play Again — reset room state and return to waiting room
document.getElementById("play-again-btn").addEventListener("click", () => {
  const btn = document.getElementById("play-again-btn");
  btn.disabled = true;
  btn.textContent = "Restarting…";
  socket.emit("restart_game", { room_code: roomCode });
});

// Handle game restart
socket.on("game_restarting", () => {
  // Show message in game over screen
  const resultsDiv = document.getElementById("final-results");
  const restartMessage = document.createElement("div");
  restartMessage.className = "text-2xl font-bold text-sky-600 text-center mt-4";
  restartMessage.textContent = "Game restarting...";
  resultsDiv.appendChild(restartMessage);
});

socket.on("game_restarted", () => {
  // Reset game state
  gameOver.style.display = "none";
  waitingRoom.style.display = "block";

  // Clear previous game messages
  document.getElementById("game-messages").innerHTML = "";

  // Reset any game-specific state variables
  bonusMessageShown = false;

  // Update waiting room display
  document.getElementById("room-code-display").textContent = roomCode;

  // Clear and reset players list
  const playersList = document.getElementById("players-list");
  playersList.innerHTML = "";

  // Re-enable the Play Again button for next time
  const playAgainBtn = document.getElementById("play-again-btn");
  if (playAgainBtn) {
    playAgainBtn.disabled = false;
    playAgainBtn.textContent = "Play Again";
  }

  // After a restart anyone in the room can start the next game
  document.getElementById("start-game").style.display = "block";
});

// Handle player rejoining for restart
socket.on("player_rejoined", (data) => {
  const playersList = document.getElementById("players-list");

  // Check if this player is already in the list
  const existingPlayer = playersList.querySelector(
    `[data-player-id="${data.player.id}"]`,
  );
  if (!existingPlayer) {
    const playerItem = document.createElement("div");
    playerItem.className = "player-item";
    playerItem.setAttribute("data-player-id", data.player.id);
    playerItem.textContent = `${data.player.name} rejoined the game`;
    playersList.appendChild(playerItem);
  }
});

// Add CSS for the new color classes
const style = document.createElement("style");
style.textContent = `
    .player-item.correct-guess {
        background-color: #4CAF50;  /* Green for correct liar guess */
        color: white;
        transition: background-color 0.3s ease;
    }
    .player-item.truth-teller-guess {
        background-color: #2196F3;  /* Blue for truth-teller */
        color: white;
        transition: background-color 0.3s ease;
    }
    .player-item.guessed {
        opacity: 0.8;
    }
    .player-item.disconnected {
        opacity: 0.6;
        background-color: #ffeb3b;
        color: #333;
    }
    .pause-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    .pause-content {
        background: white;
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        max-width: 400px;
    }
    .loading-spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 2s linear infinite;
        margin: 20px auto;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
