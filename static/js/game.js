// Game State Variables
let socket;
let playerName = '';
let roomId = '';
let isHost = false;
let currentLanguage = 'ar';
let currentDifficulty = 'medium';
let currentWord = '';
let timerInterval = null;
let roundTimer = 12; // 12 seconds per round

// Web Audio API Sound Synthesizer
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume audio context if suspended (browser security policies)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Play synthetic sound effects
function playSound(type) {
    if (!audioCtx) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime;
        
        if (type === 'click') {
            // Short high-pitched beep for correct character
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gainNode.gain.setValueAtTime(0.05, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'error_click') {
            // Lower buzzer sound for incorrect character
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'success') {
            // Nice ascending chime for completing a word
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'join') {
            // Upward sweep for join
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'leave') {
            // Downward sweep for leave
            osc.type = 'sine';
            osc.frequency.setValueAtTime(450, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'win') {
            // Happy fanfare for game over or winner
            playFanfare();
        }
    } catch (e) {
        console.error("Error playing sound: ", e);
    }
}

function playFanfare() {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, i) => {
        setTimeout(() => {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }, i * 150);
    });
}

// DOM Elements
const screens = {
    lobby: document.getElementById('screen-lobby'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
    gameover: document.getElementById('screen-game-over')
};

// Toast notification helper
function showToast(message, isSuccess = false) {
    const toast = document.getElementById('toast-message');
    const toastText = document.getElementById('toast-text');
    toastText.textContent = message;
    
    toast.className = 'toast';
    if (isSuccess) toast.classList.add('success');
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Helper to switch screens
function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (key === screenKey) {
            screens[key].classList.add('active');
        } else {
            screens[key].classList.remove('active');
        }
    });
}

// Initialize Socket.io and attach events
function initSocket() {
    socket = io();
    
    // Server events
    socket.on('error_message', (data) => {
        showToast(data.message);
    });
    
    socket.on('room_created', (data) => {
        roomId = data.room_id;
        isHost = data.is_host;
        currentLanguage = data.language;
        currentDifficulty = data.difficulty;
        
        setupWaitingScreen(data.players);
    });
    
    socket.on('join_success', (data) => {
        roomId = data.room_id;
        isHost = data.is_host;
        currentLanguage = data.language;
        currentDifficulty = data.difficulty;
        
        setupWaitingScreen(data.players);
    });
    
    socket.on('player_joined', (data) => {
        updatePlayersList(data.players);
        playSound('join');
        const joinMsg = currentLanguage === 'ar' ? `انضم اللاعب ${data.name}` : `${data.name} joined the room`;
        showToast(joinMsg, true);
    });
    
    socket.on('player_left', (data) => {
        updatePlayersList(data.players);
        playSound('leave');
        const leaveMsg = currentLanguage === 'ar' ? `غادر اللاعب ${data.name}` : `${data.name} left the room`;
        showToast(leaveMsg);
        
        // Update mini scoreboard if we are in game
        updateMiniScoreboard(data.players);
    });
    
    socket.on('new_host', (data) => {
        const isMe = (data.host_sid === socket.id);
        isHost = isMe;
        
        const hostMsg = currentLanguage === 'ar' 
            ? `المضيف الجديد هو ${data.host_name}` 
            : `New host is ${data.host_name}`;
        showToast(hostMsg, true);
        
        // Show start controls if I'm the new host
        if (isHost) {
            document.getElementById('host-controls').classList.remove('hidden');
            document.getElementById('guest-waiting-msg').classList.add('hidden');
        }
    });
    
    socket.on('game_started', (data) => {
        showScreen('game');
        document.getElementById('total-rounds').textContent = data.total_rounds;
        
        // Wait briefly for a nice screen transition, then display the first word
        // Let's reset input value
        const input = document.getElementById('game-input');
        input.value = '';
        input.disabled = true;
    });
    
    socket.on('new_word', (data) => {
        showScreen('game');
        currentWord = data.word;
        
        document.getElementById('current-round').textContent = data.index + 1;
        renderTargetWord();
        
        // Reset input
        const input = document.getElementById('game-input');
        input.value = '';
        input.disabled = false;
        
        // Focus input (Crucial for mobile soft keyboard popup!)
        // Tapping works best, but we try to auto-focus as well
        input.focus();
        
        // Auto-scroll input to view if needed
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Set up timer countdown
        startCountdownTimer(12);
        
        // Update scoreboard
        // We'll update the active status when we get list
    });
    
    socket.on('player_submitted_correct', (data) => {
        // Create floating text notification
        showLiveNotification(data.name, data.rank);
        
        // If it was ME, play success sound and disable input
        // (Handled locally on input match too, but to be sure)
    });
    
    socket.on('round_completed', (data) => {
        clearInterval(timerInterval);
        
        // Show results screen
        showScreen('results');
        
        // Set word display
        document.getElementById('results-word-display').textContent = data.word;
        
        // Render results list
        renderRoundResults(data.round_results);
        
        // Play sound
        playSound('success');
        
        // Start countdown to next round (6 seconds)
        let secondsLeft = 6;
        const countEl = document.getElementById('results-countdown');
        countEl.textContent = secondsLeft;
        
        const countdownInt = setInterval(() => {
            secondsLeft--;
            if (secondsLeft >= 0) {
                countEl.textContent = secondsLeft;
            } else {
                clearInterval(countdownInt);
            }
        }, 1000);
    });
    
    socket.on('game_over', (data) => {
        clearInterval(timerInterval);
        showScreen('gameover');
        playSound('win');
        
        renderFinalScores(data.scoreboard);
    });
}

