# Coders Follow the Sun

世界中のGitHub開発活動が太陽と共に地球を一周することを実データで可視化するWebアプリ。
GH Archive 2012-2014年の公開イベントから抽出した実際のコミット位置情報を3D地球儀上に24時間タイムラプスで表示します。

**メッセージ**: 地球はコードで眠らない。

## Quick Start

```bash
# 1. データ取得（GH Archive 2012-2014, 夏至±7日 × 1008ファイル, 約1-2GB）
python3 scripts/download.py

# 2. ジオタグ付きイベント抽出
python3 scripts/extract.py

# 3. 都市名→緯度経度変換（GeoNames cities1000 を使用）
python3 scripts/geocode.py

# 4. 24時間ビン集計
python3 scripts/aggregate.py

# 5. 起動
docker compose up -d
# → http://localhost:8888
```

## データ源

- **GH Archive**: https://gharchive.org/
- **GeoNames cities1000**: https://download.geonames.org/export/dump/cities1000.zip

詳細は `doc/` を参照。

## English

A visualization of how worldwide GitHub coding activity follows the sun across a 24-hour cycle, built from real GH Archive event data (2012-2014). The Earth never sleeps — somewhere on the globe, code is always being written.
