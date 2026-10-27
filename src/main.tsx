import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FireDataProvider } from './context/FireDataContext'
import { ThemeProvider } from './context/ThemeContext'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <FireDataProvider>
          <App />
        </FireDataProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
