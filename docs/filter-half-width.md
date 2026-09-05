# Pandoc/Word における East Asian Width = Ambiguous 文字の取り扱い

## 概要

Pandoc で日本語と欧文記号が混在する Markdown から docx を生成すると、`§`, `′`, `″` のような一部の記号が、同一文書の中で全角になったり半角になったりという揺れを起こす。これは Word の不具合ではなく、次の三つの仕様の重ね合わせから生じる現象である。

1. Unicode の East Asian Width 属性で、これらの記号が **Ambiguous (A)** に分類されていること
2. Word (OOXML) のフォント解決が、Ambiguous 文字に対しては `<w:rFonts>` の `w:hint` 属性をタイブレーカーとして用いること
3. Pandoc の docx 出力が、run 内に East Asian 文字を含むかどうかで自動的に `w:hint="eastAsia"` を付与すること

以下、それぞれを順に整理する。

## 1. Unicode East Asian Width 属性 (UAX #11)

Unicode の各文字には `East_Asian_Width` 属性が定義されている ([UAX #11](https://www.unicode.org/reports/tr11/))。値は次の 6 種である。

| 値 | 名称       | 概要 |
|----|----------|---|
| W  | Wide       | 漢字・かな等。常に全角扱い |
| F  | Fullwidth  | 全角形 (U+FF01–FF60) |
| H  | Halfwidth  | 半角形 (U+FF61–FF9F) |
| Na | Narrow     | ASCII 等。常に半角扱い |
| N  | Neutral    | 東アジア組版文脈に登場しないもの |
| **A** | **Ambiguous** | **東アジア系のレガシー文字集合では全角だが、それ以外の文脈では半角として扱われてきた文字** |

Ambiguous に該当する文字は、レンダリングするフォントや組版環境によって全角字形にも半角字形にもなりうる。同じ Unicode コードポイントでも、East Asian 系フォントの字形を引けば全角、Latin 系フォントの字形を引けば半角として描画される。代表例：

- セクション記号 `§` (U+00A7)
- プライム `′` (U+2032)、二重プライム `″` (U+2033)、三重プライム `‴` (U+2034)
- 度記号 `°`、乗算記号 `×`、除算記号 `÷`
- アクセント付きラテン文字の一部 (`é`, `ü`, `à` 等)
- ギリシャ文字、キリル文字
- 数学記号の多く (`≠`, `⊂`, `∂`, `∆`, `∑` 等)
- 一部の約物 (`—` em dash, `…` ellipsis, `‘ ’ “ ”` 引用符)
- ローマ数字 (`Ⅰ`, `Ⅱ`, `Ⅲ` 等)
- 丸数字 (`①〜⑳`)
- 幾何形状 (`△`, `○`, `■`, `◇` 等)
- 矢印 (`←`, `→`, `↑`, `↓` 等)

## 2. Word/OOXML のフォント解決ルール

OOXML の run プロパティ `<w:rPr>` には、文字種ごとの使用フォントを宣言する `<w:rFonts>` 要素がある ([MS-OE376 §2.3.2.24](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/dcf1caba-49a9-40e3-ba36-32b9e205434f))。

| 属性 | カバーする Unicode 範囲 |
|---|---|
| `w:ascii`    | U+0000–U+007F (ASCII) |
| `w:hAnsi`    | High ANSI (Latin-1 拡張等) |
| `w:eastAsia` | East Asian の Unicode サブレンジ (CJK 統合漢字、かな、East Asian 約物等) |
| `w:cs`       | Complex Script (アラビア・ヘブライ等) |

各文字の描画フォントは原則として、その Unicode コードポイントが属する範囲だけで決まる。

- `2` (U+0032) → ASCII 範囲 → `w:ascii` で指定されたフォント (例：Times New Roman)
- `あ` (U+3042) → East Asian 範囲 → `w:eastAsia` で指定されたフォント (例：游明朝)

ところが **East Asian Width = Ambiguous の文字は、上のいずれの範囲にも明確には所属しない**。この曖昧さを解決するのが `w:hint` 属性である ([ST_Hint](https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_ST_Hint_topic_ID0EHEZ2.html))。

```xml
<w:rPr>
  <w:rFonts w:ascii="Times New Roman"
            w:hAnsi="Times New Roman"
            w:eastAsia="游明朝"
            w:hint="eastAsia"/>
</w:rPr>
```

- `w:hint="default"` → Ambiguous 文字は `w:ascii`/`w:hAnsi` 側 (Latin 系フォント) で描画される → **半角字形**
- `w:hint="eastAsia"` → Ambiguous 文字は `w:eastAsia` 側 (East Asian 系フォント) で描画される → **全角字形**

ここで注意すべき点が一つある。**`w:hint` は Ambiguous 文字専用のタイブレーカー**であって、ASCII の数字や明確な East Asian 文字には影響しない。たとえば run の `w:rPr` に `w:hint="eastAsia"` が付いていても、その run 内の `2` は依然として `w:ascii` フォント (= 半角 Latin) で、`あ` は依然として `w:eastAsia` フォント (= East Asian) で描画される。hint が支配権を持つのは、Unicode 範囲だけでは Latin 側か East Asian 側か決まらない Ambiguous 文字に対してのみである。

## 3. Pandoc の docx 出力ヒューリスティック

Pandoc は Markdown を抽象構文木 (AST) に変換した後、docx writer で OOXML に出力する。インライン要素は次の規則で AST に分解される。

- 連続するテキストは 1 つの `Str "..."` 要素にまとまる
- **半角スペースは独立した `Space` 要素**として `Str` 間を区切る
- 全角約物 (`、`, `。`, `（`, `）` 等) は `Str` の中に取り込まれる

例：

```
Markdown:  日本語 X′）の続き
AST:       [ Str "日本語", Space, Str "X′）の続き" ]
```

`X′）の続き` は半角スペースで区切られない連続文字なので、1 つの `Str` にまとめられる (`）` も East Asian 約物として `Str` に含まれる)。

一方：

```
Markdown:  日本語 X′ の続き
AST:       [ Str "日本語", Space, Str "X′", Space, Str "の続き" ]
```

プライムの直後に半角スペースが入っているため、そこで `Str` が分断され、`X′` だけが独立した `Str` になる。

そのうえで docx writer は次のヒューリスティックで `<w:rFonts>` を付与する。

> **各 `Str` を 1 つの `<w:r>` (run) に変換するとき、その `Str` の中身に漢字または全角形が一文字でも含まれていれば、run に `<w:rFonts w:hint="eastAsia"/>` を付ける。含まれていなければ hint を付けない。**

「East Asian 文字が含まれていれば」ではない点に注意する。pandoc 3.9.0.2 での実測結果は次のとおりで、**ひらがな・カタカナ・CJK 約物は引き金にならない**。

| `Str` の中身 | hint |
|---|---|
| `漢字` `Ａ` `）` | `eastAsia` が付く |
| `あいう` `カタカナ` `、` `「」` `・` `ー` `々` | 付かない |

したがって `イデーンⅠ` はカタカナしか含まないので hint なし、`間主観性の現象学Ⅱ` は漢字を含むので hint ありとなる。同じ `Ⅰ` でも、隣接する語がカタカナか漢字かで XML が変わる。

これは「日本語と隣接する Ambiguous 文字は全角寄りに描画したい」という妥当な意図に基づく自動判定だが、これが揺れの原因となる。

Lua フィルターが `Str` を分割して `RawInline` を挟んだ後の差も同じ理由で説明できる。`世界(2)において` を [`filters/str_rules.lua`](../filters/str_rules.lua) に通すと `Str "において"` の run には hint が付かないが、`(2)世界において` では `Str "世界において"` に付く。前者はひらがなだけ、後者は漢字を含むという違いである。Ambiguous 文字の幅を確実に固定するには、この自動付与に頼らず run に hint を明示する。

## 4. 相互作用がもたらす表示の揺れ

以上の三つを組み合わせると、Ambiguous 文字の表示幅は **その文字を含む `Str` の構成によって決まる**。同一文書内で同じ Ambiguous 文字が、文脈によって全角になったり半角になったりという挙動が生じる。

### ケース A：直後が全角約物または East Asian 文字 → 全角

```
Markdown:  日本語 X′）の続き

AST:       [ ..., Str "X′）の続き" ]

OOXML:     <w:r>
             <w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr>
             <w:t xml:space="preserve">X′）の続き</w:t>
           </w:r>
```

run 内に漢字 (`続`) と全角形 (`）`) があるため、Pandoc はこの run に `w:hint="eastAsia"` を付与する。その効力で **`′` は East Asian フォント側で描画され、全角字形となる**。同じ run 内の `X` は ASCII 範囲なので影響を受けず、半角のまま (これは `w:hint` が Ambiguous 専用のタイブレーカーであることの帰結)。

### ケース B：直後が半角スペース → 半角

```
Markdown:  日本語 X′ の続き

AST:       [ ..., Str "X′", Space, Str "の続き" ]

OOXML:     <w:r>
             <w:t xml:space="preserve">X′</w:t>
           </w:r>
```

`X′` だけの独立 `Str` には漢字も全角形も含まれないため、Pandoc は hint を付けない。すると `′` は Ambiguous でありながらタイブレーカーが効かず、`w:ascii`/`w:hAnsi` 側にフォールバックして **半角字形で描画される**。

### 同じ文字が箇所によって揺れる

実際の文書では、ある場所では「`X′）の続き` (全角約物が後ろにある)」のように書かれ、別の場所では「`X′ の続き` (半角スペースが後ろにある)」のように書かれることが普通にある。このとき、同じ `′` が前者では全角、後者では半角という、見た目だけ見ると一見矛盾した結果になる。

### 影響を受けるのは Ambiguous 文字だけ

繰り返しになるが、`w:hint="eastAsia"` の効力が及ぶのは Ambiguous 文字のみで、`X` のような ASCII や `日本語` のような East Asian 文字は影響を受けない。揺れの観察結果も、Ambiguous に分類される文字に限られる。

## 5. 対処の一般的方針

Ambiguous 文字の表示幅を意図通りに固定したい場合、対象文字を **独立した run に切り出し、その run の `w:hint` を明示する** のが基本方針となる。

- **半角に固定したい場合**：`<w:rFonts w:hint="default"/>` を付けた run に包む。Ambiguous 文字は `w:ascii`/`w:hAnsi` 側に倒れ、半角字形となる。
- **全角に固定したい場合**：`<w:rFonts w:hint="eastAsia"/>` を付けた run に包む。Ambiguous 文字は `w:eastAsia` 側に倒れ、全角字形となる。

Pandoc 上では Lua フィルターを用いて、`Str` 要素を走査し、対象文字を `RawInline('openxml', ...)` に置換することでこれを実現できる ([Pandoc Lua Filters](https://pandoc.org/lua-filters.html))。対象文字に遭遇したら、その前後で `Str` を切り、対象文字だけを独立した raw run として挿入する、という構造になる。

この方式では、切り出した run に親のインライン要素の書式（斜体・取り消し線・リンクの文字スタイル等）が入らない。詳細は [filter-spacing.md](filter-spacing.md) の「既知の制限」を参照。

なお、reference.docx 側でフォントを定義しているなら、`w:rFonts` でフォント名まで明示する必要はない。`w:hint` の値だけを上書きすれば、フォントは reference.docx の既定値が継承される。

## 6. 対象文字を選ぶときの目安

Ambiguous 文字の全体は広いので、日本語文書で実際に使いそうなものから選ぶ。
このフィルターの用途では、まず次のあたりを見るだけで十分である。

- 記号: `§`, `¶`, `†`, `‡`, `※`, `®`
- 単位系: `°`, `′`, `″`, `‴`, `℃`, `Å`
- 数学記号: `±`, `×`, `÷`, `−`, `≠`, `≤`, `≥`, `≒`, `≡`, `∞`, `√`, `∑`, `∫`
- 矢印: `←`, `↑`, `→`, `↓`, `↔`, `⇔`
- 丸数字: `①`, `②`, `③`, `④`, `⑤`
- ローマ数字: `Ⅰ`, `Ⅱ`, `Ⅲ`, `Ⅳ`, `Ⅴ`
- ギリシャ文字: `α`, `β`, `γ`, `Δ`, `μ`, `Ω`

一覧を確認する場合は、Unicode 公式の `EastAsianWidth.txt` で `;A` の行を見る。
HTML で見たい場合は、libgrapheme のミラーが行単位で読みやすい。

- [Unicode EastAsianWidth.txt](https://www.unicode.org/Public/UCD/latest/ucd/EastAsianWidth.txt)
- [libgrapheme の EastAsianWidth.txt HTML 表示](https://git.suckless.org/libgrapheme/file/data/EastAsianWidth.txt.html)
- [Ambiguous width characters の一覧](https://emonkak.pages.dev/articles/wcwidth/ambiguous_width_characters.txt)

## 参考資料

- [Ambiguous Width文字の一覧](https://emonkak.pages.dev/articles/wcwidth/ambiguous_width_characters.txt)
- [UAX #11: East Asian Width](https://www.unicode.org/reports/tr11/) — Ambiguous 分類の規範定義
- [MS-OE376 §2.3.2.24 rFonts (Run Fonts)](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/dcf1caba-49a9-40e3-ba36-32b9e205434f) — `<w:rFonts>` 仕様
- [ST_Hint (Font Type Hint)](https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_ST_Hint_topic_ID0EHEZ2.html) — `w:hint` 列挙値の定義
- [OOXML w:rFonts (datypic)](http://www.datypic.com/sc/ooxml/e-w_rFonts-1.html) — 属性一覧と利用例
- [Pandoc User's Guide](https://pandoc.org/MANUAL.html)
- [Pandoc Lua Filters](https://pandoc.org/lua-filters.html)
- [Halfwidth and fullwidth forms (Wikipedia)](https://en.wikipedia.org/wiki/Halfwidth_and_fullwidth_forms)
