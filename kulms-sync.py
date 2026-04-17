#!/usr/bin/env python3
"""KULMS エクスポート JSON → ディレクトリ同期 + 資料ダウンロード。

Usage:
    python kulms-sync.py [export.json] [出力ディレクトリ]

  export.json   省略時はリポジトリ内 → ~/Downloads の順で自動検出
  出力ディレクトリ 省略時はスクリプト隣の courses/

差分検出: ローカルに無い or サイズが異なる資料を自動ダウンロード。
処理後、_sensitive フラグ付き JSON は自動削除される。
"""
import json, sys, os, re
import urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone


SCRIPT_DIR = Path(__file__).resolve().parent


def find_export(args):
    if len(args) >= 1 and not args[0].startswith("-"):
        return Path(args[0]).expanduser()
    # リポジトリ内 → ~/Downloads の順で検索
    for search_dir in [SCRIPT_DIR, Path.home() / "Downloads"]:
        files = sorted(
            search_dir.glob("kulms-export-*.json"),
            key=os.path.getmtime,
            reverse=True,
        )
        if files:
            return files[0]
    return None


def out_dir(args):
    if len(args) >= 2:
        return Path(args[1]).expanduser()
    return SCRIPT_DIR / "courses"


def clean_title(title):
    """[2026前期月２]電磁エネルギー学 → 電磁エネルギー学"""
    return re.sub(r"^\[.*?\]\s*", "", title)


def sanitize(name):
    return "".join(c for c in name if c not in '\\/:*?"<>|').strip()


def needs_download(dest, remote_size):
    """差分検出: ファイルが無い or サイズ不一致なら True"""
    if not dest.exists():
        return "new"
    if remote_size and dest.stat().st_size != remote_size:
        return "updated"
    return None


def _is_html(ct, data):
    if "text/html" in ct:
        return True
    head = data[:50].lstrip()
    return head.startswith(b"<!DOCTYPE") or head.startswith(b"<html")


def _fetch(url, cookie):
    req = urllib.request.Request(url, headers={"Cookie": cookie})
    with urllib.request.urlopen(req) as r:
        return r.headers.get("Content-Type", ""), r.read()


def _accept_copyright(url, cookie):
    """Sakai 著作権同意を送信してリトライ可能にする。"""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    # /access/content/group/{siteId}/file → ref=/content/group/{siteId}/file
    path = parsed.path
    ref = path.replace("/access/content", "/content", 1)
    accept_url = f"{parsed.scheme}://{parsed.netloc}/access/accept?ref={ref}&url={path}"
    req = urllib.request.Request(accept_url, headers={"Cookie": cookie})
    try:
        urllib.request.urlopen(req)
        return True
    except Exception:
        return False


def dl(url, dest, cookie):
    try:
        ct, data = _fetch(url, cookie)
        if _is_html(ct, data):
            html = data.decode("utf-8", errors="ignore")
            if "login" in html.lower():
                print(f"    SKIP(認証切れ): {dest.name}")
                return False
            # 著作権同意を試行してリトライ
            if _accept_copyright(url, cookie):
                ct2, data2 = _fetch(url, cookie)
                if not _is_html(ct2, data2):
                    with open(dest, "wb") as f:
                        f.write(data2)
                    return True
            print(f"    SKIP(著作権同意失敗): {dest.name}")
            return False
        with open(dest, "wb") as f:
            f.write(data)
        return True
    except (urllib.error.URLError, OSError) as e:
        print(f"    FAIL: {e}")
        return False


def main():
    args = sys.argv[1:]
    path = find_export(args)
    if not path or not path.exists():
        print("kulms-export JSON が見つかりません。パスを引数で指定してください。")
        sys.exit(1)

    dest_root = out_dir(args)
    print(f"読込: {path}")
    print(f"出力: {dest_root}")
    data = json.loads(path.read_text(encoding="utf-8"))

    # Auth
    auth = data.get("_auth")
    cookie = None
    if auth and auth.get("cookie"):
        exp = datetime.fromisoformat(auth["expiresAt"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) < exp:
            cookie = auth["cookie"]
            print(f"認証: 有効 (期限 {auth['expiresAt']})")
        else:
            print("認証: 期限切れ — 資料DLスキップ")
    else:
        print("認証: なし — 資料DLスキップ")

    created = downloaded = updated = skipped = failed = 0
    pending_resources = 0
    dest_root.mkdir(parents=True, exist_ok=True)

    for site in data.get("sites", []):
        raw_title = site.get("title", "").strip()
        if not raw_title:
            continue

        title = clean_title(raw_title)
        sd = dest_root / sanitize(title)
        is_new = not sd.exists()
        for sub in ("resources", "assignments"):
            (sd / sub).mkdir(parents=True, exist_ok=True)

        readme = sd / "README.md"
        if not readme.exists():
            readme.write_text(
                f"# {title}\n\n{site.get('description', '')}\n",
                encoding="utf-8",
            )

        if is_new:
            created += 1
            print(f"  + {title}")

        # Resources
        resources = site.get("resources", [])
        for res in resources:
            name = res.get("name", "").strip()
            url = res.get("url", "")
            if not name or not url:
                continue
            dest = sd / "resources" / name
            reason = needs_download(dest, res.get("size"))
            if not reason:
                skipped += 1
                continue
            if not cookie:
                pending_resources += 1
                continue
            tag = "NEW" if reason == "new" else "UPD"
            print(f"    {tag}: {name}")
            if dl(url, dest, cookie):
                if reason == "new":
                    downloaded += 1
                else:
                    updated += 1
            else:
                failed += 1

        # Assignment README
        for a in site.get("assignments", []):
            a_name = sanitize(a.get("title", "untitled"))
            a_dir = sd / "assignments" / a_name
            a_dir.mkdir(parents=True, exist_ok=True)
            info = a_dir / "README.md"
            if not info.exists():
                due = ""
                if a.get("dueDate"):
                    due = datetime.fromtimestamp(
                        a["dueDate"] / 1000
                    ).strftime("%Y-%m-%d %H:%M")
                info.write_text(
                    f"# {a.get('title', '')}\n\n"
                    f"締切: {due}\n\n"
                    f"## 課題内容\n\n{a.get('instructions', '')}\n",
                    encoding="utf-8",
                )

    # Cleanup
    if data.get("_sensitive"):
        path.unlink()
        print(f"\n{path.name} を削除しました")

    print(f"\n--- 完了 ---")
    print(f"新規: {created}サイト  DL: {downloaded}  更新: {updated}  スキップ: {skipped}  失敗: {failed}")
    if pending_resources:
        print(f"未DL: {pending_resources}件 (認証付きで再エクスポートすればDL可能)")


if __name__ == "__main__":
    main()