// SETUP WAITING ROOM SCREEN
function setupWaitingScreen(players) {
    showScreen('waiting');
    
    // Adjust language class in container for directionality
    const appContainer = document.querySelector('.app-container');
    if (currentLanguage === 'en') {
        appContainer.classList.add('lang-en');
        document.getElementById('badge-lang').textContent = 'English';
        document.getElementById('badge-diff').textContent = getDiffStringEn(currentDifficulty);
        
        // Change texts to English
        document.querySelector('#screen-waiting h2').textContent = 'Waiting Room';
        document.querySelector('#guest-waiting-msg').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Waiting for host to start...';
        document.querySelector('#btn-start-game').innerHTML = '<i class="fa-solid fa-play"></i> Start Game';
        document.querySelector('.players-list-container h3').innerHTML = 'Connected Players (<span id="players-count">0</span>)';
    } else {
        appContainer.classList.remove('lang-en');
        document.getElementById('badge-lang').textContent = 'عربي';
        document.getElementById('badge-diff').textContent = getDiffStringAr(currentDifficulty);
        
        // Change texts back to Arabic
        document.querySelector('#screen-waiting h2').textContent = 'غرفة الانتظار';
        document.querySelector('#guest-waiting-msg').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> بانتظار مضيف الغرفة لبدء اللعبة...';
        document.querySelector('#btn-start-game').innerHTML = '<i class="fa-solid fa-play"></i> ابدأ اللعبة';
        document.querySelector('.players-list-container h3').innerHTML = 'اللاعبون المتصلون (<span id="players-count">0</span>)';
    }
    
    document.getElementById('display-room-code').textContent = roomId;
    
    // Host Controls
    if (isHost) {
        document.getElementById('host-controls').classList.remove('hidden');
        document.getElementById('guest-waiting-msg').classList.add('hidden');
    } else {
        document.getElementById('host-controls').classList.add('hidden');
        document.getElementById('guest-waiting-msg').classList.remove('hidden');
    }
    
    updatePlayersList(players);
}

function getDiffStringAr(diff) {
    if (diff === 'easy') return 'سهل';
    if (diff === 'medium') return 'متوسط';
    return 'صعب';
}

function getDiffStringEn(diff) {
    if (diff === 'easy') return 'Easy';
    if (diff === 'medium') return 'Medium';
    return 'Hard';
}

function updatePlayersList(players) {
    document.getElementById('players-count').textContent = players.length;
    const listContainer = document.getElementById('players-list');
    listContainer.innerHTML = '';
    
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card';
        if (p.is_host) card.style.borderColor = 'var(--color-gold)';
        
        const avatarLetter = p.name ? p.name.charAt(0).toUpperCase() : 'P';
        
        // Badges
        let badgesHtml = '';
        if (p.is_host) {
            badgesHtml += `<span class="badge-host"><i class="fa-solid fa-crown"></i> ${currentLanguage === 'ar' ? 'مضيف' : 'Host'}</span>`;
        }
        if (p.sid === socket.id) {
            badgesHtml += `<span class="badge-you">${currentLanguage === 'ar' ? 'أنت' : 'You'}</span>`;
        }
        
        card.innerHTML = `
            <div class="player-card-info">
                <div class="player-avatar">${avatarLetter}</div>
                <div class="player-name">${p.name}</div>
            </div>
            <div class="player-status-badges">
                ${badgesHtml}
            </div>
        `;
        listContainer.appendChild(card);
    });
    
    // Also sync scoreboard in background if needed
    updateMiniScoreboard(players);
}

