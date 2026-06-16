// スマホのジェスチャーによる誤動作を防止
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

const colors = [
    { val: 0, name: '黒', hex: '#000000', text: 'white' },
    { val: 1, name: '茶', hex: '#8B4513', text: 'white' },
    { val: 2, name: '赤', hex: '#FF0000', text: 'white' },
    { val: 3, name: '橙', hex: '#FFA500', text: 'black' },
    { val: 4, name: '黄', hex: '#FFFF00', text: 'black' },
    { val: 5, name: '緑', hex: '#008000', text: 'white' },
    { val: 6, name: '青', hex: '#0000FF', text: 'white' },
    { val: 7, name: '紫', hex: '#EE82EE', text: 'black' },
    { val: 8, name: '灰', hex: '#808080', text: 'white' },
    { val: 9, name: '白', hex: '#FFFFFF', text: 'black' }
];

let score = 0, combo = 0, maxCombo = 0, lives = 3, timeLeft = 30.0;
let isPlaying = false, currentTarget = null, beatCount = 0;
let expectedTime = 0, beatTimerId = null, timerIntervalId = null, recoveryTimerId = null;
let baseBpm = 100, currentBpm = 100, beatMs = 600;
let isAnswered = false, isFever = false, isRecovering = false; 

const ui = document.getElementById('game-ui');
const settings = document.getElementById('settings-area');
const timeDisplay = document.getElementById('time-display');
const heartsDisplay = document.getElementById('hearts-display');
const bpmDisplay = document.getElementById('bpm-display');
const scoreVal = document.getElementById('score-val');
const comboDisplay = document.getElementById('combo-display');
const colorCard = document.getElementById('color-card');
const rhythmArea = document.getElementById('rhythm-area');
const clapContainer = document.getElementById('clap-container');
const phaseBar = document.getElementById('phase-bar');
const flashOverlay = document.getElementById('flash-overlay');

function startGame(bpm) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    clearTimeout(beatTimerId); clearInterval(timerIntervalId); clearTimeout(recoveryTimerId);

    baseBpm = bpm; currentBpm = bpm; updateTempoVar();
    score = 0; combo = 0; maxCombo = 0; lives = 3; timeLeft = 30.00; beatCount = 0;
    isPlaying = true; isAnswered = true; isFever = false; isRecovering = false;

    ui.classList.remove('shake');
    clapContainer.innerHTML = '';
    colorCard.innerText = 'Ready'; colorCard.style.backgroundColor = '#fff'; colorCard.style.color = '#333';

    updateUI(); resetFever();
    phaseBar.style.transition = 'none'; phaseBar.style.width = '100%';
    settings.classList.add('hidden'); ui.classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');

    nextQuestion();
    timerIntervalId = setInterval(updateTimer, 100);
    expectedTime = performance.now();
    runBeat(); 
}

function backToTitle() {
    isPlaying = false;
    clearTimeout(beatTimerId); clearInterval(timerIntervalId); clearTimeout(recoveryTimerId);
    if (audioCtx.state === 'running') audioCtx.suspend();
    
    resetFever(); ui.classList.remove('shake'); 
    document.getElementById('result-modal').classList.add('hidden');
    ui.classList.add('hidden'); settings.classList.remove('hidden');
}

function updateTempoVar() {
    beatMs = 60000 / currentBpm;
    bpmDisplay.innerText = `BPM: ${currentBpm}`;
}

function updateTimer() {
    if (!isPlaying) return;
    if (timeLeft > 0) {
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
            timeLeft = 0;
            if (baseBpm === 200 && isFever) {
                // EXTREME延長戦
            } else {
                endGame("TIME UP!"); return;
            }
        }
    } else {
        if (!isFever) { endGame("TIME UP!"); return; }
    }
    updateUI();
}

function updateUI() {
    if (timeLeft <= 0 && baseBpm === 200 && isFever) {
        timeDisplay.innerText = "∞"; timeDisplay.style.color = '#ff4757';
    } else {
        timeDisplay.innerText = timeLeft.toFixed(2); timeDisplay.style.color = '#fff';
    }
    scoreVal.innerText = score;
    let hearts = ""; for(let i=0; i<lives; i++) hearts += "❤️";
    heartsDisplay.innerText = hearts;

    if (combo >= 1) {
        comboDisplay.innerText = combo + " COMBO!"; comboDisplay.style.display = 'block'; comboDisplay.classList.add('combo-active');
    } else {
        comboDisplay.style.display = 'none'; comboDisplay.classList.remove('combo-active');
    }
}

