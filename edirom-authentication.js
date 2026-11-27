//import '../edirom-core-web-components/src/edirom-icon.js';

/**
 * Edirom authentication controls.
 * @class
 * @extends HTMLElement
 *
 * Events:
 * - `keycloak-login-request`: emitted when Keycloak sign-in is requested.
 * - `keycloak-login-failed`: emitted when the Keycloak handler cannot start or sign-in is cancelled.
 * - `keycloak-user-state-change`: emitted when the frontend Keycloak username changes.
 * - `keycloak-user-error`: emitted when an authenticated Keycloak username cannot be read.
 * - `login-popover-toggle` / `account-menu-toggle`: emitted when either menu opens or closes.
 */
class EdiromAuthentication extends HTMLElement {

  static get observedAttributes() {
    return ['keycloak-url', 'keycloak-realm', 'keycloak-client-id', 'keycloak-handler-src'];
  }

  /** Creates the authenticator and initializes its controls. */
  constructor() {
    super();

    this._keycloakUserName = null;
    this._keycloakRequestPending = false;
    this._keycloakHandlerElement = null;

    this.attachShadow({ mode: 'open' });
    this.render();
    this._cacheElements();
    this.addEventListeners();
    this._renderAccountState();
  }

  /** Restores the display-only Keycloak identity and any pending redirect callback. */
  connectedCallback() {
    this._loadKeycloakUserNameFromCookie();
    this._restoreKeycloakCallback();
  }

