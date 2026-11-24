import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AiAnalysisPayload } from '../../types/resqnet.ts';
import { fallbackAnalyzeIncident } from '../domain/rules.ts';

async function withTimeout<T>(promise: Promise<T>, ms = 25000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
      }),
    ]);
  } catch (error) {
    console.error('Gemini request failed, using rule-based fallback:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function analyzeIncidentWithAI(input: {
  category: string;
  description: string;
  locationText: string;
  peopleAffected: number;
}): Promise<AiAnalysisPayload> {
  const ai = getGeminiClient();
  if (!ai) {
    return fallbackAnalyzeIncident(input);
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          'Analyze the following emergency report for an emergency coordination desk.',
          'Remember: Your recommendation is strictly advisory for a human coordinator. Never claim to diagnose medical conditions or make autonomous dispatch decisions.',
          `Reported Category: ${input.category}`,
          `Location: ${input.locationText}`,
          `People Affected: ${input.peopleAffected}`,
          `Description: ${input.description}`,
        ].join('\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
          'You are an emergency dispatch triage advisor for ResQNet. Produce concise, factual structured JSON summarizing the report, recommending an operational priority (Critical, High, Medium, or Low), listing missing operational details, and explaining why that priority is recommended.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            incident_category: { type: Type.STRING },
            summary: { type: Type.STRING },
            priority_recommendation: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
            detected_keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            required_resources: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            reasoning_summary: { type: Type.STRING },
            additional_information_needed: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'incident_category',
            'summary',
            'priority_recommendation',
            'confidence',
            'detected_keywords',
            'required_resources',
            'reasoning_summary',
            'additional_information_needed',
          ],
        },
      },
    }));

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<AiAnalysisPayload>;
    const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
    const priority = validPriorities.includes(parsed.priority_recommendation ?? '')
      ? (parsed.priority_recommendation as AiAnalysisPayload['priority_recommendation'])
      : fallbackAnalyzeIncident(input).priority_recommendation;

    return {
      incident_category: parsed.incident_category || input.category,
      summary: parsed.summary || input.description.slice(0, 150),
      priority_recommendation: priority,
      confidence: Math.max(10, Math.min(99, Number(parsed.confidence ?? 80))),
      detected_keywords: Array.isArray(parsed.detected_keywords) ? parsed.detected_keywords.slice(0, 8) : [],
      required_resources: Array.isArray(parsed.required_resources) ? parsed.required_resources.slice(0, 6) : ['Emergency Response Vehicle'],
      reasoning_summary:
        `${parsed.reasoning_summary || 'AI operational priority assessment.'} (Advisory only — requires human coordinator verification.)`,
      additional_information_needed: Array.isArray(parsed.additional_information_needed)
        ? parsed.additional_information_needed.slice(0, 5)
        : [],
      provider: 'gemini',
    };
  } catch (error) {
    console.warn('Gemini incident analysis unavailable, using deterministic fallback rules:', error);
    return fallbackAnalyzeIncident(input);
  }
}

