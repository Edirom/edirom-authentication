//import '../edirom-core-web-components/src/edirom-icon.js';

const KEYCLOAK_ADAPTER_SRC = 'https://cdn.jsdelivr.net/npm/keycloak-js@26.2.0/lib/keycloak.js';
const SILENT_CHECK_SSO_PATH = 'resources/js/edirom-authentication/silent-check-sso.html';

/**
 * Edirom authentication controls.
 * @class
 * @extends HTMLElement
 *
 * Events:
 * - `keycloak-login-request`: emitted when Keycloak sign-in is requested.
 * - `keycloak-login-failed`: emitted when Keycloak sign-in cannot start.
 * - `keycloak-logout-request` / `keycloak-logout-failed`: emitted for Keycloak sign-out.
 * - `keycloak-user-state-change`: emitted when the frontend Keycloak username changes.
 * - `keycloak-user-error`: emitted when an authenticated Keycloak username cannot be read.
 * - `keycloak-initialization-failed` / `keycloak-token-refresh-failed`: emitted for adapter errors.
 * - `login-popover-toggle` / `account-menu-toggle`: emitted when either menu opens or closes.
 */
class EdiromAuthentication extends HTMLElement {

  static get observedAttributes() {
    return [
      'keycloak-url',
      'keycloak-realm',
      'keycloak-client-id',
      'keycloak-silent-check-sso-uri'
    ];
  }

  /** Creates the authenticator and initializes its controls. */
  constructor() {
    super();

    this._keycloakUserName = null;
    this._keycloakRequestPending = false;
    this._keycloakLogoutPending = false;
    this._keycloak = null;
    this._keycloakInitialization = null;
    this._keycloakTokenRefresh = null;

    this.attachShadow({ mode: 'open' });
    this.render();
    this._cacheElements();
    this.addEventListeners();
    this._renderAccountState();
  }

  /** Initializes Keycloak without persisting its tokens in browser storage. */
  connectedCallback() {
    this._clearLegacyTokenCookie();
    if (this._hasKeycloakConfiguration()) {
      this._initializeKeycloak().catch((error) => {
        this._reportKeycloakError('keycloak-initialization-failed', error);
      });
    }
  }