function updateMiniScoreboard(players) {
    const mini = document.getElementById('mini-scoreboard');
    if (!mini) return;
    
    mini.innerHTML = '';
    
    players.forEach(p => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'mini-player';
        
        let streakHtml = '';
        if (p.streak >= 3) {
            streakHtml = `<span class="streak-badge"><i class="fa-solid fa-fire"></i> ${p.streak}</span>`;
        }
        
        playerDiv.innerHTML = `
            <span>${p.name}</span>: 
            <strong>${p.score}</strong>
            ${streakHtml}
        `;
        mini.appendChild(playerDiv);
    });
}

// GAMEPLAY LOGIC
function renderTargetWord() {
    const targetBox = document.getElementById('word-target');
    targetBox.innerHTML = '';
    
    // Set direction of word display based on language
    if (currentLanguage === 'ar') {
        targetBox.style.direction = 'rtl';
    } else {
        targetBox.style.direction = 'ltr';
    }
    
    // Build letters
    for (let char of currentWord) {
        const span = document.createElement('span');
        span.className = 'letter-default';
        if (char === ' ') {
            span.innerHTML = '&nbsp;'; // Non-breaking space for layout
            span.style.padding = '0 6px';
        } else {
            span.textContent = char;
        }
        targetBox.appendChild(span);
    }
}

function startCountdownTimer(seconds) {
    clearInterval(timerInterval);
    roundTimer = seconds;
    const timerBar = document.getElementById('game-timer-bar');
    timerBar.style.width = '100%';
    
    const startTime = Date.now();
    const durationMs = seconds * 1000;
    
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, durationMs - elapsed);
        const percent = (remaining / durationMs) * 100;
        
        timerBar.style.width = `${percent}%`;
        
        // Turn timer red in the last 3 seconds
        if (remaining <= 3000) {
            timerBar.style.background = 'var(--color-error)';
        } else {
            timerBar.style.background = 'linear-gradient(95deg, var(--color-primary-light), var(--color-primary))';
        }
        
        if (remaining <= 0) {
            clearInterval(timerInterval);
            // Input disabled when time finishes
            document.getElementById('game-input').disabled = true;
        }
    }, 50);
}

function showLiveNotification(name, rank) {
    const notifContainer = document.getElementById('live-notifications');
    const notif = document.createElement('div');
    notif.className = 'notif-item';
    
    let ordinal = rank;
    if (currentLanguage === 'en') {
        if (rank === 1) ordinal = '1st';
        else if (rank === 2) ordinal = '2nd';
        else if (rank === 3) ordinal = '3rd';
        else ordinal = rank + 'th';
        notif.textContent = `🎉 ${name} typed it! (${ordinal})`;
    } else {
        let rankText = 'الأول';
        if (rank === 2) rankText = 'الثاني';
        else if (rank === 3) rankText = 'الثالث';
        else if (rank > 3) rankText = `المركز ${rank}`;
        notif.textContent = `🎉 ${name} كتبها بالمركز ${rankText}!`;
    }
    
    notifContainer.appendChild(notif);
    
    // Auto remove from DOM after animation
    setTimeout(() => {
        notif.remove();
    }, 2000);
}

// REAL-TIME INPUT VERIFICATION
function verifyInput() {
    const input = document.getElementById('game-input');
    const typed = input.value;
    const spans = document.getElementById('word-target').children;
    
    let allCorrect = true;
    let isTypingCorrect = true;
    
    // Reset classes and check typed characters
    for (let i = 0; i < currentWord.length; i++) {
        const span = spans[i];
        if (i < typed.length) {
            if (typed[i] === currentWord[i]) {
                span.className = 'letter-correct';
            } else {
                span.className = 'letter-incorrect';
                allCorrect = false;
                isTypingCorrect = false;
            }
        } else {
            span.className = 'letter-default';
            allCorrect = false;
        }
    }
    
    // Play sound feedback based on typing
    if (typed.length > 0) {
        if (isTypingCorrect) {
            playSound('click');
        } else {
            playSound('error_click');
            // Give input field a shake to notify player on mistake
            input.classList.add('input-shake');
            setTimeout(() => input.classList.remove('input-shake'), 300);
        }
    }
    
    // Submit if word matches perfectly
    if (allCorrect && typed === currentWord) {
        playSound('success');
        input.disabled = true;
        
        socket.emit('submit_word', { word: typed });
    }
}