export async function extractNaturalLanguageReport(narrative: string): Promise<{
  category: string;
  title: string;
  locationText: string;
  peopleAffected: number;
  keywords: string[];
  summary: string;
  missingDetails: string[];
  provider: string;
}> {
  const ai = getGeminiClient();
  const fallback = (() => {
    const lower = narrative.toLowerCase();
    let category = 'Other Emergency';
    if (lower.includes('fire') || lower.includes('smoke') || lower.includes('burn')) category = 'Fire Emergency';
    else if (lower.includes('crash') || lower.includes('accident') || lower.includes('car') || lower.includes('collision')) category = 'Road Accident';
    else if (lower.includes('flood') || lower.includes('water')) category = 'Flooding';
    else if (lower.includes('collapse') || lower.includes('elevator') || lower.includes('building')) category = 'Building Emergency';
    else if (lower.includes('missing')) category = 'Missing Person';
    else if (lower.includes('pain') || lower.includes('breathing') || lower.includes('medical') || lower.includes('unconscious') || lower.includes('injured')) category = 'Medical Emergency';
    else if (lower.includes('earthquake') || lower.includes('storm')) category = 'Natural Disaster';

    const numMatch = narrative.match(/\b(\d+)\s+(people|persons|victims|workers|passengers|occupants|individuals)\b/i);
    const peopleAffected = numMatch ? Math.max(1, Number(numMatch[1])) : 1;
    const locMatch = narrative.match(/\b(?:at|near|on|outside|inside)\s+([A-Z0-9][A-Za-z0-9\s&.,-]{4,55})/);
    const locationText = locMatch ? locMatch[1].trim() : '';

    const missingDetails: string[] = [];
    if (!locationText) missingDetails.push('Exact street address, intersection, or GPS coordinates');
    if (!numMatch) missingDetails.push('Confirmed number of people affected');
    if (narrative.trim().length < 40) missingDetails.push('Additional detail on hazards or access constraints');

    const fb = fallbackAnalyzeIncident({ category, description: narrative, locationText, peopleAffected });
    return {
      category,
      title: `${category} Report`,
      locationText,
      peopleAffected,
      keywords: fb.detected_keywords,
      summary: fb.summary,
      missingDetails,
      provider: 'fallback_rules',
    };
  })();

  if (!ai) {
    return fallback;
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Extract structured emergency report fields for citizen verification before submission:\n\n"${narrative}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Extract emergency_type (one of: Medical Emergency, Road Accident, Fire Emergency, Natural Disaster, Flooding, Building Emergency, Missing Person, Public Safety Incident, Other Emergency), a concise title, location_text if mentioned (empty string if not), integer people_affected (minimum 1), keywords, a 1-sentence summary, and missing_details array.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              title: { type: Type.STRING },
              locationText: { type: Type.STRING },
              peopleAffected: { type: Type.INTEGER },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              summary: { type: Type.STRING },
              missingDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['category', 'title', 'locationText', 'peopleAffected', 'keywords', 'summary', 'missingDetails'],
          },
        },
      })
    );
    const parsed = JSON.parse((response.text ?? '{}').trim());
    return {
      category: parsed.category || fallback.category,
      title: parsed.title || fallback.title,
      locationText: typeof parsed.locationText === 'string' ? parsed.locationText : fallback.locationText,
      peopleAffected: Math.max(1, Number(parsed.peopleAffected || fallback.peopleAffected)),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : fallback.keywords,
      summary: parsed.summary || fallback.summary,
      missingDetails: Array.isArray(parsed.missingDetails) ? parsed.missingDetails : fallback.missingDetails,
      provider: 'gemini',
    };
  } catch {
    return fallback;
  }
}

