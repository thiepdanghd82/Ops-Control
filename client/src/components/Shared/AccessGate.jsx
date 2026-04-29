/**
 * AccessGate — wraps a tab's content with permission enforcement.
 *
 *   <AccessGate tabId="standard">
 *     <StandardCalc />
 *   </AccessGate>
 *
 * Behaviour:
 *   - hidden → renders a "Access denied" placeholder with the user's
 *     current group + contact admin hint. Useful even if Sidebar
 *     already filters the tab, because deep-links / programmatic
 *     navigation can still land here.
 *   - read   → wraps children in a <fieldset disabled> so every
 *     descendant <input>, <select>, <textarea>, <button type="submit">
 *     auto-disables. Shows a banner at the top so operators know WHY
 *     nothing responds.
 *   - edit   → passes children through unchanged.
 */
import { useAccess } from '../../context/useAccess';
import './AccessGate.css';

export default function AccessGate({ tabId, children, label }) {
  const { access, activeGroup } = useAccess();
  const mode = access(tabId);

  if (mode === 'hidden') {
    return (
      <div className="ag-forbidden" role="alert">
        <div className="ag-forbidden-card">
          <div className="ag-forbidden-icon">⊘</div>
          <h3>Access Denied</h3>
          <p>
            Your permission group does not allow viewing this tab
            <b>{label ? ` (${label})` : ''}</b>.
          </p>
          {activeGroup && (
            <p className="ag-forbidden-meta">
              Group: <code>{activeGroup.id}</code> — {activeGroup.name}
            </p>
          )}
          <p className="ag-forbidden-hint">
            Contact an administrator if you believe this is incorrect.
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'read') {
    return (
      <div className="ag-readonly">
        <div className="ag-readonly-banner" role="status">
          <span className="ag-ro-icon">👁</span>
          <span>
            <b>Read-only.</b> Your permission group grants view access to this tab only.
            {activeGroup && <> Group: <code>{activeGroup.id}</code>.</>}
          </span>
        </div>
        <fieldset className="ag-readonly-fieldset" disabled>
          {children}
        </fieldset>
      </div>
    );
  }

  // edit
  return children;
}
