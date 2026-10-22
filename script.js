// スマホのジェスチャーによる誤動作を防止
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

const colors = [
    { val: 0, name: '黒', hex: '#0a0a0a', text: '#ffffff' },
    { val: 1, name: '茶', hex: '#8B4513', text: '#ffffff' },
    { val: 2, name: '赤', hex: '#ff1744', text: '#ffffff' },
    { val: 3, name: '橙', hex: '#ff9100', text: '#111111' },
    { val: 4, name: '黄', hex: '#ffea00', text: '#111111' },
    { val: 5, name: '緑', hex: '#00e676', text: '#111111' },
    { val: 6, name: '青', hex: '#2979ff', text: '#ffffff' },
    { val: 7, name: '紫', hex: '#d500f9', text: '#ffffff' },
    { val: 8, name: '灰', hex: '#78909c', text: '#ffffff' },
    { val: 9, name: '白', hex: '#ffffff', text: '#111111' }
];

// ゲーム状態変数
let score = 0, displayedScore = 0, combo = 0, maxCombo = 0, lives = 3, timeLeft = 30.0;
let isPlaying = false, currentTarget = null, beatCount = 0;
let expectedTime = 0, beatTimerId = null, timerIntervalId = null, recoveryTimerId = null;
let baseBpm = 100, currentBpm = 100, beatMs = 600;
let isAnswered = false, isRecovering = false;

// FEVER＆小節頭同期用ステート（拍の裏返りを完全に防ぐ予約フラグ）
let feverLevel = 0;         // 0:通常, 1:FEVER(x3), 2:SUPER FEVER(x5), 3:OVERDRIVE(x10)
let pendingFeverLevel = 0;  // 次の小節頭(phase===0)で適用されるFEVERレベル
let pendingBpmIncrease = 0; // 次の小節頭で加算されるBPM
let omegaStreak = 0;        // Ω PERFECTのストック数（3つでTIME +1.5s）
let currentDummyText = '';  // ストループ効果トラップ文字

// DOM要素
const ui = document.getElementById('game-ui');
const settings = document.getElementById('settings-area');
const timeDisplay = document.getElementById('time-display');
const heartsDisplay = document.getElementById('hearts-display');
const bpmDisplay = document.getElementById('bpm-display');
const scoreVal = document.getElementById('score-val');
const comboDisplay = document.getElementById('combo-display');
const bgComboWatermark = document.getElementById('bg-combo-watermark');
const colorCard = document.getElementById('color-card');
const cardDummyText = document.getElementById('card-dummy-text');
const clapContainer = document.getElementById('clap-container');
const phaseBar = document.getElementById('phase-bar');
const flashOverlay = document.getElementById('flash-overlay');
const shockwave = document.getElementById('shockwave');
const feverOverlay = document.getElementById('fever-overlay');
const multVal = document.getElementById('mult-val');
const omegaVal = document.getElementById('omega-val');
const bestScoreTitle = document.getElementById('best-score-title');

// ハイスコア読み込み
let highScore = parseInt(localStorage.getItem('ccp_high_score') || '0', 10);
bestScoreTitle.innerText = highScore.toLocaleString();

// ==========================================
// 背景ワープ＆ネオン火花Canvasエンジン
// ==========================================
const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
let stars = [];
let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

for (let i = 0; i < 85; i++) {
    stars.push({
        x: (Math.random() - 0.5) * canvas.width * 2,
        y: (Math.random() - 0.5) * canvas.height * 2,
        z: Math.random() * canvas.width,
        color: ['#00ffff', '#ff007f', '#ffea00', '#ffffff'][Math.floor(Math.random() * 4)]
    });
}

function spawnParticles(x, y, colorHex, count = 24) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 10;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            size: 3 + Math.random() * 5,
            color: colorHex,
            alpha: 1.0,
            decay: 0.02 + Math.random() * 0.025
        });
    }
}

