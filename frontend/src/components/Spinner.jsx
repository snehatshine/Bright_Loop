export default function Spinner({ text = 'Loading...' }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div className="spinner" role="status" aria-label={text} />
      {text && <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>{text}</p>}
    </div>
  );
}
