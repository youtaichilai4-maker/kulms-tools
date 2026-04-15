# ADR-0006: コースデータ JSON エクスポート機能

## Status

Accepted

## Date

2026-04-15

## Context

KULMS 拡張機能で取得できる授業情報（サイト一覧・課題・資料・小テスト）をローカル環境と連携させたい。具体的には:

- 授業ごとのディレクトリ構造を自動生成
- 授業資料のローカルダウンロード
- ローカルとの差分検出による増分同期

これらを実現するために、拡張機能からローカルへデータを受け渡す仕組みが必要。

## Decision

### エクスポート方式: `chrome.downloads` + data URL

拡張機能から JSON ファイルをダウンロードする形でデータを受け渡す。

- `background.js` で Sakai REST API を一括取得
- `chrome.downloads.download()` で `data:application/json` URL として保存
- ファイル名: `kulms-export-YYYY-MM-DD.json`
- `saveAs: true` でユーザーが保存先を選択可能

### JSON スキーマ (version: 1)

```json
{
  "exportedAt": "ISO 8601",
  "version": 1,
  "baseUrl": "https://lms.gakusei.kyoto-u.ac.jp",
  "sites": [
    {
      "id": "site-uuid",
      "title": "授業名",
      "description": "",
      "type": "course",
      "assignments": [
        {
          "id": "", "title": "", "instructions": "",
          "dueDate": null, "openDate": null, "closeDate": null,
          "status": "", "submissionType": "", "url": "",
          "attachments": [{ "name": "", "url": "", "type": "", "size": 0 }]
        }
      ],
      "resources": [
        {
          "id": "", "name": "", "path": "",
          "type": "application/pdf", "size": 0,
          "url": "", "modifiedDate": null
        }
      ],
      "quizzes": [
        { "id": "", "title": "", "dueDate": null, "url": "" }
      ]
    }
  ]
}
```

### セッション Cookie の同梱

エクスポート JSON に KULMS の `JSESSIONID` を `_auth` フィールドとして含める。
ローカル skill がこの Cookie を使って資料を直接ダウンロードできる。

**安全策（3点セット）:**

1. **`.gitignore`** — `kulms-export-*.json` をリポジトリから除外
2. **`expiresAt` フィールド** — セッションの推定有効期限（エクスポート時刻 + 30分）を付与。ローカル skill は期限切れなら Cookie を使わない
3. **`_sensitive: true` フラグ** — ローカル skill は処理完了後にファイルを削除する契約

**リスク評価:**
- Sakai セッションは30〜60分の無操作で失効するため、漏洩時の影響は限定的
- ブラウザの Cookie DB にも同じ値が平文で保存されており、ローカルファイルが追加のリスク面を大きく広げるわけではない
- `.gitignore` によりリモートリポジトリへの漏洩を防止

### ローカル連携の方針

- **Phase 1（本 ADR）**: 拡張機能で JSON エクスポート（Cookie 同梱）
- **Phase 2**: ローカル skill が JSON を読み込み、ディレクトリ生成・差分同期・資料ダウンロード

## Alternatives Considered

### 1. Native Messaging Host

Chrome の Native Messaging でローカルプロセスと直接通信。

- Pro: リアルタイム双方向通信が可能
- Con: ネイティブホストの別途インストールが必要、セットアップが複雑
- Con: OS ごとにマニフェスト設定が異なる

### 2. ローカル HTTP サーバー

localhost にサーバーを立ててPOSTでデータを送信。

- Pro: プッシュ型でリアルタイム
- Con: 常時サーバー起動が必要
- Con: CORS 設定やポート管理が煩雑

### 3. クリップボード経由

JSON をクリップボードにコピーしてローカルで貼り付け。

- Pro: 追加権限不要
- Con: 大量データに不向き、手動操作が多い

## Consequences

- `downloads` + `cookies` 権限が manifest に追加される
- ユーザーはワンクリックで全コースデータ + 認証情報を JSON 取得可能
- ローカル skill は JSON ファイルを読むだけで良いため、拡張機能との結合度が低い
- Cookie 同梱により、ローカル skill が資料を直接ダウンロード可能（Phase 2 で実装）
- `.gitignore` + `_sensitive` フラグ + `expiresAt` の3点で安全性を担保
