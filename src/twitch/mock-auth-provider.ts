import type { AccessToken, AccessTokenWithUserId } from '@twurple/auth';
import type { AuthProvider } from '@twurple/auth';
import type { UserIdResolvable } from '@twurple/common';

/**
 * A mock server never checks tokens, but Twurple still asks the auth provider
 * for a token per user and scope set, and its own providers answer that by
 * calling the real id.twitch.tv validate endpoint, which then rejects the
 * made-up token. This provider answers locally instead.
 */
export class MockAuthProvider implements AuthProvider {
  private readonly token: AccessToken;

  constructor(
    private readonly mockClientId: string,
    private readonly mockUserId: string,
    scopes: string[],
    accessToken = 'mock-access-token'
  ) {
    this.token = {
      accessToken,
      refreshToken: null,
      scope: scopes,
      expiresIn: null,
      obtainmentTimestamp: Date.now(),
    };
  }

  get clientId(): string {
    return this.mockClientId;
  }

  getCurrentScopesForUser(): string[] {
    return this.token.scope;
  }

  async getAccessTokenForUser(
    _user: UserIdResolvable,
    ..._scopeSets: Array<string[] | undefined>
  ): Promise<AccessTokenWithUserId> {
    return { ...this.token, userId: this.mockUserId };
  }

  async getAccessTokenForIntent(
    _intent: string,
    ..._scopeSets: Array<string[] | undefined>
  ): Promise<AccessTokenWithUserId> {
    return { ...this.token, userId: this.mockUserId };
  }

  async getAnyAccessToken(): Promise<AccessTokenWithUserId> {
    return { ...this.token, userId: this.mockUserId };
  }
}
