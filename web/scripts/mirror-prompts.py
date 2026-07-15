from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import io
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image, ImageOps, UnidentifiedImageError


Image.MAX_IMAGE_PIXELS = 80_000_000
MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024
MAX_IMAGE_EDGE = 1920
REQUEST_HEADERS = {
    "User-Agent": "TokenShen-Prompt-Mirror/1.0",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
}


@dataclass(frozen=True)
class Source:
    category: str
    repository: str
    raw_base: str
    root: Path
    readme: str
    license_name: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="镜像提示词和示例图片")
    parser.add_argument("--zero", required=True, type=Path)
    parser.add_argument("--imgedify", required=True, type=Path)
    parser.add_argument("--youmind", required=True, type=Path)
    parser.add_argument("--freestyle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--public-prefix", default="/prompt-assets")
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--proxy", default="")
    parser.add_argument("--scan-only", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sources = [
        Source(
            category="awesome-gpt-image",
            repository="https://github.com/ZeroLu/awesome-gpt-image",
            raw_base="https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main",
            root=args.zero.resolve(),
            readme="README.zh-CN.md",
            license_name="MIT / CC BY 4.0（仓库声明存在冲突）",
        ),
        Source(
            category="awesome-gpt4o-image-prompts",
            repository="https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
            raw_base="https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main",
            root=args.imgedify.resolve(),
            readme="README.zh-CN.md",
            license_name="MIT",
        ),
        Source(
            category="youmind-gpt-image-2",
            repository="https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
            raw_base="https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main",
            root=args.youmind.resolve(),
            readme="README_zh.md",
            license_name="CC BY 4.0",
        ),
        Source(
            category="freestyle-awesome-gpt-image-2",
            repository="https://github.com/freestylefly/awesome-gpt-image-2",
            raw_base="https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data",
            root=args.freestyle.resolve(),
            readme="cases.json",
            license_name="MIT",
        ),
    ]
    assert_sources(sources)

    items: list[dict[str, Any]] = []
    for source in sources:
        markdown = (source.root / source.readme).read_text(encoding="utf-8")
        if source.category == "awesome-gpt-image":
            parsed = parse_zero(markdown, source)
        elif source.category == "awesome-gpt4o-image-prompts":
            parsed = parse_imgedify(markdown, source)
        elif source.category == "youmind-gpt-image-2":
            parsed = parse_youmind(markdown, source)
        else:
            parsed = parse_freestyle(markdown, source)
        items.extend(parsed)
        print(f"{source.category}: {len(parsed)} 条提示词", flush=True)

    unique_images = sorted({url for item in items for url in item["sourceImages"]})
    print(f"合计提示词: {len(items)}", flush=True)
    print(f"去重后图片: {len(unique_images)}", flush=True)
    if args.scan_only:
        return 0

    output = args.output.resolve()
    images_root = output / "images"
    data_root = output / "data"
    private_root = output / "private"
    licenses_root = output / "licenses"
    images_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)
    private_root.mkdir(parents=True, exist_ok=True)
    licenses_root.mkdir(parents=True, exist_ok=True)

    source_by_category = {source.category: source for source in sources}
    image_map, failures = mirror_images(
        items,
        source_by_category,
        images_root,
        args.public_prefix.rstrip("/"),
        max(1, min(args.workers, 24)),
        args.proxy.strip(),
    )
    for item in items:
        mirrored = [image_map[url] for url in item.pop("sourceImages") if url in image_map]
        item["images"] = mirrored
        item["coverUrl"] = mirrored[0] if mirrored else ""
        item["preview"] = "\n\n".join(f"![]({url})" for url in mirrored)

    generated_at = datetime.now(timezone.utc).isoformat()
    public_payload = {
        "version": generated_at,
        "generatedAt": generated_at,
        "total": len(items),
        "items": items,
    }
    showcase = select_showcase(items, 12)
    showcase_payload = {
        "version": generated_at,
        "generatedAt": generated_at,
        "total": len(showcase),
        "items": showcase,
    }
    manifest = {
        "version": generated_at,
        "generatedAt": generated_at,
        "counts": {
            "prompts": len(items),
            "sourceImages": len(unique_images),
            "mirroredImages": len(image_map),
            "failedImages": len(failures),
        },
        "sources": [
            {
                "category": source.category,
                "repository": source.repository,
                "commit": git_head(source.root),
                "license": source.license_name,
            }
            for source in sources
        ],
        "failures": failures,
    }
    # 完整提示词只供本机接口读取，避免被静态目录一次性下载。
    write_json(private_root / "prompts.json", public_payload)
    (data_root / "prompts.json").unlink(missing_ok=True)
    write_json(data_root / "showcase.json", showcase_payload)
    write_json(data_root / "manifest.json", manifest)
    copy_licenses(sources, licenses_root)
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    return 0 if not failures else 2


