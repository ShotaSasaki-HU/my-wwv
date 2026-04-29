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
        const trickGain = this.audioCtx.createGain();

        // 誰にも聞こえない超低周波（1Hz）を，ごく僅かな音量で鳴らし続ける．
        this.keepAliveOsc.type = 'sine';
        this.keepAliveOsc.frequency.value = 1; 
        trickGain.gain.value = 0.01;

        this.keepAliveOsc.connect(trickGain);
        trickGain.connect(this.audioCtx.destination);

        this.keepAliveOsc.start(); // 永遠に再生
        console.log("Keep-alive infrasound started.");
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
const pulseFreq = { 'v': 1000, 'h': 1200 }
const HOUR_PULSE_FREQ = 1500

const audioBufferCache = {}; // デコード済みの波形データのキャッシュ
let isAnnouncingVoice = false; // 読み上げ中のフラグ

let station = document.querySelector('input[name="stationButton"]:checked').value;
const stationButtons = document.getElementsByName('stationButton');
for (const radio of stationButtons) {
    radio.addEventListener('change', (event) => {
        station = event.target.value;
        console.log(`Station changed to: ${station}`);
    });
}

const clockTimeDisplay = document.getElementById('clock-time');

let wakeLock = null;

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

// 時計の表示を更新する関数
function updateLiveClock() {
    const now = getJSTDate();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockTimeDisplay.innerText = `${h}:${m}:${s}`;
}

// ==========================================
// 3.5 Web Worker (バックグラウンドタイマー)
// ==========================================
// メインスレッド（UI）が寝かされても別スレッドで正確に時を刻み続ける専用ワーカー
// CORSエラー回避のため，ファイルは1つにまとめたまま，ブラウザには別ファイルとして読み込ませる．
const workerCode = `
    let timerId = null;
    function tick() {
        // 次の0.000秒ぴったりまでの残りミリ秒を計算して待機
        const now = new Date(); // タイムゾーンに依存しない．
        const delay = 1000 - now.getMilliseconds();
        
        timerId = setTimeout(() => {
            postMessage('tick'); // メインスレッドに「時間だよ！」と通知
            tick(); // 無限ループ
        }, delay);
    }

    // メインスレッドからの指示を受け取る．
    self.onmessage = function(e) {
        if (e.data === 'start') {
            tick();
        } else if (e.data === 'stop') {
            clearTimeout(timerId);
        }
    };
`;
// 文字列をJavaScriptファイルとしてブラウザに認識させる．
const blob = new Blob([workerCode], { type: 'application/javascript' });
const timerWorker = new Worker(URL.createObjectURL(blob));

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

function playIdent(station) {
    console.log('[Ident] Announcing identification...');
    playSignalSound(getVoicePath(station, 'ident_better'));
}

// 時間を監視する関数
function startScheduler() {
    console.log("Scheduler started with Web Worker...");

    // 念のための重複実行防止フラグ
    // JSの「クロージャ」により，関数の中に作られたコールバック関数（timerWorker.onmessage）は，
    // 元環境の変数を保持するため前回のlastHandledSecondが消えない．
    // startScheduler自体はガベージコレクションされるが，このフラグはコールバック関数に紐付けて残される．
    let lastHandledSecond = -1;

    timerWorker.onmessage = function (e) {
        if (e.data === 'tick') {
            const exactNow = getJSTDate();
            const currentMin = exactNow.getMinutes();
            const currentSec = exactNow.getSeconds();

            // 同じ秒数で2回発火するのを防止
            if (currentSec === lastHandledSecond) return;
            lastHandledSecond = currentSec;

            updateLiveClock(); // 時計の表示を更新

            if (beepGen.audioCtx.state === 'suspended' || beepGen.audioCtx.state === 'interrupted') {
                beepGen.audioCtx.resume();
            }

            switch (currentSec) { // currentSec秒になった瞬間
                case 0:
                    if (currentMin === 0) {
                        beepGen.play(HOUR_PULSE_FREQ, 800);
                    } else {
                        beepGen.play(pulseFreq[station], 800);
                    }

                    if (currentMin === 0 || currentMin === 30) {
                        playIdent(station);
                    }
                    break;
                case 52:
                    playVoiceSequence();
                    break;
            }
        }
    };

    // ワーカーに計測開始を指示
    timerWorker.postMessage('start');
}

// 画面が自動でスリープするのを防ぐ機能（Wake Lock API）
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock is active.');

            // 別のアプリを開くなどしてWake Lockが解除された場合の再取得設定
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock was released.');
            });
        } else {
            console.warn('Screen Wake Lock API is not supported on this browser.');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// 画面が再び表示された（ロック解除された）時に発火するイベント
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        console.log("App became visible again.");

        // 1. 画面スリープ防止（Wake Lock）が切れていたら再取得
        if (typeof wakeLock !== 'undefined' && wakeLock !== null) {
            requestWakeLock();
        }

        // 2. オーディオエンジンがスリープさせられていたら叩き起こす．
        if (beepGen.audioCtx.state === 'suspended' || beepGen.audioCtx.state === 'interrupted') {
            try {
                await beepGen.audioCtx.resume();
                console.log("AudioContext resumed on visibility change.");
            } catch (e) {
                console.error("Failed to resume AudioContext:", e);
            }
        }
    }
});

// ユーザーが画面の「どこか」をタッチした瞬間に確実にオーディオエンジンを再開させる．
document.addEventListener('touchstart', () => {
    if (beepGen.audioCtx.state === 'suspended' || beepGen.audioCtx.state === 'interrupted') {
        beepGen.audioCtx.resume().then(() => {
            console.log("AudioContext resumed by user touch.");
        });
    }
}, { passive: true });

// iOS Safariのアクセシビリティによる強制ズーム（ピンチ・ダブルタップ）をイベントリスナーへの介入によってプログラム的に無効化する．
function preventIosZoom() {
    // ピンチイン・ピンチアウト（複数の指でのタッチ操作）の無効化
    document.addEventListener('touchmove', (event) => {
        if (event.touches.length > 1) {
            event.preventDefault(); // デフォルトの拡大縮小処理をキャンセル
        }
    }, { passive: false }); // preventDefaultを機能させるため，明示的にpassiveをfalseにする．

    // Safari独自のジェスチャーイベント（予期せぬズーム）の無効化
    document.addEventListener('gesturestart', (event) => {
        event.preventDefault();
    });
}

// ==========================================
// 5. Entry Point
// ==========================================

preventIosZoom();

// ページを開いた瞬間から時計だけは動かしておく．
setInterval(updateLiveClock, 1000);
updateLiveClock();

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

    // 監視スタート時に画面スリープ防止をオンにする．
    await requestWakeLock();

    startScheduler(); // 監視スタート
});
