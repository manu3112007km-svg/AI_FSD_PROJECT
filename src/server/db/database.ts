import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../services/auth.ts';
import { fallbackAnalyzeIncident } from '../domain/rules.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.RESQNET_DB_PATH
  ? path.resolve(process.env.RESQNET_DB_PATH)
  : path.join(DATA_DIR, 'resqnet.db');

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    initializeSchema(dbInstance);
    ensureSeeded(dbInstance);
  }
  return dbInstance;
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- 1. roles
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. organizations
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      org_type TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'PENDING',
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. user_roles
    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, role_id)
    );

    -- 5. response_teams
    CREATE TABLE IF NOT EXISTS response_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_simulated_location INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. team_members
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES response_teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_role TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (team_id, user_id)
    );

    -- 7. incidents
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_code TEXT NOT NULL UNIQUE,
      reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location_text TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      location_source TEXT NOT NULL DEFAULT 'MANUAL',
      people_affected INTEGER NOT NULL DEFAULT 1,
      contact_info TEXT NOT NULL,
      additional_notes TEXT,
      priority TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Reported',
      assigned_team_id INTEGER REFERENCES response_teams(id) ON DELETE SET NULL,
      verified_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      reported_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. incident_updates
    CREATE TABLE IF NOT EXISTS incident_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. incident_attachments
    CREATE TABLE IF NOT EXISTS incident_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. resources
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available',
      assigned_incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. resource_assignments
    CREATE TABLE IF NOT EXISTS resource_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      rationale TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      released_at TEXT
    );

    -- 12. hospitals
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      is_verified INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. hospital_capacity
    CREATE TABLE IF NOT EXISTS hospital_capacity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      ed_status TEXT NOT NULL DEFAULT 'Operational',
      general_beds_available INTEGER NOT NULL DEFAULT 0,
      general_beds_total INTEGER NOT NULL DEFAULT 0,
      icu_beds_available INTEGER NOT NULL DEFAULT 0,
      icu_beds_total INTEGER NOT NULL DEFAULT 0,
      available_facilities TEXT NOT NULL,
      incoming_cases_count INTEGER NOT NULL DEFAULT 0,
      updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 14. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. ai_analysis
    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
      incident_category TEXT NOT NULL,
      summary TEXT NOT NULL,
      priority_recommendation TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      detected_keywords TEXT NOT NULL DEFAULT '[]',
      required_resources TEXT NOT NULL DEFAULT '[]',
      reasoning_summary TEXT NOT NULL,
      additional_information_needed TEXT NOT NULL DEFAULT '[]',
      provider TEXT NOT NULL DEFAULT 'gemini',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. incident_relationships
    CREATE TABLE IF NOT EXISTS incident_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      related_incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      similarity_score REAL NOT NULL,
      relationship_reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (source_incident_id, related_incident_id)
    );

    -- 17. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status_priority ON incidents(status, priority);
    CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at);
    CREATE INDEX IF NOT EXISTS idx_resources_status_category ON resources(status, category);
    CREATE INDEX IF NOT EXISTS idx_notifications_role_read ON notifications(target_role, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}

function ensureSeeded(db: DatabaseSync): void {
  const row = db.prepare('SELECT COUNT(*) AS count FROM roles').get() as { count: number };
  if (row.count === 0) {
    seedDemoData(db, false);
  }
}

