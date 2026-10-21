const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// マスターバス（コンプレッサー＋ピンポンディレイで音圧と空間感を強化）
let masterBus = null;
let delayNode = null;
let famicomPulse = null;

function initMasterAudio() {
    if (masterBus) return;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, audioCtx.currentTime);
    compressor.knee.setValueAtTime(12, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(6, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.15, audioCtx.currentTime);

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;

    // 空間系ショートディレイ（シンセリードの奥行き用）
    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.14;
    const delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.25;
    const delayFilter = audioCtx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2800;

    delayNode.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayFilter.connect(compressor);

    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);
    masterBus = masterGain;
}

function getMasterBus() {
    initMasterAudio();
    return masterBus;
}

// 25%パルス波生成
function getFamicomPulse() {
    if (!famicomPulse) {
        const real = new Float32Array(32);
        const imag = new Float32Array(32);
        const duty = 0.25;
        for (let i = 1; i < 32; i++) {
            real[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
        }
        famicomPulse = audioCtx.createPeriodicWave(real, imag);
    }
    return famicomPulse;
}

// デチューンSuperSaw＋パルス波ハイブリッドシンセ
function playSuperSynth(freq, startTime, duration, vol = 0.12, useDelay = false) {
    const bus = getMasterBus();
    const detunes = [-7, 0, 7]; // 3本重ねで分厚いシンセ音に
    detunes.forEach((d, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        if (idx === 1) {
            osc.setPeriodicWave(getFamicomPulse());
        } else {
            osc.type = 'sawtooth';
        }
        osc.frequency.setValueAtTime(freq, startTime);
        osc.detune.setValueAtTime(d, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol / detunes.length, startTime + 0.01);
        gain.gain.setValueAtTime(vol / detunes.length, startTime + duration * 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(bus);
        if (useDelay && delayNode && idx === 0) {
            gain.connect(delayNode);
        }

        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    });
}

function playFamicomNoise(timeOffset, duration, filterFreq, vol) {
    const bus = getMasterBus();
    const start = audioCtx.currentTime + timeOffset;
    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(vol, start);
    gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(bus);
    noiseSource.start(start);
}

function playTone(freq, type = 'sine', duration = 0.1, timeOffset = 0, vol = 0.4) {
    const bus = getMasterBus();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime + timeOffset;

    if (type === 'square') {
        osc.setPeriodicWave(getFamicomPulse());
        osc.frequency.setValueAtTime(freq, now);
    } else {
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
    }

    osc.connect(gain);
    gain.connect(bus);

    osc.start(now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.stop(now + duration + 0.02);
}

// パンチのあるクラップ＆スネアレイヤー
function playClapSound() {
    playFamicomNoise(0, 0.09, 1400, 0.7);
    playTone(240, 'triangle', 0.05, 0, 0.35);
}

// EDM風の重低音4つ打ちキック（260Hz→42Hzの急速ピッチドロップ＋アタッククリック）
function playKickSound() {
    const bus = getMasterBus();
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.22);

    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.25);

    // アタックのクリック感
    playFamicomNoise(0, 0.015, 3500, 0.25);
}

// 正解時の和音＆クリティカルSE
function playSuccessSound(comboCount, isPerfect = false) {
    const baseFreq = 587.33; // D5 (BGMのDmキーに完全調和)
    const scaleSteps = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 22, 24];
    const stepIndex = Math.min(comboCount, scaleSteps.length - 1);
    const freq = baseFreq * Math.pow(2, scaleSteps[stepIndex] / 12);

    const now = audioCtx.currentTime;
    playSuperSynth(freq, now, 0.16, 0.22, true);
    playSuperSynth(freq * 1.5, now + 0.03, 0.2, 0.16, true); // 5度ハモり

    if (isPerfect) {
        // Ω PERFECT時は高音のキラキラアルペジオを追加
        playSuperSynth(freq * 2, now + 0.05, 0.25, 0.22, true);
        playTone(freq * 3, 'sine', 0.25, 0.08, 0.25);
    }
}

// FEVER突入・進化ファンファーレ
function playPowerUpSound(level = 1) {
    const start = audioCtx.currentTime;
    const pitchMult = level >= 2 ? 1.25 : 1.0;
    const freqs = [293.66, 349.23, 440.00, 587.33, 698.46, 880.00, 1174.66].map(f => f * pitchMult);

    freqs.forEach((freq, i) => {
        playSuperSynth(freq, start + i * 0.045, 0.14, 0.2, true);
    });
}

