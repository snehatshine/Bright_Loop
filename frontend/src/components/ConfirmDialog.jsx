import Modal from './Modal';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title = 'Confirm Action', message, confirmText = 'Confirm', isDangerous = false, loading = false }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="420px">
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>{message}</p>
      </div>
      <div className="modal-footer">
        <button type="button" className="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          type="button"
          className={isDangerous ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