export function seedDemoData(db: DatabaseSync, wipeExisting = false): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (wipeExisting) {
      db.exec(`
        DELETE FROM audit_logs;
        DELETE FROM incident_relationships;
        DELETE FROM ai_analysis;
        DELETE FROM notifications;
        DELETE FROM hospital_capacity;
        DELETE FROM hospitals;
        DELETE FROM resource_assignments;
        DELETE FROM resources;
        DELETE FROM incident_attachments;
        DELETE FROM incident_updates;
        DELETE FROM incidents;
        DELETE FROM team_members;
        DELETE FROM response_teams;
        DELETE FROM user_roles;
        DELETE FROM users;
        DELETE FROM organizations;
        DELETE FROM roles;
      `);
    }

    const insertRole = db.prepare(
      'INSERT INTO roles (code, name, description) VALUES (?, ?, ?)'
    );
    const rolesData: Array<[string, string, string]> = [
      ['SUPER_ADMIN', 'Super Administrator', 'Full platform oversight, user/org governance, audit logs, and analytics'],
      ['EMERGENCY_COORDINATOR', 'Emergency Coordinator', 'Verifies incidents, reviews AI advisories, and approves resource dispatch'],
      ['EMERGENCY_RESPONDER', 'Emergency Responder', 'Accepts field assignments, updates live progress, and logs arrival'],
      ['HOSPITAL_ADMIN', 'Hospital Administrator', 'Maintains verified bed, ICU, and emergency department capacity'],
      ['CITIZEN', 'Citizen', 'Submits emergency reports, tracks updates, and locates verified hospitals'],
    ];
    for (const [code, name, desc] of rolesData) {
      insertRole.run(code, name, desc);
    }

    const getRoleId = (code: string) =>
      (db.prepare('SELECT id FROM roles WHERE code = ?').get(code) as { id: number }).id;

    const insertOrg = db.prepare(
      'INSERT INTO organizations (name, org_type, approval_status, contact_email, contact_phone, jurisdiction) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const orgCmdId = Number(
      insertOrg.run(
        'ResQNet Civic Coordination Authority',
        'Coordination Center',
        'APPROVED',
        'dispatch@resqnet.demo',
        '+1-415-555-0100',
        'Metro Bay Sector'
      ).lastInsertRowid
    );
    const orgEmsId = Number(
      insertOrg.run(
        'Golden Gate Fire & Rescue Services',
        'Emergency Response',
        'APPROVED',
        'ops@ggrescue.demo',
        '+1-415-555-0122',
        'Central & North District'
      ).lastInsertRowid
    );
    const orgHospId = Number(
      insertOrg.run(
        'St. Aurelia Regional Medical Network',
        'Healthcare Network',
        'APPROVED',
        'capacity@staurelia.demo',
        '+1-415-555-0144',
        'Metro Bay Sector'
      ).lastInsertRowid
    );
    insertOrg.run(
      'Harbor Volunteer Relief Brigade',
      'Disaster Relief NGO',
      'PENDING',
      'intake@harborrelief.demo',
      '+1-415-555-0188',
      'Waterfront & South District'
    );

    const demoPassHash = hashPassword('ResQNet2026!');
    const insertUser = db.prepare(
      'INSERT INTO users (email, password_hash, full_name, phone, organization_id, is_active, is_demo) VALUES (?, ?, ?, ?, ?, 1, 1)'
    );
    const assignUserRole = db.prepare(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'
    );

    const adminId = Number(
      insertUser.run('admin@resqnet.demo', demoPassHash, 'Evelyn Vance (Demo)', '+1-415-555-0101', orgCmdId).lastInsertRowid
    );
    assignUserRole.run(adminId, getRoleId('SUPER_ADMIN'));

    const coordId = Number(
      insertUser.run('coordinator@resqnet.demo', demoPassHash, 'Marcus Sterling (Demo)', '+1-415-555-0102', orgCmdId).lastInsertRowid
    );
    assignUserRole.run(coordId, getRoleId('EMERGENCY_COORDINATOR'));

    const respId = Number(
      insertUser.run('responder@resqnet.demo', demoPassHash, 'Lt. Elena Rostova (Demo)', '+1-415-555-0103', orgEmsId).lastInsertRowid
    );
    assignUserRole.run(respId, getRoleId('EMERGENCY_RESPONDER'));

    const hospAdminId = Number(
      insertUser.run('hospital@resqnet.demo', demoPassHash, 'Dr. Julian Mercer (Demo)', '+1-415-555-0104', orgHospId).lastInsertRowid
    );
    assignUserRole.run(hospAdminId, getRoleId('HOSPITAL_ADMIN'));

    const citizenId = Number(
      insertUser.run('citizen@resqnet.demo', demoPassHash, 'Aria Chen (Demo)', '+1-415-555-0105', null).lastInsertRowid
    );
    assignUserRole.run(citizenId, getRoleId('CITIZEN'));

    // Response teams
    const insertTeam = db.prepare(
      'INSERT INTO response_teams (team_code, name, specialty, organization_id, status, latitude, longitude, is_simulated_location) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    );
    const teamAlphaId = Number(
      insertTeam.run('TEAM-ALPHA', 'Alpha Rapid Medical & Rescue', 'Trauma & Extraction', orgEmsId, 'DEPLOYED', 37.7812, -122.411).lastInsertRowid
    );
    const teamBravoId = Number(
      insertTeam.run('TEAM-BRAVO', 'Bravo Structural Fire Squad', 'Fire & Hazardous Containment', orgEmsId, 'AVAILABLE', 37.7685, -122.429).lastInsertRowid
    );
    const teamCharlieId = Number(
      insertTeam.run('TEAM-CHARLIE', 'Charlie Swiftwater & Flood Unit', 'Flood Rescue & Evacuation', orgEmsId, 'DEPLOYED', 37.7921, -122.398).lastInsertRowid
    );
    const teamDeltaId = Number(
      insertTeam.run('TEAM-DELTA', 'Delta Civic Safety Patrol', 'Public Safety & Search', orgCmdId, 'AVAILABLE', 37.7592, -122.414).lastInsertRowid
    );

    const insertMember = db.prepare(
      'INSERT INTO team_members (team_id, user_id, member_role) VALUES (?, ?, ?)'
    );
    insertMember.run(teamAlphaId, respId, 'Team Lead');

    // Hospitals & Capacities
    const nowIso = new Date().toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    const nineHoursAgo = new Date(Date.now() - 9 * 3600_000).toISOString();

    const insertHospital = db.prepare(
      'INSERT INTO hospitals (hospital_code, name, address, contact_phone, contact_email, latitude, longitude, organization_id, is_verified, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    );
    const insertCapacity = db.prepare(
      'INSERT INTO hospital_capacity (hospital_id, ed_status, general_beds_available, general_beds_total, icu_beds_available, icu_beds_total, available_facilities, incoming_cases_count, updated_by_user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const h1 = Number(
      insertHospital.run(
        'HOSP-01',
        'St. Aurelia Trauma & Medical Center',
        '1150 Golden Gate Ave, Central Sector',
        '+1-415-555-0201',
        'ed@staurelia.demo',
        37.7795,
        -122.4312,
        orgHospId,
        1
      ).lastInsertRowid
    );
    insertCapacity.run(h1, 'Operational', 24, 120, 6, 22, 'Level 1 Trauma, Cardiac ICU, Burn Unit, Helipad', 3, hospAdminId, nowIso);

    const h2 = Number(
      insertHospital.run(
        'HOSP-02',
        'Bayfront Civic General Hospital',
        '480 Embarcadero Blvd, Waterfront Sector',
        '+1-415-555-0202',
        'intake@bayfrontmed.demo',
        37.7955,
        -122.3937,
        orgHospId,
        1
      ).lastInsertRowid
    );
    insertCapacity.run(h2, 'High Load', 9, 95, 2, 16, 'Emergency Surgery, Stroke Unit, Pediatric Care', 4, hospAdminId, twoHoursAgo);

    const h3 = Number(
      insertHospital.run(
        'HOSP-03',
        'Presidio Heights Community Hospital',
        '2240 Clay St, North Ridge',
        '+1-415-555-0203',
        'triage@presidiomed.demo',
        37.7902,
        -122.4445,
        orgHospId,
        1
      ).lastInsertRowid
    );
    insertCapacity.run(h3, 'Operational', 18, 70, 5, 12, 'Orthopedics, General Emergency, CT Imaging', 1, hospAdminId, nineHoursAgo);

    const h4 = Number(
      insertHospital.run(
        'HOSP-04',
        'Mission Valley Urgent Medical Annex',
        '3100 Mission St, South Valley',
        '+1-415-555-0204',
        'info@missionannex.demo',
        37.7485,
        -122.4182,
        null,
        0
      ).lastInsertRowid
    );
    insertCapacity.run(h4, 'Limited Triage', 12, 40, 0, 4, 'Urgent Stabilization, Ambulance Bay', 0, null, nineHoursAgo);

    // Incidents (with varying timestamps over past 14 days for analytics)
    const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    const insertIncident = db.prepare(`
      INSERT INTO incidents (
        incident_code, reporter_user_id, category, title, description, location_text,
        latitude, longitude, location_source, people_affected, contact_info, additional_notes,
        priority, status, assigned_team_id, verified_by_user_id, is_demo, reported_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED_DEMO', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);

    const inc1 = Number(
      insertIncident.run(
        'INC-2026-1001',
        citizenId,
        'Road Accident',
        'Multi-vehicle collision on Market & Van Ness',
        'Three-car collision blocking westbound lanes with two occupants trapped and heavy smoke from engine bay.',
        'Market St & Van Ness Ave, Central Sector',
        37.7752,
        -122.4192,
        4,
        'Aria Chen · +1-415-555-0105',
        'Traffic completely stalled; access possible via 11th St.',
        'Critical',
        'Response in Progress',
        teamAlphaId,
        coordId,
        hoursAgoIso(1.5),
        hoursAgoIso(1.5),
        hoursAgoIso(0.5)
      ).lastInsertRowid
    );

    const inc2 = Number(
      insertIncident.run(
        'INC-2026-1002',
        citizenId,
        'Flooding',
        'Rapid storm-drain overflow at Embarcadero Pier 24',
        'Knee-deep rising water trapping commuters near transit shelter along Embarcadero waterfront.',
        'Embarcadero Pier 24, Waterfront Sector',
        37.7918,
        -122.3915,
        7,
        'Harbor Transit Desk · +1-415-555-0166',
        'Electrical junction boxes nearby.',
        'High',
        'Assigned',
        teamCharlieId,
        coordId,
        hoursAgoIso(3),
        hoursAgoIso(3),
        hoursAgoIso(1)
      ).lastInsertRowid
    );

    const inc3 = Number(
      insertIncident.run(
        'INC-2026-1003',
        citizenId,
        'Fire Emergency',
        'Commercial kitchen grease fire at Chinatown Alley',
        'Heavy black smoke venting from second-floor restaurant exhaust duct, adjacent apartments evacuating.',
        '742 Grant Ave, Northeast Sector',
        37.7941,
        -122.4064,
        12,
        'Building Steward · +1-415-555-0171',
        'Narrow alley access for ladder trucks.',
        'Critical',
        'Under Verification',
        null,
        null,
        hoursAgoIso(0.4),
        hoursAgoIso(0.4),
        hoursAgoIso(0.4)
      ).lastInsertRowid
    );

    const inc4 = Number(
      insertIncident.run(
        'INC-2026-1004',
        citizenId,
        'Medical Emergency',
        'Elderly pedestrian experiencing acute chest pain',
        'Conscious 68-year-old male seated inside Civic Library atrium reporting radiating chest pain and dizziness.',
        '100 Larkin St, Civic Center',
        37.7791,
        -122.4158,
        1,
        'Library Security · +1-415-555-0190',
        'AED on standby at front desk.',
        'High',
        'Reported',
        null,
        null,
        hoursAgoIso(0.2),
        hoursAgoIso(0.2),
        hoursAgoIso(0.2)
      ).lastInsertRowid
    );

    const inc5 = Number(
      insertIncident.run(
        'INC-2026-1005',
        citizenId,
        'Flooding',
        'Underpass water accumulation near Ferry Building',
        'Standing storm surge water delaying emergency vehicles near Market & Embarcadero transit plaza.',
        'Ferry Building Plaza, Waterfront Sector',
        37.7948,
        -122.3935,
        3,
        'Aria Chen · +1-415-555-0105',
        'Related to waterfront storm drain surge.',
        'Medium',
        'Verified',
        null,
        coordId,
        hoursAgoIso(2.2),
        hoursAgoIso(2.2),
        hoursAgoIso(1.2)
      ).lastInsertRowid
    );

    const inc6 = Number(
      insertIncident.run(
        'INC-2026-1006',
        citizenId,
        'Building Emergency',
        'Elevator entrapment at Powell Commercial Tower',
        'Four office staff inside stalled elevator between 6th and 7th floors following localized power dip.',
        '450 Powell St, Union District',
        37.7889,
        -122.4085,
        4,
        'Tower Concierge · +1-415-555-0155',
        'Intercom operational; occupants calm.',
        'Medium',
        'Resolved',
        teamBravoId,
        coordId,
        hoursAgoIso(28),
        hoursAgoIso(28),
        hoursAgoIso(25)
      ).lastInsertRowid
    );

    const inc7 = Number(
      insertIncident.run(
        'INC-2026-1007',
        citizenId,
        'Missing Person',
        'Missing elderly visitor near Golden Gate Park East',
        '79-year-old visitor wearing navy wool coat last seen near conservatory entrance 90 minutes ago.',
        '100 John F Kennedy Dr, Park East',
        37.7726,
        -122.4601,
        1,
        'Family Contact · +1-415-555-0199',
        'Carries medical alert bracelet.',
        'High',
        'Resolved',
        teamDeltaId,
        coordId,
        hoursAgoIso(74),
        hoursAgoIso(74),
        hoursAgoIso(70)
      ).lastInsertRowid
    );

    // Incident updates
    const insertUpdate = db.prepare(
      'INSERT INTO incident_updates (incident_id, actor_user_id, previous_status, new_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertUpdate.run(inc1, citizenId, null, 'Reported', 'Citizen submitted multi-vehicle collision report.', hoursAgoIso(1.5));
    insertUpdate.run(inc1, coordId, 'Reported', 'Verified', 'Verified by Coordinator Marcus Sterling via traffic camera feed.', hoursAgoIso(1.3));
    insertUpdate.run(inc1, coordId, 'Verified', 'Assigned', 'Dispatched Alpha Rapid Medical & Rescue and Ambulance AMB-101.', hoursAgoIso(1.1));
    insertUpdate.run(inc1, respId, 'Assigned', 'Response in Progress', 'Team Alpha arrived on scene; hydraulic extraction underway.', hoursAgoIso(0.5));

    insertUpdate.run(inc2, citizenId, null, 'Reported', 'Waterfront flooding reported at Pier 24.', hoursAgoIso(3));
    insertUpdate.run(inc2, coordId, 'Reported', 'Verified', 'Confirmed coastal storm surge overflow.', hoursAgoIso(2.5));
    insertUpdate.run(inc2, coordId, 'Verified', 'Assigned', 'Assigned Charlie Swiftwater & Flood Unit.', hoursAgoIso(1));

    insertUpdate.run(inc3, citizenId, null, 'Reported', 'Reported commercial kitchen fire and smoke.', hoursAgoIso(0.4));
    insertUpdate.run(inc3, coordId, 'Reported', 'Under Verification', 'Coordinator reviewing adjacent building evacuation status.', hoursAgoIso(0.3));

    insertUpdate.run(inc4, citizenId, null, 'Reported', 'Acute medical alert submitted from Civic Library.', hoursAgoIso(0.2));
    insertUpdate.run(inc5, citizenId, null, 'Reported', 'Transit plaza water accumulation reported.', hoursAgoIso(2.2));
    insertUpdate.run(inc5, coordId, 'Reported', 'Verified', 'Verified and linked for waterfront flood clustering advisory.', hoursAgoIso(1.2));

    insertUpdate.run(inc6, coordId, 'Verified', 'Resolved', 'Occupants safely assisted out of elevator; power restored.', hoursAgoIso(25));
    insertUpdate.run(inc7, coordId, 'Assigned', 'Resolved', 'Individual located safely at botanical pavilion and reunited.', hoursAgoIso(70));

    // Resources
    const insertResource = db.prepare(`
      INSERT INTO resources (resource_code, name, category, status, assigned_incident_id, location_name, latitude, longitude, organization_id, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const res1 = Number(
      insertResource.run('RES-AMB-101', 'Advanced Life Support Ambulance 101', 'Ambulance', 'Assigned', inc1, 'Central Station Bay 1', 37.7765, -122.418, orgEmsId).lastInsertRowid
    );
    insertResource.run('RES-AMB-102', 'Rapid Trauma Ambulance 102', 'Ambulance', 'Available', null, 'Civic Medical Hub', 37.7815, -122.426, orgEmsId);
    insertResource.run('RES-ERV-201', 'Heavy Rescue Ladder Engine 201', 'Emergency Response Vehicle', 'Available', null, 'North Firehouse 4', 37.7912, -122.412, orgEmsId);
    const res4 = Number(
      insertResource.run('RES-RT-301', 'Swiftwater Inflatable Rescue Unit', 'Rescue Team', 'Assigned', inc2, 'Waterfront Pier 22 Depot', 37.7924, -122.394, orgEmsId).lastInsertRowid
    );
    insertResource.run('RES-MED-401', 'Mobile Trauma Triage Kit (20-Bed)', 'Medical Supplies', 'Available', null, 'St. Aurelia Logistics Annex', 37.7798, -122.430, orgHospId);
    insertResource.run('RES-SHL-501', 'Civic Pavilion Emergency Shelter', 'Temporary Shelter', 'Available', null, 'Civic Auditorium Hall B', 37.7782, -122.417, orgCmdId);
    insertResource.run('RES-EQP-601', 'High-Capacity Flood Dewatering Pump', 'Emergency Equipment', 'Available', null, 'Waterfront Utility Yard', 37.7872, -122.395, orgCmdId);
    insertResource.run('RES-AMB-103', 'Reserve Ambulance 103', 'Ambulance', 'Under Maintenance', null, 'South Fleet Maintenance', 37.7521, -122.410, orgEmsId);

    const insertAssignment = db.prepare(
      'INSERT INTO resource_assignments (resource_id, incident_id, assigned_by_user_id, status, rationale) VALUES (?, ?, ?, ?, ?)'
    );
    insertAssignment.run(res1, inc1, coordId, 'ACTIVE', 'Immediate ALS trauma support for multi-vehicle entrapment.');
    insertAssignment.run(res4, inc2, coordId, 'ACTIVE', 'Waterfront flood extraction capability at Pier 24.');

    // AI analyses for seeded incidents
    const insertAi = db.prepare(`
      INSERT INTO ai_analysis (
        incident_id, incident_category, summary, priority_recommendation, confidence,
        detected_keywords, required_resources, reasoning_summary, additional_information_needed, provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seededIncidents: Array<{ id: number; category: string; description: string; locationText: string; peopleAffected: number }> = [
      { id: inc1, category: 'Road Accident', description: 'Three-car collision blocking westbound lanes with two occupants trapped and heavy smoke from engine bay.', locationText: 'Market St & Van Ness Ave', peopleAffected: 4 },
      { id: inc2, category: 'Flooding', description: 'Knee-deep rising water trapping commuters near transit shelter along Embarcadero waterfront.', locationText: 'Embarcadero Pier 24', peopleAffected: 7 },
      { id: inc3, category: 'Fire Emergency', description: 'Heavy black smoke venting from second-floor restaurant exhaust duct, adjacent apartments evacuating.', locationText: '742 Grant Ave', peopleAffected: 12 },
      { id: inc4, category: 'Medical Emergency', description: 'Conscious 68-year-old male seated inside Civic Library atrium reporting radiating chest pain and dizziness.', locationText: '100 Larkin St', peopleAffected: 1 },
      { id: inc5, category: 'Flooding', description: 'Standing storm surge water delaying emergency vehicles near Market & Embarcadero transit plaza.', locationText: 'Ferry Building Plaza', peopleAffected: 3 },
      { id: inc6, category: 'Building Emergency', description: 'Four office staff inside stalled elevator between 6th and 7th floors following localized power dip.', locationText: '450 Powell St', peopleAffected: 4 },
      { id: inc7, category: 'Missing Person', description: '79-year-old visitor wearing navy wool coat last seen near conservatory entrance 90 minutes ago.', locationText: '100 John F Kennedy Dr', peopleAffected: 1 },
    ];
    for (const s of seededIncidents) {
      const analysis = fallbackAnalyzeIncident(s);
      insertAi.run(
        s.id,
        analysis.incident_category,
        analysis.summary,
        analysis.priority_recommendation,
        analysis.confidence,
        JSON.stringify(analysis.detected_keywords),
        JSON.stringify(analysis.required_resources),
        analysis.reasoning_summary,
        JSON.stringify(analysis.additional_information_needed),
        'fallback_rules'
      );
    }

    // Incident relationship (clustering advisory between Pier 24 & Ferry Building flooding)
    db.prepare(
      'INSERT INTO incident_relationships (source_incident_id, related_incident_id, similarity_score, relationship_reason) VALUES (?, ?, ?, ?)'
    ).run(
      inc5,
      inc2,
      84.5,
      'Matching category (Flooding) · Within 0.38 km waterfront proximity · Same operational shift'
    );

    // Notifications
    const insertNotif = db.prepare(
      'INSERT INTO notifications (user_id, target_role, category, title, message, related_incident_id, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)'
    );
    insertNotif.run(null, 'EMERGENCY_COORDINATOR', 'New emergency report', 'New Medical Emergency (INC-2026-1004)', 'Acute chest pain case reported at Civic Center awaiting coordinator verification.', inc4);
    insertNotif.run(null, 'EMERGENCY_COORDINATOR', 'Incident verification', 'Fire Emergency Under Verification (INC-2026-1003)', 'Grant Ave commercial smoke report requires priority confirmation.', inc3);
    insertNotif.run(respId, 'EMERGENCY_RESPONDER', 'Resource assignment', 'Active Assignment: INC-2026-1001', 'Alpha Rapid Medical & Rescue assigned with Ambulance RES-AMB-101.', inc1);
    insertNotif.run(null, 'HOSPITAL_ADMIN', 'Hospital capacity update', 'Capacity Refresh Advisory: St. Aurelia & Presidio', 'Presidio Heights capacity record is older than 6 hours and marked stale.', null);
    insertNotif.run(citizenId, 'CITIZEN', 'Response progress', 'Update on INC-2026-1001', 'Response team has arrived on scene at Market St & Van Ness Ave.', inc1);

    // Audit logs
    const insertAudit = db.prepare(
      'INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertAudit.run(adminId, 'SUPER_ADMIN', 'SYSTEM_DEMO_SEEDED', 'system', 'demo-v1', 'Initialized ResQNet demonstration dataset across 17 relational tables.');
    insertAudit.run(coordId, 'EMERGENCY_COORDINATOR', 'INCIDENT_VERIFIED', 'incident', 'INC-2026-1001', 'Verified multi-vehicle collision and authorized Team Alpha dispatch.');
    insertAudit.run(hospAdminId, 'HOSPITAL_ADMIN', 'HOSPITAL_CAPACITY_UPDATED', 'hospital', 'HOSP-01', 'Updated St. Aurelia general bed and ICU availability.');

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
