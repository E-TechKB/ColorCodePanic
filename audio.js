const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ファミコン実機の波形エミュレート（25%パルス波）
let famicomPulse = null;
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

function playFamicomNoise(timeOffset, duration, filterFreq, vol) {
    const start = audioCtx.currentTime + timeOffset;
    const bufferSize = audioCtx.sampleRate * duration;
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
    gainNode.connect(audioCtx.destination);
    noiseSource.start(start);
}

function playTone(freq, type = 'sine', duration = 0.1, timeOffset = 0, vol = 0.5) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    if (type === 'square') {
        osc.setPeriodicWave(getFamicomPulse()); 
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + timeOffset + 0.1);
    } else {
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + timeOffset);
    }
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime + timeOffset;
    osc.start(now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.stop(now + duration);
}

function playClapSound() {
    playFamicomNoise(0, 0.1, 1200, 0.8);
}

function playKickSound() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

function playSuccessSound(comboCount) {
    const baseFreq = 880; 
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const stepIndex = Math.min(comboCount, steps.length - 1);
    const freq = baseFreq * Math.pow(2, steps[stepIndex] / 12);
    playTone(freq, 'sine', 0.2, 0, 0.4);
    playTone(freq * 1.5, 'triangle', 0.3, 0.05, 0.2);
}

function playPowerUpSound() {
    const start = audioCtx.currentTime;
    const freqs = [329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    
    freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.setPeriodicWave(getFamicomPulse()); 
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, start + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.1, start + i * 0.08 + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + i * 0.08 + 0.08);
        
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(start + i * 0.08);
        osc.stop(start + i * 0.08 + 0.1);
    });
}

