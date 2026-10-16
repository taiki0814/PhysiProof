-- Account for in-flight/failed uploads as well as successful immutable versions.
-- Reservations keep failed attempt write costs; never refund daily KV writes.
CREATE TABLE uniform_storage_reservations (
  id TEXT PRIMARY KEY,
  bytes_reserved INTEGER NOT NULL CHECK(bytes_reserved>=0),
  object_writes INTEGER NOT NULL CHECK(object_writes BETWEEN 2 AND 3),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','committed','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX uniform_storage_reservation_day ON uniform_storage_reservations(created_at);
CREATE INDEX uniform_storage_reservation_state ON uniform_storage_reservations(state);
