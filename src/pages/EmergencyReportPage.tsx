import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  LocateFixed,
  Send,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { INCIDENT_CATEGORIES } from '../server/domain/rules';
import type { IncidentCategory, IncidentRecord } from '../types/resqnet';

interface DuplicateCandidate {
  incidentId: number;
  incidentCode: string;
  category: string;
  title: string;
  locationText: string;
  status: string;
  similarityScore: number;
  reasons: string[];
}

export function EmergencyReportPage({
  onCreated,
}: {
  onCreated: (incident: IncidentRecord) => void;
}) {
  const { user } = useAuth();
  const [narrative, setNarrative] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<{
    keywords: string[];
    summary: string;
    missingDetails: string[];
    provider: string;
  } | null>(null);

  const [category, setCategory] = useState<IncidentCategory>('Medical Emergency');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [locationSource, setLocationSource] = useState<'GPS' | 'MANUAL'>('MANUAL');
  const [peopleAffected, setPeopleAffected] = useState<number>(1);
  const [contactInfo, setContactInfo] = useState(user?.phone || user?.email || '');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [reportedAt, setReportedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [attachments, setAttachments] = useState<
    Array<{ fileName: string; mimeType: string; dataUrl: string }>
  >([]);

  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedIncident, setSubmittedIncident] = useState<IncidentRecord | null>(null);

  const handleNaturalLanguageExtract = async () => {
    if (narrative.trim().length < 8) {
      setError('Please enter at least 8 characters describing the emergency for AI extraction.');
      return;
    }
    setError(null);
    setExtracting(true);
    try {
      const data = await apiFetch<{
        extracted: {
          category: string;
          title: string;
          locationText: string;
          peopleAffected: number;
          keywords: string[];
          summary: string;
          missingDetails: string[];
          provider: string;
        };
      }>('/api/ai/extract-report', {
        method: 'POST',
        body: JSON.stringify({ narrative }),
      });
      const ex = data.extracted;
      if (INCIDENT_CATEGORIES.includes(ex.category as IncidentCategory)) {
        setCategory(ex.category as IncidentCategory);
      }
      if (ex.title) setTitle(ex.title);
      if (ex.locationText) setLocationText(ex.locationText);
      if (ex.peopleAffected) setPeopleAffected(ex.peopleAffected);
      setDescription(narrative);
      setExtractedPreview({
        keywords: ex.keywords,
        summary: ex.summary,
        missingDetails: ex.missingDetails,
        provider: ex.provider,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to extract details.');
    } finally {
      setExtracting(false);
    }
  };

  const handleCaptureGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('Geolocation is not supported by this browser. Enter location manually.');
      return;
    }
    setGpsStatus('Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocationSource('GPS');
        if (!locationText.trim()) {
          setLocationText(
            `GPS Coordinates (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
          );
        }
        setGpsStatus('Live GPS coordinates captured with your consent.');
      },
      () => {
        setGpsStatus('GPS permission denied or unavailable. Please enter location manually.');
      },
      { timeout: 8000 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Only JPEG, PNG, or WebP images are supported.');
        return;
      }
      if (file.size > 2.5 * 1024 * 1024) {
        setError('Each photo must be under 2.5 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachments((prev) =>
            [...prev, { fileName: file.name, mimeType: file.type, dataUrl: reader.result as string }].slice(0, 3)
          );
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheckDuplicates = async () => {
    try {
      const res = await apiFetch<{ matches: DuplicateCandidate[] }>('/api/incidents/check-duplicates', {
        method: 'POST',
        body: JSON.stringify({
          category,
          description,
          locationText,
          latitude: latitude ? Number(latitude) : undefined,
          longitude: longitude ? Number(longitude) : undefined,
        }),
      });
      setDuplicates(res.matches);
    } catch {
      // advisory check should never block submission
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await handleCheckDuplicates();
      const res = await apiFetch<{ incident: IncidentRecord }>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          category,
          title,
          description,
          locationText,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          locationSource,
          peopleAffected: Number(peopleAffected),
          contactInfo,
          additionalNotes,
          reportedAt: new Date(reportedAt).toISOString(),
          attachments,
        }),
      });
      setSubmittedIncident(res.incident);
      onCreated(res.incident);
      setTitle('');
      setDescription('');
      setNarrative('');
      setAdditionalNotes('');
      setAttachments([]);
      setExtractedPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit emergency report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 sm:p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
          Intelligent Emergency Reporting
        </h1>
        <p className="text-sm text-[#29251C]/85 mt-1">
          Submit structured emergency incidents or use AI natural-language extraction. All AI recommendations are advisory and reviewed by human coordinators.
        </p>
      </div>

      {submittedIncident && (
        <div className="rounded-lg border border-[#15803D] bg-[#ECFDF5] p-5 text-[#14532D] space-y-2">
          <div className="flex items-center gap-2 font-bold text-lg">
            <CheckCircle2 className="h-5 w-5" />
            <span>Emergency Report Confirmed · {submittedIncident.incidentCode}</span>
          </div>
          <p className="text-sm">
            Saved to database and routed to Emergency Coordinators. Advisory priority recommendation:{' '}
            <strong>{submittedIncident.aiAnalysis?.priority_recommendation || submittedIncident.priority}</strong>{' '}
            ({submittedIncident.aiAnalysis?.provider === 'gemini' ? 'Gemini AI' : 'Rule-based Fallback'}).
          </p>
        </div>
      )}

      {/* Natural Language AI Extraction Box */}
      <section className="gold-card-surface rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-[#493713]">
          <Bot className="h-5 w-5" />
          <h2 className="text-xl font-bold">Natural Language Emergency Assistant</h2>
        </div>
        <p className="text-sm text-[#29251C]/85">
          Describe what is happening in plain words. ResQNet will populate the form below for your mandatory review before submission.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            rows={3}
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Example: Two cars collided outside 450 Market St, 3 people injured and fuel leaking near crosswalk..."
            className="flex-1 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
          />
          <button
            type="button"
            disabled={extracting}
            onClick={() => void handleNaturalLanguageExtract()}
            className="px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] shrink-0 self-start cursor-pointer disabled:opacity-60"
          >
            {extracting ? 'Extracting...' : 'Extract & Populate Form'}
          </button>
        </div>

        {extractedPreview && (
          <div className="rounded-md border border-[#C9A227] bg-[#F7E7A1]/60 p-4 text-xs space-y-2">
            <p className="font-bold text-[#493713]">
              Review Extracted Details ({extractedPreview.provider === 'gemini' ? 'Gemini AI' : 'Rule Fallback'})
            </p>
            <p>
              <strong>Summary:</strong> {extractedPreview.summary}
            </p>
            {extractedPreview.keywords.length > 0 && (
              <p>
                <strong>Keywords:</strong> {extractedPreview.keywords.join(', ')}
              </p>
            )}
            {extractedPreview.missingDetails.length > 0 && (
              <p className="text-[#78350F]">
                <strong>Missing Details Suggested:</strong> {extractedPreview.missingDetails.join(' · ')}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Structured Incident Submission Form */}
      <form onSubmit={handleSubmit} className="gold-card-surface rounded-lg p-5 sm:p-6 space-y-5">
        <h2 className="text-xl font-bold text-[#493713]">Incident Details Form</h2>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-[#B91C1C] bg-[#FDECEC] px-3.5 py-2.5 text-sm font-bold text-[#7F1D1D]"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rep-category" className="block text-sm font-bold text-[#493713] mb-1">
              Emergency Category
            </label>
            <select
              id="rep-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as IncidentCategory)}
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm text-[#29251C]"
            >
              {INCIDENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rep-title" className="block text-sm font-bold text-[#493713] mb-1">
              Incident Headline
            </label>
            <input
              id="rep-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concise summary headline"
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm text-[#29251C]"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="rep-desc" className="block text-sm font-bold text-[#493713] mb-1">
              Incident Description (Required)
            </label>
            <textarea
              id="rep-desc"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => void handleCheckDuplicates()}
              placeholder="Provide detailed observations, hazards, injuries, or access notes..."
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm text-[#29251C]"
            />
          </div>

          <div>
            <label htmlFor="rep-location" className="block text-sm font-bold text-[#493713] mb-1">
              Location / Address (Required)
            </label>
            <input
              id="rep-location"
              type="text"
              required
              value={locationText}
              onChange={(e) => {
                setLocationText(e.target.value);
                setLocationSource('MANUAL');
              }}
              onBlur={() => void handleCheckDuplicates()}
              placeholder="Street address, intersection, or landmark"
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm text-[#29251C]"
            />
          </div>

          <div>
            <span className="block text-sm font-bold text-[#493713] mb-1">
              GPS Coordinates (Optional with Consent)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCaptureGps}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#C9A227] bg-[#F7E7A1] hover:bg-[#D4AF37] text-xs font-bold text-[#29251C] cursor-pointer"
              >
                <LocateFixed className="h-4 w-4" /> Capture My GPS
              </button>
              <input
                type="number"
                step="any"
                aria-label="Latitude"
                placeholder="Lat (e.g. 37.7749)"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-28 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2.5 py-2 text-xs tabular-nums"
              />
              <input
                type="number"
                step="any"
                aria-label="Longitude"
                placeholder="Lon (e.g. -122.4194)"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-28 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2.5 py-2 text-xs tabular-nums"
              />
            </div>
            {gpsStatus && <p className="text-xs text-[#493713] mt-1">{gpsStatus}</p>}
          </div>

          <div>
            <label htmlFor="rep-people" className="block text-sm font-bold text-[#493713] mb-1">
              Estimated People Affected
            </label>
            <input
              id="rep-people"
              type="number"
              min={1}
              max={10000}
              required
              value={peopleAffected}
              onChange={(e) => setPeopleAffected(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="rep-contact" className="block text-sm font-bold text-[#493713] mb-1">
              Contact Information (Protected)
            </label>
            <input
              id="rep-contact"
              type="text"
              required
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="Phone or email for coordinator follow-up"
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="rep-time" className="block text-sm font-bold text-[#493713] mb-1">
              Incident Timestamp
            </label>
            <input
              id="rep-time"
              type="datetime-local"
              value={reportedAt}
              onChange={(e) => setReportedAt(e.target.value)}
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="rep-notes" className="block text-sm font-bold text-[#493713] mb-1">
              Additional Information (Optional)
            </label>
            <input
              id="rep-notes"
              type="text"
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Gate codes, hazards, landmarks..."
              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="rep-photos" className="block text-sm font-bold text-[#493713] mb-1">
              Upload Incident Photographs (Optional · JPEG/PNG/WebP, max 3 files)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="rep-photos"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer"
              >
                <Upload className="h-4 w-4" /> Attach Image
                <input
                  id="rep-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {attachments.map((att, idx) => (
                <div
                  key={`${att.fileName}-${idx}`}
                  className="flex items-center gap-2 rounded border border-[#C9A227] bg-[#FFF2C6] px-2.5 py-1 text-xs"
                >
                  <img
                    src={att.dataUrl}
                    alt={att.fileName}
                    className="h-8 w-8 object-cover rounded border border-[#C0C0C0]"
                  />
                  <span className="max-w-[140px] truncate">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="font-bold text-[#7F1D1D] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Advisory Duplicate Detection Banner */}
        {duplicates.length > 0 && (
          <div className="rounded-md border border-[#B45309] bg-[#FEF3C7] p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#78350F]">
              <AlertTriangle className="h-4 w-4" />
              <span>
                Advisory: Potentially Related Active Reports Detected (Your report will NOT be discarded)
              </span>
            </div>
            <ul className="space-y-1 text-xs text-[#78350F]">
              {duplicates.map((m) => (
                <li key={m.incidentId}>
                  <strong>{m.incidentCode}</strong> ({m.similarityScore}% match) · {m.category} at{' '}
                  {m.locationText} — {m.reasons.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#C0C0C0]">
          <p className="text-xs text-[#493713]">
            Contact 911 or local emergency services directly if immediate life-saving assistance is required.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            <span>{submitting ? 'Submitting & Analyzing...' : 'Submit Emergency Report'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