// RENDER ROUND RESULTS SCREEN
function renderRoundResults(results) {
    const container = document.getElementById('round-results-list');
    container.innerHTML = '';
    
    // Adapt texts based on language
    const titleEl = document.querySelector('#screen-results h2');
    const headerRow = document.querySelector('.leaderboard-header-row');
    
    if (currentLanguage === 'en') {
        titleEl.textContent = 'Round Leaderboard';
        document.querySelector('.word-was').firstChild.textContent = 'Word was: ';
        headerRow.children[0].textContent = 'Rank';
        headerRow.children[1].textContent = 'Name';
        headerRow.children[2].textContent = 'Speed';
        headerRow.children[3].textContent = 'Points';
    } else {
        titleEl.textContent = 'ترتيب سرعة الجولة';
        document.querySelector('.word-was').firstChild.textContent = 'الكلمة كانت: ';
        headerRow.children[0].textContent = 'الترتيب';
        headerRow.children[1].textContent = 'الاسم';
        headerRow.children[2].textContent = 'السرعة';
        headerRow.children[3].textContent = 'النقاط';
    }
    
    results.forEach(res => {
        const row = document.createElement('div');
        row.className = `result-row`;
        if (res.rank) row.classList.add(`rank-${res.rank}`);
        
        let rankCol = res.rank ? res.rank : '-';
        
        // Formatting Name with Fire streak if active
        let nameColHtml = res.name;
        if (res.streak >= 3) {
            nameColHtml += ` <span class="streak-badge"><i class="fa-solid fa-fire"></i> ${res.streak}</span>`;
        }
        
        let speedColHtml = '';
        let pointsColHtml = '';
        
        if (res.speed !== null) {
            speedColHtml = `<span class="result-speed">${res.speed}s</span>`;
            pointsColHtml = `<span class="result-points">+${res.points_earned}</span>`;
            
            row.innerHTML = `
                <div class="result-rank">${rankCol}</div>
                <div class="result-name">${nameColHtml}</div>
                <div>${speedColHtml}</div>
                <div>${pointsColHtml}</div>
            `;
        } else {
            const noAnswerText = currentLanguage === 'ar' ? 'لم يجب' : 'No Answer';
            row.innerHTML = `
                <div class="result-rank">${rankCol}</div>
                <div class="result-name">${nameColHtml}</div>
                <div class="result-no-answer">${noAnswerText}</div>
            `;
        }
        
        container.appendChild(row);
    });
}

// RENDER GAMEOVER RESULTS (PODIUM)
function renderFinalScores(scoreboard) {
    // Top 3 Podium
    const p1 = scoreboard[0];
    const p2 = scoreboard[1];
    const p3 = scoreboard[2];
    
    // Translation labels
    const titleEl = document.querySelector('#screen-game-over h2');
    const subTitleEl = document.querySelector('#screen-game-over p');
    const fullRankTitle = document.querySelector('.final-scores-container h3');
    
    if (currentLanguage === 'en') {
        titleEl.textContent = 'Final Standings';
        subTitleEl.textContent = 'Game Over! Congratulations to the winners!';
        fullRankTitle.textContent = 'Full Leaderboard';
        document.getElementById('btn-return-lobby').innerHTML = '<i class="fa-solid fa-house"></i> Back to Main Menu';
    } else {
        titleEl.textContent = 'النتائج النهائية';
        subTitleEl.textContent = 'انتهت اللعبة! تهانينا للفائزين';
        fullRankTitle.textContent = 'الترتيب الكامل';
        document.getElementById('btn-return-lobby').innerHTML = '<i class="fa-solid fa-house"></i> العودة للرئيسية';
    }
    
    // Set First Place
    if (p1) {
        document.getElementById('podium-1st-name').textContent = p1.name;
        document.getElementById('podium-1st-score').textContent = `${p1.score} ${currentLanguage === 'ar' ? 'نقطة' : 'pts'}`;
        document.getElementById('podium-first').style.visibility = 'visible';
    } else {
        document.getElementById('podium-first').style.visibility = 'hidden';
    }
    
    // Set Second Place
    if (p2) {
        document.getElementById('podium-2nd-name').textContent = p2.name;
        document.getElementById('podium-2nd-score').textContent = `${p2.score} ${currentLanguage === 'ar' ? 'نقطة' : 'pts'}`;
        document.getElementById('podium-second').style.visibility = 'visible';
    } else {
        document.getElementById('podium-second').style.visibility = 'hidden';
    }
    
    // Set Third Place
    if (p3) {
        document.getElementById('podium-3rd-name').textContent = p3.name;
        document.getElementById('podium-3rd-score').textContent = `${p3.score} ${currentLanguage === 'ar' ? 'نقطة' : 'pts'}`;
        document.getElementById('podium-third').style.visibility = 'visible';
    } else {
        document.getElementById('podium-third').style.visibility = 'hidden';
    }
    
    // Full Rank List (for players ranking 4 and onwards)
    const listContainer = document.getElementById('final-scores-list');
    listContainer.innerHTML = '';
    
    const remaining = scoreboard.slice(3);
    if (remaining.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.color = 'var(--color-text-muted)';
        emptyDiv.style.padding = '10px';
        emptyDiv.textContent = currentLanguage === 'ar' ? 'لا يوجد لاعبون آخرون' : 'No other players';
        listContainer.appendChild(emptyDiv);
    } else {
        remaining.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = 'final-score-row';
            
            row.innerHTML = `
                <span class="final-score-rank">${idx + 4}</span>
                <span class="final-score-name">${p.name}</span>
                <span class="final-score-val">${p.score} ${currentLanguage === 'ar' ? 'نقطة' : 'pts'}</span>
            `;
            listContainer.appendChild(row);
        });
    }
}