function renderCanvasLoop() {
    // 残像を残すクリア
    ctx.fillStyle = feverLevel >= 2 ? 'rgba(20, 4, 30, 0.35)' : (feverLevel === 1 ? 'rgba(12, 8, 28, 0.4)' : 'rgba(8, 8, 17, 0.45)');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const warpSpeed = isPlaying ? (feverLevel === 3 ? 28 : feverLevel === 2 ? 18 : feverLevel === 1 ? 11 : 2.5) : 1.0;

    // ワープスター描画
    stars.forEach(s => {
        const prevZ = s.z;
        s.z -= warpSpeed;
        if (s.z <= 1) {
            s.z = canvas.width;
            s.x = (Math.random() - 0.5) * canvas.width * 2;
            s.y = (Math.random() - 0.5) * canvas.height * 2;
            return;
        }
        const sx = cx + (s.x / s.z) * 320;
        const sy = cy + (s.y / s.z) * 320;
        const px = cx + (s.x / prevZ) * 320;
        const py = cy + (s.y / prevZ) * 320;

        ctx.strokeStyle = feverLevel > 0 ? s.color : 'rgba(0, 255, 255, 0.45)';
        ctx.lineWidth = feverLevel > 0 ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();
    });

    // パーティクル火花描画
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // 重力
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
    }

    // スコアのドラムロール回転アニメーション
    if (displayedScore < score) {
        const diff = score - displayedScore;
        displayedScore += Math.max(1, Math.ceil(diff * 0.25));
        if (displayedScore > score) displayedScore = score;
        scoreVal.innerText = displayedScore.toLocaleString();
    }

    requestAnimationFrame(renderCanvasLoop);
}
requestAnimationFrame(renderCanvasLoop);

// ==========================================
// キーボード入力サポート（PC快適プレイ＆即リトライ）
// ==========================================
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key >= '0' && e.key <= '9' && isPlaying) {
        const num = parseInt(e.key, 10);
        const btn = document.querySelector(`.key[data-key="${num}"]`);
        if (btn) {
            btn.classList.add('key-pressed');
            setTimeout(() => btn.classList.remove('key-pressed'), 100);
        }
        handleInput(num, null);
    } else if ((e.key === ' ' || e.key === 'Enter') && !isPlaying && ! document.getElementById('result-modal').classList.contains('hidden')) {
        e.preventDefault();
        retryGame();
    }
});

// ==========================================
// ゲーム進行管理
// ==========================================
function startGame(bpm) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initMasterAudio();

    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);

    baseBpm = bpm;
    currentBpm = bpm;
    updateTempoVar();

    score = 0; displayedScore = 0; combo = 0; maxCombo = 0; lives = 3; timeLeft = 30.00;
    beatCount = 0; omegaStreak = 0;
    feverLevel = 0; pendingFeverLevel = 0; pendingBpmIncrease = 0;
    isPlaying = true; isAnswered = true; isRecovering = false;

    ui.classList.remove('shake', 'fever-active', 'overdrive-active');
    clapContainer.innerHTML = '';
    scoreVal.innerText = '0';
    bgComboWatermark.innerText = '';
    colorCard.style.backgroundColor = '#fff';
    colorCard.style.color = '#111';
    cardDummyText.innerText = 'READY';

    updateUI();
    resetPhaseBar();

    settings.classList.add('hidden');
    ui.classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');

    nextQuestion();
    timerIntervalId = setInterval(updateTimer, 100);
    expectedTime = performance.now();
    runBeat();
}

function retryGame() {
    startGame(baseBpm);
}

function backToTitle() {
    isPlaying = false;
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);
    feverLevel = 0; pendingFeverLevel = 0;
    ui.classList.remove('shake', 'fever-active', 'overdrive-active');
    document.getElementById('result-modal').classList.add('hidden');
    ui.classList.add('hidden');
    settings.classList.remove('hidden');
    bestScoreTitle.innerText = highScore.toLocaleString();
}

function updateTempoVar() {
    beatMs = 60000 / currentBpm;
    bpmDisplay.innerText = `BPM ${currentBpm}`;
}

function getMultiplier() {
    if (feverLevel === 3) return 10;
    if (feverLevel === 2) return 5;
    if (feverLevel === 1) return 3;
    return 1;
}

