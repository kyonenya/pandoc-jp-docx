-- ルビ記法を Word のルビに変換する

local ruby_pattern = '｜(.-)《(.-)》'
local ruby_align = "distributeSpace" -- 「均等割り付け 2」(1-2-1)
local body_config = {
  ruby_pt  = 5.5,
  base_pt  = 11,
  raise_pt = 11, -- defaults to `base_pt`
}
local footnote_config = {
  ruby_pt  = 5,
  base_pt  = 10,
  raise_pt = 10,
}

local function escape_xml(s)
  return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'))
end

local function make_ruby_xml(conf, base, ruby)
  return string.format(
    '<w:r><w:ruby>'
    .. '<w:rubyPr>'
    ..   '<w:rubyAlign w:val="%s"/>'
    ..   '<w:hps w:val="%d"/>'
    ..   '<w:hpsRaise w:val="%d"/>'
    ..   '<w:hpsBaseText w:val="%d"/>'
    ..   '<w:lid w:val="ja-JP"/>'
    .. '</w:rubyPr>'
    .. '<w:rt><w:r><w:rPr><w:rFonts w:hint="eastAsia"/><w:sz w:val="%d"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:rt>'
    .. '<w:rubyBase><w:r><w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:rubyBase>'
    .. '</w:ruby></w:r>',
    ruby_align, conf.ruby_pt * 2, conf.raise_pt * 2, conf.base_pt * 2,
    conf.ruby_pt * 2, escape_xml(ruby), escape_xml(base)
  )
end

-- text -> [Str, RawInline, Str]
local function expand_ruby(text, conf)
  local before, base, ruby, after = text:match('(.-)' .. ruby_pattern .. '(.*)')
  if not base then return nil end

  local inlines = pandoc.List()

  if #before > 0 then
    inlines:insert(pandoc.Str(before))
  end
  inlines:insert(pandoc.RawInline('openxml', make_ruby_xml(conf, base, ruby)))

  local after_inlines = expand_ruby(after, conf) -- recursive
  if after_inlines then
    inlines:extend(after_inlines)
  elseif #after > 0 then
    inlines:insert(pandoc.Str(after))
  end

  return inlines
end

return {
  {
    -- replace ruby inside Note first, so the Str pass won't reach them
    Note = function(note)
      note.content = note.content:walk({
        Str = function(elem)
          if FORMAT ~= 'docx' then return nil end

          return expand_ruby(elem.text, footnote_config)
        end,
      })
      return note
    end,
  },
  {
    Str = function(elem)
      if FORMAT ~= 'docx' then return nil end

      return expand_ruby(elem.text, body_config)
    end,
  },
}
