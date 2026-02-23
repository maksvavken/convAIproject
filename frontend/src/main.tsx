import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { CONVERSATION_INFO_DISPLAYED } from './conversationInfoDisplayed'

// Set page title from config
document.title = CONVERSATION_INFO_DISPLAYED.pageTitle;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)