import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AnalyticsOverview,
  AuthUser,
  HospitalRecord,
  IncidentCategory,
  IncidentPriority,
  IncidentRecord,
  IncidentStatus,
  ResourceRecord,
  UserRole,
} from '../types/resqnet.ts';
import {
  INCIDENT_CATEGORIES,
  VALID_ROLES,
  calculateIncidentSimilarity,
  canAssignResources,
  canManageUsers,
  canUpdateHospitalCapacity,
  canVerifyIncident,
  isCapacityStale,
  isValidStatusTransition,
  recommendResourcesForIncident,
} from './domain/rules.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  rateLimit,
  requireAuth,
  requireRoles,
  signToken,
  verifyPassword,
} from './services/auth.ts';
import {
  analyzeIncidentWithAI,
  answerDecisionSupportQuery,
  extractNaturalLanguageReport,
  generateOperationalObservations,
} from './services/ai.ts';
import { getDb, seedDemoData } from './db/database.ts';
import { broadcastRealtimeEvent } from './ws.ts';

function writeAuditLog(
  db: DatabaseSync,
  actorUserId: number | null,
  actorRole: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: string | null,
  ipAddress?: string
): void {
  db.prepare(
    'INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actorUserId, actorRole, action, entityType, entityId, details, ipAddress || null);
}

function createNotification(
  db: DatabaseSync,
  params: {
    userId?: number | null;
    targetRole?: UserRole | null;
    category: string;
    title: string;
    message: string;
    relatedIncidentId?: number | null;
  }
): void {
  const result = db
    .prepare(
      'INSERT INTO notifications (user_id, target_role, category, title, message, related_incident_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      params.userId ?? null,
      params.targetRole ?? null,
      params.category,
      params.title,
      params.message,
      params.relatedIncidentId ?? null
    );
  broadcastRealtimeEvent('notification:created', {
    id: Number(result.lastInsertRowid),
    targetRole: params.targetRole ?? null,
    userId: params.userId ?? null,
    category: params.category,
    title: params.title,
    message: params.message,
  });
}

function mapUserRow(db: DatabaseSync, userId: number): AuthUser | null {
  const row = db
    .prepare(`
      SELECT u.id, u.email, u.full_name, u.phone, u.organization_id, u.is_active, u.is_demo,
             r.code AS role_code, o.name AS org_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ?
    `)
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    phone: row.phone ? String(row.phone) : null,
    role: String(row.role_code) as UserRole,
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    organizationName: row.org_name ? String(row.org_name) : null,
    isActive: Boolean(row.is_active),
    isDemo: Boolean(row.is_demo),
  };
}

function mapIncidentRows(
  db: DatabaseSync,
  viewerRole: UserRole,
  viewerUserId: number,
  whereSql = '',
  params: Array<string | number | null> = []
): IncidentRecord[] {
  const rows = db
    .prepare(`
      SELECT i.*,
             ru.full_name AS reporter_name,
             vu.full_name AS verified_by_name,
             rt.name AS assigned_team_name
      FROM incidents i
      LEFT JOIN users ru ON ru.id = i.reporter_user_id
      LEFT JOIN users vu ON vu.id = i.verified_by_user_id
      LEFT JOIN response_teams rt ON rt.id = i.assigned_team_id
      ${whereSql}
      ORDER BY i.reported_at DESC, i.id DESC
    `)
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const id = Number(row.id);
    const isOwner = row.reporter_user_id != null && Number(row.reporter_user_id) === viewerUserId;
    const canSeeContact =
      viewerRole === 'SUPER_ADMIN' ||
      viewerRole === 'EMERGENCY_COORDINATOR' ||
      viewerRole === 'EMERGENCY_RESPONDER' ||
      isOwner;

    const aiRow = db
      .prepare('SELECT * FROM ai_analysis WHERE incident_id = ?')
      .get(id) as Record<string, unknown> | undefined;

    const updateRows = db
      .prepare(`
        SELECT iu.*, u.full_name AS actor_name, r.code AS actor_role
        FROM incident_updates iu
        LEFT JOIN users u ON u.id = iu.actor_user_id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE iu.incident_id = ?
        ORDER BY iu.created_at ASC, iu.id ASC
      `)
      .all(id) as Array<Record<string, unknown>>;

    const attachmentRows = db
      .prepare('SELECT * FROM incident_attachments WHERE incident_id = ?')
      .all(id) as Array<Record<string, unknown>>;

    const relRows = db
      .prepare(`
        SELECT ir.id, ir.related_incident_id, ir.similarity_score, ir.relationship_reason,
               ri.incident_code AS related_code, ri.category AS related_category, ri.location_text AS related_location
        FROM incident_relationships ir
        JOIN incidents ri ON ri.id = ir.related_incident_id
        WHERE ir.source_incident_id = ?
        UNION
        SELECT ir.id, ir.source_incident_id AS related_incident_id, ir.similarity_score, ir.relationship_reason,
               si.incident_code AS related_code, si.category AS related_category, si.location_text AS related_location
        FROM incident_relationships ir
        JOIN incidents si ON si.id = ir.source_incident_id
        WHERE ir.related_incident_id = ?
      `)
      .all(id, id) as Array<Record<string, unknown>>;

    return {
      id,
      incidentCode: String(row.incident_code),
      reporterUserId: row.reporter_user_id != null ? Number(row.reporter_user_id) : null,
      reporterName: canSeeContact && row.reporter_name ? String(row.reporter_name) : 'Protected Reporter',
      category: String(row.category) as IncidentCategory,
      title: String(row.title),
      description: String(row.description),
      locationText: String(row.location_text),
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      locationSource: String(row.location_source) as IncidentRecord['locationSource'],
      peopleAffected: Number(row.people_affected),
      contactInfo: canSeeContact ? String(row.contact_info) : 'Protected (Authorized Staff Only)',
      additionalNotes: row.additional_notes ? String(row.additional_notes) : null,
      priority: String(row.priority) as IncidentPriority,
      status: String(row.status) as IncidentStatus,
      assignedTeamId: row.assigned_team_id != null ? Number(row.assigned_team_id) : null,
      assignedTeamName: row.assigned_team_name ? String(row.assigned_team_name) : null,
      verifiedByUserId: row.verified_by_user_id != null ? Number(row.verified_by_user_id) : null,
      verifiedByName: row.verified_by_name ? String(row.verified_by_name) : null,
      isDemo: Boolean(row.is_demo),
      reportedAt: String(row.reported_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      aiAnalysis: aiRow
        ? {
            incident_category: String(aiRow.incident_category),
            summary: String(aiRow.summary),
            priority_recommendation: String(aiRow.priority_recommendation) as IncidentPriority,
            confidence: Number(aiRow.confidence),
            detected_keywords: JSON.parse(String(aiRow.detected_keywords || '[]')),
            required_resources: JSON.parse(String(aiRow.required_resources || '[]')),
            reasoning_summary: String(aiRow.reasoning_summary),
            additional_information_needed: JSON.parse(
              String(aiRow.additional_information_needed || '[]')
            ),
            provider: String(aiRow.provider),
          }
        : null,
      updates: updateRows.map((u) => ({
        id: Number(u.id),
        incidentId: Number(u.incident_id),
        actorUserId: u.actor_user_id != null ? Number(u.actor_user_id) : null,
        actorName: u.actor_name ? String(u.actor_name) : 'System',
        actorRole: u.actor_role ? String(u.actor_role) : null,
        previousStatus: u.previous_status ? String(u.previous_status) : null,
        newStatus: String(u.new_status),
        note: String(u.note),
        createdAt: String(u.created_at),
      })),
      attachments: canSeeContact
        ? attachmentRows.map((a) => ({
            id: Number(a.id),
            fileName: String(a.file_name),
            mimeType: String(a.mime_type),
            sizeBytes: Number(a.size_bytes),
            dataUrl: String(a.data_url),
            uploadedAt: String(a.uploaded_at),
          }))
        : [],
      relationships: relRows.map((rel) => ({
        id: Number(rel.id),
        relatedIncidentId: Number(rel.related_incident_id),
        relatedIncidentCode: String(rel.related_code),
        relatedCategory: String(rel.related_category),
        relatedLocation: String(rel.related_location),
        similarityScore: Number(rel.similarity_score),
        relationshipReason: String(rel.relationship_reason),
      })),
    };
  });
}

