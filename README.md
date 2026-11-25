# edirom-authentication
Web component to handle authentication in Edirom Online Frontend

## Keycloak sign-in

The login popover shows a Keycloak button when `keycloak-url`, `keycloak-realm`, and `keycloak-client-id` are set. The current flow redirects to Keycloak and back to the application; it does not create an eXist-db session or change the component's eXist login state.

After Keycloak sign-in, the account menu displays a separate Keycloak username. When only Keycloak is authenticated, the account menu and the existing eXist login button are both available.

```html
<edirom-authentication
  backend-url="http://localhost:8080"
  keycloak-url="http://localhost:8082"
  keycloak-realm="edirom-test-realm"
  keycloak-client-id="edirom-online"
  keycloak-handler-src="resources/web-components/edirom-keycloak-handler/keycloak-handler.js">
</edirom-authentication>
```

The `keycloak-handler-src` attribute is optional if the host page has already loaded [`@edirom/keycloak-handler`](https://github.com/Edirom/edirom-keycloak-handler). The handler redirects back to the current page, so the Keycloak client must allow that page's URL as a redirect URI. The test realm uses the default frontend and backend localhost URLs; update its client redirect URIs if those ports change.

This is a redirect-only integration: it does not exchange the Keycloak token for an eXist-db session. The username is read from the handler's token claims (or its JavaScript-readable token cookie on page reload) for display only; it is not verified by this component and must not be used for authorization. Treat this setup as a local-development integration, not production authentication.
