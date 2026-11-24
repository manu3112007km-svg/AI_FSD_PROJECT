import type {
  AiAnalysisPayload,
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
  ResourceRecord,
  ResourceRecommendation,
  UserRole,
} from '../../types/resqnet.ts';

export const INCIDENT_CATEGORIES: readonly IncidentCategory[] = [
  'Medical Emergency',
  'Road Accident',
  'Fire Emergency',
  'Natural Disaster',
  'Flooding',
  'Building Emergency',
  'Missing Person',
  'Public Safety Incident',
  'Other Emergency',
];

export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'Reported',
  'Under Verification',
  'Verified',
  'Resource Assignment Pending',
  'Assigned',
  'Response in Progress',
  'Assistance Provided',
  'Resolved',
  'Closed',
];

export const VALID_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'CITIZEN',
  'EMERGENCY_RESPONDER',
  'HOSPITAL_ADMIN',
  'EMERGENCY_COORDINATOR',
];

export const ROLE_NAV_ACCESS: Record<UserRole, readonly string[]> = {
  SUPER_ADMIN: [
    'overview',
    'report',
    'incidents',
    'resources',
    'hospitals',
    'tracking',
    'map',
    'ai',
    'analytics',
    'notifications',
    'users',
    'settings',
  ],
  EMERGENCY_COORDINATOR: [
    'overview',
    'report',
    'incidents',
    'resources',
    'hospitals',
    'tracking',
    'map',
    'ai',
    'analytics',
    'notifications',
    'settings',
  ],
  EMERGENCY_RESPONDER: [
    'overview',
    'incidents',
    'resources',
    'hospitals',
    'tracking',
    'map',
    'notifications',
    'settings',
  ],
  HOSPITAL_ADMIN: [
    'overview',
    'hospitals',
    'tracking',
    'map',
    'analytics',
    'notifications',
    'settings',
  ],
  CITIZEN: [
    'overview',
    'report',
    'tracking',
    'hospitals',
    'map',
    'notifications',
    'settings',
  ],
};

export function canAccessModule(role: UserRole, moduleKey: string): boolean {
  return ROLE_NAV_ACCESS[role]?.includes(moduleKey) ?? false;
}

export function canVerifyIncident(role: UserRole): boolean {
  return role === 'EMERGENCY_COORDINATOR' || role === 'SUPER_ADMIN';
}

export function canAssignResources(role: UserRole): boolean {
  return role === 'EMERGENCY_COORDINATOR' || role === 'SUPER_ADMIN';
}

export function canUpdateHospitalCapacity(role: UserRole): boolean {
  return role === 'HOSPITAL_ADMIN' || role === 'SUPER_ADMIN';
}