function updateTimer() {
    if (!isPlaying) return;
    if (timeLeft > 0) {
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
            timeLeft = 0;
            if (baseBpm >= 160 && feverLevel > 0) {
                // EXTREME延長戦（SUDDEN DEATH）
            } else {
                endGame("TIME UP!");
                return;
            }
        }
    } else {
        if (feverLevel === 0) {
            endGame("TIME UP!");
            return;
        }
    }
    updateUI();
}

function updateUI() {
    if (timeLeft <= 0 && baseBpm >= 160 && feverLevel > 0) {
        timeDisplay.innerText = "∞ OVER";
        timeDisplay.style.color = '#ff007f';
    } else {
        timeDisplay.innerText = timeLeft.toFixed(2);
        timeDisplay.style.color = timeLeft <= 5.0 ? '#ff2a55' : '#fff';
    }

    let hearts = "";
    for (let i = 0; i < lives; i++) hearts += "❤️";
    heartsDisplay.innerText = hearts;

    if (combo >= 1) {
        comboDisplay.innerText = `${combo} COMBO!`;
        comboDisplay.style.display = 'block';
        bgComboWatermark.innerText = combo;
    } else {
        comboDisplay.style.display = 'none';
        bgComboWatermark.innerText = '';
    }

    multVal.innerText = `x${getMultiplier()}`;
    multVal.style.color = feverLevel >= 2 ? '#ffea00' : (feverLevel === 1 ? '#ff007f' : '#00ffff');

    let starsStr = '';
    for (let i = 0; i < 3; i++) starsStr += (i < omegaStreak) ? '★' : '☆';
    omegaVal.innerText = starsStr;
    omegaVal.style.color = omegaStreak === 2 ? '#ffea00' : '#00ffff';
}

function nextQuestion() {
    currentTarget = colors[Math.floor(Math.random() * colors.length)];

    // ストループ効果トラップ（8コンボ以降、35%の確率でダミーの文字を表示して脳を惑わす）
    colorCard.classList.remove('stroop-trap');
    currentDummyText = '';
    if (combo >= 8 && Math.random() < 0.35) {
        const fakeColor = colors[Math.floor(Math.random() * colors.length)];
        if (fakeColor.val !== currentTarget.val) {
            currentDummyText = Math.random() < 0.5 ? fakeColor.name : String(fakeColor.val);
            colorCard.classList.add('stroop-trap');
        }
    }
}

function triggerFlash(color = '#ffffff', opacity = 0.55) {
    flashOverlay.style.backgroundColor = color;
    flashOverlay.style.opacity = String(opacity);
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 60);
}

function triggerShockwave() {
    shockwave.classList.remove('shockwave-anim');
    void shockwave.offsetWidth; // リフロー強制
    shockwave.classList.add('shockwave-anim');
}

function applyFeverVisuals() {
    if (feverLevel === 0) {
        ui.classList.remove('fever-active', 'overdrive-active');
    } else if (feverLevel === 1) {
        ui.classList.add('fever-active');
        ui.classList.remove('overdrive-active');
        feverOverlay.innerText = '🔥 FEVER TIME!! x3 🔥';
    } else if (feverLevel === 2) {
        ui.classList.add('fever-active');
        ui.classList.remove('overdrive-active');
        feverOverlay.innerText = '⚡ SUPER FEVER!! x5 ⚡';
    } else if (feverLevel >= 3) {
        ui.classList.add('fever-active', 'overdrive-active');
        feverOverlay.innerText = '🌈 OVERDRIVE!! x10 🌈';
    }
}