// 無敵状態 (スター) 風のFamicomジェネレーター
function playInvincibleBeat(bar, phase, timeOffset = 0) {
    const stepDuration = (beatMs / 1000) / 4; 
    
    const barMod4 = bar % 4;
    const isDm7 = (barMod4 === 0 || barMod4 === 2);

    // ベースライン
    let bassFreqDown, bassFreqUp;
    if (isDm7) {
        const downBeats = [146.83, 146.83, 146.83, 146.83]; // D3
        const upBeats   = [293.66, 220.00, 293.66, 261.63]; // D4, A3...
        bassFreqDown = downBeats[phase];
        bassFreqUp = upBeats[phase];
    } else {
        const downBeats = [130.81, 130.81, 130.81, 130.81]; // C3
        const upBeats   = [261.63, 196.00, 261.63, 246.94]; // C4, G3...
        bassFreqDown = downBeats[phase];
        bassFreqUp = upBeats[phase];
    }

    // 和音バッキング (スタブ)
    let chord1, chord2;
    if (barMod4 === 0) {
        chord1 = 261.63; // C4
        chord2 = 349.23; // F4
    } else if (barMod4 === 1) {
        chord1 = 246.94; // B3
        chord2 = 329.63; // E4
    } else if (barMod4 === 2) {
        chord1 = 349.23; // F4
        chord2 = 440.00; // A4
    } else {
        chord1 = 329.63; // E4
        chord2 = 392.00; // G4
    }

    // 4小節の動的なメロディライン (16ステップの周波数配列、0は休符)
    const melodies = [
        // 1小節目: Dm上で駆け上がるフレーズ (コール)
        // タタタ(休)タ(休)タ(休)タタタ(休)タ(休)タ(休)
        [587.33, 698.46, 880.00, 0, 1046.50, 0, 880.00, 0, 698.46, 587.33, 698.46, 0, 783.99, 0, 880.00, 0],

        // 2小節目: Cmaj上で裏拍からリズミカルに下降するフレーズ (レスポンス)
        // (休)タ(休)タ(休)タタ(休)タ(休)タ(休)タタ(休)(休)
        [0, 783.99, 0, 659.25, 0, 523.25, 587.33, 0, 659.25, 0, 783.99, 0, 659.25, 523.25, 0, 0],

        // 3小節目: スケールを上り詰めて高音でテンションを煽る
        // タ(休)タ(休)タタタ(休)タ(休)タ(休)タタタ(休)
        [880.00, 0, 1046.50, 0, 1174.66, 1046.50, 880.00, 0, 783.99, 0, 698.46, 0, 783.99, 698.46, 587.33, 0],

        // 4小節目: 次のループへ向けたキメのリズム
        // タタタタ(休)タ(休)タ(休)タ(休)タタ(休)(休)(休)
        [659.25, 587.33, 523.25, 587.33, 0, 659.25, 0, 783.99, 0, 880.00, 0, 1046.50, 1046.50, 0, 0, 0]
    ];

    // バッキング特有のシンコペーションリズム
    const rhythmPatterns = [
        [1, 1, 1, 0], 
        [1, 0, 1, 0], 
        [1, 1, 1, 0], 
        [1, 0, 1, 0]  
    ];
    const currentRhythm = rhythmPatterns[phase];
    const pulseWave = getFamicomPulse();

    for(let i=0; i<4; i++) {
        const start = audioCtx.currentTime + timeOffset + (i * stepDuration);
        
        // ハイハット・スネア風ノイズ
        const isBackbeat = (i % 2 !== 0); 
        playFamicomNoise(timeOffset + (i * stepDuration), isBackbeat ? 0.06 : 0.03, isBackbeat ? 4000 : 8000, isBackbeat ? 0.15 : 0.05);

        // --- バッキング和音 (一定のシンコペーションリズムで刻む) ---
        if (currentRhythm[i] !== 0) {
            const oscC1 = audioCtx.createOscillator(); const gainC1 = audioCtx.createGain();
            const oscC2 = audioCtx.createOscillator(); const gainC2 = audioCtx.createGain();
            
            oscC1.setPeriodicWave(pulseWave); oscC1.frequency.value = chord1;
            oscC2.setPeriodicWave(pulseWave); oscC2.frequency.value = chord2;

            gainC1.gain.setValueAtTime(0.06, start);
            gainC1.gain.setValueAtTime(0.06, start + stepDuration * 0.5);
            gainC1.gain.linearRampToValueAtTime(0, start + stepDuration * 0.6);

            gainC2.gain.setValueAtTime(0.06, start);
            gainC2.gain.setValueAtTime(0.06, start + stepDuration * 0.5);
            gainC2.gain.linearRampToValueAtTime(0, start + stepDuration * 0.6);

            oscC1.connect(gainC1); gainC1.connect(audioCtx.destination);
            oscC2.connect(gainC2); gainC2.connect(audioCtx.destination);

            oscC1.start(start); oscC1.stop(start + stepDuration);
            oscC2.start(start); oscC2.stop(start + stepDuration);
        }

        // --- リードメロディ (配列に従って独立して動く) ---
        const stepInMeasure = phase * 4 + i;
        const melodyFreq = melodies[barMod4][stepInMeasure];

        if (melodyFreq !== 0) {
            const oscM = audioCtx.createOscillator(); const gainM = audioCtx.createGain();
            
            oscM.setPeriodicWave(pulseWave); oscM.frequency.value = melodyFreq;

            gainM.gain.setValueAtTime(0.18, start);
            gainM.gain.setValueAtTime(0.18, start + stepDuration * 0.5);
            gainM.gain.linearRampToValueAtTime(0, start + stepDuration * 0.6);

            oscM.connect(gainM); gainM.connect(audioCtx.destination);
            oscM.start(start); oscM.stop(start + stepDuration);
        }

        // --- ベースライン ---
        if (i % 2 === 0) {
            const oscB = audioCtx.createOscillator();
            const gainB = audioCtx.createGain();
            oscB.type = 'triangle';
            
            oscB.frequency.value = (i === 0) ? bassFreqDown : bassFreqUp;

            gainB.gain.setValueAtTime(0.25, start);
            gainB.gain.setValueAtTime(0.25, start + stepDuration * 1.2);
            gainB.gain.linearRampToValueAtTime(0, start + stepDuration * 1.8);

            oscB.connect(gainB); gainB.connect(audioCtx.destination);
            oscB.start(start); oscB.stop(start + stepDuration * 2);
        }
    }
}