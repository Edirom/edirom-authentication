# edirom-authentication
Web component to handle authentication in Edirom Online Frontend

## Keycloak sign-in

The sign-in popover offers Keycloak authentication when `keycloak-url`, `keycloak-realm`, and `keycloak-client-id` are set. After sign-in, the account menu displays the Keycloak username. This component does not authenticate to eXist-db.

```html
<edirom-authentication
  keycloak-url="http://localhost:8082"
  keycloak-realm="edirom-test-realm"
  keycloak-client-id="edirom-online"
  keycloak-handler-src="resources/web-components/edirom-keycloak-handler/keycloak-handler.js">
</edirom-authentication>
```

The `keycloak-handler-src` attribute is optional if the host page has already loaded [`@edirom/keycloak-handler`](https://github.com/Edirom/edirom-keycloak-handler). The handler redirects back to the current page, so the Keycloak client must allow that page's URL as a redirect URI. The test realm allows the default frontend URLs; update its redirect URIs if those ports change.

The username is read from the handler's token claims (or its JavaScript-readable token cookie on page reload) for display only. This component does not validate the token and the username must not be used for authorization. Treat this setup as a local-development integration, not production authentication.