def assert_sources(sources: list[Source]) -> None:
    for source in sources:
        readme = source.root / source.readme
        if not readme.is_file():
            raise FileNotFoundError(f"缺少来源文件: {readme}")


def parse_zero(markdown: str, source: Source) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for section in split_before_heading(markdown, "## "):
        heading = first_match(section, r"^##\s+(.+)$", re.MULTILINE)
        tags = tags_from_heading(heading)
        for block in split_before_heading(section, "### "):
            title = first_match(block, r"^###\s+(.+)$", re.MULTILINE)
            title = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", title).strip()
            prompt = first_match(block, r"\*\*提示词:\*\*\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```", re.DOTALL).strip()
            if not title or not prompt:
                continue
            images = extract_images(source.raw_base, block)
            source_url = source_link(block)
            items.append(
                prompt_item(
                    source,
                    f"awesome-gpt-image-{len(items) + 1:04d}",
                    title,
                    prompt,
                    tags,
                    images,
                    source_url=source_url,
                )
            )
    return items


def parse_imgedify(markdown: str, source: Source) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for block in split_before_heading(markdown, "### "):
        title = first_match(block, r"^###\s+(.+)$", re.MULTILINE).strip()
        prompt = first_match(block, r"- \*\*提示词文本：\*\*\s*`(.*?)`", re.DOTALL).strip()
        if not title or not prompt:
            continue
        images = extract_images(source.raw_base, block)
        author, author_url = author_link(block)
        items.append(
            prompt_item(
                source,
                f"awesome-gpt4o-image-prompts-{len(items) + 1:04d}",
                title,
                prompt,
                ["gpt4o"],
                images,
                author=author,
                source_url=author_url,
            )
        )
    return items


def parse_youmind(markdown: str, source: Source) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for block in split_before_heading(markdown, "### "):
        title = first_match(block, r"^###\s+No\.\s*\d+:\s*(.+)$", re.MULTILINE).strip()
        prompt = first_match(block, r"#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```", re.DOTALL).strip()
        if not title or not prompt:
            continue
        images = extract_images(source.raw_base, block)
        author, author_url = author_link(block)
        item_source_url = source_link(block) or author_url
        prefix = title.split(" - ", 1)[0] if " - " in title else ""
        tags = ["gpt-image-2", *tags_from_heading(prefix)]
        items.append(
            prompt_item(
                source,
                f"youmind-gpt-image-2-{len(items) + 1:04d}",
                title,
                prompt,
                tags,
                images,
                author=author,
                source_url=item_source_url,
                created_at=published_date(block),
            )
        )
    return items


def parse_freestyle(payload: str, source: Source) -> list[dict[str, Any]]:
    data = json.loads(payload)
    cases = data.get("cases", []) if isinstance(data, dict) else data
    items: list[dict[str, Any]] = []
    for index, case in enumerate(cases):
        title = str(case.get("title") or "").strip()
        prompt = str(case.get("prompt") or "").strip()
        if not title or not prompt:
            continue
        image = str(case.get("image") or "").strip()
        images = [urljoin(f"{source.raw_base}/", image.lstrip("/"))] if image else []
        tags = [str(case.get("category") or ""), *(case.get("styles") or []), *(case.get("scenes") or [])]
        item = prompt_item(
            source,
            f"freestyle-awesome-gpt-image-2-{case.get('id') or index + 1}",
            title,
            prompt,
            tags,
            images,
            author=str(case.get("sourceLabel") or "").strip(),
            source_url=str(case.get("sourceUrl") or "").strip(),
        )
        item["githubUrl"] = str(case.get("githubUrl") or source.repository).strip()
        items.append(item)
    return items


