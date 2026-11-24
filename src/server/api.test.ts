import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

process.env.RESQNET_DB_PATH = path.join(os.tmpdir(), `resqnet-test-${process.pid}.db`);
import { getDb, seedDemoData } from './db/database.ts';
import { createApiRouter } from './routes.ts';

async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const db = getDb();
  seedDemoData(db, true);

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('Full multi-user workflows: Citizen report -> Coordinator verify & allocate -> Responder progress -> Hospital capacity -> RBAC', async () => {
  await withTestServer(async (baseUrl) => {
    // 1. Register a new Citizen
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Citizen User',
        email: 'newcitizen@example.org',
        password: 'StrongPassword123',
        phone: '+1-415-555-9999',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = (await regRes.json()) as { token: string; user: { role: string } };
    assert.equal(regData.user.role, 'CITIZEN');
    const citizenToken = regData.token;

    // 2. Citizen cannot access admin users
    const deniedRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert.equal(deniedRes.status, 403);

    // 3. Citizen submits an emergency report
    const createIncRes = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        category: 'Fire Emergency',
        title: 'Warehouse Smoke on 3rd Street',
        description: 'Heavy smoke and visible fire near loading bay, 4 workers trapped inside.',
        locationText: '300 3rd St, Central Sector',
        latitude: 37.782,
        longitude: -122.401,
        locationSource: 'MANUAL',
        peopleAffected: 4,
        contactInfo: '+1-415-555-9999',
      }),
    });
    assert.equal(createIncRes.status, 201);
    const incData = (await createIncRes.json()) as {
      incident: { id: number; incidentCode: string; aiAnalysis: { priority_recommendation: string } };
    };
    assert.ok(incData.incident.incidentCode.startsWith('INC-2026-'));
    assert.equal(incData.incident.aiAnalysis.priority_recommendation, 'Critical');

    // 4. Coordinator logs in via demo-login, verifies incident, and allocates available resource
    const coordLogin = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'EMERGENCY_COORDINATOR' }),
    });
    const coordToken = ((await coordLogin.json()) as { token: string }).token;

    const verifyRes = await fetch(`${baseUrl}/api/incidents/${incData.incident.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coordToken}`,
      },
      body: JSON.stringify({ status: 'Verified', note: 'Verified by dispatch' }),
    });
    assert.equal(verifyRes.status, 200);

    const recsRes = await fetch(
      `${baseUrl}/api/resources/recommendations/${incData.incident.id}`,
      { headers: { Authorization: `Bearer ${coordToken}` } }
    );
    const recsData = (await recsRes.json()) as {
      recommendations: Array<{ resourceId: number }>;
    };
    assert.ok(recsData.recommendations.length > 0);

    const allocRes = await fetch(`${baseUrl}/api/resources/allocate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coordToken}`,
      },
      body: JSON.stringify({
        resourceId: recsData.recommendations[0].resourceId,
        incidentId: incData.incident.id,
        rationale: 'Top suitability match',
      }),
    });
    assert.equal(allocRes.status, 200);

    // 5. Responder logs in and updates incident progress
    const respLogin = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'EMERGENCY_RESPONDER' }),
    });
    const respToken = ((await respLogin.json()) as { token: string }).token;

    const progRes = await fetch(`${baseUrl}/api/incidents/${incData.incident.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${respToken}`,
      },
      body: JSON.stringify({ status: 'Response in Progress', note: 'On scene containment active' }),
    });
    assert.equal(progRes.status, 200);

    // 6. Hospital Admin updates capacity and coordinator sees it
    const hospLogin = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'HOSPITAL_ADMIN' }),
    });
    const hospToken = ((await hospLogin.json()) as { token: string }).token;

    const hospListRes = await fetch(`${baseUrl}/api/hospitals`, {
      headers: { Authorization: `Bearer ${hospToken}` },
    });
    const hospList = (await hospListRes.json()) as { hospitals: Array<{ id: number }> };
    const targetHospitalId = hospList.hospitals[2].id;

    const capRes = await fetch(`${baseUrl}/api/hospitals/${targetHospitalId}/capacity`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hospToken}`,
      },
      body: JSON.stringify({
        edStatus: 'Operational',
        generalBedsAvailable: 21,
        generalBedsTotal: 70,
        icuBedsAvailable: 7,
        icuBedsTotal: 12,
        availableFacilities: 'CT Imaging, Orthopedics, Trauma Bay',
        incomingCasesCount: 2,
      }),
    });
    assert.equal(capRes.status, 200);
    const capData = (await capRes.json()) as {
      hospital: { generalBedsAvailable: number; isCapacityStale: boolean };
    };
    assert.equal(capData.hospital.generalBedsAvailable, 21);
    assert.equal(capData.hospital.isCapacityStale, false);

    // 7. Coordinator checks notifications
    const notifRes = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${coordToken}` },
    });
    const notifData = (await notifRes.json()) as { notifications: Array<{ title: string }> };
    assert.ok(notifData.notifications.some((n) => n.title.includes(incData.incident.incidentCode)));
  });
});
