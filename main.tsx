import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
	suppressYouTubeWidgetStartupWarning()
}

createRoot(document.getElementById('root')!).render(<App />)

function suppressYouTubeWidgetStartupWarning() {
	window.addEventListener(
		'error',
		(event) => {
			const isYouTubeWidgetWarning =
				event.filename.includes('www-widgetapi.js') &&
				event.message.includes("Failed to execute 'postMessage' on 'DOMWindow'") &&
				event.message.includes("target origin provided ('https://www.youtube.com')")

			if (!isYouTubeWidgetWarning) {
				return
			}

			event.preventDefault()
			event.stopImmediatePropagation()
		},
		true,
	)
}