// コンボ数とFEVER段階に応じてリアルタイム進化・転調するBGMエンジン
function playGrooveBeat(bar, phase, feverLevel, combo) {
    const bus = getMasterBus();
    const stepDuration = (beatMs / 1000) / 4;
    const barMod4 = bar % 4;
    const isDm7 = (barMod4 === 0 || barMod4 === 2);

    // OVERDRIVE時はキーが半音〜1音上がる（転調による脳汁ブースト）
    const keyShiftSemitones = feverLevel >= 3 ? 2 : (feverLevel === 2 ? 1 : 0);
    const pitchShift = Math.pow(2, keyShiftSemitones / 12);

    // ベースライン周波数
    let bassFreqDown, bassFreqUp;
    if (isDm7) {
        const downBeats = [146.83, 146.83, 146.83, 146.83];
        const upBeats   = [293.66, 220.00, 293.66, 261.63];
        bassFreqDown = downBeats[phase] * pitchShift;
        bassFreqUp = upBeats[phase] * pitchShift;
    } else {
        const downBeats = [130.81, 130.81, 130.81, 130.81];
        const upBeats   = [261.63, 196.00, 261.63, 246.94];
        bassFreqDown = downBeats[phase] * pitchShift;
        bassFreqUp = upBeats[phase] * pitchShift;
    }

    // 通常時（0〜4コンボ）でもクールなサブベース＆ハイハットを鳴らしてグルーヴを維持
    for (let i = 0; i < 4; i++) {
        const start = audioCtx.currentTime + (i * stepDuration);

        // ハイハット刻み
        const isOffbeat = (i === 2);
        if (feverLevel > 0 || combo >= 2 || isOffbeat) {
            playFamicomNoise(i * stepDuration, isOffbeat ? 0.05 : 0.025, isOffbeat ? 5000 : 8500, isOffbeat ? 0.14 : 0.05);
        }

        // ベース（ルート＋オクターブ＋サブベース重ね）
        if (i % 2 === 0) {
            const freqB = (i === 0) ? bassFreqDown : bassFreqUp;
            
            // アタック感のあるSawベース（ローパスフィルター付き）
            const oscB = audioCtx.createOscillator();
            const filterB = audioCtx.createBiquadFilter();
            const gainB = audioCtx.createGain();

            oscB.type = feverLevel > 0 ? 'sawtooth' : 'triangle';
            oscB.frequency.setValueAtTime(freqB * 0.5, start); // 1オクターブ下の重低音

            filterB.type = 'lowpass';
            filterB.frequency.setValueAtTime(feverLevel > 0 ? 950 : 450, start);
            filterB.frequency.exponentialRampToValueAtTime(160, start + stepDuration * 1.6);

            const bassVol = feverLevel > 0 ? 0.28 : 0.2;
            gainB.gain.setValueAtTime(bassVol, start);
            gainB.gain.exponentialRampToValueAtTime(0.001, start + stepDuration * 1.8);

            oscB.connect(filterB);
            filterB.connect(gainB);
            gainB.connect(bus);
            oscB.start(start);
            oscB.stop(start + stepDuration * 1.9);
        }

        // 3〜4コンボ（FEVERリーチ時）：期待感を煽る高速16分アルペジオ
        if (feverLevel === 0 && combo >= 3) {
            const arpNotes = isDm7 ? [293.66, 349.23, 440.00, 587.33] : [261.63, 329.63, 392.00, 523.25];
            playTone(arpNotes[i] * pitchShift, 'square', stepDuration * 0.7, i * stepDuration, 0.07);
        }
    }

    // FEVER未突入ならここで終了（リードメロディは温存）
    if (feverLevel === 0) return;

    // --- ここからFEVER時のフルバンド・スーパーシンセ展開 ---
    let chord1, chord2;
    if (barMod4 === 0)      { chord1 = 261.63; chord2 = 349.23; }
    else if (barMod4 === 1) { chord1 = 246.94; chord2 = 329.63; }
    else if (barMod4 === 2) { chord1 = 349.23; chord2 = 440.00; }
    else                    { chord1 = 329.63; chord2 = 392.00; }

    chord1 *= pitchShift;
    chord2 *= pitchShift;

    const melodies = [
        [587.33, 698.46, 880.00, 0, 1046.50, 0, 880.00, 0, 698.46, 587.33, 698.46, 0, 783.99, 0, 880.00, 0],
        [0, 783.99, 0, 659.25, 0, 523.25, 587.33, 0, 659.25, 0, 783.99, 0, 659.25, 523.25, 0, 0],
        [880.00, 0, 1046.50, 0, 1174.66, 1046.50, 880.00, 0, 783.99, 0, 698.46, 0, 783.99, 698.46, 587.33, 0],
        [659.25, 587.33, 523.25, 587.33, 0, 659.25, 0, 783.99, 0, 880.00, 0, 1046.50, 1046.50, 0, 0, 0]
    ];

    const rhythmPatterns = [
        [1, 1, 1, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 0],
        [1, 0, 1, 0]
    ];
    const currentRhythm = rhythmPatterns[phase];

    for (let i = 0; i < 4; i++) {
        const start = audioCtx.currentTime + (i * stepDuration);

        // バッキング和音スタブ
        if (currentRhythm[i] !== 0) {
            playSuperSynth(chord1, start, stepDuration * 0.65, 0.07, false);
            playSuperSynth(chord2, start, stepDuration * 0.65, 0.07, false);
        }

        // メインリードメロディ（SuperSaw＋ディレイ）
        const stepInMeasure = phase * 4 + i;
        const rawFreq = melodies[barMod4][stepInMeasure];
        if (rawFreq !== 0) {
            const melodyFreq = rawFreq * pitchShift;
            playSuperSynth(melodyFreq, start, stepDuration * 0.75, 0.18, true);

            // OVERDRIVE（Lv3）時は1オクターブ上の煌びやかなハモリを追加
            if (feverLevel >= 3) {
                playTone(melodyFreq * 2, 'square', stepDuration * 0.6, i * stepDuration, 0.08);
            }
        }
    }
}
