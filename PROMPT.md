# 要求仕様: Coders Follow the Sun - 世界が起きてコードを書く24時間

## 概要

GH Archive (https://gharchive.org) の 2012-2014年公開GitHubイベントから取得した実コミット位置データを使い、世界中の開発活動を24時間タイムラプスで可視化するWebアプリ。同時に日照ターミネータ（昼夜境界線）を西進させ、「**地球はいつもどこかでコードが書かれている**」というメッセージを伝える。

「Coders of Earth」シリーズのパイロット版。

## 目的

- 実データで「世界の開発活動が太陽と共に地球を一周する」事実を可視化
- YouTubeショート向けに、テック層＋一般層に刺さる驚き＋自分ごと感のフックを提供

## メッセージ

> **地球はいつもどこかでコードが書かれている。**

## データ仕様

### データソース

- **GH Archive**: https://data.gharchive.org/YYYY-MM-DD-HH.json.gz
- 2012-2014年限定（2015年以降はactor.location廃止）
- パイロット集計期間: **2012-2014 各年の6/14〜6/27（夏至±7日）**

### 抽出

- 各イベントの `actor_attributes.location` 文字列を取得（カバレッジ約50%）
- `created_at` の時刻部分のみ抽出（UTC, GitHub HQ -07:00 を UTC変換）
- 1時間ごとに「{location文字列, count}」に集計

### 位置→緯度経度変換（geocoding）

- GeoNames `cities1000.txt`（無料・公開、約14万都市）を gazetteer として使用
- マッチング順: 完全一致 → 主要都市別名（"NYC"等）→ 国名
- ヒット率目標: **70%以上**

### 想定データ規模

- 3年 × 14日 × 24時間 × 各時刻に数千〜数万イベント
- location付きで**約600万件**、geocoding後で約400万件
- 24時間に折り畳んで「典型的な1日」として表示

## 機能要件

### 必須機能

1. **0秒目フレーム設計（最重要）**
    - 0秒目から地球儀＋ターミネータ＋既に光るアジア・欧州が見える
    - 巨大テロップ「**地球はコードで眠らない**」を1コマ目から表示
    - ローディング画面禁止

2. **3D地球儀ビュー（Three.js）**
    - 漆黒背景 #000000、大陸はネオン縁取り
    - ゆっくり自転、または24時間ループに合わせて1周

3. **日照ターミネータ表示**
    - 夏至を基準日に固定、SunCalc.js で計算
    - 黄〜橙の発光ラインで描画、24hで地球一周

4. **イベント発光ドット**
    - 表示時刻に対応する位置でドットがフラッシュ発光（瞬間的）
    - 直近30分の残光フェードで「波」を演出
    - 都市別ヒートマップ（活動密度の高い地点ほど大きく明るく）

5. **HUD（常時動く数値）**
    - UTC時刻 + 主要都市ローカル時刻（東京/NY/ロンドン/シドニー）
    - 累積コミット数カウンタ
    - 「現在最もアクティブな都市」TOP3
    - 「コードを書いている国 N地域」

6. **9:16 縦長レイアウト**
    - YouTubeショート用
    - 上部HUD・中央地球儀・下部メッセージ/CTAの3段構成

### 追加機能

- 主要都市ラベル（東京・NY・SF・ロンドン・ベルリン）
- ピーク時の脈動アニメ
- 終盤の決め台詞 + CTA「あなたは何時にコードを書いてる？」

## 技術仕様

### コンテナ

- Docker 必須
- ポート: **8888**（Claude Code）
- nginx で静的配信、`templates/nginx.conf` 参照

### バックエンド（オフライン処理）

- Python 3
- `scripts/download.py` … GH Archive 1008ファイルをDL
- `scripts/extract.py` … gzip展開＋location抽出
- `scripts/geocode.py` … cities1000で緯度経度変換
- `scripts/aggregate.py` … 24時間ビン化 → `src/data/activity-24h.json`

### フロントエンド

- Three.js（地球儀）
- カスタムシェーダー / Pointsで発光ドット
- SunCalc.js でターミネータ計算
- バニラJS、軽量

### 中間データ

- `data/raw/*.json.gz` … 生データ
- `data/extracted.jsonl` … 抽出後（時刻＋location文字列）
- `data/geocoded.jsonl` … 緯度経度付き
- `src/data/activity-24h.json` … フロント用最終データ（時刻×緯度経度×count）

## UI/UXガイドライン

- 漆黒背景＋ネオン発光
- 重要テキスト14px以上、タイトル24px以上
- 重要テキストは画面**左寄り**、上下は中央寄り（ショート安全域）
- 3秒に1度以上の視覚変化

## 想定動画構成（参考、30秒に縛らない）

- 0-3秒: フック「地球はコードで眠らない」＋既に光る地球儀
- 3-15秒: 24時間1周目、波の西進
- 15-25秒: 主要都市ハイライト、ピーク時刻
- 25秒〜: 決め台詞 + CTA

## 参考

- GH Archive: https://www.gharchive.org/
- GeoNames cities1000: https://download.geonames.org/export/dump/cities1000.zip
- SunCalc.js: https://github.com/mourner/suncalc
- Three.js: https://threejs.org/
