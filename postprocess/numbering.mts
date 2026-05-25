/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * pandoc 既定の箇条書き/番号つきリストのスタイルを上書きする
 */

/** ilvl0 = 2文字分、ilvl1 = 4文字分...のインデント */
const INDENT_STEP_CHARS = 2;

/** 箇条/番号のぶら下げ文字数（本文位置より何文字分手前に置くか） */
const HANGING_CHARS = 1;

/**  reference.docx の本文フォントサイズ */
const BODY_FONT_PT = 11;

/**
 * ilvl N の <w:ind> を文字単位ベースで生成する:
 * twip も併記 (Chars 非対応ビューア向けフォールバック)
 */
function charBasedInd(ilvl: number): string {
  const twipsPerChar = BODY_FONT_PT * 20; // 1pt = 20twips
  const indentChars = (ilvl + 1) * INDENT_STEP_CHARS;
  return (
    `<w:ind ` +
    `w:leftChars="${indentChars * 100}" ` +
    `w:left="${indentChars * twipsPerChar}" ` +
    `w:hangingChars="${HANGING_CHARS * 100}" ` +
    `w:hanging="${HANGING_CHARS * twipsPerChar}"/>`
  );
}

function abstractNumPartsRegex(absId: string): RegExp {
  return new RegExp(
    `(<w:abstractNum [^>]*w:abstractNumId="${absId}"[^>]*>)` +
      `(.*?)` +
      `(</w:abstractNum>)`,
    's',
  );
}
// ->
// <w:abstractNum w:abstractNumId="19">
//   <w:nsid w:val="2FBC68B6"/>
//   <w:multiLevelType w:val="multilevel"/>
//   <w:tmpl w:val="4162C71A"/>
//   <w:styleLink w:val="a0"/><!-- ★styleLinkを除去 -->
//   <w:lvl w:ilvl="0">
//     <w:numFmt w:val="bullet"/>
//     <w:lvlText w:val="•"/>
//     <w:lvlJc w:val="left"/>
//     <!-- ★charBasedInd で上書き -->
//     <w:pPr><w:ind w:hanging="221" w:left="442"/></w:pPr>
//     <w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr>
//   </w:lvl>
//   <w:lvl w:ilvl="1">…</w:lvl>
//   <!-- ... -->
//   <w:lvl w:ilvl="8">…</w:lvl>
// </w:abstractNum>

function formatAbstractNumBody(
  bodyXML: string | undefined,
): string | undefined {
  return bodyXML
    ?.replace(/<w:styleLink [^/]*\/>/g, '')
    ?.replace(/<w:lvl w:ilvl="(\d+)">.*?<\/w:lvl>/gs, (lvl, ilvl) =>
      lvl.replace(/<w:ind [^/]*\/>/, charBasedInd(Number(ilvl))),
    );
}

function transformAbstractNumXML(s: string): string {
  const original = {
    '16': s.match(abstractNumPartsRegex('16'))?.[2], // decimal (a)
    '19': s.match(abstractNumPartsRegex('19'))?.[2], // bullet (a0)
  };
  const bullet = formatAbstractNumBody(original['19']);
  const decimal = formatAbstractNumBody(original['16']);

  const replacements = {
    '990': bullet, // not used
    '991': bullet,
    '99411': decimal,
  };
  for (const [absId, body] of Object.entries(replacements)) {
    if (!body) continue;
    s = s.replace(
      abstractNumPartsRegex(absId),
      (_match, open, _oldBody, close) => {
        if (absId === '991') console.log('postprocess: 箇条書きリスト');
        if (absId === '99411') console.log('postprocess: 番号付きリスト');
        return open + body + close;
      },
    );
  }

  return s;
}

function main(path: string): void {
  writeFileSync(
    path,
    transformAbstractNumXML(readFileSync(path, 'utf-8')),
    'utf-8',
  );
}

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error(`Usage: node ${process.argv[1]} path/to/numbering.xml`);
  process.exit(2);
}
main(args[0]);
