// Web Audio APIを使ったビープ音生成クラス
class BeepGenerator {
    constructor() {
        // AudioContextは，ブラウザ内の仮想的な音響ミキサー．
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    /**
     * 指定した周波数と長さでビープ音を鳴らす
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

// 音を1つ鳴らして終わるまで待つ関数．Promiseのインスタンスを返す．
function playSignalSound(fileName) {
    // Promiseは，非同期処理の状態や結果を表現するオブジェクト．
    return new Promise((resolve) => {
        const sound = new Howl({
            src: [fileName],
            onend: () => { resolve(); } // 音が最後まで再生された時の処理
        });
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

// asyncで非同期関数にする．awaitが使えるようになる．
playButton.addEventListener('click', async () => {
    // ブラウザの制約への対応：ユーザーがボタンを押したタイミングでAudioContextを起動・再開する．
    if (beepGen.audioCtx.state === 'suspended') {
        await beepGen.audioCtx.resume();
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // 正しい単位（単数形／複数形）の決定
    const hourUnit = getPluralSuffix(currentHour, 'hour');
    const minuteUnit = getPluralSuffix(currentMinute, 'minute');

    const playlist = [
        getVoicePath('h', 'at_the_tone'),
        getVoicePath('h', `${currentHour}`),
        getVoicePath('h', `${hourUnit}`),
        getVoicePath('h', `${currentMinute}`),
        getVoicePath('h', `${minuteUnit}`),
        getVoicePath('h', 'jst')
    ];

    console.log('Playing voice sequence...');

    for (const fileName of playlist) {
        // awaitは，Promiseオブジェクトが値を返すのを待つ演算子．
        // Promiseオブジェクトが値を返すまで，この関数のみ一時停止する．他のUI操作などは止まらないよ．
        await playSignalSound(fileName);
    }

    console.log('Playing beep...')

    await beepGen.play(1200, 800); // 毎分のビープ音: 1000Hz, 800ms

    console.log('Announcement finished.');
});

// --- メイン処理ココマデ ---
