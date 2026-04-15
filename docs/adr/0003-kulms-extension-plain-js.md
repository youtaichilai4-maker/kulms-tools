# ADR-0003: KULMS Deadline Notifier を Plain JS（ビルドステップなし）で実装

- **Status**: accepted
- **Date**: 2026-04-09
- **Deciders**: yutaakase, Claude

## Context

京都大学 KULMS の課題締切通知 Chromium 拡張機能を開発するにあたり、技術スタックを選定する必要があった。拡張機能は個人利用ツールであり、ファイル数は 8 程度の小規模プロジェクト。

## Decision

Plain JavaScript（ES2022+）でビルドステップなしに実装する。Manifest V3 の Service Worker + Content Script 構成で、`chrome://extensions` から直接読み込む。

## Consequences

**メリット:**
- ビルド不要 — 編集→リロードで即反映、開発サイクルが最速
- 依存関係ゼロ — node_modules 不要、`package.json` 不要
- Chromium DevTools で直接デバッグ可能
- 拡張機能の規模（8ファイル）に対して適切な複雑さ

**デメリット:**
- 型チェックなし — ランタイムエラーの発見が遅れる可能性
- モジュール分割が制限される（Service Worker と Content Script 間でコード共有しづらい）
- コードが成長した場合のリファクタリングコストが高い

**許容理由:**
- 個人ツールであり、コードベースの成長は限定的
- Sakai REST API のレスポンス構造はシンプルで、型の恩恵が小さい

## Alternatives Considered

### TypeScript + Webpack
- 型安全性とモジュール分割が得られるが、ビルドステップ・npm依存が必要
- 8ファイルの拡張機能にはオーバーエンジニアリング
- **却下理由**: 開発の摩擦がメリットを上回る

### TypeScript + esbuild
- Webpack より高速だが、依然としてビルドステップが必要
- **却下理由**: 同上