// ==========================================
// 拍進行エンジン（小節頭同期により裏返りゼロ）
// ==========================================
function runBeat() {
    if (!isPlaying || isRecovering) return;

    const phase = beatCount % 4;
    const bar = Math.floor(beatCount / 4);

    if (phase === 0) {
        // 前小節で未回答だった場合のタイムアウト判定
        if (beatCount > 0 && !isAnswered) {
            handleMiss("TOO SLOW!");
            return;
        }
        isAnswered = false;

        // ★重要：予約されていたFEVER昇格＆BPM加速を「小節の1拍目」に完全同期して適用
        if (pendingFeverLevel !== feverLevel) {
            const isLevelUp = pendingFeverLevel > feverLevel;
            feverLevel = pendingFeverLevel;
            applyFeverVisuals();
            if (isLevelUp) {
                playPowerUpSound(feverLevel);
                triggerFlash('#ffea00', 0.7);
                triggerShockwave();
            }
        }
        if (pendingBpmIncrease > 0) {
            currentBpm = Math.min(280, currentBpm + pendingBpmIncrease);
            pendingBpmIncrease = 0;
            updateTempoVar();
        }

        // 1拍目：キック＆出題カード表示
        playKickSound();
        playGrooveBeat(bar, phase, feverLevel, combo);
        pulseContainer();

        resetPhaseBar();
        colorCard.style.backgroundColor = currentTarget.hex;
        colorCard.style.color = currentTarget.text;
        cardDummyText.innerText = currentDummyText;
        colorCard.animate([
            { transform: 'scale(0.82) translateY(-8px)', opacity: 0.3 },
            { transform: 'scale(1) translateY(0)', opacity: 1 }
        ], { duration: 130, easing: 'ease-out' });

        clapContainer.innerHTML = '<span class="clap-item">👏</span><span class="clap-item">👏</span>';

    } else if (phase === 1) {
        // 2拍目：1回目のクラップ
        playClapSound();
        playGrooveBeat(bar, phase, feverLevel, combo);
        if (!isAnswered) {
            const items = clapContainer.querySelectorAll('.clap-item');
            if (items.length > 0) items[0].classList.add('clap-visible');
        }

    } else if (phase === 2) {
        // 3拍目：2回目のクラップ＆キック＆タイミングバー収束開始
        playClapSound();
        playKickSound();
        playGrooveBeat(bar, phase, feverLevel, combo);
        pulseContainer();

        if (!isAnswered) {
            const items = clapContainer.querySelectorAll('.clap-item');
            if (items.length > 1) items[1].classList.add('clap-visible');
            startPhaseBar(beatMs * 2);
        }

    } else if (phase === 3) {
        // 4拍目：回答ターゲット拍
        playGrooveBeat(bar, phase, feverLevel, combo);
        if (!isAnswered) {
            clapContainer.innerHTML = '<span class="sharp-text" style="color:#00ffff;">GO!!</span>';
            playTone(880, 'sine', 0.08, 0, 0.25);
        }
    }

    beatCount++;
    expectedTime += beatMs;
    let delay = expectedTime - performance.now();
    if (delay < 0) {
        expectedTime = performance.now();
        delay = 0;
    }
    beatTimerId = setTimeout(runBeat, delay);
}

function pulseContainer() {
    ui.classList.add('beat-pulse');
    setTimeout(() => ui.classList.remove('beat-pulse'), 90);
}

function resetPhaseBar() {
    phaseBar.style.transition = 'none';
    phaseBar.style.width = '0%';
}

function startPhaseBar(duration) {
    phaseBar.style.transition = `width ${duration}ms linear`;
    requestAnimationFrame(() => {
        phaseBar.style.width = '100%';
    });
}

