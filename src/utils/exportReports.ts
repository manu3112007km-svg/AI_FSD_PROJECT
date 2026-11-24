import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AnalyticsOverview, HospitalRecord, IncidentRecord, ResourceRecord } from '../types/resqnet';

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadOperationalCsv(params: {
  overview: AnalyticsOverview;
  incidents: IncidentRecord[];
  resources: ResourceRecord[];
  hospitals: HospitalRecord[];
  observations: string[];
}): void {
  const lines: string[] = [];
  lines.push('ResQNet Operational Intelligence Report');
  lines.push(`Generated At,${escapeCsvCell(new Date().toISOString())}`);
  lines.push('');
  lines.push('Summary Metric,Value');
  lines.push(`Total Incidents,${params.overview.kpis.totalIncidents}`);
  lines.push(`Active Incidents,${params.overview.kpis.activeIncidents}`);
  lines.push(`Critical Priority Incidents,${params.overview.kpis.criticalPriorityIncidents}`);
  lines.push(`Resolved Incidents,${params.overview.kpis.resolvedIncidents}`);
  lines.push(`Pending Verification,${params.overview.kpis.pendingVerification}`);
  lines.push(`Available Resources,${params.overview.kpis.availableResources}`);
  lines.push(`Registered Hospitals,${params.overview.kpis.registeredHospitals}`);
  lines.push(`General Beds Available,${params.overview.hospitalCapacitySummary.totalGeneralAvailable}/${params.overview.hospitalCapacitySummary.totalGeneralBeds}`);
  lines.push(`ICU Beds Available,${params.overview.hospitalCapacitySummary.totalIcuAvailable}/${params.overview.hospitalCapacitySummary.totalIcuBeds}`);
  lines.push('');
  lines.push('AI Operational Observations (Advisory)');
  params.observations.forEach((obs, i) => {
    lines.push(`${i + 1},${escapeCsvCell(obs)}`);
  });
  lines.push('');
  lines.push('Incident ID,Category,Priority,Status,Location,People Affected,Assigned Team,Reported At,Data Source');
  for (const inc of params.incidents) {
    lines.push(
      [
        inc.incidentCode,
        inc.category,
        inc.priority,
        inc.status,
        inc.locationText,
        inc.peopleAffected,
        inc.assignedTeamName || 'Unassigned',
        inc.reportedAt,
        inc.isDemo ? 'Demonstration' : 'Live Database',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  lines.push('');
  lines.push('Resource Code,Name,Category,Status,Location,Assigned Incident');
  for (const r of params.resources) {
    lines.push(
      [r.resourceCode, r.name, r.category, r.status, r.locationName, r.assignedIncidentCode || 'None']
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `resqnet-operational-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadOperationalPdf(params: {
  overview: AnalyticsOverview;
  incidents: IncidentRecord[];
  resources: ResourceRecord[];
  hospitals: HospitalRecord[];
  observations: string[];
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFillColor(247, 231, 161);
  doc.rect(0, 0, 595, 78, 'F');
  doc.setDrawColor(201, 162, 39);
  doc.line(0, 78, 595, 78);

  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(73, 55, 19);
  doc.text('ResQNet Operational Intelligence Report', 40, 36);

  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(41, 37, 28);
  doc.text(`Generated: ${new Date().toLocaleString()} | Intelligent Emergency Response & Resource Management`, 40, 56);

  autoTable(doc, {
    startY: 96,
    head: [['Key Operational Metric', 'Value', 'Hospital & Resource Summary', 'Value']],
    body: [
      ['Total Incidents', String(params.overview.kpis.totalIncidents), 'Available Resources', String(params.overview.kpis.availableResources)],
      ['Active Incidents', String(params.overview.kpis.activeIncidents), 'Registered Hospitals', String(params.overview.kpis.registeredHospitals)],
      ['Critical Priority', String(params.overview.kpis.criticalPriorityIncidents), 'General Beds Available', `${params.overview.hospitalCapacitySummary.totalGeneralAvailable}/${params.overview.hospitalCapacitySummary.totalGeneralBeds}`],
      ['Resolved Incidents', String(params.overview.kpis.resolvedIncidents), 'ICU Beds Available', `${params.overview.hospitalCapacitySummary.totalIcuAvailable}/${params.overview.hospitalCapacitySummary.totalIcuBeds}`],
      ['Pending Verification', String(params.overview.kpis.pendingVerification), 'Active Response Teams', String(params.overview.kpis.activeResponseTeams)],
    ],
    styles: { font: 'times', fontSize: 9, textColor: [41, 37, 28] },
    headStyles: { fillColor: [212, 175, 55], textColor: [41, 37, 28], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 253, 245] },
  });

  const afterKpiY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(73, 55, 19);
  doc.text('AI-Generated Operational Observations (Advisory)', 40, afterKpiY + 24);

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(41, 37, 28);
  let obsY = afterKpiY + 42;
  for (const obs of params.observations) {
    const wrapped = doc.splitTextToSize(`• ${obs}`, 510);
    doc.text(wrapped, 44, obsY);
    obsY += wrapped.length * 13 + 4;
  }

  autoTable(doc, {
    startY: obsY + 10,
    head: [['Incident ID', 'Category', 'Priority', 'Status', 'Location', 'Team']],
    body: params.incidents.slice(0, 15).map((i) => [
      i.incidentCode,
      i.category,
      i.priority,
      i.status,
      i.locationText,
      i.assignedTeamName || 'Unassigned',
    ]),
    styles: { font: 'times', fontSize: 8.5, textColor: [41, 37, 28] },
    headStyles: { fillColor: [201, 162, 39], textColor: [41, 37, 28], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 253, 245] },
  });

  doc.save(`resqnet-operational-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