function listResources(db: DatabaseSync): ResourceRecord[] {
  const rows = db
    .prepare(`
      SELECT r.*, o.name AS org_name, i.incident_code AS assigned_incident_code
      FROM resources r
      LEFT JOIN organizations o ON o.id = r.organization_id
      LEFT JOIN incidents i ON i.id = r.assigned_incident_id
      ORDER BY r.id ASC
    `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    resourceCode: String(r.resource_code),
    name: String(r.name),
    category: String(r.category),
    status: String(r.status) as ResourceRecord['status'],
    assignedIncidentId: r.assigned_incident_id != null ? Number(r.assigned_incident_id) : null,
    assignedIncidentCode: r.assigned_incident_code ? String(r.assigned_incident_code) : null,
    locationName: String(r.location_name),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    organizationId: r.organization_id != null ? Number(r.organization_id) : null,
    organizationName: r.org_name ? String(r.org_name) : null,
    isDemo: Boolean(r.is_demo),
    updatedAt: String(r.updated_at),
  }));
}

function listHospitals(db: DatabaseSync): HospitalRecord[] {
  const rows = db
    .prepare(`
      SELECT h.*, hc.ed_status, hc.general_beds_available, hc.general_beds_total,
             hc.icu_beds_available, hc.icu_beds_total, hc.available_facilities,
             hc.incoming_cases_count, hc.updated_at AS capacity_updated_at
      FROM hospitals h
      LEFT JOIN hospital_capacity hc ON hc.id = (
        SELECT id FROM hospital_capacity WHERE hospital_id = h.id ORDER BY id DESC LIMIT 1
      )
      ORDER BY h.id ASC
    `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((h) => {
    const capUpdated = h.capacity_updated_at ? String(h.capacity_updated_at) : String(h.updated_at);
    return {
      id: Number(h.id),
      hospitalCode: String(h.hospital_code),
      name: String(h.name),
      address: String(h.address),
      contactPhone: String(h.contact_phone),
      contactEmail: String(h.contact_email),
      latitude: Number(h.latitude),
      longitude: Number(h.longitude),
      organizationId: h.organization_id != null ? Number(h.organization_id) : null,
      isVerified: Boolean(h.is_verified),
      isDemo: Boolean(h.is_demo),
      edStatus: h.ed_status ? String(h.ed_status) : 'Operational',
      generalBedsAvailable: Number(h.general_beds_available ?? 0),
      generalBedsTotal: Number(h.general_beds_total ?? 0),
      icuBedsAvailable: Number(h.icu_beds_available ?? 0),
      icuBedsTotal: Number(h.icu_beds_total ?? 0),
      availableFacilities: h.available_facilities ? String(h.available_facilities) : 'General Triage',
      incomingCasesCount: Number(h.incoming_cases_count ?? 0),
      capacityUpdatedAt: capUpdated,
      isCapacityStale: isCapacityStale(capUpdated, 6),
    };
  });
}

function computeAnalytics(db: DatabaseSync): AnalyticsOverview {
  const incidents = db.prepare('SELECT category, priority, status, reported_at FROM incidents').all() as Array<{
    category: string;
    priority: string;
    status: string;
    reported_at: string;
  }>;
  const resources = listResources(db);
  const hospitals = listHospitals(db);
  const teams = db.prepare('SELECT status FROM response_teams').all() as Array<{ status: string }>;

  const totalIncidents = incidents.length;
  const resolvedStatuses = new Set(['Resolved', 'Closed']);
  const resolvedIncidents = incidents.filter((i) => resolvedStatuses.has(i.status)).length;
  const activeIncidents = totalIncidents - resolvedIncidents;
  const criticalPriorityIncidents = incidents.filter(
    (i) => i.priority === 'Critical' && !resolvedStatuses.has(i.status)
  ).length;
  const pendingVerification = incidents.filter((i) =>
    ['Reported', 'Under Verification'].includes(i.status)
  ).length;
  const availableResources = resources.filter((r) => r.status === 'Available').length;
  const activeResponseTeams = teams.filter((t) => t.status === 'DEPLOYED' || t.status === 'AVAILABLE').length;

  const countBy = (items: string[]) => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item, (map.get(item) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([key, count]) => ({ key, count }));
  };

  const byCategory = countBy(incidents.map((i) => i.category)).map((x) => ({
    category: x.key,
    count: x.count,
  }));
  const byPriority = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({
    priority: p,
    count: incidents.filter((i) => i.priority === p).length,
  }));
  const byStatus = countBy(incidents.map((i) => i.status)).map((x) => ({
    status: x.key,
    count: x.count,
  }));

  // Daily trends over last 7 days grounded in real reported_at timestamps
  const dailyTrends: Array<{ label: string; reported: number; resolved: number }> = [];
  for (let d = 6; d >= 0; d -= 1) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - d);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const label = dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayIncidents = incidents.filter((i) => {
      const ts = Date.parse(i.reported_at);
      return !Number.isNaN(ts) && ts >= dayStart.getTime() && ts < dayEnd.getTime();
    });
    dailyTrends.push({
      label,
      reported: dayIncidents.length,
      resolved: dayIncidents.filter((i) => resolvedStatuses.has(i.status)).length,
    });
  }

  // Weekly & monthly trends combining live DB buckets
  const weeklyTrends = [
    { label: '3 Wks Ago', reported: 0, resolved: 0 },
    { label: '2 Wks Ago', reported: 0, resolved: 0 },
    { label: 'Last Week', reported: 0, resolved: 0 },
    { label: 'Current Week', reported: 0, resolved: 0 },
  ];
  const nowMs = Date.now();
  for (const inc of incidents) {
    const ageDays = Math.max(0, (nowMs - Date.parse(inc.reported_at)) / (1000 * 3600 * 24));
    const idx = ageDays < 7 ? 3 : ageDays < 14 ? 2 : ageDays < 21 ? 1 : 0;
    weeklyTrends[idx].reported += 1;
    if (resolvedStatuses.has(inc.status)) weeklyTrends[idx].resolved += 1;
  }

  const currentMonthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const monthlyTrends = [
    { label: 'Prior Period', reported: 0, resolved: 0 },
    { label: currentMonthLabel, reported: totalIncidents, resolved: resolvedIncidents },
  ];

  const resCatSet = Array.from(new Set(resources.map((r) => r.category)));
  const resourceUtilization = resCatSet.map((category) => {
    const group = resources.filter((r) => r.category === category);
    return {
      category,
      available: group.filter((r) => r.status === 'Available').length,
      assigned: group.filter((r) => r.status === 'Assigned' || r.status === 'In Service').length,
      other: group.filter((r) => r.status === 'Under Maintenance' || r.status === 'Unavailable').length,
    };
  });

  const hospitalCapacitySummary = {
    totalGeneralAvailable: hospitals.reduce((acc, h) => acc + h.generalBedsAvailable, 0),
    totalGeneralBeds: hospitals.reduce((acc, h) => acc + h.generalBedsTotal, 0),
    totalIcuAvailable: hospitals.reduce((acc, h) => acc + h.icuBedsAvailable, 0),
    totalIcuBeds: hospitals.reduce((acc, h) => acc + h.icuBedsTotal, 0),
    verifiedHospitals: hospitals.filter((h) => h.isVerified).length,
    staleCapacityCount: hospitals.filter((h) => h.isCapacityStale).length,
  };

  return {
    kpis: {
      totalIncidents,
      activeIncidents,
      criticalPriorityIncidents,
      availableResources,
      registeredHospitals: hospitals.length,
      resolvedIncidents,
      activeResponseTeams,
      pendingVerification,
    },
    byCategory,
    byPriority,
    byStatus,
    dailyTrends,
    weeklyTrends,
    monthlyTrends,
    resourceUtilization,
    hospitalCapacitySummary,
  };
}

