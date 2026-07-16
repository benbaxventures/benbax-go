import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime } from '../lib/format';
import { apiRequest } from '../services/api';

const KYC_STATUS_FILTERS = ['ALL', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  SELFIE: 'Selfie / Portrait',
  GHANA_CARD: 'Ghana Card',
  PASSPORT_PHOTO: 'Passport photo',
  DRIVER_LICENSE: 'Driver license',
  VEHICLE_PHOTO: 'Vehicle photo',
};

type KycDoc = {
  id: string;
  kind: 'RIDER' | 'DRIVER';
  type: string;
  fileUrl: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  profileKycStatus: string;
  user: { id: string; name: string; phone: string; email: string | null };
};

type MediaResponse = {
  proofs: Array<{
    id: string;
    trackingCode: string;
    deliveryStatus: string;
    customer: { name: string; phone: string };
    photoUrl: string | null;
    signatureUrl: string | null;
    recipientName: string | null;
    verifiedAt: string | null;
    createdAt: string;
  }>;
  voiceNotes: Array<{
    id: string;
    trackingCode: string;
    deliveryStatus: string;
    customer: { name: string; phone: string };
    stage: 'PICKUP' | 'DROPOFF';
    url: string;
    createdAt: string;
  }>;
};

export function DocumentsPage() {
  const [tab, setTab] = useState<'kyc' | 'media'>('kyc');

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Documents</h1>
          <p>
            Every file uploaded from the driver, rider, and customer apps — KYC documents, delivery
            proof photos, signatures, and voice notes.
          </p>
        </div>
      </div>

      <div className="tab-row" role="tablist" aria-label="Document type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'kyc'}
          className={`tab-button${tab === 'kyc' ? ' tab-active' : ''}`}
          onClick={() => setTab('kyc')}
        >
          KYC documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'media'}
          className={`tab-button${tab === 'media' ? ' tab-active' : ''}`}
          onClick={() => setTab('media')}
        >
          Delivery proofs &amp; voice notes
        </button>
      </div>

      {tab === 'kyc' ? <KycDocumentsTab /> : <MediaTab />}
    </section>
  );
}

function KycDocumentsTab() {
  const [statusFilter, setStatusFilter] =
    useState<(typeof KYC_STATUS_FILTERS)[number]>('SUBMITTED');
  const queryClient = useQueryClient();

  const query = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-kyc-docs', statusFilter],
    queryFn: () => apiRequest<KycDoc[]>(`/admin/documents/kyc${query}`),
  });

  const review = useMutation({
    mutationFn: ({ doc, decision }: { doc: KycDoc; decision: 'VERIFIED' | 'REJECTED' }) =>
      apiRequest(`/admin/documents/kyc/${doc.kind}/${doc.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-kyc-docs'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-supply'] });
    },
  });

  const docs = data ?? [];

  return (
    <>
      <div className="filters-row">
        {KYC_STATUS_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`tab-button${statusFilter === option ? ' tab-active' : ''}`}
            onClick={() => setStatusFilter(option)}
          >
            {option === 'ALL' ? 'All' : option}
          </button>
        ))}
      </div>

      {review.isError ? (
        <p className="form-error">Review failed: {(review.error as Error).message}</p>
      ) : null}

      {isLoading ? (
        <p className="muted">Loading documents...</p>
      ) : isError ? (
        <p className="muted">Failed to load documents: {(error as Error).message}</p>
      ) : docs.length ? (
        <div className="doc-grid">
          {docs.map((doc) => (
            <article key={`${doc.kind}-${doc.id}`} className="doc-card">
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <img
                  className="doc-thumb"
                  src={doc.fileUrl}
                  alt={`${DOC_TYPE_LABELS[doc.type] ?? doc.type} uploaded by ${doc.user.name}`}
                  loading="lazy"
                />
              </a>
              <div className="doc-body">
                <div className="timeline-row">
                  <strong>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</strong>
                  <span
                    className={`status-chip${doc.status === 'REJECTED' ? ' chip-danger' : doc.status === 'SUBMITTED' ? ' chip-muted' : ''}`}
                  >
                    {doc.status}
                  </span>
                </div>
                <span className="muted">
                  {doc.user.name} · {doc.user.phone} · {doc.kind}
                </span>
                <span className="muted">Uploaded {formatDateTime(doc.createdAt)}</span>
                {doc.status === 'SUBMITTED' ? (
                  <div className="doc-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ doc, decision: 'VERIFIED' })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary-button danger-text"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ doc, decision: 'REJECTED' })}
                    >
                      Reject
                    </button>
                  </div>
                ) : doc.reviewedAt ? (
                  <span className="muted">Reviewed {formatDateTime(doc.reviewedAt)}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">
          No {statusFilter === 'ALL' ? '' : statusFilter.toLowerCase()} documents.
        </p>
      )}
    </>
  );
}

function MediaTab() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-media-docs'],
    queryFn: () => apiRequest<MediaResponse>('/admin/documents/media'),
  });

  if (isLoading) return <p className="muted">Loading media...</p>;
  if (isError) return <p className="muted">Failed to load media: {(error as Error).message}</p>;

  const proofs = data?.proofs ?? [];
  const voiceNotes = data?.voiceNotes ?? [];

  return (
    <>
      <div className="panel">
        <h2>Delivery proofs</h2>
        {proofs.length ? (
          <div className="doc-grid">
            {proofs.map((proof) => (
              <article key={proof.id} className="doc-card">
                {proof.photoUrl ? (
                  <a href={proof.photoUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      className="doc-thumb"
                      src={proof.photoUrl}
                      alt={`Proof photo for ${proof.trackingCode}`}
                      loading="lazy"
                    />
                  </a>
                ) : null}
                <div className="doc-body">
                  <strong>{proof.trackingCode}</strong>
                  <span className="muted">
                    {proof.customer.name} · {proof.deliveryStatus}
                  </span>
                  {proof.recipientName ? (
                    <span className="muted">Received by {proof.recipientName}</span>
                  ) : null}
                  {proof.signatureUrl ? (
                    <a href={proof.signatureUrl} target="_blank" rel="noopener noreferrer">
                      View signature
                    </a>
                  ) : null}
                  <span className="muted">{formatDateTime(proof.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No delivery proofs uploaded yet.</p>
        )}
      </div>

      <div className="panel">
        <h2>Customer voice notes</h2>
        {voiceNotes.length ? (
          <ul className="timeline">
            {voiceNotes.map((note) => (
              <li key={note.id}>
                <div className="timeline-row">
                  <strong>
                    {note.trackingCode} · {note.stage === 'PICKUP' ? 'Pickup' : 'Drop-off'}
                  </strong>
                  <time>{formatDateTime(note.createdAt)}</time>
                </div>
                <span className="muted">
                  {note.customer.name} · {note.customer.phone}
                </span>
                <audio className="voice-note" controls preload="none" src={note.url} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No voice notes uploaded yet.</p>
        )}
      </div>
    </>
  );
}
