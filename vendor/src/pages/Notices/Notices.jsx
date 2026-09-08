import { useEffect, useState } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import { getAuthHeaders, isAuthError } from '../../utils/api';
import './Notices.css';

const Notices = ({ url, onLogout }) => {
  const { lang, t } = useUi();

  const [notices, setNotices] = useState([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get(`${url}/api/vendors/notices`, {
          headers: getAuthHeaders(),
        });
        setNotices(data.data);
      } catch (err) {
        if (isAuthError(err)) onLogout();
        else setError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // read each notice in the active language, falling back to the other
  const titleOf = (notice) => (lang === 'np' && notice.titleNp ? notice.titleNp : notice.titleEn || notice.titleNp);
  const bodyOf = (notice) => (lang === 'np' && notice.bodyNp ? notice.bodyNp : notice.bodyEn || notice.bodyNp);

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section className='vendor-section theme-notices'>
      <h3>{t('noticesTitle')}</h3>

      {loading ? (
        <p className='empty-line'>{t('pleaseWait')}</p>
      ) : error ? (
        <p className='empty-line'>{t('loadFailedNotices')}</p>
      ) : notices.length === 0 ? (
        <p className='empty-line'>{t('noNotices')}</p>
      ) : (
        notices.map((notice) => (
          <article className='notice-card' key={notice._id}>
            <strong className='notice-title'>{titleOf(notice)}</strong>
            {bodyOf(notice) && <p className='notice-body'>{bodyOf(notice)}</p>}
            <span className='notice-date'>{t('postedOn')}: {formatDate(notice.createdAt)}</span>
          </article>
        ))
      )}
    </section>
  );
};

export default Notices;