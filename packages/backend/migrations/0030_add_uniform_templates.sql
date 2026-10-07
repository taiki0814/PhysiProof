-- Complete-design catalog. Saved uniforms contain their own design snapshots.
CREATE TABLE uniform_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  design_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_uniform_templates_catalog ON uniform_templates(status, sort_order, id);

INSERT INTO uniform_templates (id, name, category, status, sort_order, design_json) VALUES
('builtin-volt', 'VOLT RUN', 'スポーツ', 'published', 0, '{"version":1,"base_id":"classic","pattern_id":"diagonal","line_id":"side","emblem_id":"bolt","colors":{"body":"#151c2c","secondary":"#253449","collar":"#ffffff","pattern":"#a8ff3e","line":"#ffffff","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}'),
('builtin-tide', 'TIDE CREW', 'スポーツ', 'published', 10, '{"version":1,"base_id":"classic","pattern_id":"chevron","line_id":"side","emblem_id":"shield","colors":{"body":"#123043","secondary":"#253449","collar":"#ffffff","pattern":"#00d4ff","line":"#ffffff","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}'),
('builtin-ink', 'INK DASH', 'インク', 'published', 20, '{"version":1,"base_id":"classic","pattern_id":"ink","line_id":"side","emblem_id":"paw","colors":{"body":"#291742","secondary":"#253449","collar":"#ffffff","pattern":"#ff53c7","line":"#ffd166","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}'),
('builtin-sunrise', 'SUNRISE', 'スポーツ', 'published', 30, '{"version":1,"base_id":"tank","pattern_id":"gradient","line_id":"arc","emblem_id":"mountain","colors":{"body":"#ff7348","secondary":"#253449","collar":"#ffffff","pattern":"#ffcc33","line":"#241e37","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}'),
('builtin-storm', 'STORM', 'スポーツ', 'published', 40, '{"version":1,"base_id":"raglan","pattern_id":"lightning","line_id":"shoulder","emblem_id":"wing","colors":{"body":"#192531","secondary":"#384d63","collar":"#ffffff","pattern":"#8faaff","line":"#ffffff","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}'),
('builtin-grid', 'CITY GRID', 'シティ', 'published', 50, '{"version":1,"base_id":"classic","pattern_id":"grid","line_id":"slash","emblem_id":"star","colors":{"body":"#123929","secondary":"#253449","collar":"#ffffff","pattern":"#40e7ad","line":"#ffdb70","emblem":"#ffffff","text":"#ffffff"},"line_width":5,"emblem_position":"chest_left","emblem_size":1,"emblem_offset_x":0,"emblem_offset_y":0,"font_id":"block","jersey_name":"","number":""}');