export function createApiRouter(): Router {
  const router = Router();
  router.use(rateLimit());

  router.get('/health', (_req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS count FROM incidents').get() as { count: number };
    res.json({ status: 'ok', incidentsCount: row.count, timestamp: new Date().toISOString() });
  });

  // --- AUTHENTICATION ---
  router.post('/auth/register', (req, res) => {
    const db = getDb();
    const { email, password, fullName, phone } = req.body ?? {};
    if (
      typeof email !== 'string' ||
      !email.includes('@') ||
      typeof password !== 'string' ||
      password.length < 8 ||
      typeof fullName !== 'string' ||
      fullName.trim().length < 2
    ) {
      res.status(400).json({
        error: 'Valid full name, email address, and password (minimum 8 characters) are required.',
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const roleRow = db.prepare("SELECT id FROM roles WHERE code = 'CITIZEN'").get() as { id: number };
    const insertUser = db
      .prepare(
        'INSERT INTO users (email, password_hash, full_name, phone, is_active, is_demo) VALUES (?, ?, ?, ?, 1, 0)'
      )
      .run(normalizedEmail, hashPassword(password), fullName.trim(), phone ? String(phone).trim() : null);

    const newUserId = Number(insertUser.lastInsertRowid);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(newUserId, roleRow.id);

    writeAuditLog(db, newUserId, 'CITIZEN', 'USER_REGISTERED', 'user', String(newUserId), `Registered citizen ${normalizedEmail}`, req.ip);

    const user = mapUserRow(db, newUserId)!;
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      organizationId: user.organizationId,
    });
    res.status(201).json({ token, user });
  });

  router.post('/auth/login', (req, res) => {
    const db = getDb();
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) as
      | { id: number; password_hash: string; is_active: number }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'This account is suspended. Contact a Super Administrator.' });
      return;
    }

    const user = mapUserRow(db, row.id)!;
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      organizationId: user.organizationId,
    });
    writeAuditLog(db, user.id, user.role, 'USER_LOGIN', 'user', String(user.id), `Signed in (${user.role})`, req.ip);
    res.json({ token, user });
  });

  router.post('/auth/demo-login', (req, res) => {
    const db = getDb();
    const { role } = req.body ?? {};
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: 'Invalid demonstration role requested.' });
      return;
    }
    const row = db
      .prepare(`
        SELECT u.id FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE r.code = ? AND u.is_demo = 1 AND u.is_active = 1
        LIMIT 1
      `)
      .get(role) as { id: number } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Demonstration account not found for this role.' });
      return;
    }
    const user = mapUserRow(db, row.id)!;
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      organizationId: user.organizationId,
    });
    writeAuditLog(db, user.id, user.role, 'DEMO_LOGIN', 'user', String(user.id), `Demo sign-in as ${user.role}`, req.ip);
    res.json({ token, user });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = mapUserRow(db, req.authUser!.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Account not found or inactive.' });
      return;
    }
    res.json({ user });
  });

  // --- INCIDENTS ---
  router.get('/incidents', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const incidents = mapIncidentRows(db, user.role, user.userId);
    res.json({ incidents });
  });

  router.get('/incidents/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid incident ID.' });
      return;
    }
    const incidents = mapIncidentRows(db, user.role, user.userId, 'WHERE i.id = ?', [id]);
    if (incidents.length === 0) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }
    res.json({ incident: incidents[0] });
  });

  router.post('/incidents/check-duplicates', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { category, description, locationText, latitude, longitude } = req.body ?? {};
    const existing = db
      .prepare(
        "SELECT id, incident_code, category, title, description, location_text, latitude, longitude, status, reported_at FROM incidents WHERE status NOT IN ('Resolved', 'Closed')"
      )
      .all() as Array<Record<string, unknown>>;

    const matches = existing
      .map((item) => {
        const sim = calculateIncidentSimilarity(
          {
            category: String(category || ''),
            description: String(description || ''),
            locationText: String(locationText || ''),
            latitude: typeof latitude === 'number' ? latitude : null,
            longitude: typeof longitude === 'number' ? longitude : null,
            reportedAt: new Date().toISOString(),
          },
          {
            category: String(item.category),
            description: String(item.description),
            locationText: String(item.location_text),
            latitude: item.latitude != null ? Number(item.latitude) : null,
            longitude: item.longitude != null ? Number(item.longitude) : null,
            reportedAt: String(item.reported_at),
          }
        );
        return {
          incidentId: Number(item.id),
          incidentCode: String(item.incident_code),
          category: String(item.category),
          title: String(item.title),
          locationText: String(item.location_text),
          status: String(item.status),
          similarityScore: sim.score,
          reasons: sim.reasons,
        };
      })
      .filter((m) => m.similarityScore >= 45)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 4);

    res.json({
      advisoryOnly: true,
      matches,
    });
  });

  router.post('/incidents', requireAuth, async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const {
      category,
      title,
      description,
      locationText,
      latitude,
      longitude,
      locationSource,
      peopleAffected,
      contactInfo,
      additionalNotes,
      reportedAt,
      attachments,
    } = req.body ?? {};

    if (!INCIDENT_CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'Please select a valid emergency category.' });
      return;
    }
    if (typeof description !== 'string' || description.trim().length < 10) {
      res.status(400).json({ error: 'Incident description must be at least 10 characters.' });
      return;
    }
    if (typeof locationText !== 'string' || locationText.trim().length < 3) {
      res.status(400).json({ error: 'Location description or address is required.' });
      return;
    }
    if (typeof contactInfo !== 'string' || contactInfo.trim().length < 3) {
      res.status(400).json({ error: 'Contact information is required.' });
      return;
    }

    // Validate attachments (secure file upload validation)
    const validatedAttachments: Array<{
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      dataUrl: string;
    }> = [];
    if (Array.isArray(attachments)) {
      if (attachments.length > 3) {
        res.status(400).json({ error: 'Maximum 3 image attachments permitted per report.' });
        return;
      }
      for (const att of attachments) {
        const mime = String(att?.mimeType || '');
        const dataUrl = String(att?.dataUrl || '');
        const fileName = String(att?.fileName || 'attachment.jpg').slice(0, 120);
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimes.includes(mime) || !dataUrl.startsWith(`data:${mime};base64,`)) {
          res.status(400).json({ error: 'Only validated JPEG, PNG, or WebP image files are accepted.' });
          return;
        }
        const approxBytes = Math.floor((dataUrl.length * 3) / 4);
        if (approxBytes > 3 * 1024 * 1024) {
          res.status(400).json({ error: 'Each uploaded image must be 3 MB or smaller.' });
          return;
        }
        validatedAttachments.push({ fileName, mimeType: mime, sizeBytes: approxBytes, dataUrl });
      }
    }

    const people = Math.max(1, Math.min(10000, Number(peopleAffected || 1)));
    const safeTitle =
      typeof title === 'string' && title.trim().length >= 3
        ? title.trim().slice(0, 180)
        : `${category} at ${locationText.trim().slice(0, 80)}`;
    const parsedReportedAt =
      typeof reportedAt === 'string' && !Number.isNaN(Date.parse(reportedAt))
        ? new Date(reportedAt).toISOString()
        : new Date().toISOString();

    const aiAnalysis = await analyzeIncidentWithAI({
      category,
      description: description.trim(),
      locationText: locationText.trim(),
      peopleAffected: people,
    });

    const seqRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1001 AS next_num FROM incidents').get() as {
      next_num: number;
    };
    const incidentCode = `INC-2026-${seqRow.next_num}`;
    const validLocSource = ['GPS', 'MANUAL', 'SIMULATED_DEMO'].includes(locationSource)
      ? locationSource
      : 'MANUAL';

    const insertRes = db
      .prepare(`
        INSERT INTO incidents (
          incident_code, reporter_user_id, category, title, description, location_text,
          latitude, longitude, location_source, people_affected, contact_info, additional_notes,
          priority, status, is_demo, reported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reported', 0, ?)
      `)
      .run(
        incidentCode,
        user.userId,
        category,
        safeTitle,
        description.trim(),
        locationText.trim(),
        typeof latitude === 'number' ? latitude : null,
        typeof longitude === 'number' ? longitude : null,
        validLocSource,
        people,
        contactInfo.trim(),
        additionalNotes ? String(additionalNotes).trim() : null,
        aiAnalysis.priority_recommendation,
        parsedReportedAt
      );

    const newIncidentId = Number(insertRes.lastInsertRowid);

    db.prepare(
      'INSERT INTO incident_updates (incident_id, actor_user_id, previous_status, new_status, note) VALUES (?, ?, NULL, ?, ?)'
    ).run(
      newIncidentId,
      user.userId,
      'Reported',
      `Incident submitted by ${user.fullName}. AI recommended ${aiAnalysis.priority_recommendation} priority (awaiting human coordinator verification).`
    );

    db.prepare(`
      INSERT INTO ai_analysis (
        incident_id, incident_category, summary, priority_recommendation, confidence,
        detected_keywords, required_resources, reasoning_summary, additional_information_needed, provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newIncidentId,
      aiAnalysis.incident_category,
      aiAnalysis.summary,
      aiAnalysis.priority_recommendation,
      aiAnalysis.confidence,
      JSON.stringify(aiAnalysis.detected_keywords),
      JSON.stringify(aiAnalysis.required_resources),
      aiAnalysis.reasoning_summary,
      JSON.stringify(aiAnalysis.additional_information_needed),
      aiAnalysis.provider || 'fallback_rules'
    );

    for (const att of validatedAttachments) {
      db.prepare(
        'INSERT INTO incident_attachments (incident_id, file_name, mime_type, size_bytes, data_url) VALUES (?, ?, ?, ?, ?)'
      ).run(newIncidentId, att.fileName, att.mimeType, att.sizeBytes, att.dataUrl);
    }

    // Advisory clustering relationships (never auto-discard or auto-merge)
    const activeOthers = db
      .prepare(
        "SELECT id, category, description, location_text, latitude, longitude, reported_at FROM incidents WHERE id != ? AND status NOT IN ('Resolved', 'Closed')"
      )
      .all(newIncidentId) as Array<Record<string, unknown>>;

    for (const other of activeOthers) {
      const sim = calculateIncidentSimilarity(
        {
          category,
          description: description.trim(),
          locationText: locationText.trim(),
          latitude: typeof latitude === 'number' ? latitude : null,
          longitude: typeof longitude === 'number' ? longitude : null,
          reportedAt: parsedReportedAt,
        },
        {
          category: String(other.category),
          description: String(other.description),
          locationText: String(other.location_text),
          latitude: other.latitude != null ? Number(other.latitude) : null,
          longitude: other.longitude != null ? Number(other.longitude) : null,
          reportedAt: String(other.reported_at),
        }
      );
      if (sim.score >= 50) {
        db.prepare(
          'INSERT OR IGNORE INTO incident_relationships (source_incident_id, related_incident_id, similarity_score, relationship_reason) VALUES (?, ?, ?, ?)'
        ).run(newIncidentId, Number(other.id), sim.score, sim.reasons.join(' · '));
      }
    }

    // Notify coordinators & admins without leaking citizen contact details
    createNotification(db, {
      targetRole: 'EMERGENCY_COORDINATOR',
      category: 'New emergency report',
      title: `New ${category} (${incidentCode})`,
      message: `${safeTitle} reported at ${locationText.trim()}. AI advisory: ${aiAnalysis.priority_recommendation}.`,
      relatedIncidentId: newIncidentId,
    });
    createNotification(db, {
      targetRole: 'SUPER_ADMIN',
      category: 'New emergency report',
      title: `Incident Logged (${incidentCode})`,
      message: `${category} submitted in ${locationText.trim()}.`,
      relatedIncidentId: newIncidentId,
    });

    writeAuditLog(
      db,
      user.userId,
      user.role,
      'INCIDENT_CREATED',
      'incident',
      incidentCode,
      `Created ${category} incident with advisory priority ${aiAnalysis.priority_recommendation}`,
      req.ip
    );

    const created = mapIncidentRows(db, user.role, user.userId, 'WHERE i.id = ?', [newIncidentId])[0];
    broadcastRealtimeEvent('incident:created', { incidentId: newIncidentId, incidentCode });
    res.status(201).json({ incident: created });
  });

  router.patch('/incidents/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const id = Number(req.params.id);
    const existingRow = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    const { status, priority, assignedTeamId, note } = req.body ?? {};
    const prevStatus = String(existingRow.status) as IncidentStatus;
    const nextStatus = (status || prevStatus) as IncidentStatus;

    const transition = isValidStatusTransition(prevStatus, nextStatus, user.role);
    if (!transition.valid) {
      res.status(403).json({ error: transition.reason });
      return;
    }

    if (priority && !canVerifyIncident(user.role)) {
      res.status(403).json({ error: 'Only coordinators or administrators can override operational priority.' });
      return;
    }
    if (assignedTeamId !== undefined && !canAssignResources(user.role)) {
      res.status(403).json({ error: 'Only coordinators or administrators can assign response teams.' });
      return;
    }

    const nextPriority = priority || String(existingRow.priority);
    const nextTeamId =
      assignedTeamId !== undefined
        ? assignedTeamId
          ? Number(assignedTeamId)
          : null
        : existingRow.assigned_team_id != null
          ? Number(existingRow.assigned_team_id)
          : null;

    const verifiedBy =
      ['Verified', 'Assigned', 'Resolved', 'Closed'].includes(nextStatus) &&
      canVerifyIncident(user.role)
        ? user.userId
        : existingRow.verified_by_user_id != null
          ? Number(existingRow.verified_by_user_id)
          : null;

    db.prepare(`
      UPDATE incidents
      SET status = ?, priority = ?, assigned_team_id = ?, verified_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, nextPriority, nextTeamId, verifiedBy, id);

    if (nextTeamId) {
      db.prepare("UPDATE response_teams SET status = 'DEPLOYED', updated_at = datetime('now') WHERE id = ?").run(
        nextTeamId
      );
    }
    if (['Resolved', 'Closed'].includes(nextStatus)) {
      // Release assigned resources automatically on resolution
      db.prepare(
        "UPDATE resources SET status = 'Available', assigned_incident_id = NULL, updated_at = datetime('now') WHERE assigned_incident_id = ?"
      ).run(id);
      db.prepare(
        "UPDATE resource_assignments SET status = 'RELEASED', released_at = datetime('now') WHERE incident_id = ? AND status = 'ACTIVE'"
      ).run(id);
      if (nextTeamId) {
        db.prepare("UPDATE response_teams SET status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?").run(
          nextTeamId
        );
      }
    }

    const updateNote =
      typeof note === 'string' && note.trim().length > 0
        ? note.trim()
        : `Status updated from ${prevStatus} to ${nextStatus} by ${user.fullName}.`;

    db.prepare(
      'INSERT INTO incident_updates (incident_id, actor_user_id, previous_status, new_status, note) VALUES (?, ?, ?, ?, ?)'
    ).run(id, user.userId, prevStatus, nextStatus, updateNote);

    const incidentCode = String(existingRow.incident_code);
    const reporterId = existingRow.reporter_user_id != null ? Number(existingRow.reporter_user_id) : null;

    const notifCategory =
      nextStatus === 'Verified'
        ? 'Incident verification'
        : nextStatus === 'Resolved' || nextStatus === 'Closed'
          ? 'Incident resolution'
          : 'Response progress';

    if (reporterId) {
      createNotification(db, {
        userId: reporterId,
        targetRole: 'CITIZEN',
        category: notifCategory,
        title: `${incidentCode} Status: ${nextStatus}`,
        message: updateNote,
        relatedIncidentId: id,
      });
    }
    createNotification(db, {
      targetRole: 'EMERGENCY_COORDINATOR',
      category: notifCategory,
      title: `${incidentCode} → ${nextStatus}`,
      message: updateNote,
      relatedIncidentId: id,
    });
    if (nextTeamId) {
      createNotification(db, {
        targetRole: 'EMERGENCY_RESPONDER',
        category: notifCategory,
        title: `Field Update: ${incidentCode}`,
        message: updateNote,
        relatedIncidentId: id,
      });
    }

    writeAuditLog(
      db,
      user.userId,
      user.role,
      'INCIDENT_UPDATED',
      'incident',
      incidentCode,
      `${prevStatus} -> ${nextStatus} (${nextPriority})`,
      req.ip
    );

    const updated = mapIncidentRows(db, user.role, user.userId, 'WHERE i.id = ?', [id])[0];
    broadcastRealtimeEvent('incident:updated', { incidentId: id, status: nextStatus, priority: nextPriority });
    res.json({ incident: updated });
  });

  // --- RESOURCES & TEAMS ---
  router.get('/teams', requireAuth, (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`
        SELECT rt.*, o.name AS org_name
        FROM response_teams rt
        LEFT JOIN organizations o ON o.id = rt.organization_id
        ORDER BY rt.id ASC
      `)
      .all() as Array<Record<string, unknown>>;

    res.json({
      teams: rows.map((t) => ({
        id: Number(t.id),
        teamCode: String(t.team_code),
        name: String(t.name),
        specialty: String(t.specialty),
        organizationId: t.organization_id != null ? Number(t.organization_id) : null,
        organizationName: t.org_name ? String(t.org_name) : null,
        status: String(t.status),
        latitude: Number(t.latitude),
        longitude: Number(t.longitude),
        isSimulatedLocation: Boolean(t.is_simulated_location),
        updatedAt: String(t.updated_at),
      })),
    });
  });

  router.get('/resources', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({ resources: listResources(db) });
  });

  router.get(
    '/resources/recommendations/:incidentId',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN', 'EMERGENCY_RESPONDER'),
    (req, res) => {
      const db = getDb();
      const incidentId = Number(req.params.incidentId);
      const inc = db.prepare('SELECT category, latitude, longitude FROM incidents WHERE id = ?').get(incidentId) as
        | { category: string; latitude: number | null; longitude: number | null }
        | undefined;
      if (!inc) {
        res.status(404).json({ error: 'Incident not found.' });
        return;
      }
      const recommendations = recommendResourcesForIncident(inc, listResources(db));
      res.json({
        advisoryNotice: 'Recommendations require human coordinator approval prior to dispatch.',
        recommendations,
      });
    }
  );

  router.post(
    '/resources',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN', 'EMERGENCY_RESPONDER'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const { name, category, locationName, latitude, longitude, status } = req.body ?? {};
      if (!name || !category || !locationName) {
        res.status(400).json({ error: 'Resource name, category, and location are required.' });
        return;
      }
      const seq = db.prepare('SELECT COALESCE(MAX(id), 0) + 700 AS num FROM resources').get() as { num: number };
      const code = `RES-${seq.num}`;
      const ins = db
        .prepare(
          'INSERT INTO resources (resource_code, name, category, status, location_name, latitude, longitude, organization_id, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
        )
        .run(
          code,
          String(name).trim(),
          String(category).trim(),
          status || 'Available',
          String(locationName).trim(),
          typeof latitude === 'number' ? latitude : 37.7749,
          typeof longitude === 'number' ? longitude : -122.4194,
          user.organizationId
        );
      writeAuditLog(db, user.userId, user.role, 'RESOURCE_CREATED', 'resource', code, `Registered ${name}`, req.ip);
      const created = listResources(db).find((r) => r.id === Number(ins.lastInsertRowid));
      broadcastRealtimeEvent('resource:updated', { resourceCode: code });
      res.status(201).json({ resource: created });
    }
  );

  router.patch(
    '/resources/:id',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN', 'EMERGENCY_RESPONDER'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const id = Number(req.params.id);
      const { status, locationName, name } = req.body ?? {};
      const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }
      const nextStatus = status || String(existing.status);
      const nextAssignedIncidentId: number | null =
        nextStatus === 'Available' || nextStatus === 'Under Maintenance' || nextStatus === 'Unavailable'
          ? null
          : existing.assigned_incident_id != null
            ? Number(existing.assigned_incident_id)
            : null;

      db.prepare(
        "UPDATE resources SET name = ?, status = ?, location_name = ?, assigned_incident_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(
        name ? String(name).trim() : String(existing.name),
        nextStatus,
        locationName ? String(locationName).trim() : String(existing.location_name),
        nextAssignedIncidentId,
        id
      );

      if (nextAssignedIncidentId === null && existing.assigned_incident_id != null) {
        db.prepare(
          "UPDATE resource_assignments SET status = 'RELEASED', released_at = datetime('now') WHERE resource_id = ? AND status = 'ACTIVE'"
        ).run(id);
      }

      writeAuditLog(
        db,
        user.userId,
        user.role,
        'RESOURCE_UPDATED',
        'resource',
        String(existing.resource_code),
        `Status set to ${nextStatus}`,
        req.ip
      );
      const updated = listResources(db).find((r) => r.id === id);
      broadcastRealtimeEvent('resource:updated', { resourceId: id, status: nextStatus });
      res.json({ resource: updated });
    }
  );

  router.post(
    '/resources/allocate',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const { resourceId, incidentId, teamId, rationale } = req.body ?? {};
      const resRow = db.prepare('SELECT * FROM resources WHERE id = ?').get(Number(resourceId)) as
        | Record<string, unknown>
        | undefined;
      const incRow = db.prepare('SELECT * FROM incidents WHERE id = ?').get(Number(incidentId)) as
        | Record<string, unknown>
        | undefined;

      if (!resRow || !incRow) {
        res.status(404).json({ error: 'Resource or incident not found.' });
        return;
      }
      if (String(resRow.status) !== 'Available') {
        res.status(409).json({ error: 'Selected resource is not currently Available.' });
        return;
      }

      db.prepare(
        "UPDATE resources SET status = 'Assigned', assigned_incident_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(Number(incidentId), Number(resourceId));

      db.prepare(
        "INSERT INTO resource_assignments (resource_id, incident_id, assigned_by_user_id, status, rationale) VALUES (?, ?, ?, 'ACTIVE', ?)"
      ).run(Number(resourceId), Number(incidentId), user.userId, rationale || 'Coordinator approved allocation');

      const prevStatus = String(incRow.status);
      const nextStatus =
        ['Reported', 'Under Verification', 'Verified', 'Resource Assignment Pending'].includes(prevStatus)
          ? 'Assigned'
          : prevStatus;
      const nextTeamId: number | null = teamId
        ? Number(teamId)
        : incRow.assigned_team_id != null
          ? Number(incRow.assigned_team_id)
          : null;

      db.prepare(
        "UPDATE incidents SET status = ?, assigned_team_id = ?, verified_by_user_id = COALESCE(verified_by_user_id, ?), updated_at = datetime('now') WHERE id = ?"
      ).run(nextStatus, nextTeamId, user.userId, Number(incidentId));

      if (nextTeamId) {
        db.prepare("UPDATE response_teams SET status = 'DEPLOYED', updated_at = datetime('now') WHERE id = ?").run(
          nextTeamId
        );
      }

      db.prepare(
        'INSERT INTO incident_updates (incident_id, actor_user_id, previous_status, new_status, note) VALUES (?, ?, ?, ?, ?)'
      ).run(
        Number(incidentId),
        user.userId,
        prevStatus,
        nextStatus,
        `Coordinator ${user.fullName} approved allocation of ${String(resRow.name)} (${String(resRow.resource_code)}).`
      );

      createNotification(db, {
        targetRole: 'EMERGENCY_RESPONDER',
        category: 'Resource assignment',
        title: `Dispatched ${String(resRow.resource_code)} to ${String(incRow.incident_code)}`,
        message: `${String(resRow.name)} allocated to ${String(incRow.location_text)}.`,
        relatedIncidentId: Number(incidentId),
      });

      writeAuditLog(
        db,
        user.userId,
        user.role,
        'RESOURCE_ALLOCATED',
        'resource_assignment',
        `${String(resRow.resource_code)}->${String(incRow.incident_code)}`,
        rationale || 'Coordinator approved',
        req.ip
      );

      broadcastRealtimeEvent('resource:assigned', {
        resourceId: Number(resourceId),
        incidentId: Number(incidentId),
      });
      res.json({ ok: true, resources: listResources(db) });
    }
  );

  // --- HOSPITALS ---
  router.get('/hospitals', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({ hospitals: listHospitals(db) });
  });

  router.post(
    '/hospitals',
    requireAuth,
    requireRoles('HOSPITAL_ADMIN', 'SUPER_ADMIN'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const {
        name,
        address,
        contactPhone,
        contactEmail,
        latitude,
        longitude,
        generalBedsAvailable,
        generalBedsTotal,
        icuBedsAvailable,
        icuBedsTotal,
        availableFacilities,
      } = req.body ?? {};
      if (!name || !address || !contactPhone || !contactEmail) {
        res.status(400).json({ error: 'Hospital name, address, phone, and email are required.' });
        return;
      }
      const seq = db.prepare('SELECT COALESCE(MAX(id), 0) + 10 AS num FROM hospitals').get() as { num: number };
      const code = `HOSP-${seq.num}`;
      const ins = db
        .prepare(
          'INSERT INTO hospitals (hospital_code, name, address, contact_phone, contact_email, latitude, longitude, organization_id, is_verified, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)'
        )
        .run(
          code,
          String(name).trim(),
          String(address).trim(),
          String(contactPhone).trim(),
          String(contactEmail).trim(),
          typeof latitude === 'number' ? latitude : 37.778,
          typeof longitude === 'number' ? longitude : -122.42,
          user.organizationId,
          user.role === 'SUPER_ADMIN' ? 1 : 0
        );
      const hospitalId = Number(ins.lastInsertRowid);
      db.prepare(
        'INSERT INTO hospital_capacity (hospital_id, ed_status, general_beds_available, general_beds_total, icu_beds_available, icu_beds_total, available_facilities, incoming_cases_count, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(
        hospitalId,
        'Operational',
        Math.max(0, Number(generalBedsAvailable || 10)),
        Math.max(1, Number(generalBedsTotal || 50)),
        Math.max(0, Number(icuBedsAvailable || 2)),
        Math.max(0, Number(icuBedsTotal || 10)),
        String(availableFacilities || 'Emergency Triage, General Ward'),
        user.userId
      );

      writeAuditLog(db, user.userId, user.role, 'HOSPITAL_REGISTERED', 'hospital', code, `Registered ${name}`, req.ip);
      broadcastRealtimeEvent('hospital:capacity_updated', { hospitalId });
      res.status(201).json({ hospital: listHospitals(db).find((h) => h.id === hospitalId) });
    }
  );

  router.patch(
    '/hospitals/:id/capacity',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      if (!canUpdateHospitalCapacity(user.role)) {
        res.status(403).json({ error: 'Only authorized Hospital Administrators or Super Admins can update hospital capacity.' });
        return;
      }
      const id = Number(req.params.id);
      const hosp = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!hosp) {
        res.status(404).json({ error: 'Hospital not found.' });
        return;
      }

      const {
        edStatus,
        generalBedsAvailable,
        generalBedsTotal,
        icuBedsAvailable,
        icuBedsTotal,
        availableFacilities,
        incomingCasesCount,
      } = req.body ?? {};

      const genTotal = Math.max(0, Number(generalBedsTotal ?? 0));
      const genAvail = Math.min(genTotal, Math.max(0, Number(generalBedsAvailable ?? 0)));
      const icuTotal = Math.max(0, Number(icuBedsTotal ?? 0));
      const icuAvail = Math.min(icuTotal, Math.max(0, Number(icuBedsAvailable ?? 0)));

      const nowIso = new Date().toISOString();
      db.prepare(
        'INSERT INTO hospital_capacity (hospital_id, ed_status, general_beds_available, general_beds_total, icu_beds_available, icu_beds_total, available_facilities, incoming_cases_count, updated_by_user_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        String(edStatus || 'Operational'),
        genAvail,
        genTotal,
        icuAvail,
        icuTotal,
        String(availableFacilities || 'Emergency Department'),
        Math.max(0, Number(incomingCasesCount ?? 0)),
        user.userId,
        nowIso
      );

      createNotification(db, {
        targetRole: 'EMERGENCY_COORDINATOR',
        category: 'Hospital capacity update',
        title: `Capacity Updated: ${String(hosp.name)}`,
        message: `ED ${edStatus || 'Operational'} · ${genAvail}/${genTotal} General Beds · ${icuAvail}/${icuTotal} ICU Beds.`,
      });

      writeAuditLog(
        db,
        user.userId,
        user.role,
        'HOSPITAL_CAPACITY_UPDATED',
        'hospital',
        String(hosp.hospital_code),
        `Updated beds: ${genAvail}/${genTotal} general, ${icuAvail}/${icuTotal} ICU`,
        req.ip
      );

      broadcastRealtimeEvent('hospital:capacity_updated', { hospitalId: id });
      res.json({ hospital: listHospitals(db).find((h) => h.id === id) });
    }
  );

  router.patch(
    '/hospitals/:id/verify',
    requireAuth,
    requireRoles('SUPER_ADMIN'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const id = Number(req.params.id);
      const { isVerified } = req.body ?? {};
      db.prepare("UPDATE hospitals SET is_verified = ?, updated_at = datetime('now') WHERE id = ?").run(
        isVerified ? 1 : 0,
        id
      );
      writeAuditLog(
        db,
        req.authUser!.userId,
        req.authUser!.role,
        'HOSPITAL_VERIFICATION_CHANGED',
        'hospital',
        String(id),
        `Verified = ${Boolean(isVerified)}`,
        req.ip
      );
      broadcastRealtimeEvent('hospital:capacity_updated', { hospitalId: id });
      res.json({ hospital: listHospitals(db).find((h) => h.id === id) });
    }
  );

  // --- ANALYTICS ---
  router.get('/analytics/overview', requireAuth, (_req, res) => {
    const db = getDb();
    res.json(computeAnalytics(db));
  });

  router.get('/analytics/predictive', requireAuth, (_req, res) => {
    const db = getDb();
    const overview = computeAnalytics(db);
    const total = Math.max(1, overview.kpis.totalIncidents);
    const estimates = overview.byCategory.map((c) => ({
      category: c.category,
      historicalCount: c.count,
      estimatedNext24hDemand: Math.max(1, Math.round((c.count / total) * 5 + (c.category === 'Medical Emergency' ? 1 : 0))),
      recommendedStandbyUnits: c.category === 'Medical Emergency' || c.category === 'Road Accident' ? 2 : 1,
    }));
    const peakWindows = [
      { window: '00:00–06:00', estimatedIndex: 22 },
      { window: '06:00–12:00', estimatedIndex: 58 },
      { window: '12:00–18:00', estimatedIndex: 84 },
      { window: '18:00–24:00', estimatedIndex: 67 },
    ];
    res.json({
      label: 'ESTIMATES ONLY — Statistical projections derived from historical and demonstration incident ratios; not confirmed future events.',
      categoryDemandEstimates: estimates,
      peakWindows,
    });
  });

  // --- AI ENDPOINTS ---
  router.post('/ai/analyze-incident', requireAuth, async (req, res) => {
    const { category, description, locationText, peopleAffected } = req.body ?? {};
    const analysis = await analyzeIncidentWithAI({
      category: String(category || 'Other Emergency'),
      description: String(description || ''),
      locationText: String(locationText || ''),
      peopleAffected: Number(peopleAffected || 1),
    });
    res.json({ analysis });
  });

  router.post('/ai/extract-report', requireAuth, async (req, res) => {
    const { narrative } = req.body ?? {};
    if (typeof narrative !== 'string' || narrative.trim().length < 8) {
      res.status(400).json({ error: 'Please describe the situation in at least 8 characters.' });
      return;
    }
    const extracted = await extractNaturalLanguageReport(narrative.trim());
    res.json({ extracted });
  });

  router.post(
    '/ai/decision-support',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN'),
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const { question } = req.body ?? {};
      if (typeof question !== 'string' || question.trim().length < 3) {
        res.status(400).json({ error: 'Please enter a valid operational question.' });
        return;
      }
      const incidents = mapIncidentRows(db, req.authUser!.role, req.authUser!.userId).map((i) => ({
        incidentCode: i.incidentCode,
        category: i.category,
        priority: i.priority,
        status: i.status,
        locationText: i.locationText,
        isDemo: i.isDemo,
        reportedAt: i.reportedAt,
      }));
      const resources = listResources(db).map((r) => ({
        resourceCode: r.resourceCode,
        name: r.name,
        category: r.category,
        status: r.status,
        locationName: r.locationName,
      }));
      const hospitals = listHospitals(db).map((h) => ({
        hospitalCode: h.hospitalCode,
        name: h.name,
        edStatus: h.edStatus,
        generalBedsAvailable: h.generalBedsAvailable,
        icuBedsAvailable: h.icuBedsAvailable,
        isCapacityStale: h.isCapacityStale,
        isVerified: h.isVerified,
        capacityUpdatedAt: h.capacityUpdatedAt,
      }));

      const result = await answerDecisionSupportQuery(question.trim(), {
        incidents,
        resources,
        hospitals,
      });
      res.json(result);
    }
  );

  router.post(
    '/ai/generate-summary',
    requireAuth,
    requireRoles('EMERGENCY_COORDINATOR', 'SUPER_ADMIN', 'HOSPITAL_ADMIN'),
    async (_req, res) => {
      const db = getDb();
      const overview = computeAnalytics(db);
      const observations = await generateOperationalObservations(overview);
      res.json({ overview, observations, generatedAt: new Date().toISOString() });
    }
  );

  // --- NOTIFICATIONS ---
  router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const rows =
      user.role === 'SUPER_ADMIN'
        ? (db.prepare('SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT 100').all() as Array<Record<string, unknown>>)
        : (db
            .prepare(
              'SELECT * FROM notifications WHERE user_id = ? OR target_role = ? ORDER BY created_at DESC, id DESC LIMIT 80'
            )
            .all(user.userId, user.role) as Array<Record<string, unknown>>);

    res.json({
      notifications: rows.map((n) => ({
        id: Number(n.id),
        userId: n.user_id != null ? Number(n.user_id) : null,
        targetRole: n.target_role ? (String(n.target_role) as UserRole) : null,
        category: String(n.category),
        title: String(n.title),
        message: String(n.message),
        relatedIncidentId: n.related_incident_id != null ? Number(n.related_incident_id) : null,
        isRead: Boolean(n.is_read),
        createdAt: String(n.created_at),
      })),
    });
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    if (user.role === 'SUPER_ADMIN') {
      db.prepare('UPDATE notifications SET is_read = 1').run();
    } else {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR target_role = ?').run(
        user.userId,
        user.role
      );
    }
    res.json({ ok: true });
  });

  // --- SUPER ADMIN: USERS, ORGS, AUDIT LOGS, RESET DEMO ---
  router.get('/admin/users', requireAuth, requireRoles('SUPER_ADMIN'), (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`
        SELECT u.id, u.email, u.full_name, u.phone, u.organization_id, u.is_active, u.is_demo,
               r.code AS role_code, o.name AS org_name
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        LEFT JOIN organizations o ON o.id = u.organization_id
        ORDER BY u.id ASC
      `)
      .all() as Array<Record<string, unknown>>;

    res.json({
      users: rows.map((row) => ({
        id: Number(row.id),
        email: String(row.email),
        fullName: String(row.full_name),
        phone: row.phone ? String(row.phone) : null,
        role: String(row.role_code) as UserRole,
        organizationId: row.organization_id != null ? Number(row.organization_id) : null,
        organizationName: row.org_name ? String(row.org_name) : null,
        isActive: Boolean(row.is_active),
        isDemo: Boolean(row.is_demo),
      })),
    });
  });

  router.post('/admin/users', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { email, password, fullName, phone, role, organizationId } = req.body ?? {};
    if (!email || !password || !fullName || !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: 'Valid name, email, password, and role are required.' });
      return;
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }
    const roleRow = db.prepare('SELECT id FROM roles WHERE code = ?').get(role) as { id: number };
    const ins = db
      .prepare(
        'INSERT INTO users (email, password_hash, full_name, phone, organization_id, is_active, is_demo) VALUES (?, ?, ?, ?, ?, 1, 0)'
      )
      .run(
        normalizedEmail,
        hashPassword(String(password)),
        String(fullName).trim(),
        phone ? String(phone).trim() : null,
        organizationId ? Number(organizationId) : null
      );
    const newId = Number(ins.lastInsertRowid);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(newId, roleRow.id);
    writeAuditLog(
      db,
      req.authUser!.userId,
      req.authUser!.role,
      'ADMIN_CREATED_USER',
      'user',
      String(newId),
      `Created ${normalizedEmail} with role ${role}`,
      req.ip
    );
    res.status(201).json({ user: mapUserRow(db, newId) });
  });

  router.patch('/admin/users/:id', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const targetId = Number(req.params.id);
    const { role, isActive } = req.body ?? {};
    const target = mapUserRow(db, targetId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (typeof isActive === 'boolean') {
      db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(
        isActive ? 1 : 0,
        targetId
      );
    }
    if (role && VALID_ROLES.includes(role)) {
      const roleRow = db.prepare('SELECT id FROM roles WHERE code = ?').get(role) as { id: number };
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(targetId);
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(targetId, roleRow.id);
    }
    writeAuditLog(
      db,
      req.authUser!.userId,
      req.authUser!.role,
      'ADMIN_UPDATED_USER',
      'user',
      String(targetId),
      `Updated user ${target.email}`,
      req.ip
    );
    res.json({ user: mapUserRow(db, targetId) });
  });

  router.get('/admin/organizations', requireAuth, requireRoles('SUPER_ADMIN', 'EMERGENCY_COORDINATOR'), (_req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM organizations ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    res.json({
      organizations: rows.map((o) => ({
        id: Number(o.id),
        name: String(o.name),
        orgType: String(o.org_type),
        approvalStatus: String(o.approval_status),
        contactEmail: String(o.contact_email),
        contactPhone: String(o.contact_phone),
        jurisdiction: String(o.jurisdiction),
        createdAt: String(o.created_at),
      })),
    });
  });

  router.patch('/admin/organizations/:id', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const { approvalStatus } = req.body ?? {};
    if (!['APPROVED', 'PENDING', 'SUSPENDED'].includes(approvalStatus)) {
      res.status(400).json({ error: 'Invalid approval status.' });
      return;
    }
    db.prepare("UPDATE organizations SET approval_status = ?, updated_at = datetime('now') WHERE id = ?").run(
      approvalStatus,
      id
    );
    writeAuditLog(
      db,
      req.authUser!.userId,
      req.authUser!.role,
      'ORGANIZATION_STATUS_UPDATED',
      'organization',
      String(id),
      `Set approval_status = ${approvalStatus}`,
      req.ip
    );
    res.json({ ok: true });
  });

  router.get('/admin/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (!canManageUsers(req.authUser!.role)) {
      res.status(403).json({ error: 'Audit logs are restricted to Super Administrators.' });
      return;
    }
    const rows = db
      .prepare(`
        SELECT a.*, u.full_name AS actor_name
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 120
      `)
      .all() as Array<Record<string, unknown>>;

    res.json({
      logs: rows.map((l) => ({
        id: Number(l.id),
        actorUserId: l.actor_user_id != null ? Number(l.actor_user_id) : null,
        actorName: l.actor_name ? String(l.actor_name) : 'System',
        actorRole: l.actor_role ? String(l.actor_role) : null,
        action: String(l.action),
        entityType: String(l.entity_type),
        entityId: l.entity_id ? String(l.entity_id) : null,
        details: l.details ? String(l.details) : null,
        createdAt: String(l.created_at),
      })),
    });
  });

  router.post('/admin/reset-demo', requireAuth, requireRoles('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    seedDemoData(db, true);
    const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@resqnet.demo'").get() as { id: number };
    const token = signToken({
      userId: admin.id,
      email: 'admin@resqnet.demo',
      role: 'SUPER_ADMIN',
      fullName: 'Evelyn Vance (Demo)',
      organizationId: 1,
    });
    writeAuditLog(db, admin.id, 'SUPER_ADMIN', 'DEMO_DATA_RESET', 'system', 'demo-v1', 'Super Admin reset demonstration dataset', req.ip);
    broadcastRealtimeEvent('demo:reset', { resetBy: req.authUser!.fullName });
    res.json({ ok: true, token, user: mapUserRow(db, admin.id) });
  });

  return router;
}