def prompt_item(
    source: Source,
    item_id: str,
    title: str,
    prompt: str,
    tags: list[str],
    images: list[str],
    *,
    author: str = "",
    source_url: str = "",
    created_at: str = "",
) -> dict[str, Any]:
    return {
        "id": item_id,
        "title": title,
        "coverUrl": "",
        "prompt": prompt,
        "tags": unique(tags),
        "category": source.category,
        "githubUrl": source.repository,
        "license": source.license_name,
        "author": author,
        "sourceUrl": source_url,
        "images": [],
        "sourceImages": images,
        "preview": "",
        "createdAt": created_at,
        "updatedAt": "",
    }


def split_before_heading(markdown: str, prefix: str) -> list[str]:
    blocks: list[str] = []
    current: list[str] = []
    for line in markdown.splitlines():
        if line.startswith(prefix) and current:
            blocks.append("\n".join(current))
            current = []
        current.append(line)
    blocks.append("\n".join(current))
    return blocks


def first_match(value: str, pattern: str, flags: int = 0) -> str:
    match = re.search(pattern, value, flags)
    return match.group(1) if match else ""


def extract_images(base_url: str, markdown: str) -> list[str]:
    markdown_images = re.findall(r"!\[[^\]]*]\(([^)]+)\)", markdown)
    html_images = re.findall(r"<img\b[^>]*?\bsrc\s*=\s*[\"']([^\"']+)[\"']", markdown, re.IGNORECASE)
    result: list[str] = []
    for raw in [*markdown_images, *html_images]:
        value = html.unescape(raw.strip()).strip("<>")
        if " " in value and not value.lower().startswith(("http://", "https://")):
            value = value.split(" ", 1)[0]
        absolute = value if re.match(r"^https?://", value, re.IGNORECASE) else urljoin(f"{base_url}/", value.lstrip("./"))
        if not absolute or urlparse(absolute).hostname == "img.shields.io":
            continue
        if absolute not in result:
            result.append(absolute)
    return result


def tags_from_heading(value: str) -> list[str]:
    cleaned = re.sub(r"[^\w/&、与 ]", "", value, flags=re.UNICODE)
    return unique(re.split(r"\s*(?:/|&|、|与)\s*", cleaned))


