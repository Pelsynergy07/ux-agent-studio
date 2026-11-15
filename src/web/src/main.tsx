import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import '@fontsource-variable/geist-mono'
import { applyTheme, readTheme } from './theme'
import { App } from './App'
import { RenderView } from './pages/Render'
import { ReviewPage } from './pages/ReviewPage'
import './styles.css'
import './steps.css'

applyTheme(readTheme())

// Stakeholders get /review/<token>; everything else is the designer's app.
// #/render/… are chrome-less pages the case-study builder photographs (flows, concepts).
const review = /^\/review\/([a-f0-9]{32})/.exec(location.pathname)
createRoot(document.getElementById('root')!).render(review ? <ReviewPage token={review[1]} /> : location.hash.startsWith('#/render/') ? <RenderView hash={location.hash} /> : <App />)
