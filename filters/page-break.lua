-- フェンス付き div を Word の改ページに変換する
-- ::: {.page-break} ::: → 改ページ

function Div(elem)
  if FORMAT ~= 'docx' then return nil end

  if elem.classes:includes('page-break') then
    local xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    return pandoc.RawBlock('openxml', xml)
  end
end
