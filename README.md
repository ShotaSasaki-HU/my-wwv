# my-wwh
時間の見当識をサポートする時報アプリ

https://shotasasaki-hu.github.io/my-wwv/

## 概要
「何時に何をすればいいか分かっているのに、動き出せない」「いつの間にか時間が過ぎている」といったお悩みの解決をサポートするために開発しました。

短波ラジオの標準電波（WWV/WWVH）のようなレトロな雰囲気で、正確な日本標準時（JST）をアナウンスし続けます。

## 主な機能
- **正確な時報**: 毎分0秒にビープ音を鳴らします。
- **音声アナウンス**: 毎分52秒から「At the tone...」に続く時刻読み上げを開始します。
- **JST固定**: デバイスの設定に関わらず、常に日本標準時（JST）を基準に動作します。
- **スリープ防止**: 監視中は画面が自動で暗くならないようロックをかけ、常に時計を確認できる状態を保ちます。

## 使い方
1. iPhoneのSafari等で [my-wwh](https://shotasasaki-hu.github.io/my-wwv/) を開きます。
2. 「Start Monitoring」ボタンをタップします。
3. **iPhoneのサイレントスイッチ（マナーモード）をオフ**にし、スマホスタンド等に立てかけて使用してください。
   - ※ホーム画面に追加（PWA）して使用すると、よりアプリ感覚で快適に使えます。

## 技術的なポイント
- **Web Audio API**: ブラウザの再生制限を回避するため、全ての音声をAudioBufferとしてメモリに展開して再生しています。
- **自己補正タイマー**: `setTimeout`のズレをミリ秒単位で計算し、常に正確なタイミングで音声を再生します。
- **音声のエイジング**: AIで生成したクリアな音声をあえて劣化させ、実際のナレーター風の質感に加工しています。

## クレジット（Credits）
本アプリで使用しているベースの音声ファイルは、以下のリポジトリから拝借しています。
- [kalafut/wwv](https://github.com/kalafut/wwv) (WWV Simulator)<br>
  Copyright (c) 2019 Jim Kalafut<br>
  Licensed under the MIT License.

## 音声素材 `h_jst.mp3` の生成
本アプリの特徴である"Japan Standard Time."の音声は、以下の手順で作成されました。

1. **AI生成**: `hasanbasbunar/Voice-Cloning-XTTS-v2` を使用して音声を生成。
2. **エイジング加工**: `ffmpeg` を使用し、帯域制限とピンクノイズの合成を行いました。

```sh
ffmpeg -i h_jst_orig.mp3 \
-filter_complex "anoisesrc=color=pink:amplitude=0.012 [noise]; \
[0:a] aresample=10000, highpass=f=400, lowpass=f=3000, volume=1.5 [voice]; \
[voice][noise] amix=inputs=2:duration=first [mixed]; \
[mixed] volume=3.0 [out]" \
-map "[out]" h_jst.mp3
```
