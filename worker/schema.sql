-- Abonnements aux notifications : un par téléphone (endpoint push), avec ses réglages et la prochaine échéance
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- empreinte SHA-256 de l'endpoint
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  cfg TEXT NOT NULL,            -- JSON : ville arrondie (~1 km), fuseau, méthode de calcul, rappels choisis
  next_at INTEGER,              -- prochaine notification (ms depuis 1970), NULL si aucun rappel actif
  updated INTEGER NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS subs_next ON subs(next_at);
