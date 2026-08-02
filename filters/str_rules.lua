-- Word の文字書式 (OOXML の w:rPr) を指定して run (w:r) を組み立てる
-- 1. 傍点: 日本語を含む **強調** を傍点にする
-- 2. 半角幅の固定: Ambiguous 文字を半角幅で表示させる
-- 3. 和欧間アキ: 記号が挟まると Word が入れてくれないアキを補う

local rules = {
  half_width = { ['§'] = true, ['′'] = true, ['″'] = true, ['‴'] = true },
  spacing = { ['′'] = true, ['″'] = true, ['‴'] = true, ['('] = true, [')'] = true, },
}

local xml = {
  boten = '<w:em w:val="dot"/>', -- 丸傍点（ゴマ傍点は "comma"）
  half_width = '<w:rFonts w:hint="default"/>',
  spacing = '<w:spacing w:val="44"/>', -- 2.2pt
}

local function is_japanese(char)
  local c = utf8.codepoint(char)
  return (c >= 0x3040 and c <= 0x30FF) -- ひらがな・カタカナ
      or (c >= 0x4E00 and c <= 0x9FFF) -- CJK統合漢字
end

local function contains_japanese(text)
  for char in text:gmatch(utf8.charpattern) do
    if is_japanese(char) then return true end
  end
  return false
end

local function needs_spacing(char, next_char)
  if next_char == nil then return false end
  return (rules.spacing[char] and is_japanese(next_char)) -- 記号 → 和文
      or (is_japanese(char) and rules.spacing[next_char]) -- 和文 → 記号
end

local function split_runs_by_rules(text) --> [{ text, rpr }]
  local chars = {}
  for char in text:gmatch(utf8.charpattern) do chars[#chars + 1] = char end

  local runs = pandoc.List()

  for i, char in ipairs(chars) do
    local rpr = (rules.half_width[char] and xml.half_width or '')
      .. (needs_spacing(char, chars[i + 1]) and xml.spacing or '')
    local last = runs[#runs]

    if rpr == '' and last and last.rpr == '' then
      last.text = last.text .. char -- 直前の書式なし run に続ける
    else
      runs:insert({ text = char, rpr = rpr })
    end
  end

  return runs
end

local function escape_xml(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

local function make_run(rpr, text)
  return string.format(
       '<w:r>' -- run
      .. '<w:rPr>%s</w:rPr>' -- rpr (run properties)
      .. '<w:t xml:space="preserve">%s</w:t>' -- text
    .. '</w:r>',
    rpr, escape_xml(text)
  )
end

return {
  {
    Strong = function(elem)
      if FORMAT ~= 'docx' then return nil end

      local text = pandoc.utils.stringify(elem.content)
      if not contains_japanese(text) then return nil end

      return split_runs_by_rules(text):map(function(run)
        return pandoc.RawInline('openxml', make_run(run.rpr .. xml.boten, run.text))
      end)
    end,
  },
  {
    Str = function(elem)
      if FORMAT ~= 'docx' then return nil end

      return split_runs_by_rules(elem.text):map(function(run)
        return run.rpr == '' and pandoc.Str(run.text)
          or pandoc.RawInline('openxml', make_run(run.rpr, run.text))
      end)
    end,
  },
}
