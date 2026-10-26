import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource-variable/geist-mono'
import { applyTheme, readTheme } from './theme'
import { App } from './App'
import { ReviewPage } from './pages/ReviewPage'
import './styles.css'

applyTheme(readTheme())

// Stakeholders get /review/<token>; everything else is the designer's app.
const review = /^\/review\/([a-f0-9]{32})/.exec(location.pathname)
createRoot(document.getElementById('root')!).render(review ? <ReviewPage token={review[1]} /> : <App />)