export async function answerDecisionSupportQuery(
  question: string,
  dbSnapshot: {
    incidents: Array<{
      incidentCode: string;
      category: string;
      priority: string;
      status: string;
      locationText: string;
      isDemo: boolean;
      reportedAt: string;
    }>;
    resources: Array<{
      resourceCode: string;
      name: string;
      category: string;
      status: string;
      locationName: string;
    }>;
    hospitals: Array<{
      hospitalCode: string;
      name: string;
      edStatus: string;
      generalBedsAvailable: number;
      icuBedsAvailable: number;
      isCapacityStale: boolean;
      isVerified: boolean;
      capacityUpdatedAt: string;
    }>;
  }
): Promise<{
  answer: string;
  citedRecords: string[];
  recommendedActions: string[];
  provider: string;
}> {
  const ai = getGeminiClient();

  const activeIncidents = dbSnapshot.incidents.filter((i) => !['Resolved', 'Closed'].includes(i.status));
  const pendingVerification = dbSnapshot.incidents.filter((i) =>
    ['Reported', 'Under Verification'].includes(i.status)
  );
  const unavailableResources = dbSnapshot.resources.filter((r) => r.status !== 'Available');
  const freshHospitals = dbSnapshot.hospitals.filter((h) => !h.isCapacityStale);

  const deterministicFallback = () => {
    const q = question.toLowerCase();
    const cited: string[] = [];
    const actions: string[] = [];
    const lines: string[] = [];

    if (q.includes('verification') || q.includes('awaiting') || q.includes('verify')) {
      lines.push(
        `[Database Records] There are ${pendingVerification.length} incident(s) awaiting verification:`
      );
      for (const inc of pendingVerification) {
        lines.push(`- ${inc.incidentCode} (${inc.category}, ${inc.priority} priority) at ${inc.locationText} [${inc.isDemo ? 'Demo Record' : 'Live Submission'}]`);
        cited.push(inc.incidentCode);
      }
      if (pendingVerification.length > 0) {
        actions.push(`Verify ${pendingVerification[0].incidentCode} in Incident Management and review resource suitability.`);
      }
    } else if (q.includes('unavailable') || q.includes('resource') || q.includes('shortage')) {
      lines.push(
        `[Database Records] ${unavailableResources.length} of ${dbSnapshot.resources.length} registered resources are currently unavailable or assigned:`
      );
      for (const r of unavailableResources) {
        lines.push(`- ${r.resourceCode} (${r.name}, ${r.category}) — Status: ${r.status} at ${r.locationName}`);
        cited.push(r.resourceCode);
      }
      actions.push('Monitor Ambulance and Rescue Team availability across high-priority sectors.');
    } else if (q.includes('hospital') || q.includes('capacity') || q.includes('bed')) {
      lines.push(
        `[Database Records] ${freshHospitals.length} of ${dbSnapshot.hospitals.length} hospitals have updated capacity within the last 6 hours:`
      );
      for (const h of dbSnapshot.hospitals) {
        lines.push(
          `- ${h.hospitalCode} ${h.name}: ${h.generalBedsAvailable} General / ${h.icuBedsAvailable} ICU beds · ED: ${h.edStatus} · ${h.isCapacityStale ? 'STALE (>6h)' : 'Recently Updated'}`
        );
        cited.push(h.hospitalCode);
      }
      actions.push('Request capacity refresh from hospitals flagged as STALE (>6h).');
    } else {
      lines.push(
        `[Database Records] Operational Overview: ${activeIncidents.length} active incidents (${pendingVerification.length} awaiting verification), ` +
          `${dbSnapshot.resources.length - unavailableResources.length} available resources, and ${freshHospitals.length} hospitals with fresh capacity updates.`
      );
      for (const inc of activeIncidents.slice(0, 4)) {
        lines.push(`- ${inc.incidentCode}: ${inc.category} (${inc.priority}) — ${inc.status} at ${inc.locationText}`);
        cited.push(inc.incidentCode);
      }
      actions.push('Prioritize verification for unverified Critical/High incidents and confirm hospital ICU capacity before trauma routing.');
    }

    lines.push('');
    lines.push('[Advisory Notice] All recommendations are generated from live database records and rule-based logic; human coordinators retain full authority over operational decisions.');

    return {
      answer: lines.join('\n'),
      citedRecords: cited,
      recommendedActions: actions,
      provider: 'fallback_rules',
    };
  };

  if (!ai) {
    return deterministicFallback();
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Coordinator Question: ${question}\n\nAuthorized Operational Database Snapshot:\n${JSON.stringify(dbSnapshot)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are the ResQNet Decision Support Assistant. Answer strictly using ONLY the provided database snapshot. Never invent incident IDs, counts, or hospital names. Explicitly label database facts vs AI insights vs demonstration records.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              citedRecords: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['answer', 'citedRecords', 'recommendedActions'],
          },
        },
      })
    );
    const parsed = JSON.parse((response.text ?? '{}').trim());
    return {
      answer: parsed.answer || deterministicFallback().answer,
      citedRecords: Array.isArray(parsed.citedRecords) ? parsed.citedRecords : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
      provider: 'gemini',
    };
  } catch {
    return deterministicFallback();
  }
}

export async function generateOperationalObservations(summaryPayload: unknown): Promise<string[]> {
  const ai = getGeminiClient();
  const fallback = [
    'Active incident distribution remains concentrated in Central and Waterfront sectors; maintain ambulance and flood response staging.',
    'Hospitals with capacity timestamps older than 6 hours are flagged stale and require administrator confirmation prior to trauma routing.',
    'All AI priority and resource recommendations remain advisory pending coordinator verification.',
  ];
  if (!ai) return fallback;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate 3 concise, database-grounded executive observations for an operational emergency report:\n${JSON.stringify(summaryPayload)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      })
    );
    const parsed = JSON.parse((response.text ?? '[]').trim());
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.slice(0, 5) : fallback;
  } catch {
    return fallback;
  }
}
