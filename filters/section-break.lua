-- フェンス付き div を Word のセクション区切りに変換する
-- ::: {.section-break type="nextPage"} ::: → 次ページからの区切り
-- ::: {.section-break type="oddPage"} :::  → 奇数ページからの区切り
-- ::: {.section-break type="evenPage"} ::: → 偶数ページからの区切り

-- reference.docx の末尾 sectPr の値に依存するため、以下のコマンドで取得してコピペする
-- unzip -p reference.docx word/document.xml | grep -oE '<w:sectPr[^/]*?(/>|.*?</w:sectPr>)' | tail -1

function Div(elem)
  if FORMAT ~= 'docx' then return nil end

  if elem.classes:includes('section-break') then
    local break_type = elem.attributes['type']
    local xml = string.format(
      '<w:p><w:pPr><w:sectPr>' ..
        '<w:footerReference w:type="even" r:id="rId8"/>' ..
        '<w:footerReference w:type="default" r:id="rId9"/>' ..
        '<w:headerReference w:type="first" r:id="rId10"/>' ..
        '<w:footerReference w:type="first" r:id="rId11"/>' ..
        '<w:type w:val="%s"/>' ..
        '<w:pgSz w:w="11906" w:h="16838" w:code="9"/>' ..
        '<w:pgMar w:top="1985" w:right="1531" w:bottom="1985" w:left="1871" w:header="1077" w:footer="850" w:gutter="0"/>' ..
        '<w:cols w:space="720"/>' ..
        '<w:docGrid w:type="linesAndChars" w:linePitch="398" w:charSpace="776"/>' ..
      '</w:sectPr></w:pPr></w:p>',
      break_type
    )
    return pandoc.RawBlock('openxml', xml)
  end
end
