import type { Auth, LuciaError } from "lucia-auth";
import {
	CreateUserAttributesParameter,
	generateState,
	GetAuthorizationUrlReturnType,
	LuciaOAuthError,
	LuciaUser,
	OAuthConfig,
	OAuthProvider
} from "./index.js";
import { Client, Issuer } from "openid-client";

interface Configs extends OAuthConfig {
	issuerUrl: string;
	redirectUri: string;
}

class OIDC<A extends Auth> implements OAuthProvider<A> {
	constructor(auth: A, configs: Configs) {
		this.auth = auth;
		this.clientId = configs.clientId;
		this.clientSecret = configs.clientSecret;
		this.scope = configs.scope ?? ["oidc", "email", "profile"];
		this.issuerUrl = configs.issuerUrl;
		this.redirectUri = configs.redirectUri;
	}

	private auth: A;
	private clientId: string;
	private clientSecret: string;
	private scope: string[];
	private issuerUrl: string;
	private redirectUri: string;
	private client: Client | undefined;

	public init = async () => {
		if (this.client) return this.client;

		const issuer = await Issuer.discover(this.issuerUrl);
		this.client = new issuer.Client({
			client_id: this.clientId,
			client_secret: this.clientSecret,
			response_types: ["code"]
		});
		return this.client;
	};

	public getAuthorizationUrl = <
		State extends string | null | undefined = undefined
	>(
		state?: State
	): GetAuthorizationUrlReturnType<State> => {
		if (!this.client) throw new LuciaOAuthError("OIDC_CLIENT_NOT_INITIALIZED");
		const s =
			state ?? (typeof state === "undefined" ? generateState() : undefined);

		const url = this.client.authorizationUrl({
			scope: this.scope.join(" "),
			redirect_uri: this.redirectUri,
			...(s && { state: s })
		});

		if (state === null)
			return [url] as const as GetAuthorizationUrlReturnType<State>;
		return [url, s] as const as GetAuthorizationUrlReturnType<State>;
	};

	public validateCallback = async (code: string) => {
		if (!this.client) throw new LuciaOAuthError("OIDC_CLIENT_NOT_INITIALIZED");
		const tokens = await this.client.callback(this.redirectUri, { code });

		const userinfo = await this.client.userinfo(tokens);
		const PROVIDER_ID = "oidc";
		const PROVIDER_USER_ID = userinfo.sub;

		let existingUser: LuciaUser<A> | null = null;
		try {
			const { user } = await this.auth.getKeyUser(
				PROVIDER_ID,
				PROVIDER_USER_ID
			);
			existingUser = user as LuciaUser<A>;
		} catch (e) {
			const error = e as Partial<LuciaError>;
			if (error?.message !== "AUTH_INVALID_KEY_ID") throw e;
			// existingUser is null
		}
		const createUser = async (
			userAttributes: CreateUserAttributesParameter<A>
		) => {
			return (await this.auth.createUser({
				key: {
					providerId: PROVIDER_ID,
					providerUserId: PROVIDER_USER_ID
				},
				attributes: userAttributes as any
			})) as any;
		};
		const createKey = async (userId: string) => {
			return await this.auth.createKey(userId, {
				providerId: PROVIDER_ID,
				providerUserId: PROVIDER_USER_ID,
				password: null
			});
		};
		return {
			createUser,
			existingUser,
			providerUser: userinfo,
			createKey
		};
	};
}

const oidc = async <A extends Auth>(auth: A, configs: Configs) => {
	const oidc = new OIDC(auth, configs);
	await oidc.init();
	return oidc;
};

export default oidc;