// ==========================================
// 回答入力＆判定処理
// ==========================================
function handleInput(num, event) {
    if (!isPlaying || isRecovering || isAnswered) return;

    // スマホ用微細バイブレーション
    if (navigator.vibrate) navigator.vibrate(12);

    const phase = (beatCount - 1) % 4;
    if (phase === 0 || phase === 1) {
        isAnswered = true;
        clapContainer.innerHTML = '<span class="sharp-text" style="color:#ff2a55; font-size:1.6rem;">EARLY!</span>';
        handleMiss("EARLY!");
        return;
    }

    isAnswered = true;
    const maskWidth = phaseBar.getBoundingClientRect().width;
    const parentWidth = phaseBar.parentElement.getBoundingClientRect().width;
    const percentage = 100 - ((maskWidth / parentWidth) * 100);

    phaseBar.style.transition = 'none';
    phaseBar.style.width = (100 - percentage) + '%';

    if (num === currentTarget.val) {
        combo++;
        if (combo > maxCombo) maxCombo = combo;

        // 次の小節頭で発動するFEVERレベルを予約（ここではbeatCountをリセットしない！）
        if (combo >= 25) pendingFeverLevel = 3;
        else if (combo >= 15) pendingFeverLevel = 2;
        else if (combo >= 5) pendingFeverLevel = 1;
        else pendingFeverLevel = 0;

        if (feverLevel > 0) {
            pendingBpmIncrease += 4; // 次の小節頭でBPM加速
        }

        // タイミング3段階判定（Ω PERFECT / GREAT / GOOD）
        let baseScore = 50, okText = "GOOD!", okColor = "#00c6ff", isPerfect = false;

        if (percentage >= 44.0 && percentage <= 56.0) {
            baseScore = 150;
            isPerfect = true;
            okText = "Ω PERFECT!!";
            omegaStreak++;
            if (omegaStreak >= 3) {
                omegaStreak = 0;
                timeLeft = Math.min(45.0, timeLeft + 1.5);
                okText = "Ω EXTEND +1.5s!!";
                triggerShockwave();
            }
        } else if (percentage >= 33.33 && percentage <= 66.66) {
            baseScore = 100;
            okText = feverLevel > 0 ? "FEVER GREAT!!" : "GREAT!!";
            okColor = feverLevel > 0 ? "#ffea00" : "#00e676";
        } else {
            okText = feverLevel > 0 ? "FEVER GOOD!" : "GOOD!";
            okColor = feverLevel > 0 ? "#ff9100" : "#00c6ff";
        }

        const bpmMultiplier = currentBpm / 100;
        const feverMult = getMultiplier();
        const gainedScore = Math.floor((baseScore * bpmMultiplier * feverMult) + (combo * 15 * bpmMultiplier));
        score += gainedScore;

        // 視聴覚フィードバック炸裂
        playSuccessSound(combo, isPerfect);
        triggerFlash(isPerfect ? '#ffea00' : '#ffffff', isPerfect ? 0.65 : 0.35);

        ui.classList.remove('hit-shake');
        void ui.offsetWidth;
        ui.classList.add('hit-shake');

        comboDisplay.classList.remove('combo-active');
        void comboDisplay.offsetWidth;
        comboDisplay.classList.add('combo-active');

        // カラーカードに正解フィードバック表示
        cardDummyText.innerText = `${currentTarget.val} [${currentTarget.name}]`;

        if (isPerfect) {
            clapContainer.innerHTML = `<span class="sharp-text rainbow-text" style="font-size:1.75rem;">${okText}</span>`;
        } else {
            clapContainer.innerHTML = `<span class="sharp-text" style="color:${okColor}; font-size:1.75rem; text-shadow:0 0 12px ${okColor};">${okText}</span>`;
        }

        // 火花パーティクル＆フローティングスコア生成
        const cardRect = colorCard.getBoundingClientRect();
        const px = event && event.clientX ? event.clientX : (cardRect.left + cardRect.width / 2);
        const py = event && event.clientY ? event.clientY : (cardRect.top + cardRect.height / 2);
        spawnParticles(px, py, currentTarget.hex === '#0a0a0a' ? '#00ffff' : currentTarget.hex, isPerfect ? 36 : 18);
        spawnFloatingScore(px, py, gainedScore, isPerfect);

        updateUI();
        nextQuestion();
    } else {
        clapContainer.innerHTML = '<span class="sharp-text" style="color:#ff2a55; font-size:2.4rem;">✖ MISS!</span>';
        handleMiss("MISS!");
    }
}

