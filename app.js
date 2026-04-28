// app.js

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

// 音声ファイルを1つ鳴らす関数．awaitのためにPromiseのインスタンスを返す．
const audioCache = {}; // 音声のキャッシュ
function playSignalSound(fileName) {
    // Promiseは，非同期処理の状態や結果を表現するオブジェクト．
    return new Promise((resolve) => {
        if (!audioCache[fileName]) {
            audioCache[fileName] = new Howl({
                src: [fileName],
                preload: true,
                // もし読み込みや再生中にエラーが起きても，isAnnouncingVoiceがスタックしないよう強制的にresolveして次に進める．
                onloaderror: () => { console.warn('Load Error:', fileName); resolve(); },
                onplayerror: () => { console.warn('Play Error:', fileName); resolve(); }
            });
        }

        const sound = audioCache[fileName];

        sound.once('end', () => { resolve(); }); // onceにより，コールバック関数は一度使用したら破棄する．onだとどんどん溜まっていく．
        sound.play();
    });
}

// --- メイン処理ココカラ ---

const playButton = document.getElementById('playButton');
const beepGen = new BeepGenerator();

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

let isAnnouncingVoice = false; // 読み上げ中のフラグ

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
        getVoicePath('h', 'at_the_tone'),
        getVoicePath('h', `${targetHour}`),
        getVoicePath('h', `${hourUnit}`),
        getVoicePath('h', `${targetMinute}`),
        getVoicePath('h', `${minuteUnit}`),
        getVoicePath('h', 'jst')
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
async function playBeep() {
    console.log('[Beep] 1200Hz Beep at exactly 0 seconds.');
    beepGen.play(1200, 800); // awaitしない．
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
            const currentSec = exactNow.getSeconds();
            console.log(currentSec);

            if (currentSec === 0) { playBeep(); } // 0秒になった瞬間 -> ビープ音
            if (currentSec === 46) { playVoiceSequence(); } // 46秒になった瞬間 -> "At the tone..."

            tick(); // 再帰呼び出しによる無限ループ
        }, delayToNextSecond);
    }

    tick(); // 初回のループを起動
}

playButton.addEventListener('click', async () => {
    // ブラウザの制約への対応：ユーザーがボタンを押したタイミングでAudioContextを起動・再開する．
    if (beepGen.audioCtx.state === 'suspended') {
        await beepGen.audioCtx.resume();
    }

    // 無音の無限ループをスタートさせ，ブラウザに「タブが音楽を再生中だ」と誤認させる．
    beepGen.startKeepAlive();

    playButton.disabled = true;
    playButton.innerText = "Monitoring time...";

    startScheduler(); // 監視スタート
});

// --- メイン処理ココマデ ---
