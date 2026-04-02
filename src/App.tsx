import Layout from './components/layout/Layout'
import { NetworkView } from './components/network'
import SessionDetail from './components/sessions/SessionDetail'
import WorkstreamDetail from './components/sessions/WorkstreamDetail'
import { KanbanBoard } from './components/kanban'
import { TerminalPanel } from './components/terminal'
import { SettingsProvider, useSettingsContext } from './context/SettingsContext'
import { SessionProvider, useSessionContext } from './context/SessionContext'
import { TerminalProvider } from './context/TerminalContext'
import { useAccentColor } from './hooks/useAccentColor'
import { useTheme } from './hooks/useTheme'

function AppContent() {
  const { viewMode, selectedWorkstream } = useSessionContext()
  const { settings } = useSettingsContext()
  useAccentColor(settings.display.accentColor)
  useTheme(settings.display.theme)

  return (
    <Layout
      left={<KanbanBoard />}
      right={selectedWorkstream ? <WorkstreamDetail /> : <SessionDetail />}
      fullContent={viewMode === 'network' ? <NetworkView /> : undefined}
      bottomPanel={<TerminalPanel />}
    />
  )
}

function App() {
  return (
    <SettingsProvider>
      <SessionProvider>
        <TerminalProvider>
          <AppContent />
        </TerminalProvider>
      </SessionProvider>
    </SettingsProvider>
  )
}

export default App