function nextQuestion() {
    currentTarget = colors[Math.floor(Math.random() * colors.length)];
}

function triggerFlash() {
    flashOverlay.style.opacity = '0.6';
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 50);
}

function checkFever() {
    if (combo >= 5) { 
        if (!isFever) {
            isFever = true; document.body.classList.add('fever-bg'); 
            ui.classList.add('fever-active'); playPowerUpSound(); 
        }
    } else {
        resetFever();
    }
}

function resetFever() {
    isFever = false; document.body.classList.remove('fever-bg'); ui.classList.remove('fever-active');
    document.body.style.backgroundColor = '#1a1a1a';
    if (currentBpm !== baseBpm) { currentBpm = baseBpm; updateTempoVar(); }
}

function runBeat(isFeverStart = false) {
    if (!isPlaying || isRecovering) return;

    const phase = beatCount % 4; 
    const bar = Math.floor(beatCount / 4); // %8制限を外し、ループ計算をaudio.js側に委任

    if (phase === 0) {
        playTone(300, 'sine', 0.1, 0, 0.4); playKickSound();
        if (isFever) playInvincibleBeat(bar, phase, 0);
        if (beatCount > 0 && !isAnswered && !isFeverStart) { handleMiss("TOO SLOW!"); return; }
        isAnswered = false;
        
        resetPhaseBar();
        colorCard.innerText = ''; colorCard.style.backgroundColor = currentTarget.hex; colorCard.style.transform = "scale(1)"; 
        colorCard.animate([ { transform: 'scale(0.8) translateY(-10px)', opacity: 0 }, { transform: 'scale(1) translateY(0)', opacity: 1 } ], { duration: 150, easing: 'ease-out' });
        if (!isFeverStart) clapContainer.innerHTML = '';
        rhythmArea.style.fontSize = "2.8rem";

    } else if (phase === 1) {
        playClapSound();
        if (isFever) playInvincibleBeat(bar, phase, 0);
        if (!isAnswered) clapContainer.innerHTML = '<span class="clap-item clap-visible">👏</span><span class="clap-item">👏</span>';

    } else if (phase === 2) {
        playClapSound(); playKickSound();
        if (isFever) playInvincibleBeat(bar, phase, 0);
        if (!isAnswered) {
            const items = clapContainer.querySelectorAll('.clap-item');
            if (items.length > 1) items[1].classList.add('clap-visible');
            startPhaseBar(beatMs * 2);
        }

    } else if (phase === 3) {
        if (isFever) playInvincibleBeat(bar, phase, 0);
        if (!isAnswered) {
            clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c;">???</span>';
            playTone(800, 'sine', 0.1, 0, 0.2); 
        }
    }

    beatCount++; expectedTime += beatMs;
    let delay = expectedTime - performance.now();
    if (delay < 0) { expectedTime = performance.now(); delay = 0; }
    beatTimerId = setTimeout(runBeat, delay);
}

function resetPhaseBar() { phaseBar.style.transition = 'none'; phaseBar.style.width = '100%'; }
function startPhaseBar(duration) { phaseBar.style.transition = `width ${duration}ms linear`; requestAnimationFrame(() => { phaseBar.style.width = '0%'; }); }

