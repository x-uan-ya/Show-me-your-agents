import { getDataSource } from "../data/sources";

interface Props {
  // Matches an id in src/data/sources.ts.
  sourceId: string;
  // Optional short label override; defaults to the dataset provider.
  label?: string;
}

// Reusable inline citation. Renders a small "[Source: ...]" reference that links
// to the original dataset page. Use next to a market-context statement so the
// source is visible without cluttering the UI. If the id is unknown it renders
// nothing (fail safe, never a broken/invented citation).
export function DataSourceCitation({ sourceId, label }: Props) {
  const source = getDataSource(sourceId);
  if (!source) return null;

  return (
    <a
      className="data-source-citation"
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source.datasetName} — ${source.provider} (${source.license})`}
    >
      [Source: {label ?? source.provider}]
    </a>
  );
}
