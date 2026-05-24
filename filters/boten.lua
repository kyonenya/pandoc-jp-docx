-- **日本語を含む文字列** を Word の傍点に変換する

local boten_style = "dot" -- 丸傍点
-- local boten_style = "comma" -- ゴマ傍点

local function escape_xml(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

local function contains_japanese(s)
  for _, c in utf8.codes(s) do
    if (c >= 0x3040 and c <= 0x30FF) -- ひらがな・カタカナ
       or (c >= 0x4E00 and c <= 0x9FFF) -- CJK統合漢字
    then
      return true
    end
  end
  return false
end

function Strong(elem)
  if FORMAT ~= 'docx' then return nil end

  local text = pandoc.utils.stringify(elem.content)
  if not contains_japanese(text) then return nil end

  local xml = string.format(
    '<w:r><w:rPr><w:em w:val="%s"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r>',
    boten_style,
    escape_xml(text)
  )
  return pandoc.RawInline('openxml', xml)
end
