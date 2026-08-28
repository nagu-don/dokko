import './GetApp.css'

const GetApp = () => {
  return (
    <div className='get-app-page'>
      <div className='get-app-container'>
        <div className='get-app-hero'>
          <h1>Get the App</h1>
          <p>Download our app for the best shopping experience.</p>
        </div>
        <div className='get-app-options'>
          <div className='app-card'>
            <div className='app-icon'>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M17.523 15.341c-.5 0-.906-.405-.906-.906s.406-.906.906-.906.906.405.906.906-.406.906-.906.906zm-11.046 0c-.5 0-.906-.405-.906-.906s.406-.906.906-.906.906.405.906.906-.406.906-.906.906zm11.405-6.02l1.997-3.459a.416.416 0 00-.152-.567.416.416 0 00-.568.152L17.117 9.22c-1.458-.598-3.1-.936-4.868-.936s-3.41.338-4.868.936L6.741 5.447a.416.416 0 00-.568-.152.416.416 0 00-.152.567l1.997 3.459C3.066 11.09.991 14.426.991 18.257h22.018c0-3.831-2.075-7.167-5.127-8.936z"/>
              </svg>
            </div>
            <h2>Android</h2>
            <p>Available on Google Play</p>
            <button className='download-btn'>Download for Android</button>
          </div>
          <div className='app-card'>
            <div className='app-icon'>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.49.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.98 1.07-3.11-1.05.05-2.31.7-3.06 1.56-.68.79-1.26 2.05-1.1 3.14 1.19.09 2.38-.6 3.09-1.59"/>
              </svg>
            </div>
            <h2>iOS</h2>
            <p>Available on App Store</p>
            <button className='download-btn'>Download for iOS</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GetApp
