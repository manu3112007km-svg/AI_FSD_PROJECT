-- ResQNet PostgreSQL + PostGIS Reference Schema (17 Normalized Tables)
-- Note: In environments where hosted Cloud SQL/PostgreSQL is unavailable,
-- the backend mirrors this exact 17-table relational schema using SQLite.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  org_type VARCHAR(64) NOT NULL,
  approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  contact_email VARCHAR(200) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL,
  jurisdiction VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS response_teams (
  id SERIAL PRIMARY KEY,
  team_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'AVAILABLE',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_simulated_location BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES response_teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role VARCHAR(80) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  incident_code VARCHAR(40) NOT NULL UNIQUE,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category VARCHAR(80) NOT NULL,
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  location_text VARCHAR(300) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  people_affected INTEGER NOT NULL DEFAULT 1,
  contact_info VARCHAR(160) NOT NULL,
  additional_notes TEXT,
  priority VARCHAR(24) NOT NULL DEFAULT 'Medium',
  status VARCHAR(48) NOT NULL DEFAULT 'Reported',
  assigned_team_id INTEGER REFERENCES response_teams(id) ON DELETE SET NULL,
  verified_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  previous_status VARCHAR(48),
  new_status VARCHAR(48) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incident_attachments (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  resource_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Available',
  assigned_incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
  location_name VARCHAR(200) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_assignments (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  rationale TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS hospitals (
  id SERIAL PRIMARY KEY,
  hospital_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(300) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL,
  contact_email VARCHAR(200) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospital_capacity (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  ed_status VARCHAR(48) NOT NULL DEFAULT 'Operational',
  general_beds_available INTEGER NOT NULL DEFAULT 0,
  general_beds_total INTEGER NOT NULL DEFAULT 0,
  icu_beds_available INTEGER NOT NULL DEFAULT 0,
  icu_beds_total INTEGER NOT NULL DEFAULT 0,
  available_facilities TEXT NOT NULL,
  incoming_cases_count INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_role VARCHAR(64),
  category VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  related_incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  incident_category VARCHAR(80) NOT NULL,
  summary TEXT NOT NULL,
  priority_recommendation VARCHAR(24) NOT NULL,
  confidence INTEGER NOT NULL,
  detected_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning_summary TEXT NOT NULL,
  additional_information_needed JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incident_relationships (
  id SERIAL PRIMARY KEY,
  source_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  related_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,2) NOT NULL,
  relationship_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_incident_id, related_incident_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(64),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  details TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_priority ON incidents(status, priority);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_status_category ON resources(status, category);
CREATE INDEX IF NOT EXISTS idx_notifications_role_read ON notifications(target_role, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
