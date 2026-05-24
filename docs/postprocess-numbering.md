# Word のリスト (箇条書き / 番号付き) インデント対応の調査ノート

`postprocess-numbering.sh` / `postprocess/numbering.mts` の背景。

## 解決したい問題

reference.docx で「箇条書き(ユーザー定義)」「段落番号(ユーザー定義)」をデザインし、各レベルのインデントを文字単位 (lvl0=2文字 / lvl1=4文字 / lvl2=6文字 / ...) で定義したが、pandoc でコンパイルした docx ではこの定義が効かず、リスト本体が pandoc のデフォルト位置 (lvl 1 の本文が 3 文字目開始など) で表示されてしまう。

## OOXML のリスト周辺構造

docx のスタイルは大きく 2 系統に分かれている。

### A. 段落スタイル (`<w:style w:type="paragraph">`)

paragraph 単位の見た目 (font / 行間 / 段落間隔 / 文字色 / etc.)。paragraph に `<w:pStyle w:val="..."/>` で適用される。

- 標準 (Normal)
- 本文 (Body Text)
- 見出し1 (Heading 1)
- Compact (pandoc 独自、リストアイテムにも付く)
- リスト段落 (ListParagraph)
- etc.

### B. 番号付け定義 (`<w:abstractNum>` + `<w:num>` + numbering style)

リスト固有の「●」「1.」表記と、lvl ごとのインデント、番号体系を定義する。paragraph に `<w:numPr><w:numId/></w:numPr>` で適用される。

3 段構造になっている:

```
numbering style "a0" (型 numbering、表示名「箇条書き(ユーザー定義)」)
  └─ <w:numPr><w:numId="16"/> を持つ
        └─ <w:num id="16"> が <w:abstractNumId w:val="19"/> を指す
              └─ <w:abstractNum id="19"> ← lvl 0..8 の lvlText・<w:ind> がここ
```

bullet 文字や lvl ごとの indent といった「実体」が記述されているのは最下層の `<w:abstractNum>`。

### リストアイテムは A と B を両方持つ

```xml
<w:p>
  <w:pPr>
    <w:pStyle w:val="Compact"/>       ← A. 段落スタイル
    <w:numPr>                         ← B. 番号付け
      <w:ilvl w:val="0"/>
      <w:numId w:val="1001"/>
    </w:numPr>
  </w:pPr>
  <w:r><w:t>項目本文...</w:t></w:r>
</w:p>
```

- A の Compact から font サイズ・行間・段落前後の空きを引く
- B の 1001 → abstractNum から bullet 文字「●」、左 440 twip、ぶら下げ 220 twip を引く

## pandoc 3.9 の落とし穴

pandoc は `--reference-doc=reference.docx` 経由で reference からスタイルを取り込むが、リスト周辺で**繋ぎが途切れる**:

1. reference の `<w:abstractNum w:abstractNumId="19">` (styleLink="a0") はそのまま import される (= bullet 文字、lvl 0..8 の indent 定義はちゃんとコピーされている)
2. reference の `<w:style w:type="numbering" w:styleId="a0">` も import される。これは `<w:numPr><w:numId w:val="16"/>` を持つ
3. **しかし `<w:num w:numId="16">...<w:abstractNumId w:val="19"/>...</w:num>` の繋ぎ役 `<w:num>` エントリは生成されない**

つまり `style a0` → `numId 16` → ??? でチェーンが切れ、Word/LO は abstract 19 にたどり着けない。

そして、実際のリスト本体 (markdown の `- foo`) は pandoc が独自に生成する `<w:num w:numId="1001">` を持ち、これが pandoc 既定の `<w:abstractNum w:abstractNumId="991">` を指す。991 のほうは reference のスタイル定義を引き継いでおらず、lvl 0..8 すべて `<w:ind w:left="N*720" w:hanging="360"/>` という機械的な等差で、reference の意図とは無関係。

### 登場する abstractNum 一覧

postprocess に関係する abstractNum は計 5 つ。reference.docx 由来の本体定義 2 つ (= コピー元) と、pandoc 既定の 3 つ (= 書き換え対象) の関係:

| abstractNumId | 出どころ | numFmt | styleLink | 役割 | postprocess での扱い |
|---|---|---|---|---|---|
| **16** | reference.docx から import | decimal | `"a"` 有り | 番号付きリストの本体定義 (lvl 0..8 の lvlText/indent)。"a" スタイル (= 段落番号(ユーザー定義)) の canonical な lvl 定義 | **コピー元** (decimal 用) |
| **19** | reference.docx から import | bullet | `"a0"` 有り | 箇条書きの本体定義 (lvl 0..8 の lvlText/indent)。"a0" スタイル (= 箇条書き(ユーザー定義)) の canonical な lvl 定義 | **コピー元** (bullet 用) |
| **990** | pandoc 既定 (固定 ID) | bullet | 無し | placeholder。`lvlText=" "` で見える bullet なし。`<w:num w:numId="1000">` 経由で参照されるが、document.xml の段落からは参照されない (pandoc の内部都合で出る) | 19 同等に上書き (どこからも参照されないので実害なし、対称性のため触っている) |
| **991** | pandoc 既定 (固定 ID) | bullet | 無し | 実用 bullet (Symbol/Wingdings の `•`/`o`/`▪` 循環)。document.xml の箇条書き段落が numId 1001+ 経由で指す | **コピー先** (bullet)、中身を 19 由来で上書き |
| **99411** | pandoc 既定 (固定 ID) | decimal | 無し | 実用 decimal (`%1.`/`%2.`/...)。document.xml の番号付きリスト段落が指す | **コピー先** (decimal)、中身を 16 由来で上書き |

ID は reference の中身に依存せず固定 (= 16/19 は reference.docx に元からその ID で存在、990/991/99411 は pandoc が必ずその ID で吐く)。reference-30x40.docx のように numbering.xml を持たない reference を使うと 16/19 が import されないので、その場合 postprocess は早期 return する。

ただし markdown の中身次第で 990/991/99411 のうち一部が生成されないことがある:

| markdown のリスト内容 | 生成される pandoc 既定 abstractNum |
|---|---|
| bullet と ordered 両方 | 990, 991, 99411 |
| bullet のみ | 990, 991 (99411 無し) |
| ordered のみ | 990, 99411 (991 無し) |
| リスト無し | numbering.xml 自体生成されない |

`postprocess/numbering.mts` はコピー元 (16/19) もコピー先 (990/991/99411) も「無ければ silently skip」する形にしてあるので、上記いずれのケースでも追加修正なしに動く。

## 効かなかったアプローチ (覚え書き)

実機 (Word) で何度も試してダメだったもの:

1. **pandoc 既定 abstractNum の `<w:ind>` だけ書き換え** → 段落の pStyle "Compact" が `w:firstLine="0"` を持ち、numbering の `w:hanging` と衝突して打ち消し合った
2. **`<w:tabs><w:tab w:val="num" w:pos="LEFT"/></w:tabs>` を lvl pPr に挿入** → LO/Word の hanging tab 処理ロジックは numbering の `<w:tabs>` を尊重せず、効かなかった
3. **settings.xml の `<w:defaultTabStop>` を 720→442 に変更** → 同上、tab 着地点に影響せず
4. **リスト numId の参照先を別の abstractNum に張り替え** (`abstractNumId=22` numStyleLink="a0" や `=19` styleLink="a0" 直接) → 22 経由は欠落チェーンで解決できず、19 直接でも何かフォールバック挙動でダメ

これらに時間を溶かしたのは、原因を「インデント値の問題」「pStyle 干渉」「Word の tab 仕様」のレイヤーで疑い続けていたから。実際の決め手は別のところにあった。

## 実装は XML パーサではなく文字列操作で

`postprocess/numbering.mts` の中身は正規表現での文字列置換で書いてある。「XML を文字列で扱うのは行儀が悪いので Python の `xml.etree.ElementTree` でリファクタしたい」と思って一度切り替えてみたところ、Word が docx を開いたときに「このファイルは破損しています。修復しますか?」ダイアログを出すようになった (修復後は正しく表示される)。

原因の詳細は追っていないが、XML パーサ (ElementTree やおそらく `libxml2` 系も同様) の serialize は機能的には等価でも以下のような変更を加え、Word がこれを破損とみなすらしい:

- attribute の出力順 (パース時の順序を維持しても、内部処理で並びが変わる場合あり)
- 自己閉じタグと開閉ペアの選択
- xmlns 宣言の位置や順序
- 空白の正規化

