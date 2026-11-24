export type UserRole =
  | 'SUPER_ADMIN'
  | 'CITIZEN'
  | 'EMERGENCY_RESPONDER'
  | 'HOSPITAL_ADMIN'
  | 'EMERGENCY_COORDINATOR';

export type IncidentCategory =
  | 'Medical Emergency'
  | 'Road Accident'
  | 'Fire Emergency'
  | 'Natural Disaster'
  | 'Flooding'
  | 'Building Emergency'
  | 'Missing Person'
  | 'Public Safety Incident'
  | 'Other Emergency';

export type IncidentPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type IncidentStatus =
  | 'Reported'
  | 'Under Verification'
  | 'Verified'
  | 'Resource Assignment Pending'
  | 'Assigned'
  | 'Response in Progress'
  | 'Assistance Provided'
  | 'Resolved'
  | 'Closed';

export type ResourceStatus =
  | 'Available'
  | 'Assigned'
  | 'In Service'
  | 'Under Maintenance'
  | 'Unavailable';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  organizationId: number | null;
  organizationName: string | null;
  isActive: boolean;
  isDemo: boolean;
}

export interface AiAnalysisPayload {
  incident_category: string;
  summary: string;
  priority_recommendation: IncidentPriority;
  confidence: number;
  detected_keywords: string[];
  required_resources: string[];
  reasoning_summary: string;
  additional_information_needed: string[];
  provider?: string;
}

export interface IncidentUpdateRecord {
  id: number;
  incidentId: number;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  previousStatus: string | null;
  newStatus: string;
  note: string;
  createdAt: string;
}

export interface IncidentAttachmentRecord {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface IncidentRelationshipRecord {
  id: number;
  relatedIncidentId: number;
  relatedIncidentCode: string;
  relatedCategory: string;
  relatedLocation: string;
  similarityScore: number;
  relationshipReason: string;
}

export interface IncidentRecord {
  id: number;
  incidentCode: string;
  reporterUserId: number | null;
  reporterName: string | null;
  category: IncidentCategory;
  title: string;
  description: string;
  locationText: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: 'GPS' | 'MANUAL' | 'SIMULATED_DEMO';
  peopleAffected: number;
  contactInfo: string;
  additionalNotes: string | null;
  priority: IncidentPriority;
  status: IncidentStatus;
  assignedTeamId: number | null;
  assignedTeamName: string | null;
  verifiedByUserId: number | null;
  verifiedByName: string | null;
  isDemo: boolean;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
  aiAnalysis?: AiAnalysisPayload | null;
  updates?: IncidentUpdateRecord[];
  attachments?: IncidentAttachmentRecord[];
  relationships?: IncidentRelationshipRecord[];
}

export interface ResourceRecord {
  id: number;
  resourceCode: string;
  name: string;
  category: string;
  status: ResourceStatus;
  assignedIncidentId: number | null;
  assignedIncidentCode: string | null;
  locationName: string;
  latitude: number;
  longitude: number;
  organizationId: number | null;
  organizationName: string | null;
  isDemo: boolean;
  updatedAt: string;
}

export interface ResourceRecommendation {
  resourceId: number;
  resourceCode: string;
  name: string;
  category: string;
  status: ResourceStatus;
  locationName: string;
  distanceKm: number;
  suitabilityScore: number;
  reasons: string[];
}

export interface ResponseTeamRecord {
  id: number;
  teamCode: string;
  name: string;
  specialty: string;
  organizationId: number | null;
  organizationName: string | null;
  status: string;
  latitude: number;
  longitude: number;
  isSimulatedLocation: boolean;
  updatedAt: string;
}

export interface HospitalRecord {
  id: number;
  hospitalCode: string;
  name: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  latitude: number;
  longitude: number;
  organizationId: number | null;
  isVerified: boolean;
  isDemo: boolean;
  edStatus: string;
  generalBedsAvailable: number;
  generalBedsTotal: number;
  icuBedsAvailable: number;
  icuBedsTotal: number;
  availableFacilities: string;
  incomingCasesCount: number;
  capacityUpdatedAt: string;
  isCapacityStale: boolean;
}

export interface NotificationRecord {
  id: number;
  userId: number | null;
  targetRole: UserRole | null;
  category: string;
  title: string;
  message: string;
  relatedIncidentId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface OrganizationRecord {
  id: number;
  name: string;
  orgType: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  contactEmail: string;
  contactPhone: string;
  jurisdiction: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export interface AnalyticsOverview {
  kpis: {
    totalIncidents: number;
    activeIncidents: number;
    criticalPriorityIncidents: number;
    availableResources: number;
    registeredHospitals: number;
    resolvedIncidents: number;
    activeResponseTeams: number;
    pendingVerification: number;
  };
  byCategory: Array<{ category: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  dailyTrends: Array<{ label: string; reported: number; resolved: number }>;
  weeklyTrends: Array<{ label: string; reported: number; resolved: number }>;
  monthlyTrends: Array<{ label: string; reported: number; resolved: number }>;
  resourceUtilization: Array<{ category: string; available: number; assigned: number; other: number }>;
  hospitalCapacitySummary: {
    totalGeneralAvailable: number;
    totalGeneralBeds: number;
    totalIcuAvailable: number;
    totalIcuBeds: number;
    verifiedHospitals: number;
    staleCapacityCount: number;
  };
}
