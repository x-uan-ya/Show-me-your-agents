import { DataSourceCitation } from "../components/DataSourceCitation";
import {
  DATA_SOURCES,
  MARKET_CONTEXT_SCOPE_NOTE,
  METHODOLOGY_NOTE,
  USAGE_TYPE_LABELS,
} from "../data/sources";

// Sources & Methodology page.
// Explains how evidence is used, keeps customer feedback and Singapore market
// context strictly separate, and lists every market-context dataset with its
// provider, licence and original source link.
export function SourcesMethodology() {
  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Transparency</p>
            <h1>Sources &amp; methodology</h1>
            <p>
              How customer insights are produced and how Singapore market
              datasets are used as supporting context.
            </p>
          </div>
          <span className="context-pill">{DATA_SOURCES.length} context datasets</span>
        </header>

        <section className="surface-card p-5 sm:p-6">
          <p className="section-kicker">Methodology</p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            How insights are generated
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{METHODOLOGY_NOTE}</p>
        </section>

        {/* The two evidence types, kept strictly separate. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card p-5 sm:p-6">
            <p className="section-kicker">Customer feedback evidence</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Drives individual insights
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The Customer Insight Intelligence engine uses the supplied
              customer-feedback records to generate insights, and links each
              insight to the specific feedback records that support it.
            </p>
          </section>
          <section className="surface-card p-5 sm:p-6">
            <p className="section-kicker">Singapore market context</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Background context only
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {MARKET_CONTEXT_SCOPE_NOTE}
            </p>
          </section>
        </div>

        {/* Example of a market-context statement carrying an inline citation.
            No statistic is invented; this is a qualitative context statement. */}
        <section className="surface-card p-5 sm:p-6">
          <p className="section-kicker">Example context statement</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Online F&amp;B sales provide additional digital-channel context for
            scenario design.{" "}
            <DataSourceCitation
              sourceId="online-fnb-sales-proportion"
              label="Singapore Department of Statistics"
            />
          </p>
        </section>

        {/* Full dataset list with provider, licence and source link. */}
        <section className="surface-card p-5 sm:p-6">
          <p className="section-kicker">Dataset 2 — Singapore market context</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Data sources</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Each dataset below is used for supporting context only. Licences are
            shown exactly as provided; review the original source for full terms.
          </p>

          <ul className="data-source-list">
            {DATA_SOURCES.map((source) => (
              <li key={source.id} className="data-source-item">
                <div className="data-source-item-head">
                  <h3>{source.datasetName}</h3>
                  <span className="data-source-usage">
                    {USAGE_TYPE_LABELS[source.usageType]}
                  </span>
                </div>
                <p className="data-source-purpose">{source.purpose}</p>
                <dl className="data-source-meta">
                  <div>
                    <dt>Provider</dt>
                    <dd>{source.provider}</dd>
                  </div>
                  <div>
                    <dt>Licence</dt>
                    <dd>{source.license}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open original dataset
                      </a>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="data-source-license-note">
            Licence note: &ldquo;Singapore Open Data Licence&rdquo; and
            &ldquo;CC BY-NC 4.0&rdquo; are shown exactly as provided. CC BY-NC 4.0
            is a non-commercial licence and does not permit unrestricted
            commercial reuse. Always check the original source for the governing
            terms before any reuse.
          </p>
        </section>
      </div>
    </main>
  );
}
