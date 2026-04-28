const playButton = document.getElementById('playButton');

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

// asyncで非同期関数にする．awaitが使えるようになる．
playButton.addEventListener('click', async () => {
    const now = new Date();
    const currentHour = now.getHours();

    const clips_path = './voice_clips/'
    const playlist = [
        clips_path + 'v_at_the_tone.mp3',
        clips_path + `v_${currentHour}.mp3`,
        clips_path + 'v_hours.mp3'
    ];

    console.log('Playing sequence:', playlist);

    for (const fileName of playlist) {
        // awaitは，Promiseオブジェクトが値を返すのを待つ演算子．
        // Promiseオブジェクトが値を返すまで，この関数のみ一時停止する．他のUI操作などは止まらないよ．
        await playSignalSound(fileName);
    }

    console.log('Announcement finished.');
});
