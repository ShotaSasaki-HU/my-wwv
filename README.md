# my-wwh

## `h_jst.mp3`の生成
1. hasanbasbunar/Voice-Cloning-XTTS-v2で綺麗な"Japan Standard Time."を生成
2. ffmpegでエイジング加工
```sh
ffmpeg -i h_jst_orig.mp3 \
-filter_complex "anoisesrc=color=pink:amplitude=0.012 [noise]; \
[0:a] aresample=10000, highpass=f=400, lowpass=f=3000, volume=1.5 [voice]; \
[voice][noise] amix=inputs=2:duration=first [mixed]; \
[mixed] volume=3.0 [out]" \
-map "[out]" h_jst.mp3
```
