//import '../edirom-core-web-components/src/edirom-icon.js';

/**
 * Edirom authentication controls.
 * @class
 * @extends HTMLElement
 *
 * Events:
 * - `login-request`: emitted with the submitted username, password and remember choice.
 * - `logout-request`: emitted when logout is requested.
 * - `login-state-change`: emitted when the authenticated state changes.
 * - `login-popover-toggle` / `account-menu-toggle`: emitted when either menu opens or closes.
 */
class EdiromAuthentication extends HTMLElement {

  static get observedAttributes() {
    return ['backend-url'];
  }

  /** Creates the authenticator and initializes its controls. */
  constructor() {
    super();

    this._isLoggedIn = false;
    this._userName = 'Username not set';
    this._authRequestPending = false;
    this._authenticationStatusRequested = false;
    this._authenticationRequestQueue = Promise.resolve();

    this.attachShadow({ mode: 'open' });
    this.render();
    this._cacheElements();
    this.addEventListeners();
    this._renderAccountState();
  }

  /** Loads the current eXist-db session after this element receives its endpoint. */
  connectedCallback() {
    this._loadAuthenticationState();
  }

  /** Loads the current session when the hosting application supplies its backend URL. */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'backend-url' && oldValue !== newValue) {
      this._authenticationStatusRequested = false;
      this._loadAuthenticationState();
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

        #login-form, #input-container { display: flex; flex-direction: column; }
        #login-form { gap: 0.75rem; }
        #input-container { gap: 0.5rem; }
        #input-container > div { display: flex; flex-direction: column; gap: 0.25rem; }
        #input-container input { box-sizing: border-box; width: 100%; }
        #login-form h1 { margin: 0; font-size: 1.25rem; }
        #remember-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          cursor: pointer;
        }

        #remember-me { cursor: pointer; }

        #account-name {
          margin: 0 0.5rem 0.5rem;
          color: #222;
          font-weight: 600;
        }

        #login-error, #account-error {
          margin: 0;
          color: #a40000;
        }

        #login-submit, #logout-button {
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

        #login-submit:hover, #logout-button:hover,
        #login-submit:focus-visible, #logout-button:focus-visible {
          background: #e6e6e6;
        }

        #login-submit edirom-icon, #logout-button edirom-icon {
          width: 1.5rem;
          height: 1.5rem;
        }
      </style>

      <edirom-icon id="login-button" name="login" role="button" tabindex="0"
        title="Login" aria-label="Login" aria-haspopup="true" aria-expanded="false"
        aria-controls="login-popover"></edirom-icon>
      <edirom-icon id="account-button" name="account_circle" role="button" tabindex="0"
        title="Account" aria-label="Account menu" aria-haspopup="true" aria-expanded="false"
        aria-controls="account-popover" hidden></edirom-icon>

      <div id="login-popover" popover="manual">
        <form id="login-form" novalidate>
          <h1>Sign in</h1>
          <p id="login-error" role="alert" hidden></p>
          <div id="input-container">
            <div>
              <label for="username">Username</label>
              <input id="username" type="text" name="username" autocomplete="username" placeholder="Enter username" required>
            </div>
            <div>
              <label for="password">Password</label>
              <input id="password" type="password" name="password" autocomplete="current-password" placeholder="Enter password" required>
            </div>
          </div>
          <label id="remember-label" for="remember-me">
            <input id="remember-me" type="checkbox" name="remember">
            Remember me
          </label>
          <button id="login-submit" type="submit">
            <edirom-icon name="login" aria-hidden="true"></edirom-icon>
            <span>Login</span>
          </button>
        </form>
      </div>

      <div id="account-popover" popover="manual">
        <p id="account-name"></p>
        <p id="account-error" role="alert" hidden></p>
        <button id="logout-button" type="button">
          <edirom-icon name="logout" aria-hidden="true"></edirom-icon>
          <span>Logout</span>
        </button>
      </div>
    `;
  }

  /** Caches references to the rendered controls. */
  _cacheElements() {
    this._loginButton = this.shadowRoot.querySelector('#login-button');
    this._accountButton = this.shadowRoot.querySelector('#account-button');
    this._loginPopover = this.shadowRoot.querySelector('#login-popover');
    this._accountPopover = this.shadowRoot.querySelector('#account-popover');
    this._loginForm = this.shadowRoot.querySelector('#login-form');
    this._rememberLabel = this.shadowRoot.querySelector('#remember-label');
    this._loginSubmit = this.shadowRoot.querySelector('#login-submit');
    this._logoutButton = this.shadowRoot.querySelector('#logout-button');
    this._accountName = this.shadowRoot.querySelector('#account-name');
    this._loginError = this.shadowRoot.querySelector('#login-error');
    this._accountError = this.shadowRoot.querySelector('#account-error');
  }

  /** Adds event listeners to the buttons, form and popovers. */
  addEventListeners() {
    this._loginButton.addEventListener('click', () => {
      this._togglePopover(this._loginPopover, this._loginButton);
    });
    this._accountButton.addEventListener('click', () => {
      this._togglePopover(this._accountPopover, this._accountButton);
    });

    this._loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this._handleLogin();
    });
    // The authenticator is hosted inside an Ext button; keep its click handler
    // from cancelling the checkbox's native label activation.
    this._rememberLabel.addEventListener('click', (event) => event.stopPropagation());
    this._loginSubmit.addEventListener('click', (event) => {
      event.preventDefault();
      this._handleLogin();
    });
    this._logoutButton.addEventListener('click', () => this._handleLogout());

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

  /** Sends credentials to eXist-db and updates the UI after authentication succeeds. */
  async _handleLogin() {
    if (this._authRequestPending) return;

    const formData = new FormData(this._loginForm);
    this._dispatchComponentEvent('login-request', {
      username: formData.get('username'),
      password: formData.get('password'),
      remember: formData.get('remember') === 'on'
    });

    this._setError(this._loginError, '');
    this._setAuthRequestPending(true);
    try {
      const response = await this._requestAuthentication({
        action: 'login',
        user: formData.get('username'),
        password: formData.get('password'),
        ...(formData.get('remember') === 'on' ? { remember: 'true' } : {})
      });

      if (!response.authenticated) {
        throw new Error(response.message || 'The username or password was not accepted.');
      }

      this._setLoggedIn(true, response.userName);
      this._loginForm.reset();
      this._loginPopover.hidePopover();
      this._dispatchComponentEvent('login-success', { userName: response.userName });
    } catch (error) {
      this._setError(this._loginError, error.message || 'Login failed.');
      this._dispatchComponentEvent('login-failed', { message: error.message || 'Login failed.' });
    } finally {
      this.shadowRoot.querySelector('#password').value = '';
      this._setAuthRequestPending(false);
    }
  }

  /** Requests that eXist-db end the current session before updating the UI. */
  async _handleLogout() {
    if (this._authRequestPending) return;
    this._dispatchComponentEvent('logout-request', { userName: this._userName });

    this._setError(this._accountError, '');
    this._setAuthRequestPending(true);
    try {
      const response = await this._requestAuthentication({ action: 'logout' });
      if (!response.loggedOut) throw new Error(response.message || 'Logout failed.');

      this._setLoggedIn(false);
      this._accountPopover.hidePopover();
      this._dispatchComponentEvent('logout-success');
    } catch (error) {
      this._setError(this._accountError, error.message || 'Logout failed.');
      this._dispatchComponentEvent('logout-failed', { message: error.message || 'Logout failed.' });
    } finally {
      this._setAuthRequestPending(false);
    }
  }

  /** Sends a form-encoded request to the authentication endpoint on the configured backend. */
  _requestAuthentication(parameters) {
    const queuedRequest = this._authenticationRequestQueue.then(() => this._sendAuthenticationRequest(parameters));
    this._authenticationRequestQueue = queuedRequest.catch(() => undefined);
    return queuedRequest;
  }

  /** Sends one request at a time because eXist persistent-login tokens rotate per request. */
  async _sendAuthenticationRequest(parameters) {
    const backendUrl = this.getAttribute('backend-url');
    const endpoint = backendUrl && `${backendUrl.replace(/\/$/, '')}/api/authentication`;
    if (!endpoint) throw new Error('The authentication endpoint has not been configured.');

    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(parameters)
    });

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error('The authentication endpoint returned an unreadable response.');
    }

    if (!response.ok && response.status !== 401) {
      throw new Error(result.message || `Authentication request failed (${response.status}).`);
    }
    return result;
  }

  /** Reads the existing eXist-db session so the icon reflects the server state. */
  async _loadAuthenticationState() {
    if (this._authenticationStatusRequested || !this.isConnected || !this.getAttribute('backend-url')) return;
    this._authenticationStatusRequested = true;
    try {
      const response = await this._requestAuthentication({ action: 'status' });
      this._setLoggedIn(response.authenticated, response.userName || this._userName);
    } catch (error) {
      this._dispatchComponentEvent('authentication-status-error', {
        message: error.message || 'Could not read the authentication status.'
      });
    }
  }

  /** Updates the pending state of both account actions. */
  _setAuthRequestPending(isPending) {
    this._authRequestPending = isPending;
    this._loginSubmit.disabled = isPending;
    this._logoutButton.disabled = isPending;
  }

  /** Shows or clears an accessible message in the relevant menu. */
  _setError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  /** Sets the current authentication state and updates the visible trigger. */
  _setLoggedIn(isLoggedIn, userName = this._userName) {
    const previousState = this._isLoggedIn;
    this._isLoggedIn = Boolean(isLoggedIn);
    this._userName = userName;
    this._renderAccountState();

    if (previousState !== this._isLoggedIn) {
      this._dispatchComponentEvent('login-state-change', {
        isLoggedIn: this._isLoggedIn,
        userName: this._isLoggedIn ? this._userName : null
      });
    }
  }

  /** Updates the login and account triggers to match the current state. */
  _renderAccountState() {
    this._loginButton.hidden = this._isLoggedIn;
    this._accountButton.hidden = !this._isLoggedIn;
    this._accountName.textContent = this._isLoggedIn ? this._userName : '';

    if (this._isLoggedIn) {
      this._accountButton.setAttribute('title', this._userName);
      this._accountButton.setAttribute('aria-label', `Account menu for ${this._userName}`);
    } else {
      this._loginButton.setAttribute('title', 'Login');
      this._loginButton.setAttribute('aria-label', 'Login');
    }
  }
}

if (!customElements.get('edirom-authentication')) {
  customElements.define('edirom-authentication', EdiromAuthentication);
}
