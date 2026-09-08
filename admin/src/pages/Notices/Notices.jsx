import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Notices.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { useAdminContext } from '../../context/AdminContext'

const EMPTY_FORM = { titleEn: '', titleNp: '', bodyEn: '', bodyNp: '' }

const Notices = ({ url }) => {
  const { lang, t } = useAdminContext()

  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const authError = (error) => {
    if (isAuthError(error)) {
      toast.error('Session expired. Please log in again.')
      return true
    }
    return false
  }

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${url}/api/admins/notices`, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) {
        setNotices(response.data.data)
      }
    } catch (error) {
      if (!authError(error)) toast.error(t('failedToLoadNotices'))
    } finally {
      setLoading(false)
    }
  }, [url, t])

  useEffect(() => {
    fetchNotices()
  }, [fetchNotices])

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handlePost = async () => {
    if (!form.titleEn.trim() && !form.titleNp.trim()) {
      toast.error(t('noticeTitleRequired'))
      return
    }
    if (!form.bodyEn.trim() && !form.bodyNp.trim()) {
      toast.error(t('noticeBodyRequired'))
      return
    }

    setPosting(true)
    try {
      const response = await axios.post(`${url}/api/admins/notices`, form, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) {
        toast.success(t('noticePosted'))
        setForm(EMPTY_FORM)
        fetchNotices()
      } else {
        toast.error(response.data.message || t('noticePostFailed'))
      }
    } catch (error) {
      if (!authError(error)) {
        toast.error(error.response?.data?.message || t('noticePostFailed'))
      }
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (notice) => {
    const title = notice.titleEn || notice.titleNp
    if (!window.confirm(t('confirmDeleteNotice', { title }))) return

    setDeletingId(notice._id)
    try {
      const response = await axios.delete(
        `${url}/api/admins/notices/${notice._id}`,
        { headers: getAuthHeaders() }
      )
      if (response.data.success) {
        toast.success(t('noticeDeleted'))
        setNotices((prev) => prev.filter((n) => n._id !== notice._id))
      } else {
        toast.error(response.data.message || t('noticeDeleteFailed'))
      }
    } catch (error) {
      if (!authError(error)) {
        toast.error(error.response?.data?.message || t('noticeDeleteFailed'))
      }
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return 'N/A'
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // preview each notice in the admin's active language, falling back to the other
  const titleOf = (notice) => (lang === 'np' && notice.titleNp ? notice.titleNp : notice.titleEn || notice.titleNp)
  const bodyOf = (notice) => (lang === 'np' && notice.bodyNp ? notice.bodyNp : notice.bodyEn || notice.bodyNp)

  return (
    <div className='notices-page'>
      <div className='notices-header'>
        <h1>{t('noticesTitle')}</h1>
        <p className='notices-subtitle'>{t('noticesSubtitle')}</p>
      </div>

      {/* composer */}
      <div className='notices-composer'>
        <div className='notice-fields-grid'>
          <label>
            <span>{t('noticeTitleEn')}</span>
            <input
              value={form.titleEn}
              onChange={setField('titleEn')}
              placeholder={t('noticeTitlePlaceholder')}
            />
          </label>
          <label>
            <span>{t('noticeTitleNp')}</span>
            <input
              value={form.titleNp}
              onChange={setField('titleNp')}
              placeholder={t('noticeTitlePlaceholder')}
            />
          </label>
          <label>
            <span>{t('noticeBodyEn')}</span>
            <textarea
              value={form.bodyEn}
              onChange={setField('bodyEn')}
              placeholder={t('noticeBodyPlaceholder')}
              rows={3}
            />
          </label>
          <label>
            <span>{t('noticeBodyNp')}</span>
            <textarea
              value={form.bodyNp}
              onChange={setField('bodyNp')}
              placeholder={t('noticeBodyPlaceholder')}
              rows={3}
            />
          </label>
        </div>
        <div className='notices-composer-actions'>
          <button
            className='btn-post'
            onClick={handlePost}
            disabled={posting}
          >
            {posting ? t('processing') : t('postNotice')}
          </button>
        </div>
      </div>

      {/* posted notices */}
      <div className='notices-list-header'>
        <h3>{t('noticesTitle')}</h3>
      </div>

      {loading ? (
        <p className='notices-loading'>{t('loading')}</p>
      ) : notices.length === 0 ? (
        <div className='notices-empty'>
          <p>{t('noNotices')}</p>
        </div>
      ) : (
        <div className='notices-list'>
          {notices.map((notice) => (
            <div className='notice-card' key={notice._id}>
              <div className='notice-card-main'>
                <strong className='notice-title'>{titleOf(notice)}</strong>
                {bodyOf(notice) && <p className='notice-body'>{bodyOf(notice)}</p>}
                <div className='notice-meta'>
                  <span>{t('postedBy')}: {notice.postedBy?.name || '—'}</span>
                  <span>{t('postedOn')}: {formatDate(notice.createdAt)}</span>
                </div>
              </div>
              <button
                className='btn-delete'
                onClick={() => handleDelete(notice)}
                disabled={deletingId === notice._id}
              >
                {deletingId === notice._id ? t('processing') : t('deleteNotice')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Notices