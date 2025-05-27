// Connect to the Socket.IO server
const socket = io({
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Game state
let playerName = '';
let roomCode = '';
let isHost = false;
let myPlayerId = null;

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const joinSection = document.getElementById('join-section');
const waitingRoom = document.getElementById('waiting-room');
const gameSection = document.getElementById('game-section');
const gameOver = document.getElementById('game-over');

// Initially hide the join section until connected
joinSection.style.display = 'none';
connectionStatus.style.display = 'block';

// Connection handling
socket.on('connect', () => {
    console.log('Connected to server');
    connectionStatus.style.display = 'none';
    joinSection.style.display = 'block';
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    connectionStatus.style.display = 'block';
    connectionStatus.innerHTML = '<p style="color: red;">Error connecting to server. Retrying...</p>';
    joinSection.style.display = 'none';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionStatus.style.display = 'block';
    connectionStatus.innerHTML = '<p style="color: red;">Disconnected from server. Reconnecting...</p>';
    joinSection.style.display = 'none';
});

// Create Room
document.getElementById('create-room').addEventListener('click', () => {
    playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }

    fetch('/create_room', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: playerName }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        roomCode = data.room_code;
        isHost = true;
        joinGame();
    });
});

// Join Room
document.getElementById('join-room').addEventListener('click', () => {
    playerName = document.getElementById('player-name').value.trim();
    roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!playerName || !roomCode) {
        alert('Please enter your name and room code');
        return;
    }

    fetch(`/join_room/${roomCode}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: playerName }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        joinGame();
    });
});

function joinGame() {
    socket.emit('join_game', {
        room_code: roomCode,
        name: playerName
    });
    
    joinSection.style.display = 'none';
    waitingRoom.style.display = 'block';
    document.getElementById('room-code-display').textContent = roomCode;
}

// Handle player joined
socket.on('player_joined', (data) => {
    const playersList = document.getElementById('players-list');
    
    // Check if this player is already in the list
    const existingPlayer = playersList.querySelector(`[data-player-id="${data.player.id}"]`);
    if (existingPlayer) {
        return; // Skip if player already shown
    }
    
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    playerItem.setAttribute('data-player-id', data.player.id);
    playerItem.textContent = data.message;
    playersList.appendChild(playerItem);
    
    if (isHost) {
        document.getElementById('start-game').style.display = 'block';
    }
});

// Start game
document.getElementById('start-game').addEventListener('click', () => {
    socket.emit('start_game', { room_code: roomCode });
});

function addGameMessage(message, type = 'info') {
    const messagesDiv = document.getElementById('game-messages');
    const messageElem = document.createElement('div');
    messageElem.className = `message ${type}`;
    messageElem.textContent = message;
    messagesDiv.appendChild(messageElem);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
}

// Game started
socket.on('game_started', (state) => {
    waitingRoom.style.display = 'none';
    gameSection.style.display = 'block';
    myPlayerId = state.player_id;
    addGameMessage('Game has started!', 'system');
    updateGameState(state);
});

// Update game state
socket.on('game_state_update', updateGameState);
socket.on('new_round', updateGameState);

function updateGameState(state) {
    // Find my player info
    const myPlayer = state.players[myPlayerId];
    if (!myPlayer) return;

    // Update role with simple description
    document.getElementById('player-role').textContent = `Role: ${myPlayer.role}`;
    
    // Update question and answer based on role
    const questionElem = document.getElementById('question');
    const answerSection = document.getElementById('answer-section');
    
    // Update question visibility
    if (state.question) {
        questionElem.textContent = `Question: ${state.question}`;
        questionElem.parentElement.style.display = 'block';
    } else {
        questionElem.parentElement.style.display = 'none';
    }
    
    if (myPlayer.role === 'guesser') {
        answerSection.style.display = 'none';
        // Only show this message when the game first starts or on role change
        if (state.current_round === 1 || state.new_round) {
            addGameMessage("You're the guesser! Try to figure out who's lying.", 'role');
        }
    } else {
        answerSection.style.display = 'block';
        document.getElementById('answer').textContent = `Answer: ${state.answer || ''}`;
        // Only show these messages when the game first starts or on role change
        if (state.current_round === 1 || state.new_round) {
            if (myPlayer.role === 'truth-teller') {
                addGameMessage("Remember: You must tell the truth! Give this answer exactly.", 'role');
            } else if (myPlayer.role === 'liar') {
                addGameMessage("Remember: You're a liar! Make up a false answer.", 'role');
            }
        }
    }
    
    // Update players list
    const playersList = document.getElementById('players-game-list');
    playersList.innerHTML = '';
    
    // Add round information
    const roundInfo = document.createElement('div');
    roundInfo.className = 'round-info';
    roundInfo.textContent = `Round ${state.current_round || 1}`;
    playersList.appendChild(roundInfo);
    
    // Add other players
    Object.values(state.players).forEach(player => {
        if (myPlayer.role === 'guesser' && player.id === myPlayerId) {
            return;
        }

        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player.has_been_guessed) {
            playerItem.classList.add('guessed');
        }
        
        let playerStatus = player.has_been_guessed ? ' (Already Guessed)' : '';
        playerItem.textContent = `${player.name} - ${player.points} points${playerStatus}`;
        
        if (myPlayer.role === 'guesser' && !player.has_been_guessed) {
            const guessButton = document.createElement('button');
            guessButton.textContent = `Guess ${player.name}`;
            guessButton.onclick = () => {
                makeGuess(player.id);
            };
            playerItem.appendChild(guessButton);
        }
        
        playersList.appendChild(playerItem);
    });
}

function makeGuess(playerId) {
    socket.emit('make_guess', {
        room_code: roomCode,
        guessed_player_id: playerId
    });
}

// Handle guess results
socket.on('guess_result', (result) => {
    const message = document.createElement('div');
    message.className = 'message guess-result';
    
    if (result.was_truth_teller) {
        message.textContent = `${result.guessed_player} was the Truth-teller! Round Over!`;
        addGameMessage('Game continues with new roles!', 'system');
    } else {
        message.textContent = `${result.guessed_player} was a Liar! +${result.points_earned} point${result.points_earned !== 1 ? 's' : ''}`;
        if (result.found_all_liars) {
            addGameMessage('You found all the liars! Bonus point awarded!', 'system');
        }
    }
    
    document.getElementById('game-messages').appendChild(message);
});

// Game over
socket.on('game_over', (results) => {
    // Add awards to game feed first
    const messagesDiv = document.getElementById('game-messages');
    
    // Add a separator
    const separator = document.createElement('div');
    separator.className = 'message system';
    separator.innerHTML = '🏆 Game Over! Final Awards 🏆';
    messagesDiv.appendChild(separator);
    
    // Add Best Guesser award
    const guesserAward = document.createElement('div');
    guesserAward.className = 'message award';
    guesserAward.innerHTML = `🎯 Best Guesser: ${results.awards.best_guesser.name} (${results.awards.best_guesser.correct_guesses} correct guesses)`;
    messagesDiv.appendChild(guesserAward);
    
    // Add Best Liar award
    const liarAward = document.createElement('div');
    liarAward.className = 'message award';
    liarAward.innerHTML = `🎭 Best Liar: ${results.awards.best_liar.name} (${results.awards.best_liar.successful_escapes} successful escapes)`;
    messagesDiv.appendChild(liarAward);
    
    // Auto-scroll to show awards
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Show the final results screen
    gameSection.style.display = 'none';
    gameOver.style.display = 'block';
    
    const resultsDiv = document.getElementById('final-results');
    resultsDiv.innerHTML = `
        <h3>🏆 Game Over - ${results.winner} Wins!</h3>
        <h4>Final Rankings:</h4>
        ${results.rankings.map(r => `
            <p>${getRankEmoji(r.rank)} ${r.rank}. ${r.name}
               <br>Points: ${r.points}
               <br>Guessing Accuracy: ${Math.round(r.accuracy)}%
               ${r.awards ? `<br>🏅 Awards: ${r.awards}` : ''}
            </p>
        `).join('')}
        <div class="awards-section">
            <h4>Game Awards</h4>
            <div class="award-card">
                <h5>Best Guesser</h5>
                <p>${results.awards.best_guesser.name}</p>
                <p class="award-stat">${results.awards.best_guesser.correct_guesses} correct guesses</p>
                <p class="award-stat-detail">Success Rate: ${Math.round((results.stats[Object.keys(results.stats).find(id => 
                    results.stats[id].correct_guesses === results.awards.best_guesser.correct_guesses)].correct_guesses / 
                    results.stats[Object.keys(results.stats).find(id => 
                    results.stats[id].correct_guesses === results.awards.best_guesser.correct_guesses)].total_guesses) * 100)}%</p>
            </div>
            <div class="award-card">
                <h5>Best Liar</h5>
                <p>${results.awards.best_liar.name}</p>
                <p class="award-stat">${results.awards.best_liar.successful_escapes} successful escapes</p>
                <p class="award-stat-detail">Survival Rate: ${Math.round((results.stats[Object.keys(results.stats).find(id => 
                    results.stats[id].times_survived === results.awards.best_liar.successful_escapes)].times_survived / 
                    results.stats[Object.keys(results.stats).find(id => 
                    results.stats[id].times_survived === results.awards.best_liar.successful_escapes)].times_as_liar) * 100)}%</p>
            </div>
            <div class="award-card">
                <h5>Game Stats</h5>
                <p>Total Rounds: ${Object.values(results.stats)[0].rounds_played}</p>
                <p>Total Lies Caught: ${Object.values(results.stats).reduce((sum, player) => sum + player.times_caught, 0)}</p>
                <p>Total Successful Escapes: ${Object.values(results.stats).reduce((sum, player) => sum + player.times_survived, 0)}</p>
                <p class="award-stat-detail">Overall Guesser Success Rate: ${Math.round((Object.values(results.stats).reduce((sum, player) => sum + player.correct_guesses, 0) / 
                    Object.values(results.stats).reduce((sum, player) => sum + player.total_guesses, 0)) * 100)}%</p>
                <p class="award-stat-detail">Overall Liar Survival Rate: ${Math.round((Object.values(results.stats).reduce((sum, player) => sum + player.times_survived, 0) / 
                    Object.values(results.stats).reduce((sum, player) => sum + player.times_as_liar, 0)) * 100)}%</p>
            </div>
        </div>
    `;
});

function getRankEmoji(rank) {
    switch(rank) {
        case 1: return '🥇';
        case 2: return '🥈';
        case 3: return '🥉';
        default: return '🎮';
    }
}

// Play again
document.getElementById('play-again').addEventListener('click', () => {
    window.location.reload();
}); 