Word が permissive ではあるが「壊れたファイル」と判定するロジックは細かい構文に敏感らしく、文字列で **byte-exact に近い形** で書き換えるほうがトラブルが少ない。`numbering.xml` の他の部分には触らず、対象 abstractNum の中身だけを差し替える今の実装が結果的に最も無難だった。

なお、XML パーサを使わない以上、Python ↔ TypeScript の言語差は薄い (どちらも正規表現での文字列操作)。現状は TypeScript (.mts) 版で実装している。

将来 XML パーサ化を再検討する場合は、Word での「修復しますか」ダイアログが出ないことを必ず確認すること。LibreOffice での render が通っても Word は別判定をする。

## 効いたアプローチ

**pandoc 既定 abstractNum 990/991 の中身を、reference の abstractNum 19 (= 箇条書きの本体定義) の lvl 0..8 で置き換え。99411 は abstractNum 16 (= 番号付けの本体定義) で置き換え。**

- numId → abstractNumId のマッピングは触らない (`<w:lvlOverride>` 等もそのまま保持)
- 「pandoc 既定 abstract = 名前は pandoc のまま、中身は reference 由来」になり、styleLink チェーンを経由せず直接解決される
- styleLink 属性は本物の定義 (19/16) のみが持つべきなので、コピー側からは除く

要するに「styleLink チェーンが本来繋がるはずの両端を、中継ノードを介さず直結した」のが転機。sample-list.docx (ユーザーが手動で作成した、正しく表示されるサンプル) の構造を観察してこの気づきに至った。

## 文字単位 vs twip

postprocess は出力 `<w:ind>` をすべてコード側で生成する。reference.docx の `<w:ind>` 値は読み取らない (reference 側の twip 値が将来何になっても、出力は変わらない)。

文字数はコード内定数から決まる:

- `leftChars = (ilvl + 1) × INDENT_STEP_CHARS` (本文インデント)
- `hangingChars = HANGING_CHARS` (label のぶら下げ幅)

twip 併記値 (Chars 非対応ビューア向けフォールバック) は `BODY_FONT_PT × 20 = twipsPerChar` (1 pt = 20 twips) を文字数に掛けて算出。`BODY_FONT_PT` は reference の本文 (Normal/標準スタイル) フォントサイズに合わせる (現状 11pt → 1 文字 = 220 twips)。

OOXML 仕様上、`w:*Chars` は 1/100 文字単位なので、最終的な XML 出力ではそれぞれ ×100 する。例として lvl 0 の出力:

```xml
<w:ind w:leftChars="200" w:left="440" w:hangingChars="100" w:hanging="220"/>
       └─ 2 文字  └─ 440 twip  └─ 1 文字  └─ 220 twip
```

Word は Chars 属性優先、twip はフォールバック。

## Word UI 上の表示単位

ファイル側で `w:leftChars="200"` が入っていても、Word の段落ダイアログでは Word のユーザー設定によって表示単位が cm か文字単位かで切り替わる:

- ファイル → オプション → 詳細設定 → 表示 セクション
- 「インデントとスペーシングを文字単位で表示する」(または類似名称、バージョンで変動) を ON

ON で「左 2 文字 / ぶら下げ 1 文字」、OFF で「左 0.78 cm / ぶら下げ 0.39 cm」。docx ファイル側ではコントロールできない、ユーザー設定。

## メンテナンスの注意

- pandoc を upgrade して既定 abstractNum の ID 体系 (990/991/99411) が変わったら postprocess は静かに「対象 abstract が無い」扱いでスキップする (= リスト書き換えが効かない docx ができる)。実際の新 ID を確認して `postprocess/numbering.mts` の対象 ID 配列を更新する
- インデント刻み幅を変えたい場合は `INDENT_STEP_CHARS` を、bullet/本文間の距離を変えたい場合は `HANGING_CHARS` を、本文フォントサイズが変わった場合は `BODY_FONT_PT` を書き換える
- `.mts` は Node 22.7+ ネイティブの type stripping で動かす前提。ローカルは Node 24 で動作確認済み
- LibreOffice で render して確認するときは pixel 単位で測ること。Body 開始位置は `<w:pgMar w:left>` ÷ 1440 × DPI で算出、1 文字 (本文 11pt) は約 46 px @ 300 DPI

## 関連

- `filters/section-break.lua` / `filter-section-break.md` ... 同じく pandoc の docx 出力を手当てする話 (セクション区切り)
