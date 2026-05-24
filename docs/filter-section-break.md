# Word セクション区切りの仕様とワークアラウンド

`filters/section-break.lua` が reference.docx の値をベタ書きしている理由のメモ。

## 何が起きるか

`::: {.section-break type="oddPage"} :::` を出力する素朴な実装

```xml
<w:p><w:pPr><w:sectPr><w:type w:val="oddPage"/></w:sectPr></w:pPr></w:p>
```

をビルドすると、コンパイル後の docx で

- **ページ番号フッタが消える**
- **ページサイズが Letter にリセットされる**

という症状が出る。reference.docx を単体で開けば A4 でページ番号も出ているのに、コンパイル先の dist だけ壊れる、という見え方になる。

## なぜ起きるか

### OOXML の sectPr は継承しない

OOXML / WordprocessingML (ECMA-376) の `<w:sectPr>` は **そのセクションのプロパティを完全に記述する自己完結ブロック** という建付け。CSS のカスケードや HTML の親子継承のような仕組みは仕様に存在しない。

つまり新しいセクションを途中で挿入すると、

- `footerReference` を書かなければ → ページ番号フッタなし
- `pgSz` を書かなければ → 用紙サイズはデフォルト (= Letter)
- `pgMar` を書かなければ → 余白はデフォルト
- `docGrid` を書かなければ → 和文グリッドなし

になる。前セクションや文書末尾 sectPr の値は **一切受け継がない**。

これは Word が WordPerfect 等の 80〜90 年代 DTP プロダクトと概念互換を保とうとした設計の名残で、その思想を 2006 年の XML 化のときにそのまま標準化した結果。

### なぜ Letter フォールバックなのか

ECMA-376 Annex E (Implementation-defined defaults) に `<w:pgSz>` のデフォルトが

```
w:w = "12240" twip  = 8.5 inch
w:h = "15840" twip  = 11  inch
```

と明文化されている。Microsoft が米国企業で、Office の歴史的デフォルトが Letter だったため。ロケール依存ではなく世界共通の仕様デフォルト。LibreOffice でも同じ挙動になる。

日本の Word UI で「ふつう A4」に見えるのは、Word の **ローカライズ層** が日本ロケールでテンプレート (`Normal.dotm`) を A4 で初期化してくれているから。OOXML スキーマそのものは A4 を知らない。

### なぜ Word UI では継承するように見えるのか

Word アプリで「セクション区切りを挿入」すると、**Word が暗黙に直前セクションの pgSz/pgMar/footerReference を新セクションへコピー**する親切な処理を入れている。人間が Word で作る経路ではこの親切が効くので、誰も継承の不在に気づかない。

Pandoc + Lua フィルターで生 OOXML を書く経路にはこの親切が効かないので、書き手が自分で全部書き出すしかない。

## ワークアラウンド

`filters/section-break.lua` が出すセクション区切り sectPr に、reference.docx 末尾 sectPr の中身を **写経して全部入れる**:

```xml
<w:sectPr>
  <w:footerReference w:type="even" r:id="rId8"/>
  <w:footerReference w:type="default" r:id="rId9"/>
  <w:headerReference w:type="first" r:id="rId10"/>
  <w:footerReference w:type="first" r:id="rId11"/>
  <w:type w:val="..."/>
  <w:pgSz w:w="11906" w:h="16838" w:code="9"/>
  <w:pgMar w:top="1985" w:right="1531" w:bottom="1985" w:left="1871" w:header="1077" w:footer="850" w:gutter="0"/>
  <w:cols w:space="720"/>
  <w:docGrid w:type="linesAndChars" w:linePitch="398" w:charSpace="776"/>
</w:sectPr>
```

これにより全セクションで A4・余白・和文グリッド・フッタ参照がそろう。

### 値の出どころ

| 要素 | 出どころ |
|---|---|
| `footerReference` / `headerReference` の `r:id` | reference.docx の `word/_rels/document.xml.rels` |
| `footerReference` / `headerReference` の `w:type` | reference.docx 末尾 sectPr |
| `pgSz` / `pgMar` / `cols` / `docGrid` | reference.docx 末尾 sectPr |
| `w:type w:val` | Markdown 側 `::: {.section-break type="..."}` から渡る |

要するに **reference.docx 末尾 sectPr のほぼ完全コピー** + Markdown 由来のセクション種別、という構造。

## メンテナンス手順

reference.docx を編集した後 (フッタ追加・余白変更・寸法変更など) は、以下を確認する。

### 1. rId 番号の確認

```sh
unzip -p reference.docx word/_rels/document.xml.rels | grep -E "footer|header"
```

footer/header の relationship ID が変わっていないかチェック。reference 編集で順序が動くとここがズレる。

### 2. 末尾 sectPr の参照値取り出し

```sh
unzip -p reference.docx word/document.xml | grep -oE '<w:sectPr[^/]*?(/>|.*?</w:sectPr>)' | tail -1
```

得られた XML を `filters/section-break.lua` の string.format 内に貼り直す。`<w:type w:val="%s"/>` だけは Markdown 由来なのでプレースホルダのまま残す。

#### 転記時の省略ルール

実際のコマンド出力には Word の編集履歴管理用 ID が混ざる。これらは **省略可** (レイアウト・表示に一切影響しない):

```xml
<w:sectPr w:rsidR="00321158" w:rsidRPr="009C13DE" w:rsidSect="002E18CE">
              ↑              ↑                 ↑
        この 3 つは省略可 (rsid = Revision Save ID)
```

| 種類 | 例 | 扱い |
|---|---|---|
| `w:rsid*` 系 (`rsidR`/`rsidRPr`/`rsidSect`/`rsidDel`/`rsidP` 等) | `w:rsidR="00321158"` | 省略可。Word が保存ごとに発番する変更追跡用 ID |
| `w14:paraId` / `w14:textId` | `w14:paraId="20F085B8"` | 省略可。Word 2010+ の編集追跡用 |

逆に **省略不可** なものに注意:

| 種類 | 例 | 理由 |
|---|---|---|
| `r:id` (子要素の relationship ID) | `<w:footerReference r:id="rId8"/>` | `word/_rels/document.xml.rels` の実体参照。消すとフッタ未表示 |
| `<w:pgSz>` | — | 省略すると **Letter にフォールバック** |
| `<w:pgMar>` | — | 省略するとデフォルト 1 inch 余白 |
| `<w:docGrid>` | — | 省略すると **和文の行送り・字間が崩れる** |
| `<w:footerReference>` `<w:headerReference>` | — | 省略するとフッタ/ヘッダ非表示 |
| `<w:cols>` | — | 1 カラムなら省略してもよい (実害なし) |

**紛らわしい点**: `r:id` (relationship id, 必須) と `w:rsidR` 系 (revision save id, 省略可) は頭の `r` が同じなだけで完全に別物。

### 3. ビルドして検証

本文先頭セクションの sectPr にフィルター生成の値 (footerReference 込み) が入っていれば成功。Word で開いて 1 ページ目にページ番号が見えるかも視覚的に確認。

## 別寸法 reference を使うとき

`reference-30x40.docx` のような別寸法用の reference を使う場合、pgSz/pgMar/docGrid が異なるので **専用のフィルターを別途用意する必要がある** (例: `filters/section-break-30x40.lua`)。reference を引数で切り替えるだけでは sectPr の中身は連動しない、という点に注意。
