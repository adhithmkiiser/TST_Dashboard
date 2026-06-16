import React from 'react';

interface SummaryCardsProps {
  uniqueSpeciesCount: number;
  totalDetections: number;
  activeRecordersCount: number;
  totalFilesProcessed: number;
  totalExpectedFiles: number;
  totalDays: number;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({
  uniqueSpeciesCount,
  totalDetections,
  activeRecordersCount,
  totalFilesProcessed,
  totalExpectedFiles,
  totalDays,
}) => {
  // Format numbers nicely
  const formatNum = (n: number) => new Intl.NumberFormat().format(n);

  return (
    <div className="summary-cards">
      <div className="kpi-card">
        <span className="kpi-label">Species Richness</span>
        <span className="kpi-value">{uniqueSpeciesCount}</span>
        <span className="kpi-subtext">Unique avian species detected</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Total Detections</span>
        <span className="kpi-value">{formatNum(totalDetections)}</span>
        <span className="kpi-subtext">BirdNET classification triggers</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Active Recorders</span>
        <span className="kpi-value">{activeRecordersCount}</span>
        <span className="kpi-subtext">Stations monitored (~{totalDays} site-days)</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Acoustic Survey Effort</span>
        <span className="kpi-value">{formatNum(totalFilesProcessed)}</span>
        <span className="kpi-subtext">
          {formatNum(totalExpectedFiles)} of {formatNum(totalFilesProcessed)} clips parsed (~{formatNum(Math.round(totalFilesProcessed * 15 / 60))} hrs)
        </span>
      </div>
    </div>
  );
};

export default SummaryCards;