function spawnFloatingScore(x, y, pts, isPerfect) {
    const el = document.createElement('div');
    el.className = 'floating-score';
    el.innerText = `+${pts.toLocaleString()}`;
    if (isPerfect) {
        el.style.fontSize = '1.8rem';
        el.style.color = '#00ffff';
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
}

// ==========================================
// ミス＆ゲームオーバー処理
// ==========================================
function handleMiss(reason) {
    if (isRecovering) return;
    if (navigator.vibrate) navigator.vibrate([40, 30, 60]);

    if (timeLeft <= 0) {
        playTone(140, 'sawtooth', 0.4);
        playTone(98, 'sawtooth', 0.4);
        endGame("FINISHED!");
        return;
    }

    isRecovering = true;
    combo = 0;
    omegaStreak = 0;
    feverLevel = 0;
    pendingFeverLevel = 0;
    pendingBpmIncrease = 0;
    currentBpm = baseBpm;
    updateTempoVar();
    applyFeverVisuals();

    ui.classList.add('shake');
    setTimeout(() => ui.classList.remove('shake'), 400);
    triggerFlash('#ff0044', 0.6);
    playTone(140, 'sawtooth', 0.35);
    playTone(98, 'sawtooth', 0.4);

    lives--;
    updateUI();

    if (lives <= 0) {
        endGame("GAME OVER");
        return;
    }

    clearTimeout(beatTimerId);
    clapContainer.innerHTML = `<span class="sharp-text" style="color:#ff2a55; font-size:1.8rem;">${reason}</span>`;
    colorCard.style.backgroundColor = '#2c3e50';
    colorCard.style.color = '#fff';
    cardDummyText.innerText = 'WAIT...';
    resetPhaseBar();

    recoveryTimerId = setTimeout(() => {
        if (!isPlaying) return;
        isRecovering = false;
        beatCount = 0;
        expectedTime = performance.now();
        nextQuestion();
        runBeat();
    }, 1200);
}

function endGame(msg) {
    isPlaying = false;
    clearTimeout(beatTimerId);
    clearInterval(timerIntervalId);
    clearTimeout(recoveryTimerId);
    phaseBar.style.transition = 'none';
    feverLevel = 0;
    pendingFeverLevel = 0;
    applyFeverVisuals();
    ui.classList.remove('shake');

    // ハイスコア更新チェック
    const badge = document.getElementById('result-badge');
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('ccp_high_score', String(highScore));
        badge.innerText = '🎉 NEW RECORD!! 🎉';
    } else {
        badge.innerText = 'RESULT';
    }

    // ランク＆「あと何点で次のランクか」のニアミス煽り計算
    const ranks = [
        { name: 'Ω (GOD)', min: 60000, color: '#00ffff' },
        { name: 'SSS',     min: 35000, color: '#ff007f' },
        { name: 'SS',      min: 20000, color: '#ffea00' },
        { name: 'S',       min: 10000, color: '#ff9100' },
        { name: 'A',       min: 6000,  color: '#ff2a55' },
        { name: 'B',       min: 3500,  color: '#00c6ff' },
        { name: 'C',       min: 1500,  color: '#00e676' },
        { name: 'D',       min: 0,     color: '#78909c' }
    ];

    let currentRank = ranks[ranks.length - 1];
    let nextRank = null;
    for (let i = 0; i < ranks.length; i++) {
        if (score >= ranks[i].min) {
            currentRank = ranks[i];
            nextRank = i > 0 ? ranks[i - 1] : null;
            break;
        }
    }

    document.getElementById('result-title').innerText = msg;
    document.getElementById('result-score').innerText = score.toLocaleString();
    document.getElementById('result-combo').innerText = maxCombo;

    const rankEl = document.getElementById('result-rank');
    rankEl.innerText = currentRank.name;
    rankEl.style.color = currentRank.color;

    const hintEl = document.getElementById('next-rank-hint');
    if (nextRank) {
        const diff = nextRank.min - score;
        hintEl.innerText = `NEXT RANK [${nextRank.name}] まで あと ${diff.toLocaleString()} pt!!`;
    } else {
        hintEl.innerText = `最高ランク到達！圧倒的カラーコードマスター！`;
    }

    document.getElementById('result-modal').classList.remove('hidden');
}