export function canUpdateResponderProgress(role: UserRole): boolean {
  return role === 'EMERGENCY_RESPONDER' || role === 'EMERGENCY_COORDINATOR' || role === 'SUPER_ADMIN';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function isValidStatusTransition(
  current: IncidentStatus,
  next: IncidentStatus,
  role: UserRole
): { valid: boolean; reason?: string } {
  if (current === next) {
    return { valid: true };
  }
  const currentIdx = INCIDENT_STATUSES.indexOf(current);
  const nextIdx = INCIDENT_STATUSES.indexOf(next);
  if (currentIdx === -1 || nextIdx === -1) {
    return { valid: false, reason: 'Unrecognized incident status.' };
  }
  if (role === 'CITIZEN') {
    return { valid: false, reason: 'Citizens cannot alter operational incident status.' };
  }
  if (role === 'HOSPITAL_ADMIN') {
    return { valid: false, reason: 'Hospital administrators cannot transition field incident status.' };
  }
  if (role === 'EMERGENCY_RESPONDER') {
    const allowedResponderTargets: IncidentStatus[] = [
      'Response in Progress',
      'Assistance Provided',
    ];
    if (!allowedResponderTargets.includes(next)) {
      return {
        valid: false,
        reason: 'Responders can update field progress to Response in Progress or Assistance Provided; coordinators verify resolution.',
      };
    }
  }
  if (nextIdx < currentIdx && role !== 'SUPER_ADMIN') {
    return {
      valid: false,
      reason: 'Workflow statuses advance forward unless overridden by Super Admin.',
    };
  }
  return { valid: true };
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

const CRITICAL_KEYWORDS = [
  'unconscious',
  'not breathing',
  'cardiac',
  'heart attack',
  'trapped',
  'collapse',
  'collapsed',
  'explosion',
  'gunshot',
  'major fire',
  'wildfire',
  'submerged',
  'bleeding heavily',
  'mass casualty',
  'multi-vehicle',
  'chemical leak',
];

const HIGH_KEYWORDS = [
  'fire',
  'smoke',
  'collision',
  'accident',
  'fracture',
  'injured',
  'flood',
  'rising water',
  'gas smell',
  'missing child',
  'elderly missing',
  'chest pain',
  'stroke',
  'assault',
];

const MEDIUM_KEYWORDS = [
  'minor injury',
  'power outage',
  'downed tree',
  'traffic',
  'stranded',
  'sprain',
  'water leak',
  'blocked road',
];

export function fallbackAnalyzeIncident(input: {
  category: string;
  description: string;
  locationText?: string;
  peopleAffected?: number;
}): AiAnalysisPayload {
  const text = `${input.category} ${input.description}`.toLowerCase();
  const matchedCritical = CRITICAL_KEYWORDS.filter((kw) => text.includes(kw));
  const matchedHigh = HIGH_KEYWORDS.filter((kw) => text.includes(kw));
  const matchedMedium = MEDIUM_KEYWORDS.filter((kw) => text.includes(kw));

  const people = Math.max(1, Number(input.peopleAffected ?? 1));
  let priority: IncidentPriority = 'Medium';
  let confidence = 68;

  if (matchedCritical.length > 0 || people >= 6) {
    priority = 'Critical';
    confidence = Math.min(92, 74 + matchedCritical.length * 6);
  } else if (
    matchedHigh.length > 0 ||
    people >= 3 ||
    input.category === 'Fire Emergency' ||
    input.category === 'Building Emergency'
  ) {
    priority = 'High';
    confidence = Math.min(88, 70 + matchedHigh.length * 5);
  } else if (matchedMedium.length > 0) {
    priority = 'Medium';
    confidence = 66;
  } else if (input.category === 'Other Emergency' && input.description.trim().length < 40) {
    priority = 'Low';
    confidence = 58;
  }

  const requiredResourcesMap: Record<string, string[]> = {
    'Medical Emergency': ['Ambulance', 'Medical Supplies'],
    'Road Accident': ['Ambulance', 'Emergency Response Vehicle', 'Rescue Team'],
    'Fire Emergency': ['Emergency Response Vehicle', 'Rescue Team', 'Ambulance'],
    'Natural Disaster': ['Rescue Team', 'Temporary Shelter', 'Disaster Response Resource'],
    Flooding: ['Rescue Team', 'Temporary Shelter', 'Disaster Response Resource'],
    'Building Emergency': ['Rescue Team', 'Emergency Response Vehicle', 'Medical Supplies'],
    'Missing Person': ['Rescue Team', 'Emergency Response Vehicle'],
    'Public Safety Incident': ['Emergency Response Vehicle', 'Medical Supplies'],
    'Other Emergency': ['Emergency Response Vehicle'],
  };

  const requiredResources = requiredResourcesMap[input.category] ?? ['Emergency Response Vehicle'];

  const missingInfo: string[] = [];
  if (!input.locationText || input.locationText.trim().length < 6) {
    missingInfo.push('Specific street address or landmark coordinates');
  }
  if (input.description.trim().length < 30) {
    missingInfo.push('More operational detail about immediate hazards or access routes');
  }
  if (!input.peopleAffected) {
    missingInfo.push('Estimated count of people affected or needing assistance');
  }

  const detectedKeywords = Array.from(
    new Set([...matchedCritical, ...matchedHigh, ...matchedMedium])
  ).slice(0, 8);

  const summarySource = input.description.trim();
  const summary =
    summarySource.length > 160 ? `${summarySource.slice(0, 157)}...` : summarySource;

  return {
    incident_category: input.category || 'Other Emergency',
    summary: summary || 'Reported incident awaiting coordinator review.',
    priority_recommendation: priority,
    confidence,
    detected_keywords: detectedKeywords.length > 0 ? detectedKeywords : [input.category.toLowerCase()],
    required_resources: requiredResources,
    reasoning_summary:
      `Rule-based advisory evaluation (${priority}) derived from category "${input.category}", ` +
      `${people} affected individual(s), and detected operational terms. A human coordinator must verify and approve dispatch decisions.`,
    additional_information_needed: missingInfo,
    provider: 'fallback_rules',
  };
}

export function tokenizeText(text: string): Set<string> {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'near',
    'there',
    'have',
    'been',
    'into',
    'onto',
    'over',
    'under',
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
  return new Set(tokens);
}

export function calculateIncidentSimilarity(
  a: {
    category: string;
    description: string;
    locationText: string;
    latitude: number | null;
    longitude: number | null;
    reportedAt: string;
  },
  b: {
    category: string;
    description: string;
    locationText: string;
    latitude: number | null;
    longitude: number | null;
    reportedAt: string;
  }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (a.category === b.category) {
    score += 30;
    reasons.push(`Matching category (${a.category})`);
  }

  if (
    a.latitude != null &&
    a.longitude != null &&
    b.latitude != null &&
    b.longitude != null
  ) {
    const dist = haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
    if (dist <= 1.5) {
      score += 35;
      reasons.push(`Within ${dist} km proximity`);
    } else if (dist <= 5) {
      score += 18;
      reasons.push(`Nearby sector (${dist} km apart)`);
    }
  } else {
    const locA = tokenizeText(a.locationText);
    const locB = tokenizeText(b.locationText);
    const locOverlap = Array.from(locA).filter((t) => locB.has(t));
    if (locOverlap.length > 0) {
      score += 22;
      reasons.push(`Shared location terms (${locOverlap.slice(0, 2).join(', ')})`);
    }
  }

  const timeA = Date.parse(a.reportedAt);
  const timeB = Date.parse(b.reportedAt);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
    const hoursDiff = Math.abs(timeA - timeB) / (1000 * 60 * 60);
    if (hoursDiff <= 2) {
      score += 15;
      reasons.push('Reported within 2-hour window');
    } else if (hoursDiff <= 12) {
      score += 8;
      reasons.push('Reported same operational shift');
    }
  }

  const tokensA = tokenizeText(a.description);
  const tokensB = tokenizeText(b.description);
  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const intersectionCount = Array.from(tokensA).filter((t) => tokensB.has(t)).length;
  if (unionSize > 0 && intersectionCount > 0) {
    const jaccard = intersectionCount / unionSize;
    const textPoints = Math.round(jaccard * 35);
    if (textPoints > 0) {
      score += textPoints;
      reasons.push('Similar incident description keywords');
    }
  }

  return { score: Math.min(100, score), reasons };
}

const CATEGORY_SUITABILITY: Record<string, string[]> = {
  'Medical Emergency': ['Ambulance', 'Medical Supplies', 'Rescue Team'],
  'Road Accident': ['Ambulance', 'Emergency Response Vehicle', 'Rescue Team'],
  'Fire Emergency': ['Emergency Response Vehicle', 'Rescue Team', 'Ambulance'],
  'Natural Disaster': ['Rescue Team', 'Temporary Shelter', 'Disaster Response Resource', 'Medical Supplies'],
  Flooding: ['Rescue Team', 'Temporary Shelter', 'Disaster Response Resource', 'Emergency Equipment'],
  'Building Emergency': ['Rescue Team', 'Emergency Equipment', 'Emergency Response Vehicle', 'Ambulance'],
  'Missing Person': ['Rescue Team', 'Emergency Response Vehicle', 'Emergency Equipment'],
  'Public Safety Incident': ['Emergency Response Vehicle', 'Ambulance', 'Medical Supplies'],
  'Other Emergency': ['Emergency Response Vehicle', 'Rescue Team', 'Medical Supplies'],
};

export function recommendResourcesForIncident(
  incident: {
    category: string;
    latitude: number | null;
    longitude: number | null;
  },
  resources: ResourceRecord[]
): ResourceRecommendation[] {
  const preferredCategories = CATEGORY_SUITABILITY[incident.category] ?? [
    'Emergency Response Vehicle',
  ];

  const candidates = resources.filter(
    (r) => r.status === 'Available' && r.assignedIncidentId === null
  );

  const scored: ResourceRecommendation[] = candidates.map((r) => {
    let score = 40;
    const reasons: string[] = ['Currently Available & unassigned'];

    const matchIdx = preferredCategories.indexOf(r.category);
    if (matchIdx === 0) {
      score += 35;
      reasons.push(`Primary match for ${incident.category}`);
    } else if (matchIdx > 0) {
      score += 22;
      reasons.push(`Support match for ${incident.category}`);
    } else {
      score += 5;
    }

    let distanceKm = 5;
    if (incident.latitude != null && incident.longitude != null) {
      distanceKm = haversineDistanceKm(
        incident.latitude,
        incident.longitude,
        r.latitude,
        r.longitude
      );
      if (distanceKm <= 3) {
        score += 25;
        reasons.push(`Close proximity (${distanceKm} km)`);
      } else if (distanceKm <= 8) {
        score += 15;
        reasons.push(`Moderate distance (${distanceKm} km)`);
      } else {
        score += 5;
        reasons.push(`Regional staging (${distanceKm} km)`);
      }
    }

    return {
      resourceId: r.id,
      resourceCode: r.resourceCode,
      name: r.name,
      category: r.category,
      status: r.status,
      locationName: r.locationName,
      distanceKm,
      suitabilityScore: Math.min(100, score),
      reasons,
    };
  });

  return scored.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}

export function isCapacityStale(updatedAtIso: string, thresholdHours = 6): boolean {
  const parsed = Date.parse(updatedAtIso);
  if (Number.isNaN(parsed)) return true;
  const ageHours = (Date.now() - parsed) / (1000 * 60 * 60);
  return ageHours > thresholdHours;
}
