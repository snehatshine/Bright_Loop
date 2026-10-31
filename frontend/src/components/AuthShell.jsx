// Shared layout for all sign-in screens: brand panel on the left, form on the right.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="shell">
      <aside className="brand" aria-hidden="true">
        <svg viewBox="0 0 200 200" className="loop">
          <circle cx="100" cy="100" r="78" className="loop-track" />
          <path d="M100 22 A78 78 0 1 1 22 100" className="loop-arc" />
          <circle cx="100" cy="22" r="7" className="loop-dot" />
        </svg>
        <p className="brand-name">Brightloop</p>
        <p className="brand-line">Every plan, invoice and payment in one cycle.</p>
      </aside>
      <main className="panel">
        <div className="card">
          <h1>{title}</h1>
          {subtitle && <p className="sub">{subtitle}</p>}
          {children}
          {footer && <p className="foot">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
