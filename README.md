# kulms-tools

京都大学 KULMS (Sakai LMS) の授業データ管理ツール。

## 構成

```
extension/       Chrome 拡張機能 — 締切通知 + コースデータ エクスポート
kulms-sync.py    エクスポート JSON → ローカル同期スクリプト
courses/         授業ディレクトリ (gitignored)
docs/adr/        設計判断の記録
```

## セットアップ

### 1. Chrome 拡張機能をインストール

1. `chrome://extensions` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」→ `extension/` を選択

### 2. 使い方

```bash
# KULMS にログイン → 拡張機能の「エクスポート」ボタン → JSON を保存

# 同期実行 (~/Downloads から自動検出)
python kulms-sync.py

# 出力先を指定
python kulms-sync.py kulms-export-2026-04-15.json courses/m1-2026-spring
```

## 差分同期

- ローカルに無いファイル → ダウンロード
- サイズが異なるファイル → 再ダウンロード (更新検出)
- 既存で同サイズ → スキップ

## セキュリティ

- エクスポート JSON にはセッション Cookie が含まれる (30分で失効)
- `.gitignore` で JSON と courses 内容をリポジトリから除外
- スクリプトは処理後に JSON を自動削除
