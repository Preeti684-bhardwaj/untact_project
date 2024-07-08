const jose = require('jose');
const { ClaimGrants, VideoGrant, claimsToJwtPayload } = require('./grants.js');

const defaultTTL = '6h';  // 6 hours

class AccessToken {
  constructor(apiKey, apiSecret, options = {}) {
    this.apiKey = apiKey || process.env.LIVEKIT_API_KEY;
    this.apiSecret = apiSecret || process.env.LIVEKIT_API_SECRET;

    if (!this.apiKey || !this.apiSecret) {
      throw new Error('API key and API secret must be set');
    } else if (typeof document !== 'undefined') {
      console.error(
        'You should not include your API secret in your web client bundle.\n' +
        'Your web client should request a token from your backend server which should then use ' +
        'the API secret to generate a token. See https://docs.livekit.io/client/connect/'
      );
    }

    this.grants = {};
    this.identity = options.identity;
    this.ttl = options.ttl || defaultTTL;
    if (typeof this.ttl === 'number') {
      this.ttl = `${this.ttl}s`;
    }
    if (options.metadata) {
      this.metadata = options.metadata;
    }
    if (options.name) {
      this.name = options.name;
    }
  }

  addGrant(grant) {
    this.grants.video = { ...(this.grants.video || {}), ...grant };
  }

  set metadata(md) {
    this.grants.metadata = md;
  }

  set name(name) {
    this.grants.name = name;
  }

  async toJwt() {
    const secret = new TextEncoder().encode(this.apiSecret);

    const jwt = new jose.SignJWT(claimsToJwtPayload(this.grants))
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.apiKey)
      .setExpirationTime(this.ttl)
      .setNotBefore(0);

    if (this.identity) {
      jwt.setSubject(this.identity);
    } else if (this.grants.video?.roomJoin && !this.identity) {
      throw new Error('Identity is required for room join but not set');
    }

    return jwt.sign(secret);
  }
}

class TokenVerifier {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async verify(token) {
    const secret = new TextEncoder().encode(this.apiSecret);
    const { payload } = await jose.jwtVerify(token, secret, { issuer: this.apiKey });
    if (!payload) {
      throw new Error('Invalid token');
    }

    return payload;
  }
}

module.exports = { AccessToken, TokenVerifier };