  /** Updates Keycloak controls when their configuration changes. */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name.startsWith('keycloak-') && oldValue !== newValue) {
      this._renderKeycloakButton();
      this._renderAccountState();
      if (this.isConnected && this._hasKeycloakConfiguration()) this._restoreKeycloakCallback();
    }
  }

  /** Renders the authenticator markup and styles into its shadow root. */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          font-family: inherit;
        }

        edirom-icon[role="button"] {
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2.5rem;
          min-height: 2.5rem;
          padding: 0.5rem;
          border-radius: 50%;
          cursor: pointer;
        }

        [hidden] { display: none !important; }

        [popover] {
          position: fixed;
          inset: auto;
          margin: 0;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 0.25rem;
          box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 15%);
          background: Canvas;
          color: CanvasText;
        }

        #login-popover {
          box-sizing: border-box;
          width: min(20rem, calc(100vw - 2rem));
        }

        #account-popover {
          min-width: 10rem;
          padding: 0.5rem;
        }

        #login-popover h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
        #keycloak-account-name {
          margin: 0 0.5rem 0.5rem;
          color: #222;
          font-weight: 600;
        }

        #keycloak-error {
          margin: 0;
          color: #a40000;
        }

        #keycloak-login-button {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          width: 100%;
          min-height: 2.5rem;
          padding: 0.5rem;
          border: 1px solid #555;
          border-radius: 0.25rem;
          gap: 0.5rem;
          background: #fff;
          color: #222;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }

        #keycloak-login-button:hover,
        #keycloak-login-button:focus-visible {
          background: #e6e6e6;
        }

        #keycloak-login-button edirom-icon {
          width: 1.5rem;
          height: 1.5rem;
        }
      </style>

      <edirom-icon id="login-button" name="login" role="button" tabindex="0"
        title="Sign in with Keycloak" aria-label="Sign in with Keycloak" aria-haspopup="true" aria-expanded="false"
        aria-controls="login-popover"></edirom-icon>
      <edirom-icon id="account-button" name="account_circle" role="button" tabindex="0"
        title="Account" aria-label="Account menu" aria-haspopup="true" aria-expanded="false"
        aria-controls="account-popover" hidden></edirom-icon>

      <div id="login-popover" popover="manual">
        <h1>Sign in</h1>
        <p id="keycloak-error" role="alert" hidden></p>
        <button id="keycloak-login-button" type="button" hidden>
          <edirom-icon name="login" aria-hidden="true"></edirom-icon>
          <span>Sign in with Keycloak</span>
        </button>
      </div>

      <div id="account-popover" popover="manual">
        <p id="keycloak-account-name">Keycloak user: <span id="keycloak-user-name"></span></p>
      </div>
    `;
  }

  /** Caches references to the rendered controls. */
  _cacheElements() {
    this._loginButton = this.shadowRoot.querySelector('#login-button');
    this._accountButton = this.shadowRoot.querySelector('#account-button');
    this._loginPopover = this.shadowRoot.querySelector('#login-popover');
    this._accountPopover = this.shadowRoot.querySelector('#account-popover');
    this._keycloakLoginButton = this.shadowRoot.querySelector('#keycloak-login-button');
    this._keycloakAccountName = this.shadowRoot.querySelector('#keycloak-account-name');
    this._keycloakUserNameElement = this.shadowRoot.querySelector('#keycloak-user-name');
    this._keycloakError = this.shadowRoot.querySelector('#keycloak-error');
  }

  /** Adds event listeners to the controls and popovers. */
  addEventListeners() {
    this._loginButton.addEventListener('click', () => {
      this._togglePopover(this._loginPopover, this._loginButton);
    });
    this._accountButton.addEventListener('click', () => {
      this._togglePopover(this._accountPopover, this._accountButton);
    });

    this._keycloakLoginButton.addEventListener('click', () => this._handleKeycloakLogin());

    this._loginPopover.addEventListener('toggle', () => {
      this._dispatchComponentEvent('login-popover-toggle', {
        open: this._loginPopover.matches(':popover-open')
      });
      this._syncExpandedState();
    });
    this._accountPopover.addEventListener('toggle', () => {
      this._dispatchComponentEvent('account-menu-toggle', {
        open: this._accountPopover.matches(':popover-open')
      });
      this._syncExpandedState();
    });
  }

  /** Opens or closes a popover and keeps the two menus mutually exclusive. */
  _togglePopover(popover, anchor) {
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
      return;
    }

    const otherPopover = popover === this._loginPopover ? this._accountPopover : this._loginPopover;
    if (otherPopover.matches(':popover-open')) otherPopover.hidePopover();
    popover.showPopover();
    this._placePopover(popover, anchor);
  }

  /** Positions a popover beneath its trigger button. */
  _placePopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth;
    const left = Math.max(8, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 8));
    popover.style.left = `${left}px`;
    popover.style.top = `${rect.bottom + 8}px`;
  }

  /** Keeps trigger expanded states synchronized with popover visibility. */
  _syncExpandedState() {
    this._loginButton.setAttribute('aria-expanded', String(this._loginPopover.matches(':popover-open')));
    this._accountButton.setAttribute('aria-expanded', String(this._accountPopover.matches(':popover-open')));
  }

  /** Emits a bubbling event that can be handled by the hosting application. */
  _dispatchComponentEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail: { element: this.tagName.toLowerCase(), ...detail },
      bubbles: true,
      composed: true
    }));
  }

  /** Starts Keycloak sign-in through the configured Edirom Keycloak handler. */
  async _handleKeycloakLogin() {
    if (this._keycloakRequestPending || this._keycloakHandlerElement) return;
    this._setError(this._keycloakError, '');

    if (!this._hasKeycloakConfiguration()) {
      const message = 'Configure keycloak-url, keycloak-realm, and keycloak-client-id to enable Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
      return;
    }

    this._setKeycloakRequestPending(true);
    try {
      sessionStorage.setItem(this._keycloakPendingStorageKey(), 'true');
      this._dispatchComponentEvent('keycloak-login-request', {
        realm: this.getAttribute('keycloak-realm'),
        clientId: this.getAttribute('keycloak-client-id')
      });
      await this._mountKeycloakHandler();
      await this._waitForKeycloakUserName();
    } catch (error) {
      const message = error.message || 'Could not start Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
    } finally {
      this._setKeycloakRequestPending(false);
    }
  }

  /** Resumes the Keycloak adapter after the browser returns from its login redirect. */
  async _restoreKeycloakCallback() {
    if (!this._hasKeycloakConfiguration()) return;

    const storageKey = this._keycloakPendingStorageKey();
    let pending;
    try {
      pending = sessionStorage.getItem(storageKey);
      if (pending) sessionStorage.removeItem(storageKey);
    } catch (error) {
      const message = error.message || 'Could not resume Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
      return;
    }
    if (!pending) return;

    const callback = new URLSearchParams(window.location.search);
    if (callback.has('error')) {
      const message = 'Keycloak sign-in was not completed.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
      return;
    }
    if (!callback.has('code') || !callback.has('state')) return;

    try {
      await this._mountKeycloakHandler();
      await this._waitForKeycloakUserName();
    } catch (error) {
      const message = error.message || 'Could not resume Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
    }
  }

  /** Loads and mounts the reusable handler, which processes the OIDC redirect callback. */
  async _mountKeycloakHandler() {
    if (this._keycloakHandlerElement) return this._keycloakHandlerElement;

    if (!customElements.get('keycloak-handler')) {
      const source = this.getAttribute('keycloak-handler-src');
      if (!source) {
        throw new Error('Load @edirom/keycloak-handler or set keycloak-handler-src before using Keycloak sign-in.');
      }
      const sourceUrl = new URL(source, document.baseURI);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
        throw new Error('keycloak-handler-src must use HTTP or HTTPS.');
      }
      await import(sourceUrl.href);
    }

    if (!customElements.get('keycloak-handler')) {
      throw new Error('The configured Keycloak handler did not register the keycloak-handler element.');
    }

    const handler = document.createElement('keycloak-handler');
    handler.setAttribute('url', this.getAttribute('keycloak-url'));
    handler.setAttribute('realm', this.getAttribute('keycloak-realm'));
    handler.setAttribute('client-id', this.getAttribute('keycloak-client-id'));
    handler.hidden = true;
    this.shadowRoot.append(handler);
    this._keycloakHandlerElement = handler;
    return handler;
  }

  /** Waits for the handler to expose its authenticated Keycloak identity. */
  async _waitForKeycloakUserName() {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const keycloak = this._keycloakHandlerElement?.keycloak;
      if (keycloak?.authenticated) {
        const userName = keycloak.tokenParsed?.preferred_username || keycloak.tokenParsed?.name;
        if (typeof userName === 'string' && userName.trim()) {
          this._setKeycloakUserName(userName);
          return;
        }

        const message = 'The Keycloak token does not contain a username.';
        this._dispatchComponentEvent('keycloak-user-error', { message });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const message = 'Keycloak did not provide an authenticated username for display.';
    this._dispatchComponentEvent('keycloak-user-error', { message });
  }

  /** Reads the Keycloak handler's token cookie for display-only identity information. */
  _loadKeycloakUserNameFromCookie() {
    const token = this._readCookie('keycloak_token');
    if (!token) {
      this._setKeycloakUserName(null);
      return;
    }

    try {
      const payload = this._decodeJwtPayload(token);
      if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
        this._setKeycloakUserName(null);
        return;
      }

      const userName = payload.preferred_username || payload.name;
      if (typeof userName !== 'string' || !userName.trim()) {
        throw new Error('The Keycloak token does not contain a username.');
      }
      this._setKeycloakUserName(userName);
    } catch (error) {
      this._setKeycloakUserName(null);
      this._dispatchComponentEvent('keycloak-user-error', {
        message: error.message || 'Could not read the Keycloak username.'
      });
    }
  }

  /** Returns a cookie value without treating token contents as trusted identity claims. */
  _readCookie(name) {
    const prefix = `${name}=`;
    const cookie = document.cookie.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return cookie ? cookie.slice(prefix.length) : null;
  }

  /** Decodes a JWT payload for display only; it does not validate the token signature. */
  _decodeJwtPayload(token) {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) throw new Error('The Keycloak token is malformed.');

    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(paddedBase64), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /** Updates the display-only Keycloak username and the account menu. */
  _setKeycloakUserName(userName) {
    const nextUserName = userName || null;
    if (this._keycloakUserName === nextUserName) return;

    this._keycloakUserName = nextUserName;
    this._renderAccountState();
    this._dispatchComponentEvent('keycloak-user-state-change', { userName: nextUserName });
  }

  /** Reports whether the minimum Keycloak connection settings are present. */
  _hasKeycloakConfiguration() {
    return ['keycloak-url', 'keycloak-realm', 'keycloak-client-id']
      .every((name) => Boolean(this.getAttribute(name)?.trim()));
  }

  /** Names the session marker used to resume a redirect for this realm and client. */
  _keycloakPendingStorageKey() {
    return [
      'edirom-authentication',
      'keycloak-pending',
      this.getAttribute('keycloak-url'),
      this.getAttribute('keycloak-realm'),
      this.getAttribute('keycloak-client-id')
    ].join(':');
  }

  /** Keeps the Keycloak button and its disabled state in sync. */
  _renderKeycloakButton() {
    if (!this._keycloakLoginButton) return;
    this._keycloakLoginButton.disabled = this._keycloakRequestPending;
  }

  /** Updates the pending state of the Keycloak action. */
  _setKeycloakRequestPending(isPending) {
    this._keycloakRequestPending = isPending;
    this._renderKeycloakButton();
  }

  /** Shows or clears an accessible message in the relevant menu. */
  _setError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  /** Shows the sign-in trigger or Keycloak account menu as appropriate. */
  _renderAccountState() {
    const hasKeycloakUser = Boolean(this._keycloakUserName);
    this._loginButton.hidden = hasKeycloakUser;
    this._accountButton.hidden = !hasKeycloakUser;
    this._keycloakAccountName.hidden = !hasKeycloakUser;
    this._keycloakUserNameElement.textContent = this._keycloakUserName || '';
    this._renderKeycloakButton();

    if (hasKeycloakUser) {
      this._accountButton.setAttribute('title', this._keycloakUserName);
      this._accountButton.setAttribute('aria-label', `Keycloak account for ${this._keycloakUserName}`);
    } else {
      this._loginButton.setAttribute('title', 'Sign in with Keycloak');
      this._loginButton.setAttribute('aria-label', 'Sign in with Keycloak');
    }
  }
}

if (!customElements.get('edirom-authentication')) {
  customElements.define('edirom-authentication', EdiromAuthentication);
}