  /** Updates Keycloak controls when their configuration changes. */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name.startsWith('keycloak-') && oldValue !== newValue) {
      this._renderKeycloakButton();
      this._renderAccountState();
      if (this.isConnected && this._hasKeycloakConfiguration()) {
        this._initializeKeycloak().catch((error) => {
          this._reportKeycloakError('keycloak-initialization-failed', error);
        });
      }
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

        #keycloak-error,
        #keycloak-logout-error {
          margin: 0;
          color: #a40000;
        }

        .keycloak-action-button {
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

        .keycloak-action-button:hover,
        .keycloak-action-button:focus-visible {
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
        <button id="keycloak-login-button" class="keycloak-action-button" type="button">
          <edirom-icon name="login" aria-hidden="true"></edirom-icon>
          <span>Sign in with Keycloak</span>
        </button>
      </div>

      <div id="account-popover" popover="manual">
        <p id="keycloak-account-name">Keycloak user: <span id="keycloak-user-name"></span></p>
        <p id="keycloak-logout-error" role="alert" hidden></p>
        <button id="keycloak-logout-button" class="keycloak-action-button" type="button">Sign out</button>
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
    this._keycloakLogoutButton = this.shadowRoot.querySelector('#keycloak-logout-button');
    this._keycloakAccountName = this.shadowRoot.querySelector('#keycloak-account-name');
    this._keycloakUserNameElement = this.shadowRoot.querySelector('#keycloak-user-name');
    this._keycloakError = this.shadowRoot.querySelector('#keycloak-error');
    this._keycloakLogoutError = this.shadowRoot.querySelector('#keycloak-logout-error');
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
    this._keycloakLogoutButton.addEventListener('click', () => this._handleKeycloakLogout());

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

  /** Starts Keycloak sign-in through the configured adapter. */
  async _handleKeycloakLogin() {
    if (this._keycloakRequestPending) return;
    this._setError(this._keycloakError, '');

    if (!this._hasKeycloakConfiguration()) {
      const message = 'Configure keycloak-url, keycloak-realm, and keycloak-client-id to enable Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
      return;
    }

    this._setKeycloakRequestPending(true);
    try {
      this._dispatchComponentEvent('keycloak-login-request', {
        realm: this.getAttribute('keycloak-realm'),
        clientId: this.getAttribute('keycloak-client-id')
      });
      const keycloak = await this._initializeKeycloak();
      if (keycloak.authenticated) {
        this._updateKeycloakUserName(keycloak);
        this._loginPopover.hidePopover();
        return;
      }
      await keycloak.login({ redirectUri: window.location.href });
    } catch (error) {
      const message = error.message || 'Could not start Keycloak sign-in.';
      this._setError(this._keycloakError, message);
      this._dispatchComponentEvent('keycloak-login-failed', { message });
    } finally {
      this._setKeycloakRequestPending(false);
    }
  }

  /** Ends the Keycloak session and returns to the current application page. */
  async _handleKeycloakLogout() {
    if (this._keycloakLogoutPending) return;
    this._setError(this._keycloakLogoutError, '');
    this._setKeycloakLogoutPending(true);

    try {
      const keycloak = await this._initializeKeycloak();
      this._dispatchComponentEvent('keycloak-logout-request', {
        realm: this.getAttribute('keycloak-realm'),
        clientId: this.getAttribute('keycloak-client-id')
      });
      await keycloak.logout({ redirectUri: window.location.href });
      this._setKeycloakUserName(null);
      this._accountPopover.hidePopover();
    } catch (error) {
      const message = error.message || 'Could not sign out of Keycloak.';
      this._setError(this._keycloakLogoutError, message);
      this._dispatchComponentEvent('keycloak-logout-failed', { message });
    } finally {
      this._setKeycloakLogoutPending(false);
    }
  }

  /** Returns a refreshed access token for use in API Authorization headers. */
  async getAccessToken() {
    const keycloak = await this._initializeKeycloak();
    if (!keycloak.authenticated) {
      throw new Error('Sign in to Keycloak before requesting an access token.');
    }

    let tokenRefresh;
    try {
      tokenRefresh = this._keycloakTokenRefresh || keycloak.updateToken(30);
      this._keycloakTokenRefresh = tokenRefresh;
      await tokenRefresh;
    } catch (error) {
      const message = error.message || 'Could not refresh the Keycloak access token.';
      this._dispatchComponentEvent('keycloak-token-refresh-failed', { message });
      throw error;
    } finally {
      if (this._keycloakTokenRefresh === tokenRefresh) {
        this._keycloakTokenRefresh = null;
      }
    }

    if (!keycloak.token) throw new Error('Keycloak did not provide an access token.');
    this._updateKeycloakUserName(keycloak);
    return keycloak.token;
  }

  /** Creates the in-memory Keycloak adapter and processes SSO or login callbacks. */
  async _initializeKeycloak() {
    if (this._keycloakInitialization) return this._keycloakInitialization;
    if (this._keycloak) return this._keycloak;
    if (!this._hasKeycloakConfiguration()) {
      throw new Error('Configure keycloak-url, keycloak-realm, and keycloak-client-id first.');
    }

    this._keycloakInitialization = this._createKeycloakAdapter();
    try {
      return await this._keycloakInitialization;
    } finally {
      this._keycloakInitialization = null;
    }
  }

  async _createKeycloakAdapter() {
    const sourceUrl = new URL(KEYCLOAK_ADAPTER_SRC, document.baseURI);
    if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
      throw new Error('The Keycloak adapter URL must use HTTP or HTTPS.');
    }
    const silentCheckSsoPath = this.getAttribute('keycloak-silent-check-sso-uri') || SILENT_CHECK_SSO_PATH;
    const silentCheckSsoUrl = new URL(silentCheckSsoPath, document.baseURI);
    if (silentCheckSsoUrl.origin !== window.location.origin) {
      throw new Error('The silent SSO callback URL must use the application origin.');
    }

    const adapterModule = await import(sourceUrl.href);
    if (typeof adapterModule.default !== 'function') {
      throw new Error('The configured Keycloak adapter has no default constructor export.');
    }

    const keycloak = new adapterModule.default({
      url: this.getAttribute('keycloak-url'),
      realm: this.getAttribute('keycloak-realm'),
      clientId: this.getAttribute('keycloak-client-id')
    });
    this._keycloak = keycloak;
    keycloak.onAuthSuccess = () => this._updateKeycloakUserName(keycloak);
    keycloak.onAuthRefreshSuccess = () => this._updateKeycloakUserName(keycloak);
    keycloak.onAuthLogout = () => this._setKeycloakUserName(null);

    try {
      await keycloak.init({
        onLoad: 'check-sso',
        checkLoginIframe: false,
        pkceMethod: 'S256',
        silentCheckSsoRedirectUri: silentCheckSsoUrl.href,
        silentCheckSsoFallback: false
      });
      this._updateKeycloakUserName(keycloak);
      return keycloak;
    } catch (error) {
      this._keycloak = null;
      throw error;
    }
  }

  _updateKeycloakUserName(keycloak) {
    if (!keycloak.authenticated) {
      this._setKeycloakUserName(null);
      return;
    }

    const userName = keycloak.tokenParsed?.preferred_username || keycloak.tokenParsed?.name;
    if (typeof userName === 'string' && userName.trim()) {
      this._setKeycloakUserName(userName);
      return;
    }

    this._setKeycloakUserName(null);
    const message = 'The Keycloak access token does not contain a username.';
    this._dispatchComponentEvent('keycloak-user-error', { message });
  }

  _clearLegacyTokenCookie() {
    document.cookie = 'keycloak_token=; Max-Age=0; Path=/; Secure; SameSite=Lax';
  }

  _reportKeycloakError(eventName, error) {
    const message = error.message || 'Keycloak authentication failed.';
    this._setError(this._keycloakError, message);
    this._dispatchComponentEvent(eventName, { message });
  }

  /** Updates the Keycloak username and account menu. */
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

  /** Updates the pending state of the Keycloak sign-out action. */
  _setKeycloakLogoutPending(isPending) {
    this._keycloakLogoutPending = isPending;
    this._keycloakLogoutButton.disabled = isPending;
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
