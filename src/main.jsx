import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { IS_ARTIFACT } from './engine/ai.js'

if (IS_ARTIFACT) document.documentElement.dataset.edition = 'artifact'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
