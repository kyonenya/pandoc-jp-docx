-- Word の文字書式（OOXML の w:rPr）を指定した run を組み立てる
-- 1. 傍点 (w:em): 日本語を含む **強調** を丸傍点にする
-- 2. 半角幅の固定 (w:rFonts): Ambiguous 文字を半角で表示させる
-- 3. 和欧間アキ (w:spacing): 記号が挟まると Word が入れてくれないアキを補う

local xml = {
  boten = '<w:em w:val="dot"/>', -- 丸傍点。ゴマ傍点は "comma"
  half_width = '<w:rFonts w:hint="default"/>',
  spacing = '<w:spacing w:val="44"/>', -- 和欧間アキ 2.2pt
}

local rules = {
  spacing = {
    ['′'] = true, ['″'] = true, ['‴'] = true, ['('] = true, [')'] = true,
  },
  half_width = { ['§'] = true, ['′'] = true, ['″'] = true, ['‴'] = true },
}

local function escape_xml(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

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

-- 文字の境界にアキが要るか。記号が挟まると Word の自動アキが効かないので補う
-- w:spacing は run 内の各文字の後ろに入るので、呼び出し側は左の文字に付ける
local function needs_spacing(left, right)
  if left == nil or right == nil then return false end
  return (rules.spacing[left] and is_japanese(right)) -- 記号 → 和文
      or (is_japanese(left) and rules.spacing[right]) -- 和文 → 記号
end

local function make_run(rpr, text)
  return string.format(
    '<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r>',
    rpr, escape_xml(text)
  )
end

-- text -> [{ text, rpr }]
local function split_runs(text)
  local chars = {}
  for char in text:gmatch(utf8.charpattern) do chars[#chars + 1] = char end

  local runs, plain = pandoc.List(), ''
  local function flush()
    if plain ~= '' then runs:insert({ text = plain, rpr = '' }) end
    plain = ''
  end

  for i, char in ipairs(chars) do
    local rpr = (rules.half_width[char] and xml.half_width or '')
      .. (needs_spacing(char, chars[i + 1]) and xml.spacing or '')

    if rpr == '' then
      plain = plain .. char
    else
      flush()
      runs:insert({ text = char, rpr = rpr })
    end
  end

  if #runs == 0 then return nil end -- 対象文字なし。plain を flush する前に判定する
  flush()
  return runs
end

return {
  {
    -- 傍点。ruby.lua より先に処理する必要がある
    Strong = function(elem)
      if FORMAT ~= 'docx' then return nil end

      local text = pandoc.utils.stringify(elem.content)
      if not contains_japanese(text) then return nil end

      local runs = split_runs(text) or pandoc.List({ { text = text, rpr = '' } })
      return runs:map(function(run)
        return pandoc.RawInline('openxml', make_run(run.rpr .. xml.boten, run.text))
      end)
    end,
  },
  {
    -- 半角幅の固定とアキ補正
    Str = function(elem)
      if FORMAT ~= 'docx' then return nil end

      local runs = split_runs(elem.text)
      if not runs then return nil end

      return runs:map(function(run)
        return run.rpr == '' and pandoc.Str(run.text)
          or pandoc.RawInline('openxml', make_run(run.rpr, run.text))
      end)
    end,
  },
}
