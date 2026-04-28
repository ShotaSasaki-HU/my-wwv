// app.js

// ==========================================
// 1. Classes & Blueprints
// ==========================================

// Web Audio APIを使ったビープ音生成クラス
class BeepGenerator {
    constructor() {
        // AudioContextは，ブラウザ内の仮想的な音響ミキサー．
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.keepAliveOsc = null; // 無音ループ用のオシレータ
    }

    // 無音ループでブラウザを騙してスリープを防ぐメソッド
    startKeepAlive() {
        if (this.keepAliveOsc) return; // 既に動いていたら何もしない．

        this.keepAliveOsc = this.audioCtx.createOscillator();
        const silentGain = this.audioCtx.createGain();

        silentGain.gain.value = 0; // 無音

        this.keepAliveOsc.connect(silentGain);
        silentGain.connect(this.audioCtx.destination);

        this.keepAliveOsc.start(); // 無音を永遠に再生し続ける．
    }

    /**
     * 指定した周波数と長さでビープ音を鳴らすメソッド
     * @param {number} frequency - 周波数（Hz） 例: 1000
     * @param {number} durationMs - 長さ（ミリ秒） 例: 800
     * @returns {Promise} 音が鳴り終わると解決するPromise
     */
    play(frequency, durationMs) {
        return new Promise((resolve) => {
            const oscillator = this.audioCtx.createOscillator(); // 波の発生源
            const gainNode = this.audioCtx.createGain(); // ゲインノード（音量調整つまみ）

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gainNode.gain.value = 0.5;

            // ケーブルを繋ぐイメージ: 発生源 -> 音量調整 -> スピーカー出力
            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            oscillator.start(); // 再生開始

            // 指定した時間が経過したら音を停止
            setTimeout(() => {
                oscillator.stop();
                resolve();
            }, durationMs);
        });
    }
}

// ==========================================
// 2. Global State & Instances
// ==========================================
const playButton = document.getElementById('playButton');
const beepGen = new BeepGenerator();
const audioBufferCache = {}; // デコード済みの波形データのキャッシュ
let isAnnouncingVoice = false; // 読み上げ中のフラグ

const stationButtons = document.getElementsByName('stationButton');
let station = 'h';
for (let i = 0; i < stationButtons.length; i++) {
    if (stationButtons.item(i).checked) {
        station = stationButtons.item(i).value;
        break;
    }
}

// ==========================================
// 3. Helper Functions
// ==========================================

// 音声ファイルへのパスを組み立てるヘルパー関数
function getVoicePath(station, clipName) {
    const basePath = './voice_clips/'
    return `${basePath}${station}_${clipName}.mp3`
}

// 数値が単数形か複数形かを判定して単語に接尾辞を追加するヘルパー関数
function getPluralSuffix(value, word) {
    return value === 1 ? word : word + 's'; // 0は一般的に複数形
}

// 実行環境に依存せず日本標準時のDateオブジェクトを生成するヘルパー関数
function getJSTDate() {
    const now = new Date();
    // getTimezoneOffset()はUTCとの差分を「分」で返すため，ミリ秒に変換して加算する．
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    return new Date(utcTime + (60 * 60 * 1000 * 9)); // JST
}

// ==========================================
// 4. Core Logic
// ==========================================

// 音声ファイルをダウンロードしWeb Audio API用の波形データに変換してキャッシュする関数
// asyncがついているので，この関数は「Promiseを返す関数」に自動変換される．
async function loadAudioBuffer(fileName) {
    if (audioBufferCache[fileName]) {
        return audioBufferCache[fileName];
    }

    try {
        const response = await fetch(fileName);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await beepGen.audioCtx.decodeAudioData(arrayBuffer); // audioCtxはbeepGenから拝借
        audioBufferCache[fileName] = audioBuffer;
        return audioBuffer;
    } catch (error) {
        console.error("Failed to load or decode audio:", fileName, error);
        return null;
    }
}

