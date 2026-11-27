# edirom-authentication
Web component for Keycloak authentication in Edirom Online Frontend.

## Keycloak authentication and API tokens

The sign-in popover offers Keycloak authentication when `keycloak-url`, `keycloak-realm`, and `keycloak-client-id` are set. The component initializes the Keycloak JavaScript adapter with the authorization-code flow and PKCE (`S256`). Tokens remain in adapter memory; the component does not write them to cookies, `localStorage`, or `sessionStorage`. On connection, it removes the legacy `keycloak_token` cookie created by the previous handler.

After sign-in, the account menu displays the username from the access-token claims and provides a Keycloak sign-out button. Frontend API code can request a current access token through the component's public `getAccessToken()` method. It refreshes a token that is close to expiry and returns the access-token string:

```js
const authentication = document.querySelector('edirom-authentication');
const accessToken = await authentication.getAccessToken();
const response = await fetch(apiUrl, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

The component loads the pinned Keycloak JavaScript adapter and resolves the silent-check callback to `resources/js/edirom-authentication/silent-check-sso.html` from the application base URL. The callback file must be served from the application origin, and the Keycloak client must allow both the application URL and callback URL as valid redirect URIs. Configure a standalone component with the Keycloak connection settings:

```html
<edirom-authentication
  keycloak-url="http://localhost:8082"
  keycloak-realm="edirom-test-realm"
  keycloak-client-id="edirom-online">
</edirom-authentication>
```

For applications hosting the callback at a different same-origin path, set `keycloak-silent-check-sso-uri` before the component is connected:

```html
<edirom-authentication
  keycloak-url="https://keycloak.example.org"
  keycloak-realm="my-realm"
  keycloak-client-id="my-client"
  keycloak-silent-check-sso-uri="/auth/silent-check-sso.html">
</edirom-authentication>
```

The API is not implemented yet. When added, it must validate the bearer access token (including signature, issuer, audience, expiry, and permissions); displaying the username in this component is not authorization. Keep API calls on HTTPS in deployed environments.
