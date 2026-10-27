ALTER TABLE team_battles ADD COLUMN territory_lifetime_hours REAL CHECK(territory_lifetime_hours IS NULL OR (territory_lifetime_hours>=1.0/60 AND territory_lifetime_hours<=8760 AND map_mode='isolated'));
CREATE TABLE running_courses (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,route_json TEXT NOT NULL,length_m REAL NOT NULL CHECK(length_m>=200 AND length_m<=30000),
 source_session_id TEXT NOT NULL REFERENCES running_sessions(id),archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_running_courses_owner ON running_courses(user_id,archived);
ALTER TABLE running_sessions ADD COLUMN course_id TEXT REFERENCES running_courses(id);
CREATE TABLE running_course_progress (
 session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
 course_id TEXT NOT NULL REFERENCES running_courses(id),state_json TEXT NOT NULL,laps INTEGER NOT NULL CHECK(laps>=0)
);
CREATE TABLE running_course_completions (
 session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
 course_id TEXT NOT NULL REFERENCES running_courses(id),user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 laps INTEGER NOT NULL CHECK(laps>0),length_m REAL NOT NULL,completed_at TEXT NOT NULL
);
CREATE INDEX idx_course_completions_owner ON running_course_completions(user_id,course_id);
CREATE TABLE course_cosmetic_unlocks (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reward_id TEXT NOT NULL,
 unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,reward_id)
);
CREATE TABLE course_cosmetic_equipment (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,title_id TEXT,frame_id TEXT,revision INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER complete_course_laps AFTER UPDATE OF status ON running_sessions WHEN OLD.status='active' AND NEW.status<>'active'
BEGIN
 INSERT OR IGNORE INTO running_course_completions(session_id,course_id,user_id,laps,length_m,completed_at)
 SELECT NEW.id,c.id,NEW.user_id,p.laps,c.length_m,NEW.completed_at FROM running_course_progress p JOIN running_courses c ON c.id=p.course_id
 WHERE p.session_id=NEW.id AND NEW.status='completed' AND NEW.distance_m>0 AND NEW.duration_sec>0 AND p.laps>0
   AND c.id=NEW.course_id AND c.user_id=NEW.user_id AND NEW.distance_m>=p.laps*c.length_m*.85;
 DELETE FROM running_course_progress WHERE session_id=NEW.id;
END;
