interface Props {
  onLogin: () => void;
  onRegister: () => void;
}

const FEATURES = [
  {
    number: "01",
    title: "Keep every client in focus",
    copy: "Separate briefs, signals, insights and campaign calendars without losing the agency-wide view.",
    accent: "cyan",
  },
  {
    number: "02",
    title: "Show the evidence",
    copy: "Trace every behavioural insight back to the customer feedback that supports it.",
    accent: "violet",
  },
  {
    number: "03",
    title: "Move from signal to schedule",
    copy: "Turn customer-message gaps into a reviewable seven-day campaign and content calendar.",
    accent: "amber",
  },
] as const;

const WORKFLOW = [
  ["Import", "Bring in reviews, surveys and campaign feedback."],
  ["Understand", "Find purchase, trial, retention and unmet-need signals."],
  ["Plan", "Connect customer truth to message, CTA and channel choices."],
  ["Coordinate", "Review every client's campaign in one shared calendar."],
] as const;

export function Landing({ onLogin, onRegister }: Props) {
  return (
    <div className="landing-page">
      <div className="landing-glow landing-glow-one" aria-hidden="true" />
      <div className="landing-glow landing-glow-two" aria-hidden="true" />

      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Campaign Intelligence home">
          <img src="/campaign-intelligence-logo.png" alt="" />
          <span>Campaign Intelligence</span>
        </a>
        <nav aria-label="Landing page navigation">
          <a href="#product">Product</a>
          <a href="#workflow">Workflow</a>
          <a href="#agencies">For agencies</a>
        </nav>
        <div className="landing-header-actions">
          <button type="button" className="landing-signin" onClick={onLogin}>Sign in</button>
          <button type="button" className="landing-cta-small" onClick={onRegister}>Create account <span>↗</span></button>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-pill"><i /> Evidence-led planning for modern agencies</div>
            <h1>Turn customer evidence into campaigns <em>clients believe in.</em></h1>
            <p>
              One intelligent workspace to understand customer behaviour, uncover message gaps,
              and coordinate campaigns across every client you manage.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-cta-primary" onClick={onRegister}>Start your workspace <span>→</span></button>
              <a href="#product" className="landing-cta-secondary"><span className="play-mark">▶</span> See how it works</a>
            </div>
            <div className="landing-proof-row" aria-label="Product benefits">
              <span><i>✓</i> Multi-client workspaces</span>
              <span><i>✓</i> Evidence-linked insights</span>
              <span><i>✓</i> Human approval</span>
            </div>
          </div>

          <div className="landing-product-stage" aria-label="Campaign Intelligence workspace preview">
            <div className="preview-orbit orbit-one" aria-hidden="true" />
            <div className="preview-orbit orbit-two" aria-hidden="true" />
            <div className="preview-window">
              <div className="preview-topbar">
                <div className="preview-window-dots"><i /><i /><i /></div>
                <span>Campaign workspace</span>
                <b><i /> Live plan</b>
              </div>
              <div className="preview-body">
                <aside className="preview-sidebar">
                  <div className="preview-mini-brand"><img src="/campaign-intelligence-logo.png" alt="" /></div>
                  {[0, 1, 2, 3, 4].map((item) => <span className={item === 1 ? "active" : ""} key={item} />)}
                </aside>
                <div className="preview-content">
                  <header>
                    <div><small>CLIENT WORKSPACE</small><strong>Northstar Coffee</strong></div>
                    <button type="button" tabIndex={-1}>Generate plan</button>
                  </header>
                  <div className="preview-metrics">
                    <article><span>Signals analysed</span><strong>300</strong><small>Customer evidence</small></article>
                    <article><span>Insight areas</span><strong>7</strong><small>Across the journey</small></article>
                    <article><span>Campaign items</span><strong>4</strong><small>Ready for review</small></article>
                  </div>
                  <div className="preview-grid">
                    <article className="preview-gap-card">
                      <div className="preview-card-label"><i /> CUSTOMER-MESSAGE GAP</div>
                      <h3>Customers value speed. Your message leads with premium quality.</h3>
                      <div className="preview-alignment"><span>Current message</span><i /><span>Customer value</span></div>
                      <p>Lead with the weekday convenience customers already describe.</p>
                    </article>
                    <article className="preview-schedule-card">
                      <div className="preview-card-label">7-DAY PLAN <span>4 items</span></div>
                      {["Customer proof", "Answer the concern", "Show the offer", "Invite feedback"].map((label, index) => (
                        <div className="preview-schedule-row" key={label}>
                          <b>{[1, 3, 5, 7][index]}</b><span><strong>{label}</strong><small>{index % 2 ? "Email" : "Instagram"}</small></span><i />
                        </div>
                      ))}
                    </article>
                  </div>
                </div>
              </div>
            </div>
            <div className="preview-float-card preview-float-left"><span>↗</span><div><small>PURCHASE DRIVER</small><strong>Weekday value</strong></div></div>
            <div className="preview-float-card preview-float-right"><span>✓</span><div><small>CAMPAIGN STATUS</small><strong>Evidence ready</strong></div></div>
          </div>
        </section>

        <section className="landing-signal-strip" aria-label="Campaign workflow summary">
          <span>Customer signals</span><i>→</i><span>Behavioural insight</span><i>→</i><span>Message strategy</span><i>→</i><span>Campaign calendar</span>
        </section>

        <section className="landing-section landing-product" id="product">
          <header className="landing-section-heading">
            <div><span className="landing-kicker">Why Campaign Intelligence</span><h2>Less guessing.<br />More grounded decisions.</h2></div>
            <p>Campaign planning gets difficult when customer evidence, client context and content schedules live in different places. Bring the reasoning together.</p>
          </header>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article className={`landing-feature is-${feature.accent}`} key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <div className="feature-visual" aria-hidden="true">
                  <i /><i /><i /><b>{feature.number === "01" ? "⌘" : feature.number === "02" ? "◎" : "↗"}</b>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-workflow" id="workflow">
          <div className="workflow-intro">
            <span className="landing-kicker">Evidence → insight → campaign</span>
            <h2>A workflow your strategy can explain.</h2>
            <p>Move from raw customer language to an approved content plan without losing the evidence along the way.</p>
            <button type="button" onClick={onRegister}>Build your first campaign <span>→</span></button>
          </div>
          <ol className="workflow-list">
            {WORKFLOW.map(([title, copy], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
                <i>↗</i>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section agency-section" id="agencies">
          <div className="agency-copy">
            <span className="landing-kicker">Made for multi-client work</span>
            <h2>Give every client a clear story—and your team one place to manage it.</h2>
            <p>Keep access, evidence and calendars scoped to the right client while maintaining an agency-wide view of what is moving.</p>
            <div className="agency-stat-row"><span><strong>8</strong> behavioural lenses</span><span><strong>1</strong> shared calendar</span><span><strong>0</strong> unsupported claims</span></div>
          </div>
          <div className="agency-client-stack" aria-hidden="true">
            <article><i className="client-avatar one">N</i><span><strong>Northstar Coffee</strong><small>Campaign approved</small></span><b>12 Sep</b></article>
            <article><i className="client-avatar two">M</i><span><strong>Meridian Studio</strong><small>Insights ready</small></span><b>18 Sep</b></article>
            <article><i className="client-avatar three">L</i><span><strong>Little Orchard</strong><small>Mapping signals</small></span><b>22 Sep</b></article>
          </div>
        </section>

        <section className="landing-final-cta">
          <div className="final-cta-grid" aria-hidden="true" />
          <span className="landing-kicker">Your customers are already telling you what matters</span>
          <h2>Turn their evidence into your next campaign.</h2>
          <p>Create a secure workspace, add your first client and build a campaign your team can defend.</p>
          <div><button type="button" className="landing-cta-primary" onClick={onRegister}>Create your account <span>→</span></button><button type="button" className="landing-signin" onClick={onLogin}>Sign in</button></div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><img src="/campaign-intelligence-logo.png" alt="" /><span>Campaign Intelligence</span></a>
        <p>Evidence-led campaign planning for modern agency teams.</p>
        <span>Show Me Your Agents · 2026</span>
      </footer>
    </div>
  );
}