// ATTACH DOM EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    // Lobby Interaction
    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const inputName = document.getElementById('player-name');
    const inputRoomCode = document.getElementById('room-code-input');
    
    // Language and difficulty inputs
    const difficultySelect = document.getElementById('difficulty-select');
    
    btnCreateRoom.addEventListener('click', () => {
        playerName = inputName.value.trim();
        if (!playerName) {
            showToast(document.querySelector('input[name="lang-select"]:checked').value === 'ar' ? 'الرجاء إدخال اسم اللاعب أولاً!' : 'Please enter your name first!');
            inputName.focus();
            return;
        }
        
        initAudio(); // Trigger audio setup on interaction
        
        const langVal = document.querySelector('input[name="lang-select"]:checked').value;
        const diffVal = difficultySelect.value;
        
        socket.emit('create_room', {
            name: playerName,
            language: langVal,
            difficulty: diffVal
        });
    });
    
    btnJoinRoom.addEventListener('click', () => {
        playerName = inputName.value.trim();
        const roomCode = inputRoomCode.value.trim();
        
        if (!playerName) {
            showToast('الرجاء إدخال اسم اللاعب أولاً!');
            inputName.focus();
            return;
        }
        if (!roomCode) {
            showToast('الرجاء إدخال رقم الغرفة!');
            inputRoomCode.focus();
            return;
        }
        
        initAudio(); // Trigger audio setup on interaction
        
        socket.emit('join_room', {
            name: playerName,
            room_id: roomCode
        });
    });
    
    // Name Input triggers audio init too to bypass browser security policies early
    inputName.addEventListener('keydown', () => {
        initAudio();
    });
    
    // Copy Room Code to clipboard
    const btnCopyCode = document.getElementById('btn-copy-code');
    btnCopyCode.addEventListener('click', () => {
        const codeText = document.getElementById('display-room-code').textContent;
        navigator.clipboard.writeText(codeText).then(() => {
            const copiedText = currentLanguage === 'ar' ? 'تم نسخ كود الغرفة!' : 'Room code copied!';
            showToast(copiedText, true);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });
    
    // Start Game (Host only)
    const btnStartGame = document.getElementById('btn-start-game');
    btnStartGame.addEventListener('click', () => {
        socket.emit('start_game');
    });
    
    // Typing input verification
    const gameInput = document.getElementById('game-input');
    gameInput.addEventListener('input', () => {
        verifyInput();
    });
    
    // Prevent default actions or form submit on input Enter
    gameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });
    
    // Leave room / return to lobby
    const btnLeaveLobby = document.querySelector('.btn-leave-lobby');
    btnLeaveLobby.addEventListener('click', () => {
        // Simple reload to disconnect and reset state
        window.location.reload();
    });
    
    const btnReturnLobby = document.getElementById('btn-return-lobby');
    btnReturnLobby.addEventListener('click', () => {
        window.location.reload();
    });
    
    // Fix mobile viewport height issues when virtual keyboard appears
    // This repositions elements nicely
    window.addEventListener('resize', () => {
        const activeInput = document.activeElement;
        if (activeInput && (activeInput.id === 'game-input' || activeInput.id === 'player-name')) {
            setTimeout(() => {
                activeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    });
});
