const playButton = document.getElementById('playButton');

// Howler.jsを使った音声ファイルの準備
const testSound = new Howl({
    src: ['./voice_clips/v_at_the_tone.mp3']
});

playButton.addEventListener('click', () => {
    console.log("The button was pushed.")
    testSound.play();
});
