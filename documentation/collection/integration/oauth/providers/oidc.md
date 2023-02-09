---
_order: 0
title: "OpenID Connect (OIDC)"
---

Integration for authentication via OpenID Connect (OIDC), which is an identity layer built on top of OAuth2. OIDC is supported by many identity providers including [Google](https://developers.google.com/identity/openid-connect/openid-connect) and [Azure AD](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc) or even self-hosted providers like [Authelia](https://www.authelia.com/configuration/identity-providers/open-id-connect/) and [Authentik](https://goauthentik.io/integrations/sources/oauth/#openid-connect).

### Initialization

```ts
import oidc from "@lucia-auth/oauth/oidc";
import { auth } from "./lucia.js";

// Initialization is asynchronous as part of the OIDC discovery process
const oidcAuth = await oidc(auth, configs);
```

```ts
const oidc: (
	auth: Auth,
	configs: {
		clientId: string;
		clientSecret: string;
		redirectUri: string;
		issuerUrl: string;
		scope?: string[];
		responseTypes?: string[];
	}
) => OIDCProvider;
```

> The OIDC provider initialization is **asynchronous**. This is due to the URI discovery process of OIDC.

#### Parameter

| name                 | type                                        | description                         | optional | default                      |
| -------------------- | ------------------------------------------- | ----------------------------------- | -------- | ---------------------------- |
| auth                 | [`Auth`](/reference/types/lucia-types#auth) | Lucia instance                      |          |                              |
| configs.clientId     | `string`                                    | Provider app client id              |          |                              |
| configs.clientSecret | `string`                                    | Provider app client secret          |          |                              |
| configs.redirectUri  | `string`                                    | one of the authorized redirect URIs |          |                              |
| configs.issuerUrl    | `string`                                    | Self-discovery URL for client       |          |                              |
| configs.scope        | `string[]`                                  | an array of scopes                  | true     | ["oidc", "email", "profile"] |

### Redirect user to authorization url

Redirect the user to Identity Provider's authorization url, which can be retrieved using `getAuthorizationUrl()`.

```ts
import oidc from "@lucia-auth/oauth/oidc";
import { auth } from "./lucia.js";

const oidcAuth = oidc(auth, configs);

const [authorizationUrl, state] = oidcAuth.getAuthorizationUrl();

// the state can be stored in cookies or localstorage for request validation on callback
setCookie("state", state, {
	path: "/",
	httpOnly: true, // only readable in the server
	maxAge: 60 * 60 // a reasonable expiration date
}); // example with cookie
```

### Validate callback

The authorization code and state can be retrieved from the `code` and `state` search params, respectively, inside the callback url. Validate that the state is the same as the one stored in either cookies or localstorage before passing the `code` to `validateCallback()`.

```ts
import oidc from "@lucia-auth/oauth/oidc";

const oidcAuth = oidc(auth, configs);

// get code and state from search params
const url = new URL(callbackUrl);
const code = url.searchParams.get("code") || ""; // http://localhost:3000/api/oidc?code=abc&state=efg => abc
const state = url.searchParams.get("state") || ""; // http://localhost:3000/api/oidc?code=abc&state=efg => efg

// get state stored in cookie (refer to previous step)
const storedState = headers.cookie.get("state");

// validate state
if (state !== storedState) throw new Error(); // invalid state

const oidcSession = await oidcAuth.validateCallback(code);
```

## `oidc()` (default)

Refer to [`Initialization`](/oauth/providers/oidc#initialization).

## `OIDCProvider`

```ts
interface OIDCProvider {
	getAuthorizationUrl: <State = string | null | undefined = undefined>(state?: State) => State extends null ? [url: string] : [url: string, state: string]
	validateCallback: (code: string) => Promise<OIDCProviderSession>;
}
```

Implements [`OAuthProvider`](/oauth/reference/api-reference#oauthprovider).

### `getAuthorizationUrl()`

Refer to [`OAuthProvider.getAuthorizationUrl()`](/oauth/reference/api-reference#getauthorizationurl).

### `validateCallback()`

Implements [`OAuthProvider.validateCallback()`](/oauth/reference/api-reference#getauthorizationurl). `code` can be acquired from the `code` search params inside the callback url.

```ts
const validateCallback: (code: string) => Promise<OIDCProviderSession>;
```

#### Errors

| type                        | description                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OIDC_CLIENT_NOT_INITIALIZED | Thrown when the OIDC provider client is not initialized. This can happen because the OIDC class was instantiated manually without calling and awaiting `init()` |

#### Returns

| type                                                               |
| ------------------------------------------------------------------ |
| [`OIDCProviderSession`](/oauth/providers/oidc#oidcprovidersession) |

## `OIDCProviderSession`

```ts
interface OIDCProviderSession {
	existingUser: User | null;
	createKey: (userId: string) => Promise<Key>;
	createUser: (userAttributes) => Promise<User>;
	providerUser: UserInfo;
}
```

Implements [`ProviderSession`](/oauth/reference/api-reference#providersession).

| name                                           | type                                                  | description                                       |
| ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| existingUser                                   | [`User`](/reference/types/lucia-types#user)` \| null` | existing user - null if non-existent (= new user) |
| [createKey](/oauth/providers/oidc#createkey)   | `Function`                                            |                                                   |
| [createUser](/oauth/providers/oidc#createuser) | `Function`                                            |                                                   |
| providerUser                                   | [`UserInfo`](/oauth/providers/oidc#userinfo)          | User information from `userinfo` endpoint         |

### `createKey()`

```ts
const createKey: (userId: string) => Promise<Key>;
```

Creates a new key using [`Lucia.createKey()`](/reference/api/server-api#createkey) using the following parameter:

| name           | value                                                           |
| -------------- | --------------------------------------------------------------- |
| userId         | `userId`                                                        |
| providerId     | `"oidc"`                                                        |
| providerUserId | OIDC user id ([`UserInfo.sub`](/oauth/providers/oidc#userinfo)) |

### `createUser()`

```ts
const createUser: (userAttributes: Lucia.UserAttributes) => Promise<User>;
```

Creates a new user using [`Lucia.createUser()`](/reference/api/server-api#createuser) using the following parameter:

| name                    | value                                                           |
| ----------------------- | --------------------------------------------------------------- |
| data.key.providerId     | `"oidc"`                                                        |
| data.key.providerUserId | OIDC user id ([`UserInfo.sub`](/oauth/providers/oidc#userinfo)) |
| data.attributes         | `userAttributes`                                                |

## `UserInfo`

```ts
interface UserInfo {
	sub: string;
	name?: string;
	given_name?: string;
	family_name?: string;
	middle_name?: string;
	nickname?: string;
	preferred_username?: string;
	profile?: string;
	picture?: string;
	website?: string;
	email?: string;
	email_verified?: boolean;
	gender?: string;
	birthdate?: string;
	zoneinfo?: string;
	locale?: string;
	phone_number?: string;
	updated_at?: number;
	address?: Address<ExtendedAddress>;
}
```
