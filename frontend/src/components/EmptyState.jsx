export default function EmptyState({ title = 'No items found', description = 'There are no records to display.', actionText, onAction }) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
      <h3>{title}</h3>
      <p style={{ margin: 0, maxWidth: '40ch' }}>{description}</p>
      {actionText && onAction && (
        <button type="button" className="primary sm" onClick={onAction} style={{ marginTop: '0.5rem' }}>
          {actionText}
        </button>
      )}
    </div>
  );
}
