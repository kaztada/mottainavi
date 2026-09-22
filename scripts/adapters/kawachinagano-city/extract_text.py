"""
河内長野市「家庭用ごみの分別辞典」PDF からテキストを取り出す(市が PDF を更新したときだけ手動で実行)。

  python3 -m pip install pypdf   # 初回のみ
  python3 scripts/adapters/kawachinagano-city/extract_text.py

入力: data/cache/kawachinagano-city.pdf(アダプタの fetchSource が1回だけ取得してキャッシュする)
出力: data/cache/kawachinagano-city.txt(アダプタはこのテキストを読んで品目に切り出す)

Node の pdfjs-dist では表の行の並びが崩れるため、行を正しく取れる pypdf を使っている。
"""
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "data/cache/kawachinagano-city.pdf"
TXT = ROOT / "data/cache/kawachinagano-city.txt"

reader = PdfReader(str(PDF))
text = "\n".join((page.extract_text() or "") for page in reader.pages)
TXT.write_text(text, encoding="utf-8")
print(f"{TXT}: {len(reader.pages)} ページ, {len(text)} 文字")
