import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActivitySidebar } from './components/ActivitySidebar.js';
import { AddProjectModal } from './components/AddProjectModal.js';
import { AgentDetailModal } from './components/AgentDetailModal.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { DebugView } from './components/DebugView.js';
import { MobileActivitySheet } from './components/MobileActivitySheet.js';
import { MobileAgentDetail } from './components/MobileAgentDetail.js';
import { ZoomControls } from './components/ZoomControls.js';
import { useMobileDetect } from './hooks/useMobileDetect.js';
import { PULSE_ANIMATION_DURATION_SEC, TILE_SIZE, ZOOM_MAX, ZOOM_MIN } from './constants.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { SpeechBubble } from './office/components/SpeechBubble.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool } from './office/types.js';
import { wsClient } from './wsClient.js';

// Game state lives outside React -- updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

const actionBarBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
};

const actionBarBtnDisabled: React.CSSProperties = {
  ...actionBarBtnStyle,
  opacity: 'var(--pixel-btn-disabled-opacity)',
  cursor: 'default',
};

function EditActionBar({
  editor,
  editorState: es,
}: {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
}) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--pixel-controls-z)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'var(--pixel-bg)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '4px 8px',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <button
        style={undoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={undoDisabled ? undefined : editor.handleUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={redoDisabled ? actionBarBtnDisabled : actionBarBtnStyle}
        onClick={redoDisabled ? undefined : editor.handleRedo}
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button style={actionBarBtnStyle} onClick={editor.handleSave} title="Save layout">
        Save
      </button>
      {!showResetConfirm ? (
        <button
          style={actionBarBtnStyle}
          onClick={() => setShowResetConfirm(true)}
          title="Reset to last saved layout"
        >
          Reset
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '22px', color: 'var(--pixel-reset-text)' }}>Reset?</span>
          <button
            style={{ ...actionBarBtnStyle, background: 'var(--pixel-danger-bg)', color: '#fff' }}
            onClick={() => {
              setShowResetConfirm(false);
              editor.handleReset();
            }}
          >
            Yes
          </button>
          <button style={actionBarBtnStyle} onClick={() => setShowResetConfirm(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const { isConnected } = useWebSocket();
  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    monitoredProjects,
    activityLog,
    agentBubbles,
    showInactiveAgents,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const handleOpenAddProject = useCallback(() => setIsAddProjectOpen(true), []);
  const handleCloseAddProject = useCallback(() => setIsAddProjectOpen(false), []);

  // Memoize projects for modal
  const projectsForModal = useMemo(
    () =>
      monitoredProjects.map((p) => ({
        id: p.id,
        path: p.path,
        name: p.name,
        source: p.source,
      })),
    [monitoredProjects],
  );

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [detailAgentId, setDetailAgentId] = useState<number | null>(null);
  const [showInactiveAgentsLocal, setShowInactiveAgentsLocal] = useState(true);

  const { isMobile } = useMobileDetect();
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
  const [mobileAgentId, setMobileAgentId] = useState<number | null>(null);

  const isSheetOpen = mobileActivityOpen || mobileAgentId !== null;

  const handleMobileActivityOpen = useCallback(() => {
    setMobileAgentId(null);
    setMobileActivityOpen(true);
  }, []);

  const handleMobileAgentTap = useCallback((agentId: number) => {
    setMobileActivityOpen(false);
    setMobileAgentId(agentId);
  }, []);

  // Sync showInactiveAgents from server config
  useEffect(() => {
    setShowInactiveAgentsLocal(showInactiveAgents);
  }, [showInactiveAgents]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleActivity = useCallback(() => setIsActivityOpen((prev) => !prev), []);
  const handleToggleShowInactiveAgents = useCallback(() => {
    setShowInactiveAgentsLocal(prev => {
      const next = !prev;
      wsClient.send({ type: 'setShowInactiveAgents', enabled: next });
      return next;
    });
  }, []);

  // Build agent name map from officeState characters
  const agentNames = useMemo(() => {
    const os = getOfficeState();
    const names: Record<number, string> = {};
    for (const ch of os.characters.values()) {
      if (ch.isSubagent) continue;
      names[ch.id] = ch.folderName || `Agent #${ch.id}`;
    }
    return names;
  }, [agents]); // eslint-disable-line -- re-derive when agents list changes

  const handleSelectAgent = useCallback((id: number) => {
    wsClient.send({ type: 'focusAgent', id });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    wsClient.send({ type: 'closeAgent', id });
  }, []);

  const handleCloseDetail = useCallback(() => setDetailAgentId(null), []);

  const handleCenterView = useCallback(() => {
    const os = getOfficeState();
    os.cameraFollowId = null;
    os.selectedAgentId = null;
    // Fit map width to viewport so it fills left-to-right
    const layout = os.getLayout();
    const canvas = document.querySelector('canvas');
    if (canvas && layout.cols > 0 && layout.rows > 0) {
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.clientWidth * dpr;
      const canvasH = canvas.clientHeight * dpr;
      let fitZoom = Math.round(canvasW / (layout.cols * TILE_SIZE));
      if (isMobile) fitZoom = Math.min(fitZoom, 4);
      const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
      editor.handleZoomChange(clampedZoom);
      // Center vertically: offset so map is centered in viewport
      const mapHeight = layout.rows * TILE_SIZE * clampedZoom;
      const panY = (canvasH - mapHeight) / 2;
      editor.panRef.current = { x: 0, y: panY };
    } else {
      editor.panRef.current = { x: 0, y: 0 };
    }
  }, [editor]);

  // Center view on initial layout load
  useEffect(() => {
    if (layoutReady) {
      // Small delay to ensure canvas is rendered
      const timer = setTimeout(handleCenterView, 100);
      return () => clearTimeout(timer);
    }
  }, [layoutReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    wsClient.send({ type: 'focusAgent', id: focusId });
    // Open agent detail modal
    setDetailAgentId((prev) => (prev === focusId ? null : focusId));
  }, []);

  const officeState = getOfficeState();

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard;

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--pixel-text)',
          gap: 8,
        }}
      >
        <span>Loading...</span>
        {!isConnected && (
          <span style={{ fontSize: '18px', color: 'var(--pixel-text-dim)' }}>
            Connecting to server...
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .pixel-agents-pulse { animation: pixel-agents-pulse ${PULSE_ANIMATION_DURATION_SEC}s ease-in-out infinite; }
        .pixel-agents-migration-btn:hover { filter: brightness(0.8); }
      `}</style>

      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        isMobile={isMobile}
        isSheetOpen={isSheetOpen}
        onAgentTap={isMobile ? handleMobileAgentTap : undefined}
      />

      {!isDebugMode && <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} onCenter={handleCenterView} isMobile={isMobile} />}

      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--pixel-vignette)',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      />

      <div className="desktop-only">
        <BottomToolbar
          isEditMode={editor.isEditMode}
          onAddProject={handleOpenAddProject}
          onToggleEditMode={editor.handleToggleEditMode}
          isDebugMode={isDebugMode}
          onToggleDebugMode={handleToggleDebugMode}
          isActivityOpen={isActivityOpen}
          onToggleActivity={handleToggleActivity}
          showInactiveAgents={showInactiveAgentsLocal}
          onToggleShowInactiveAgents={handleToggleShowInactiveAgents}
        />
      </div>

      <AddProjectModal
        isOpen={isAddProjectOpen}
        onClose={handleCloseAddProject}
        projects={projectsForModal}
      />

      <div className="desktop-only">
        {editor.isEditMode && editor.isDirty && (
          <EditActionBar editor={editor} editorState={editorState} />
        )}
      </div>

      {showRotateHint && (
        <div
          style={{
            position: 'absolute',
            top: editor.isDirty ? 52 : 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 49,
            background: 'var(--pixel-hint-bg)',
            color: '#fff',
            fontSize: '20px',
            padding: '3px 8px',
            borderRadius: 0,
            border: '2px solid var(--pixel-accent)',
            boxShadow: 'var(--pixel-shadow)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Rotate (R)
        </div>
      )}

      <div className="desktop-only">
        {editor.isEditMode &&
          (() => {
            // Compute selected furniture color from current layout
            const selUid = editorState.selectedFurnitureUid;
            const selColor = selUid
              ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
              : null;
            return (
              <EditorToolbar
                activeTool={editorState.activeTool}
                selectedTileType={editorState.selectedTileType}
                selectedFurnitureType={editorState.selectedFurnitureType}
                selectedFurnitureUid={selUid}
                selectedFurnitureColor={selColor}
                floorColor={editorState.floorColor}
                wallColor={editorState.wallColor}
                selectedWallSet={editorState.selectedWallSet}
                onToolChange={editor.handleToolChange}
                onTileTypeChange={editor.handleTileTypeChange}
                onFloorColorChange={editor.handleFloorColorChange}
                onWallColorChange={editor.handleWallColorChange}
                onWallSetChange={editor.handleWallSetChange}
                onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                loadedAssets={loadedAssets}
              />
            );
          })()}
      </div>

      {!isDebugMode && (
        <SpeechBubble
          officeState={officeState}
          agentBubbles={agentBubbles}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
        />
      )}

      {!isDebugMode && (
        <ToolOverlay
          officeState={officeState}
          agents={agents}
          agentTools={agentTools}
          subagentCharacters={subagentCharacters}
          containerRef={containerRef}
          zoom={editor.zoom}
          panRef={editor.panRef}
          onCloseAgent={handleCloseAgent}
        />
      )}

      {isDebugMode && (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}

      <div className="desktop-only">
        {isActivityOpen && !isDebugMode && (
          <ActivitySidebar
            activityLog={activityLog}
            agents={agents}
            agentNames={agentNames}
          />
        )}
      </div>

      {!isMobile && detailAgentId !== null && !isDebugMode && !editor.isEditMode && (
        <AgentDetailModal
          agentId={detailAgentId}
          officeState={officeState}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          activityLog={activityLog}
          monitoredProjects={monitoredProjects}
          onClose={handleCloseDetail}
          onCloseAgent={handleCloseAgent}
        />
      )}

      {/* Mobile components */}
      {isMobile && (
        <>
          {/* Activity sheet handle (always visible as collapsed bar) */}
          <div
            onClick={handleMobileActivityOpen}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'var(--pixel-bg, #1e1e2e)',
              borderTop: '2px solid var(--pixel-accent, #5a8cff)',
              padding: '6px',
              textAlign: 'center',
              zIndex: 55,
              cursor: 'pointer',
              paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 36, height: 3, background: '#555', borderRadius: 2, margin: '0 auto 4px' }} />
            <div style={{ fontSize: 10, color: 'var(--pixel-accent, #5a8cff)' }}>
              Activity Log — {activityLog.length} entries ↑
            </div>
          </div>

          <MobileActivitySheet
            activities={activityLog}
            isOpen={mobileActivityOpen}
            onClose={() => setMobileActivityOpen(false)}
            agentCount={officeState.characters.size}
          />

          <MobileAgentDetail
            agentId={mobileAgentId}
            officeState={officeState}
            agentTools={agentTools}
            agentStatuses={agentStatuses}
            monitoredProjects={monitoredProjects}
            onClose={() => setMobileAgentId(null)}
          />
        </>
      )}

      {showMigrationNotice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setMigrationNoticeDismissed(true)}
        >
          <div
            style={{
              background: 'var(--pixel-bg)',
              border: '2px solid var(--pixel-border)',
              borderRadius: 0,
              padding: '24px 32px',
              maxWidth: 620,
              boxShadow: 'var(--pixel-shadow)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '40px', marginBottom: 12, color: 'var(--pixel-accent)' }}>
              We owe you an apology!
            </div>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We've just migrated to fully open-source assets, all built from scratch with love.
              Unfortunately, this means your previous layout had to be reset.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              We're really sorry about that.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text)', margin: '0 0 12px 0' }}>
              The good news? This was a one-time thing, and it paves the way for some genuinely
              exciting updates ahead.
            </p>
            <p style={{ fontSize: '26px', color: 'var(--pixel-text-dim)', margin: '0 0 20px 0' }}>
              Stay tuned, and thanks for using Pixel Agents!
            </p>
            <button
              className="pixel-agents-migration-btn"
              style={{
                padding: '6px 24px 8px',
                fontSize: '30px',
                background: 'var(--pixel-accent)',
                color: '#fff',
                border: '2px solid var(--pixel-accent)',
                borderRadius: 0,
                cursor: 'pointer',
                boxShadow: 'var(--pixel-shadow)',
              }}
              onClick={() => setMigrationNoticeDismissed(true)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
