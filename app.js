const playButton = document.getElementById('playButton');

playButton.addEventListener('click', () => {
    const now = new Date();
    const currentHour = now.getHours(); // 0-23

    const hourFileName = `./voice_clips/v_${currentHour}.mp3`;
    console.log('Now playing:', hourFileName)

    const hourSound = new Howl({
        src: [hourFileName]
    });

    hourSound.play();
});
