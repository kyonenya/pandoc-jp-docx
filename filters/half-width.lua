-- 登録した Ambiguous 文字を Word で半角/全角として表示するよう固定する
-- curl -L https://emonkak.pages.dev/articles/wcwidth/ambiguous_width_characters.txt | awk -F '\t' 'NR == 1 || $NF == "A"'

local char_to_hint = {
  -- 半角に固定
  ['§'] = 'default',
  ['′'] = 'default',
  ['″'] = 'default',
  ['‴'] = 'default',
  -- 全角に固定
  -- ['①'] = 'eastAsia',
}

local function escape_xml(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

local function make_hint_xml(char, hint)
  return string.format(
    '<w:r><w:rPr><w:rFonts w:hint="%s"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r>',
    hint, escape_xml(char)
  )
end

-- 選言マッチ
-- text:match('(.-)([§′″])(.*)')
local function match_chars(text)
  for pos, codepoint in utf8.codes(text) do
    local char = utf8.char(codepoint)
    if char_to_hint[char] then
      return text:sub(1, pos - 1), char, text:sub(pos + #char)
    end
  end
end

-- text -> [Str, RawInline, Str]
local function expand_width(text)
  local before, char, after = match_chars(text)
  if not char then return nil end

  local inlines = pandoc.List()
  if #before > 0 then
    inlines:insert(pandoc.Str(before))
  end
  inlines:insert(pandoc.RawInline('openxml', make_hint_xml(char, char_to_hint[char])))

  local after_inlines = expand_width(after) -- recursive
  if after_inlines then
    inlines:extend(after_inlines)
  elseif #after > 0 then
    inlines:insert(pandoc.Str(after))
  end

  return inlines
end

function Str(elem)
  if FORMAT ~= 'docx' then return nil end

  return expand_width(elem.text)
end
