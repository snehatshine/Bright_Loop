import Spinner from './Spinner';
import EmptyState from './EmptyState';

export default function DataTable({
  columns,
  data = [],
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items to show.',
  page = 1,
  limit = 20,
  total = 0,
  onPageChange,
  toolbar
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startRecord = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(total, page * limit);

  return (
    <div className="table-container">
      {toolbar && <div className="table-toolbar">{toolbar}</div>}

      {loading ? (
        <Spinner text="Loading records..." />
      ) : data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key || col.header} style={{ textAlign: col.align || 'left', width: col.width }}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={row.id || idx}>
                    {columns.map(col => (
                      <td key={col.key || col.header} style={{ textAlign: col.align || 'left' }}>
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > limit && onPageChange && (
            <div className="pagination">
              <div>
                Showing <b>{startRecord}</b> - <b>{endRecord}</b> of <b>{total}</b>
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="ghost sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  Previous
                </button>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: 600 }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="ghost sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
