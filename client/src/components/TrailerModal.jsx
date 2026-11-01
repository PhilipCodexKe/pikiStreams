import React from 'react';

export default function TrailerModal({ trailerKey, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      id="trailerModal"
      className="trailer-modal"
      style={{ display: 'flex', opacity: 1, visibility: 'visible' }}
      aria-hidden={!isOpen}
    >
      <div className="trailer-backdrop" onClick={onClose}></div>

      <div className="trailer-box">
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>

        <div className="video-wrapper">
          {trailerKey ? (
            <iframe
              id="trailerIframe"
              className="trailer-iframe"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
              title="Movie Trailer"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          ) : (
            <div style={{ color: '#fff', textAlign: 'center', padding: '50px' }}>
              No trailer available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

