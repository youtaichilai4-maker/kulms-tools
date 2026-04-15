# kulms-tools

**京大生のための KULMS 自動化ツールキット**

KULMS (Sakai LMS) の締切リマインド・授業資料の自動同期・CLI ツール連携をワンセットで提供する OSS です。

- Chrome 拡張機能で KULMS サイト上に**締切リマインダー**を表示
- ワンクリックで全授業データを JSON エクスポート
- Python スクリプトで授業資料を**差分ダウンロード**し、ローカルにコース別ディレクトリを自動生成
- [Claude Code](https://claude.ai/claude-code)、[Codex CLI](https://github.com/openai/codex) 等の AI CLI ツールと組み合わせることで、課題の整理・要約・取り組みを自動化できる

> 京大の学生なら誰でも使えます。改善アイデアや PR を歓迎します。

---

## クイックスタート

```bash
git clone https://github.com/youtaichilai4-maker/kulms-tools.git
cd kulms-tools
```

### 1. Chrome 拡張機能をインストール

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」→ `extension/` フォルダを選択

### 2. エクスポート

1. [KULMS](https://lms.gakusei.kyoto-u.ac.jp) にログイン
2. 拡張機能のポップアップ or サイドパネルで **「エクスポート」** ボタンをクリック
3. `kulms-export-YYYY-MM-DD.json` が `~/Downloads/` に自動保存される

### 3. ローカル同期

```bash
python kulms-sync.py
```

これだけ。引数なしで `~/Downloads` から最新の JSON を自動検出し、`courses/` に授業ディレクトリと資料を同期します。

```
courses/
  電磁エネルギー学/
    README.md                ← コース情報
    resources/
      1 イントロ.pdf          ← 自動ダウンロード済み
      Part I.pdf
    assignments/
      413課題/
        README.md            ← 締切・課題内容
  物理化学特論/
    ...
```

出力先を変えたい場合:

```bash
python kulms-sync.py kulms-export-2026-04-15.json courses/m1-2026-spring
```

---

## 機能一覧

### Chrome 拡張機能 (`extension/`)

| 機能 | 説明 |
|---|---|
| 締切リマインド | KULMS サイト上にサイドパネルで課題・小テストの締切を一覧表示。緊急度別に色分け |
| バッジ通知 | 24時間以内の締切数をアイコンバッジで表示 |
| コースデータ エクスポート | 全サイトの課題・資料メタデータ・小テスト情報を JSON で一括出力 |
| 認証情報の同梱 | セッション Cookie を JSON に含め、ローカルスクリプトでの資料ダウンロードを可能にする |

### 同期スクリプト (`kulms-sync.py`)

| 機能 | 説明 |
|---|---|
| 自動検出 | `~/Downloads` から最新の export JSON を自動で見つける |
| ディレクトリ生成 | コースごとに `resources/`, `assignments/` を自動作成 |
| 差分ダウンロード | ローカルに無いファイル → DL、サイズ変更 → 再DL、同一 → スキップ |
| 課題情報の保存 | 締切・課題内容を `assignments/*/README.md` に書き出し |
| 自動クリーンアップ | 処理後に Cookie 入り JSON を自動削除 |

---

## AI CLI ツールとの連携

エクスポートされたコース情報と資料がローカルにあることで、AI CLI ツールから直接アクセスできます。

### Claude Code での例

```bash
cd courses/電磁エネルギー学

# 課題内容を確認して取り組む
claude "assignments/413課題/README.md を読んで、レポートの構成案を作って"

# 講義資料を要約
claude "resources/ の PDF を読んで、今週の講義内容をまとめて"
```

### Codex CLI での例

```bash
codex "courses/ 内の全課題から、今週締切のものを一覧にして"
```

ローカルにファイルがあるからこそ、これらのツールがコンテキストとして読み込める。KULMS のブラウザ画面を行き来する必要はありません。

---

## 差分同期の仕組み

```
KULMS (リモート)              ローカル (courses/)
  lecture01.pdf  100KB    →   lecture01.pdf  100KB   ... スキップ
  lecture02.pdf  200KB    →   lecture02.pdf  150KB   ... 再ダウンロード (更新)
  lecture03.pdf  300KB    →   (存在しない)            ... 新規ダウンロード
```

毎回エクスポート → `python kulms-sync.py` するだけで、新しい資料だけが追加されます。

---

## セキュリティ

| 対策 | 内容 |
|---|---|
| `.gitignore` | `kulms-export-*.json` と `courses/*/` をリポジトリから除外 |
| セッション有効期限 | Cookie に `expiresAt` (30分) を付与。期限切れなら DL をスキップ |
| 自動削除 | スクリプトは処理完了後に JSON ファイルを削除 |
| 短命セッション | Sakai のセッションは30〜60分の無操作で失効。漏洩リスクは限定的 |

**courses/ の中身（PDF・ノート）と export JSON は git に含まれません。** リポジトリを fork/clone しても他人のデータは見えません。

---

## リポジトリ構成

```
kulms-tools/
  extension/           Chrome 拡張機能 (Manifest V3)
    manifest.json
    background.js      API 通信・エクスポート・バッジ更新
    content.js         サイドパネル UI
    popup.js / .html   ポップアップ UI
    styles.css         パネルスタイル
    popup.css          ポップアップスタイル
  courses/             授業ディレクトリ (gitignored)
  kulms-sync.py        ローカル同期スクリプト (Python 3, stdlib のみ)
  docs/adr/            Architecture Decision Records
```

---

## 動作要件

- Chrome (Manifest V3 対応)
- Python 3.7+
- 京都大学 KULMS アカウント

外部パッケージのインストールは不要です。

---

## Contributing

京大生の開発者を歓迎します。

- バグ報告・機能要望 → [Issues](https://github.com/youtaichilai4-maker/kulms-tools/issues)
- コード改善 → Pull Request を送ってください

### 改善アイデアの例

- [ ] 資料の自動ダウンロード（Native Messaging で ~/Downloads を経由しない）
- [ ] 締切の Google Calendar / Apple Calendar 連携
- [ ] KULMS のお知らせ・掲示板の取得
- [ ] 成績情報の取得と可視化
- [ ] CLI から直接エクスポートできるようにする（ヘッドレス認証）

一緒に京大の学習体験を良くしましょう。

---

## License

MIT