function handleInput(num) {
    if (!isPlaying || isRecovering) return;
    if (isAnswered) return;

    const phase = (beatCount - 1) % 4;
    if (phase === 0 || phase === 1) {
        isAnswered = true; clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c; font-size:1.5rem;">EARLY!</span>'; handleMiss("EARLY!"); return;
    }

    isAnswered = true;
    const currentWidth = phaseBar.getBoundingClientRect().width;
    const parentWidth = phaseBar.parentElement.getBoundingClientRect().width;
    const percentage = (currentWidth / parentWidth) * 100;

    phaseBar.style.transition = 'none'; phaseBar.style.width = percentage + '%';

    if (num === currentTarget.val) {
        combo++; if (combo > maxCombo) maxCombo = combo;
        
        let justEnteredFever = false;
        if (combo === 5 && !isFever) justEnteredFever = true;

        checkFever();

        let baseScore = 0, okText = "", okColor = "", fontSize = "2rem";
        if (percentage >= 33.33 && percentage <= 66.66) {
            baseScore = 100; okText = isFever ? 'FEVER GREAT!!' : 'GREAT!!'; okColor = isFever ? '#f1c40f' : '#2ecc71'; fontSize = "2.4rem"; 
        } else {
            baseScore = 50; okText = isFever ? 'FEVER GOOD!' : 'GOOD!'; okColor = isFever ? '#e67e22' : '#3498db'; 
        }

        const bpmMultiplier = currentBpm / 100; const feverMultiplier = isFever ? 3 : 1;
        score += Math.floor((baseScore * bpmMultiplier * feverMultiplier) + (combo * 10 * bpmMultiplier));

        playSuccessSound(combo); triggerFlash(); 
        clapContainer.innerHTML = `<span class="sharp-text" style="color:${okColor}; font-size:${fontSize};">${okText}</span>`;
        
        if (isFever && !justEnteredFever) { currentBpm += 5; updateTempoVar(); } 
        else if (justEnteredFever) { updateTempoVar(); }

        updateUI(); nextQuestion();

        if (justEnteredFever) {
            clearTimeout(beatTimerId); beatCount = 0; expectedTime = performance.now(); runBeat(true); return;
        }
    } else {
        clapContainer.innerHTML = '<span class="sharp-text" style="color:#e74c3c; font-size:3rem;">✖</span>'; handleMiss("MISS!"); 
    }
}

function handleMiss(reason) {
    if (isRecovering) return;
    if (timeLeft <= 0) { playTone(150, 'sawtooth', 0.4); playTone(110, 'sawtooth', 0.4); endGame("FINISHED!"); return; }

    isRecovering = true; combo = 0; resetFever(); 
    ui.classList.add('shake'); setTimeout(() => { ui.classList.remove('shake'); }, 400);
    playTone(150, 'sawtooth', 0.4); playTone(110, 'sawtooth', 0.4);

    lives--; updateUI();

    if (lives <= 0) { endGame("GAME OVER"); return; }

    clearTimeout(beatTimerId);
    clapContainer.innerHTML = `<span class="sharp-text" style="color:#e74c3c; font-size:2rem;">${reason}</span>`;
    colorCard.innerText = 'WAIT...'; colorCard.style.backgroundColor = '#95a5a6'; colorCard.style.color = '#fff'; colorCard.style.transform = "scale(0.9)";
    resetPhaseBar();

    recoveryTimerId = setTimeout(() => {
        if (!isPlaying) return;
        isRecovering = false; beatCount = 0; expectedTime = performance.now(); 
        nextQuestion(); runBeat();
    }, 1500);
}

function endGame(msg) {
    isPlaying = false;
    clearTimeout(beatTimerId); clearInterval(timerIntervalId); clearTimeout(recoveryTimerId);
    phaseBar.style.transition = 'none'; resetFever(); ui.classList.remove('shake');
    
    let rank = 'D', rankColor = '#95a5a6'; 
    if (score >= 30000) { rank = 'SSS'; rankColor = '#ff9ff3'; } 
    else if (score >= 20000) { rank = 'SS'; rankColor = '#f368e0'; } 
    else if (score >= 8000) { rank = 'S'; rankColor = '#f1c40f'; } 
    else if (score >= 5500) { rank = 'A'; rankColor = '#e74c3c'; } 
    else if (score >= 3500) { rank = 'B'; rankColor = '#3498db'; } 
    else if (score >= 1500) { rank = 'C'; rankColor = '#2ecc71'; }
    
    document.getElementById('result-title').innerText = msg;
    document.getElementById('result-score').innerText = score;
    document.getElementById('result-combo').innerText = maxCombo;
    const rankEl = document.getElementById('result-rank'); rankEl.innerText = rank; rankEl.style.color = rankColor;
    document.getElementById('result-modal').classList.remove('hidden');
}