// キャッシュされた波形データを使って音声を再生する関数
// awaitのためにPromiseのインスタンスを返す．
function playSignalSound(fileName) {
    return new Promise(async (resolve) => {
        const buffer = await loadAudioBuffer(fileName); // 音声データ

        if (!buffer) {
            resolve(); // 読み込み失敗時はスキップして次へ
            return;
        }

        const source = beepGen.audioCtx.createBufferSource(); // 音声データの再生機
        source.buffer = buffer;
        source.connect(beepGen.audioCtx.destination);

        source.onended = () => { resolve(); }; // 再生終了時のイベント
        source.start(); // 再生開始
    });
}

// 現在時刻のアナウンスを鳴らす関数
// asyncで非同期関数にする．awaitが使えるようになる．
async function playVoiceSequence() {
    if (isAnnouncingVoice) { return; }; // 既に読み上げ中なら，新しい読み上げはキャンセルする．
    isAnnouncingVoice = true;

    const now = getJSTDate();
    // 声は「0秒より前」に鳴り始めるため，読み上げるべき時間は「次の分」である．
    now.setMinutes(now.getMinutes() + 1);

    const targetHour = now.getHours();
    const targetMinute = now.getMinutes();

    // 正しい単位（単数形／複数形）の決定
    const hourUnit = getPluralSuffix(targetHour, 'hour');
    const minuteUnit = getPluralSuffix(targetMinute, 'minute');

    const playlist = [
        getVoicePath(station, 'at_the_tone'),
        getVoicePath(station, `${targetHour}`),
        getVoicePath(station, `${hourUnit}`),
        getVoicePath(station, `${targetMinute}`),
        getVoicePath(station, `${minuteUnit}`),
        getVoicePath(station, 'jst')
    ];

    console.log(`[Voice] Starting sequence for ${targetHour}:${targetMinute}...`);

    for (const fileName of playlist) {
        // awaitは，Promiseオブジェクトが値を返すのを待つ演算子．
        // Promiseオブジェクトが値を返すまで，この関数のみ一時停止する．他のUI操作などは止まらないよ．
        await playSignalSound(fileName);
    }

    isAnnouncingVoice = false;
}

// ビープ音を鳴らす関数
function playBeep() {
    console.log('[Beep] 1200Hz Beep at exactly 0 seconds.');
    beepGen.play(1200, 800); // awaitしない．
}

function playIdent(station) {
    console.log('[Ident] Announcing identification...');
    playSignalSound(getVoicePath(station, 'ident_better'));
}

// 時間を監視する関数
function startScheduler() {
    console.log("Scheduler started...");

    function tick() {
        const now = getJSTDate();
        const seconds = now.getSeconds();
        const ms = now.getMilliseconds();

        const delayToNextSecond = 1000 - ms; // 次に秒数が切り替わるピッタリまでのミリ秒

        setTimeout(() => {
            const exactNow = getJSTDate();
            const currentMin = exactNow.getMinutes();
            const currentSec = exactNow.getSeconds();

            switch (currentSec) { // currentSecになった瞬間
                case 0:
                    playBeep();

                    if (currentMin === 0 || currentMin === 30) {
                        playIdent(station);
                    }
                    break;
                case 52:
                    playVoiceSequence();
                    break;
            }

            tick(); // 再帰呼び出しによる無限ループ
        }, delayToNextSecond);
    }

    tick(); // 初回のループを起動
}

// ==========================================
// 5. Entry Point
// ==========================================

playButton.addEventListener('click', async () => {
    // ブラウザの制約への対応：ユーザーがボタンを押したタイミングでAudioContextを起動・再開する．
    if (beepGen.audioCtx.state === 'suspended') {
        await beepGen.audioCtx.resume();
    }

    // 無音の無限ループをスタートさせ，ブラウザに「タブが音楽を再生中だ」と誤認させる．
    beepGen.startKeepAlive();

    playButton.disabled = true;
    playButton.innerText = "Monitoring time...";

    // よく使う音声を事前にメモリへ読み込み
    console.log("Preloading common audio files...");
    const commonFiles = [
        getVoicePath(station, 'at_the_tone'),
        getVoicePath(station, 'hour'),
        getVoicePath(station, 'hours'),
        getVoicePath(station, 'minute'),
        getVoicePath(station, 'minutes'),
        getVoicePath(station, 'jst')
    ];
    Promise.all(commonFiles.map(file => loadAudioBuffer(file))) // 並列で一気にロード
        .then(() => console.log("Preload complete."));

    startScheduler(); // 監視スタート
});
