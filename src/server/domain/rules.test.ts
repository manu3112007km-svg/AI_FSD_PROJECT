import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIncidentSimilarity,
  canAccessModule,
  canAssignResources,
  canManageUsers,
  canUpdateHospitalCapacity,
  canVerifyIncident,
  fallbackAnalyzeIncident,
  haversineDistanceKm,
  isCapacityStale,
  isValidStatusTransition,
  recommendResourcesForIncident,
} from './rules.ts';
import type { ResourceRecord } from '../../types/resqnet.ts';

test('RBAC isolates privileged actions to authorized roles', () => {
  assert.equal(canAccessModule('CITIZEN', 'users'), false);
  assert.equal(canAccessModule('CITIZEN', 'report'), true);
  assert.equal(canAccessModule('SUPER_ADMIN', 'users'), true);
  assert.equal(canVerifyIncident('EMERGENCY_COORDINATOR'), true);
  assert.equal(canVerifyIncident('CITIZEN'), false);
  assert.equal(canAssignResources('EMERGENCY_COORDINATOR'), true);
  assert.equal(canAssignResources('EMERGENCY_RESPONDER'), false);
  assert.equal(canUpdateHospitalCapacity('HOSPITAL_ADMIN'), true);
  assert.equal(canUpdateHospitalCapacity('EMERGENCY_RESPONDER'), false);
  assert.equal(canManageUsers('SUPER_ADMIN'), true);
  assert.equal(canManageUsers('EMERGENCY_COORDINATOR'), false);
});

test('Fallback AI analyzer classifies critical emergencies accurately', () => {
  const analysis = fallbackAnalyzeIncident({
    category: 'Building Emergency',
    description: 'Two-story warehouse collapse with 8 workers trapped inside and smoke visible.',
    locationText: '420 Harbor Industrial Blvd',
    peopleAffected: 8,
  });

  assert.equal(analysis.priority_recommendation, 'Critical');
  assert.equal(analysis.provider, 'fallback_rules');
  assert.ok(analysis.detected_keywords.includes('trapped'));
  assert.ok(analysis.required_resources.includes('Rescue Team'));
  assert.ok(analysis.reasoning_summary.includes('human coordinator'));
});

test('Fallback AI analyzer identifies missing details on terse reports', () => {
  const analysis = fallbackAnalyzeIncident({
    category: 'Other Emergency',
    description: 'Help needed',
    locationText: '',
  });
  assert.ok(analysis.additional_information_needed.length >= 2);
});

test('Incident status transitions respect role boundaries and progression', () => {
  assert.equal(
    isValidStatusTransition('Reported', 'Verified', 'EMERGENCY_COORDINATOR').valid,
    true
  );
  assert.equal(
    isValidStatusTransition('Reported', 'Verified', 'CITIZEN').valid,
    false
  );
  assert.equal(
    isValidStatusTransition('Assigned', 'Response in Progress', 'EMERGENCY_RESPONDER').valid,
    true
  );
  assert.equal(
    isValidStatusTransition('Assigned', 'Closed', 'EMERGENCY_RESPONDER').valid,
    false
  );
});

test('Similarity scoring detects nearby matching incidents for clustering advisory', () => {
  const now = new Date().toISOString();
  const sim = calculateIncidentSimilarity(
    {
      category: 'Flooding',
      description: 'Severe street flooding blocking riverside intersection near bridge',
      locationText: 'Riverside Bridge North',
      latitude: 37.7749,
      longitude: -122.4194,
      reportedAt: now,
    },
    {
      category: 'Flooding',
      description: 'Water rising rapidly at riverside bridge intersection, cars stranded',
      locationText: 'Riverside Bridge Approach',
      latitude: 37.7755,
      longitude: -122.4189,
      reportedAt: now,
    }
  );
  assert.ok(sim.score >= 70);
  assert.ok(sim.reasons.length >= 2);
});

test('Resource recommendation engine prioritizes available, suitable, nearby units', () => {
  const resources: ResourceRecord[] = [
    {
      id: 1,
      resourceCode: 'RES-101',
      name: 'Medic Unit Alpha',
      category: 'Ambulance',
      status: 'Available',
      assignedIncidentId: null,
      assignedIncidentCode: null,
      locationName: 'Central Station',
      latitude: 37.775,
      longitude: -122.418,
      organizationId: 1,
      organizationName: 'Metro EMS',
      isDemo: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      resourceCode: 'RES-102',
      name: 'Shelter Kit Beta',
      category: 'Temporary Shelter',
      status: 'Available',
      assignedIncidentId: null,
      assignedIncidentCode: null,
      locationName: 'North Depot',
      latitude: 37.85,
      longitude: -122.5,
      organizationId: 1,
      organizationName: 'Relief Corps',
      isDemo: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 3,
      resourceCode: 'RES-103',
      name: 'Medic Unit Busy',
      category: 'Ambulance',
      status: 'Assigned',
      assignedIncidentId: 9,
      assignedIncidentCode: 'INC-2026-1009',
      locationName: 'Central Station',
      latitude: 37.775,
      longitude: -122.418,
      organizationId: 1,
      organizationName: 'Metro EMS',
      isDemo: true,
      updatedAt: new Date().toISOString(),
    },
  ];

  const recs = recommendResourcesForIncident(
    { category: 'Medical Emergency', latitude: 37.7749, longitude: -122.4194 },
    resources
  );

  assert.equal(recs.length, 2);
  assert.equal(recs[0].resourceCode, 'RES-101');
  assert.ok(recs[0].suitabilityScore > recs[1].suitabilityScore);
});

test('Haversine distance and stale capacity checks behave deterministically', () => {
  const d = haversineDistanceKm(37.7749, -122.4194, 37.7849, -122.4094);
  assert.ok(d > 1 && d < 2);

  const oldIso = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  const freshIso = new Date().toISOString();
  assert.equal(isCapacityStale(oldIso, 6), true);
  assert.equal(isCapacityStale(freshIso, 6), false);
});