def source_link(block: str) -> str:
    patterns = [
        r"(?:Source|来源)[^\n]*?\[[^\]]+]\((https?://[^)]+)\)",
        r"\*Source:\*\s*\[[^\]]+]\((https?://[^)]+)\)",
    ]
    for pattern in patterns:
        match = re.search(pattern, block, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def author_link(block: str) -> tuple[str, str]:
    match = re.search(r"(?:Author|作者)[^\n]*?\[([^\]]+)]\((https?://[^)]+)\)", block, re.IGNORECASE)
    return (match.group(1).strip(), match.group(2).strip()) if match else ("", "")


def published_date(block: str) -> str:
    return first_match(block, r"(?:Published|发布(?:时间|日期)?)[^\n]*?([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})", re.IGNORECASE)


def unique(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        normalized = value.strip().lower()
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def mirror_images(
    items: list[dict[str, Any]],
    sources: dict[str, Source],
    output_root: Path,
    public_prefix: str,
    workers: int,
    proxy: str,
) -> tuple[dict[str, str], list[dict[str, str]]]:
    task_by_url: dict[str, tuple[str, Source]] = {}
    for item in items:
        source = sources[item["category"]]
        for url in item["sourceImages"]:
            task_by_url.setdefault(url, (item["category"], source))

    image_map: dict[str, str] = {}
    failures: list[dict[str, str]] = []
    total = len(task_by_url)
    started_at = time.monotonic()

    def run(task: tuple[str, tuple[str, Source]]) -> tuple[str, str, str]:
        url, (category, source) = task
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        relative = Path(category) / f"{digest}.webp"
        target = output_root / relative
        if target.is_file() and target.stat().st_size:
            return url, f"{public_prefix}/{relative.as_posix()}", ""
        try:
            data = read_image_bytes(url, source, proxy)
            save_webp(data, target)
            return url, f"{public_prefix}/{relative.as_posix()}", ""
        except Exception as error:  # noqa: BLE001
            return url, "", str(error)[:300]

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(run, task) for task in task_by_url.items()]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            url, public_url, error = future.result()
            if public_url:
                image_map[url] = public_url
            else:
                failures.append({"url": url, "error": error})
            if index == total or index % 25 == 0:
                elapsed = max(0.1, time.monotonic() - started_at)
                print(f"图片进度: {index}/{total}，成功 {len(image_map)}，失败 {len(failures)}，{index / elapsed:.1f} 张/秒", flush=True)
    return image_map, failures


def read_image_bytes(url: str, source: Source, proxy: str) -> bytes:
    local = local_source_file(url, source)
    if local and local.is_file():
        return local.read_bytes()

    attempts: list[dict[str, str] | None] = []
    if proxy:
        attempts.append({"http": proxy, "https": proxy})
    attempts.append(None)
    last_error: Exception | None = None
    for proxies in attempts:
        for retry in range(2):
            try:
                response = requests.get(
                    url,
                    headers=REQUEST_HEADERS,
                    timeout=(10, 35),
                    stream=True,
                    allow_redirects=True,
                    proxies=proxies,
                )
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_content(128 * 1024):
                    content.extend(chunk)
                    if len(content) > MAX_DOWNLOAD_BYTES:
                        raise ValueError("图片超过 32MB")
                if not content:
                    raise ValueError("图片内容为空")
                return bytes(content)
            except Exception as error:  # noqa: BLE001
                last_error = error
                time.sleep(0.5 * (retry + 1))
    raise RuntimeError(last_error or "图片下载失败")


def local_source_file(url: str, source: Source) -> Path | None:
    prefix = f"{source.raw_base}/"
    if not url.startswith(prefix):
        return None
    relative = url[len(prefix) :].split("?", 1)[0]
    candidate = (source.root / relative).resolve()
    try:
        candidate.relative_to(source.root)
    except ValueError:
        return None
    return candidate


def save_webp(data: bytes, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.seek(0)
            image = ImageOps.exif_transpose(image)
            image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            image.save(temporary, format="WEBP", quality=82, method=6)
        temporary.replace(target)
    except (UnidentifiedImageError, OSError, ValueError) as error:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"图片解码失败: {error}") from error


def select_showcase(items: list[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    categories = list(dict.fromkeys(item["category"] for item in items))
    grouped = {category: [item for item in items if item["category"] == category and item["coverUrl"]] for category in categories}
    selected: list[dict[str, Any]] = []
    index = 0
    while len(selected) < count and any(index < len(grouped[category]) for category in categories):
        for category in categories:
            values = grouped[category]
            if index < len(values):
                selected.append(values[index])
                if len(selected) == count:
                    break
        index += 1
    return selected


def copy_licenses(sources: list[Source], output: Path) -> None:
    for source in sources:
        license_file = source.root / "LICENSE"
        if license_file.is_file():
            shutil.copyfile(license_file, output / f"{source.category}.txt")
        note = output / f"{source.category}.source.txt"
        note.write_text(
            f"来源：{source.repository}\n许可证：{source.license_name}\n提交：{git_head(source.root)}\n",
            encoding="utf-8",
        )


def git_head(root: Path) -> str:
    head = root / ".git" / "HEAD"
    if not head.is_file():
        return ""
    value = head.read_text(encoding="utf-8").strip()
    if value.startswith("ref: "):
        ref = root / ".git" / value[5:]
        return ref.read_text(encoding="utf-8").strip() if ref.is_file() else ""
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("已取消", file=sys.stderr)
        raise SystemExit(130)
