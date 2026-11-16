import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Download,
  FileCode2,
  GitCompare,
  Layers,
  Menu,
  Moon,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { WORKSPACE_PRESETS } from './data/presets';
import {
  GtmExportJson,
  MeasurementWorkspace,
  OciImportRow,
  TaxonomyEvent,
} from './types/tracking';
import { analyzeGtmContainer, patchGtmContainer } from './utils/gtmAnalyzer';
import { OverviewAudit } from './components/OverviewAudit';
import { GtmAuditor } from './components/GtmAuditor';
import { EventSimulator } from './components/EventSimulator';
import { TaxonomyPlanner } from './components/TaxonomyPlanner';
import { DiscrepancyModeler } from './components/DiscrepancyModeler';
import { ConsentDebugger } from './components/ConsentDebugger';
import { AuditExportModal } from './components/AuditExportModal';

type NavTab = 'overview' | 'gtm' | 'consent' | 'simulator' | 'taxonomy' | 'discrepancy';

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview Audit', icon: Activity },
  { id: 'gtm', label: 'GTM Container', icon: FileCode2 },
  { id: 'consent', label: 'Consent Mode Debugger', icon: ShieldCheck },
  { id: 'simulator', label: 'Event & CAPI Debug', icon: Radio },
  { id: 'taxonomy', label: 'Measurement Plan', icon: Layers },
  { id: 'discrepancy', label: 'Discrepancy & OCI', icon: GitCompare },
];

const STORAGE_KEY = 'tagaudit_workspace_state_v1';
const THEME_STORAGE_KEY = 'tagaudit_theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [workspaces, setWorkspaces] = useState<MeasurementWorkspace[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === WORKSPACE_PRESETS.length) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage parse error and fall back to presets
    }
    return WORKSPACE_PRESETS;
  });

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    WORKSPACE_PRESETS[0].id
  );
  const [patchLogs, setPatchLogs] = useState<Record<string, string[]>>({});
  const [exportModalOpen, setExportModalOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch {
      // Ignore quota errors
    }
  }, [workspaces]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0],
    [workspaces, selectedWorkspaceId]
  );

  const gtmSummary = useMemo(
    () => analyzeGtmContainer(activeWorkspace.gtmContainer),
    [activeWorkspace.gtmContainer]
  );

  const updateActiveWorkspace = (
    updater: (prev: MeasurementWorkspace) => MeasurementWorkspace
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === activeWorkspace.id ? updater(w) : w))
    );
  };

  const handleImportContainer = (nextContainer: GtmExportJson) => {
    setPatchLogs((prev) => ({ ...prev, [activeWorkspace.id]: [] }));
    updateActiveWorkspace((prev) => ({
      ...prev,
      gtmContainer: nextContainer,
    }));
  };

  const handlePatchContainer = () => {
    const { patched, changesApplied } = patchGtmContainer(
      activeWorkspace.gtmContainer
    );
    updateActiveWorkspace((prev) => ({
      ...prev,
      gtmContainer: patched,
    }));
    setPatchLogs((prev) => ({
      ...prev,
      [activeWorkspace.id]: changesApplied,
    }));
    setActiveTab('gtm');
  };

  const handleUpdateTaxonomy = (nextTaxonomy: TaxonomyEvent[]) => {
    updateActiveWorkspace((prev) => ({
      ...prev,
      taxonomy: nextTaxonomy,
    }));
  };

  const handleAddOciRow = (row: OciImportRow) => {
    updateActiveWorkspace((prev) => ({
      ...prev,
      ociRows: [row, ...prev.ociRows],
    }));
  };

  const handleUpdateOciRow = (updatedRow: OciImportRow) => {
    updateActiveWorkspace((prev) => ({
      ...prev,
      ociRows: prev.ociRows.map((r) => (r.id === updatedRow.id ? updatedRow : r)),
    }));
  };

  const handleResetPresets = () => {
    const original = WORKSPACE_PRESETS.find((w) => w.id === activeWorkspace.id);
    if (!original) return;
    updateActiveWorkspace(() => JSON.parse(JSON.stringify(original)));
    setPatchLogs((prev) => ({ ...prev, [activeWorkspace.id]: [] }));
  };

  const handleOpenExportModal = () => {
    setExportModalOpen(true);
  };

  const activeNavTitle =
    NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Overview Audit';

  const SidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="space-y-6">
        {/* Brand Wordmark */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-orange-600 text-white flex items-center justify-center shrink-0">
              <Radio className="w-3.5 h-3.5" />
            </span>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              TagAudit
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="px-3 space-y-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Workspace Scenario Switcher */}
        <div className="px-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <label
            htmlFor="workspace-select"
            className="block text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Audit Workspace
          </label>
          <select
            id="workspace-select"
            value={activeWorkspace.id}
            onChange={(e) => {
              setSelectedWorkspaceId(e.target.value);
              setMobileMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {activeWorkspace.stackSummary}
          </p>
        </div>
      </div>

      {/* Bottom Workspace Reset Action */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={handleResetPresets}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Workspace Data
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 h-full border-r border-slate-200 dark:border-slate-800 z-10">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumbs Left, Theme & Primary Action Right */}
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">Workspaces</span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                {activeWorkspace.domain}
              </span>
              <span className="text-slate-300 dark:text-slate-700">/</span>
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeNavTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span className="hidden sm:inline">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleOpenExportModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-orange-600 rounded-lg hover:bg-slate-800 dark:hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Audit Report
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1280px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewAudit
              workspace={activeWorkspace}
              gtmSummary={gtmSummary}
              taxonomy={activeWorkspace.taxonomy}
              isDark={theme === 'dark'}
              onNavigate={setActiveTab}
              onPatchGtm={handlePatchContainer}
            />
          )}

          {activeTab === 'gtm' && (
            <GtmAuditor
              container={activeWorkspace.gtmContainer}
              summary={gtmSummary}
              patchLog={patchLogs[activeWorkspace.id] || []}
              isDark={theme === 'dark'}
              onImportContainer={handleImportContainer}
              onPatchContainer={handlePatchContainer}
            />
          )}

          {activeTab === 'consent' && (
            <ConsentDebugger
              container={activeWorkspace.gtmContainer}
              onPatchConsent={handlePatchContainer}
            />
          )}

          {activeTab === 'simulator' && <EventSimulator />}

          {activeTab === 'taxonomy' && (
            <TaxonomyPlanner
              events={activeWorkspace.taxonomy}
              isDark={theme === 'dark'}
              onChangeEvents={handleUpdateTaxonomy}
            />
          )}

          {activeTab === 'discrepancy' && (
            <DiscrepancyModeler
              key={activeWorkspace.id}
              discrepancies={activeWorkspace.discrepancies}
              ociRows={activeWorkspace.ociRows}
              defaultTrafficSettings={activeWorkspace.defaultTrafficSettings}
              onAddOciRow={handleAddOciRow}
              onUpdateOciRow={handleUpdateOciRow}
            />
          )}
        </main>
      </div>

      <AuditExportModal
        open={exportModalOpen}
        workspace={activeWorkspace}
        gtmSummary={gtmSummary}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
}
