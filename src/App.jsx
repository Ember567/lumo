import React, { useEffect, useState } from 'react'
import { LayoutDashboard, BookOpen, GraduationCap, Route, ListChecks, Link2, Settings as SettingsIcon, Menu } from 'lucide-react'
import { supabase, supabaseConfigured, supabaseConfigError } from './supabaseClient.js'
import { APP_NAME, STORAGE_PREFIX } from './config.js'
import { fmtLong } from './lib/dates.js'
import Auth, { SetNewPassword } from './components/Auth.jsx'
import BrandMark from './components/BrandMark.jsx'
import Onboarding from './components/Onboarding.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import NextUp from './components/NextUp.jsx'
import OverviewSummary from './components/OverviewSummary.jsx'
import WeeklyReview from './components/WeeklyReview.jsx'
import MeadowCard from './components/meadow/Meadow.jsx'
import WeeklyFocusCard from './components/WeeklyFocusCard.jsx'
import StudyTimer from './components/StudyTimer.jsx'
import StudyPlanTopics from './components/StudyPlanTopics.jsx'
import StudyBurndown from './components/StudyBurndown.jsx'
import ProgressCard from './components/Progress.jsx'
import Tasks from './components/Tasks.jsx'
import CalendarCard from './components/Calendar.jsx'
import StudyPlanTimeline from './components/StudyPlanTimeline.jsx'
import LinksView from './components/LinksView.jsx'
import Planner from './components/planner/Planner.jsx'
import SettingsView from './components/Settings.jsx'
import QuizView from './components/quiz/QuizView.jsx'
import LumiCompanion from './components/lumi/LumiCompanion.jsx'
import ScanDialog from './components/scan/ScanDialog.jsx'
import { onScanRequest } from './lib/scan.js'
import { lumiEmit } from './lib/lumi.js'

const SIDEBAR_BREAKPOINT = 820
const SIDEBAR_COLLAPSED_KEY = `${STORAGE_PREFIX}:sidebar-collapsed`

function getInitialSidebarCollapsed() {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored !== null) return stored === 'true'
  } catch { /* localStorage nicht verfügbar */ }
  return window.innerWidth < SIDEBAR_BREAKPOINT
}

const SECTIONS = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard },
  { id: 'learning', label: 'Lernen', icon: BookOpen },
  { id: 'quiz', label: 'Abfragen', icon: GraduationCap },
  { id: 'planner', label: 'Planer', icon: Route },
  { id: 'organisation', label: 'Organisation', icon: ListChecks },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'settings', label: 'Einstellungen', icon: SettingsIcon },
]

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(sess)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <BrandMark className="auth-mark" />
          <h1 className="auth-title">{APP_NAME}</h1>
          <p className="auth-config-warning">{supabaseConfigError}</p>
        </div>
      </div>
    )
  }

  if (loading) return null
  if (recovering && session) return <SetNewPassword onDone={() => setRecovering(false)} />
  if (!session) return <Auth />
  return <Dashboard key={session.user.id} session={session} />
}

function Dashboard({ session }) {
  const userId = session.user.id
  const [settings, setSettings] = useState(undefined) // undefined = lädt noch
  const [activeSection, setActiveSection] = useState('overview')
  const [plannerTab, setPlannerTab] = useState('goals')
  const [collapsed, setCollapsed] = useState(getInitialSidebarCollapsed)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [quizRequest, setQuizRequest] = useState(null)
  const [scan, setScan] = useState(null) // { subjectId } während der Scan-Dialog offen ist

  useEffect(() => onScanRequest(detail => setScan({ subjectId: detail.subjectId || '' })), [])

  useEffect(() => { loadSettings() }, [userId])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle()
    setSettings(data || null)
  }

  function navigate(section, tab) {
    setActiveSection(section)
    lumiEmit('section', { section })
    if (tab) setPlannerTab(tab)
    window.scrollTo({ top: 0 })
  }

  // Abfrage von überall starten (Lernen, Übersicht) — läuft im Abfragen-Tab.
  function startQuiz(target) {
    setQuizRequest({ mode: target.subjectId ? 'subject' : 'topic', ...target })
    navigate('quiz')
  }

  function toggleCollapsed() {
    setCollapsed(current => {
      const next = !current
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* ignorieren */ }
      return next
    })
  }

  if (settings === undefined) return null

  if (!settings?.onboarded) {
    return (
      <Onboarding
        userId={userId}
        onDone={(saved, target) => { setSettings(saved); navigate(target.section, target.tab) }}
      />
    )
  }

  const currentSection = SECTIONS.find(s => s.id === activeSection)
  const title = activeSection === 'overview' && settings.display_name
    ? `Hallo, ${settings.display_name}`
    : currentSection.label

  return (
    <div className="app-shell">
      <Sidebar
        sections={SECTIONS}
        active={activeSection}
        onChange={id => navigate(id)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onLogout={() => supabase.auth.signOut()}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="main-content" data-section={activeSection}>
        <header className="content-header">
          <button type="button" className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)} aria-label="Menü öffnen">
            <Menu size={20} strokeWidth={2} />
          </button>
          <h1 className="content-title" key={activeSection}>{title}</h1>
          <span className="today">{fmtLong(new Date())}</span>
        </header>

        {activeSection === 'overview' && (
          <div className="plan-section">
            <StatusBar userId={userId} onNavigate={navigate} />
            <NextUp userId={userId} onNavigate={navigate} onStartQuiz={startQuiz} />
            <OverviewSummary userId={userId} onNavigate={navigate} />
            <WeeklyReview userId={userId} />
            <MeadowCard userId={userId} />
          </div>
        )}

        {activeSection === 'learning' && (
          <div className="plan-section">
            <WeeklyFocusCard userId={userId} onNavigate={navigate} />
            <StudyTimer userId={userId} />
            <div className="plan-two-col">
              <StudyPlanTopics userId={userId} onNavigate={navigate} onStartQuiz={startQuiz} />
              <StudyBurndown userId={userId} onNavigate={navigate} />
            </div>
            <ProgressCard userId={userId} onNavigate={navigate} />
          </div>
        )}

        {activeSection === 'quiz' && (
          <QuizView
            userId={userId}
            request={quizRequest}
            onRequestHandled={() => setQuizRequest(null)}
            onNavigate={navigate}
          />
        )}

        {activeSection === 'planner' && (
          <Planner userId={userId} tab={plannerTab} onTabChange={setPlannerTab} />
        )}

        {activeSection === 'organisation' && (
          <div className="plan-section">
            <main className="grid">
              <Tasks userId={userId} />
              <CalendarCard userId={userId} />
            </main>
            <StudyPlanTimeline userId={userId} onNavigate={navigate} />
          </div>
        )}

        {activeSection === 'links' && (
          <div className="plan-section">
            <LinksView userId={userId} />
          </div>
        )}

        {activeSection === 'settings' && (
          <SettingsView
            userId={userId}
            email={session.user.email}
            settings={settings}
            onSettingsChange={setSettings}
            onNavigate={navigate}
          />
        )}

        <footer className="foot">{APP_NAME} · deine Ziele, deine Daten</footer>
      </div>

      <LumiCompanion userId={userId} section={activeSection} onNavigate={navigate} onStartQuiz={startQuiz} />
      {scan && <ScanDialog userId={userId} initialSubjectId={scan.subjectId} onClose={() => setScan(null)} onNavigate={navigate} />}
    </div>
  )
}
