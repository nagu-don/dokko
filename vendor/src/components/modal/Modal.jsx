import './Modal.css';

// generic popup shell — backdrop click and the × button both close it
const Modal = ({ title, onClose, wide = false, children }) => (
  <div className='vendor-modal-overlay' onClick={onClose}>
    <div className={`vendor-modal ${wide ? 'vendor-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className='vendor-modal-head'>
        <h3>{title}</h3>
        <button className='modal-close' onClick={onClose} aria-label='Close'>×</button>
      </div>
      <div className='vendor-modal-body'>
        {children}
      </div>
    </div>
  </div>
);

export default Modal;
